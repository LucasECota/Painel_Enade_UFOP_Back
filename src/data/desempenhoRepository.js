const fs = require('fs');
const path = require('path');
const { cursos } = require('./avaliaufopRepository');
const { gerarIdAnonimo } = require('../utils/anonimizacao');

const NOTA_MINIMA = 60;

// Pasta onde ficam os JSONs das notas. Pode ser trocada pela variável de ambiente
// DADOS_AVALIAUFOP (útil pra testar sem mexer nos dados reais).
const pastaDosDados = () =>
    process.env.DADOS_AVALIAUFOP || path.join(__dirname, '..', '..', 'data', 'avaliaufop');

// As três atividades que geram nota, na ordem do curso. Cada uma tem uma pasta em
// data/avaliaufop/<curso>/<pasta>/ (veja o README dessa pasta).
const simulados = [
    { pasta: 'teste-conhecimento', nome: 'Teste o seu conhecimento' },
    { pasta: 'fg', nome: 'Formação Geral (objetivas)' },
    { pasta: 'ce', nome: 'Componente Específico (objetivas)' },
];

// Lê os números informados à mão em data/avaliaufop/participantes.json
// (inscritos e concluintes de cada curso). Campo vazio (null) = usa o valor calculado.
function lerParticipantesManuais(chaveDoCurso) {
    const caminho = path.join(pastaDosDados(), 'participantes.json');

    try {
        return JSON.parse(fs.readFileSync(caminho, 'utf-8'))[chaveDoCurso] || {};
    } catch {
        return {};
    }
}

// Converte "1,00" em 1.
function lerNumero(texto) {
    return Number(String(texto).replace(',', '.'));
}

// Calcula a nota de uma tentativa em % (0 a 100).
// 1) Preferência pela nota final do Moodle: a coluna "avaliarNNNN" traz a nota e o
//    máximo no nome (ex.: "avaliar1000" = nota de 0 a 10,00).
// 2) Se não houver essa coluna (ou ela for incoerente), soma as colunas q1, q2...
//    e divide pela soma dos máximos (ex.: "q1250" = questão 1 com máximo 2,50).
function calcularPercentual(linha) {
    const colunaDaNota = Object.keys(linha).find((coluna) => /^avaliar\d+$/.test(coluna));

    if (colunaDaNota) {
        const maximoDaNota = Number(colunaDaNota.slice('avaliar'.length)) / 100;
        const nota = lerNumero(linha[colunaDaNota]);

        if (maximoDaNota > 0 && nota <= maximoDaNota) {
            return (nota / maximoDaNota) * 100;
        }
    }

    let obtido = 0;
    let maximo = 0;
    let numero = 0;

    Object.keys(linha)
        .filter((coluna) => /^q\d/.test(coluna))
        .forEach((coluna) => {
            numero++;
            maximo += Number(coluna.slice(`q${numero}`.length)) / 100;
            obtido += lerNumero(linha[coluna]);
        });

    return maximo > 0 ? (obtido / maximo) * 100 : 0;
}

// Lê todos os .json da pasta de uma atividade (o nome do arquivo não importa: pode ser o
// nome que o Moodle gera) e devolve { aluno -> melhor nota em % }.
// Devolve null se a pasta não existir ou não tiver nenhum arquivo.
function lerMelhoresNotas(chaveDoCurso, pasta) {
    const caminhoDaPasta = path.join(pastaDosDados(), chaveDoCurso, pasta);
    if (!fs.existsSync(caminhoDaPasta)) return null;

    const arquivos = fs.readdirSync(caminhoDaPasta).filter((nome) => nome.endsWith('.json'));
    if (arquivos.length === 0) return null;

    const melhores = {};

    arquivos.forEach((arquivo) => {
        let linhas;
        try {
            linhas = JSON.parse(fs.readFileSync(path.join(caminhoDaPasta, arquivo), 'utf-8')).flat();
        } catch (erro) {
            // arquivo incompleto ou com JSON inválido: ignora em vez de derrubar a rota
            console.warn(`Não foi possível ler ${arquivo}: ${erro.message}`);
            return;
        }

        linhas
            .filter((linha) => linha.estado === 'Finalizada')
            .forEach((linha) => {
                // arquivos já anonimizados trazem "aluno"; os crus trazem o e-mail
                const aluno = linha.aluno || gerarIdAnonimo(linha['endereodee-mail']);
                const percentual = calcularPercentual(linha);
                melhores[aluno] = Math.max(melhores[aluno] ?? 0, percentual);
            });
    });

    return melhores;
}

const media = (lista) => (lista.length ? lista.reduce((a, b) => a + b, 0) / lista.length : 0);

// Monta o desempenho do curso a partir dos arquivos. Atividade sem arquivo (ou sem
// nenhuma tentativa finalizada) aparece com realizada = false e aproveitamento 0.
function montarDesempenho(curso) {
    const lidas = simulados.map((simulado) => ({
        nome: simulado.nome,
        notas: lerMelhoresNotas(curso.chave, simulado.pasta) || {},
    }));

    const emails = new Set(lidas.flatMap((item) => Object.keys(item.notas)));
    // Concluiu = fez as três atividades; aprovado = concluiu com 60% ou mais em todas.
    const concluintes = [...emails].filter((email) => lidas.every((item) => email in item.notas));
    const aprovados = concluintes.filter((email) => lidas.every((item) => item.notas[email] >= NOTA_MINIMA));

    const manuais = lerParticipantesManuais(curso.chave);
    const todasAsNotas = lidas.flatMap((item) => Object.values(item.notas));
    const mediaGeral = Math.round(media(todasAsNotas));

    return {
        chave: curso.chave,
        nome: curso.nome,
        inscritos: manuais.inscritos ?? emails.size,
        concluintes: manuais.concluintes ?? concluintes.length,
        aprovados: aprovados.length,
        media: mediaGeral,
        atividades: [
            ...lidas.map((item) => {
                const valores = Object.values(item.notas);
                return {
                    nome: item.nome,
                    realizada: valores.length > 0,
                    aproveitamento: Math.round(media(valores)),
                };
            }),
            { nome: 'Média geral', realizada: todasAsNotas.length > 0, aproveitamento: mediaGeral },
        ],
    };
}

// Devolve o desempenho de todos os cursos, na ordem do AvaliaUFOP.
function listarDesempenho() {
    return cursos.map(montarDesempenho);
}

// Devolve o desempenho de um curso ("ec", "ep" ou "si"), ou null se não existir.
function buscarDesempenho(chaveDoCurso) {
    const curso = cursos.find((c) => c.chave === chaveDoCurso);
    return curso ? montarDesempenho(curso) : null;
}

module.exports = { listarDesempenho, buscarDesempenho };
