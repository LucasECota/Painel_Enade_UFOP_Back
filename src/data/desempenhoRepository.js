const fs = require('fs');
const path = require('path');
const { cursos } = require('./avaliaufopRepository');
const { buscarQuestoes } = require('./questoesRepository');
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

// Simulado Enade (prova completa, aplicada à parte do curso do Moodle). Fica separado das três atividades:
// não entra na média geral, nos inscritos, nos concluintes nem nos aprovados.
const PASTA_DO_SIMULADO = 'simulado';

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
// nome que o Moodle gera) e devolve só as tentativas finalizadas.
// Devolve null se a pasta não existir ou não tiver nenhum arquivo.
function lerTentativasFinalizadas(chaveDoCurso, pasta) {
    const caminhoDaPasta = path.join(pastaDosDados(), chaveDoCurso, pasta);
    if (!fs.existsSync(caminhoDaPasta)) return null;

    const arquivos = fs.readdirSync(caminhoDaPasta).filter((nome) => nome.endsWith('.json'));
    if (arquivos.length === 0) return null;

    return arquivos.flatMap((arquivo) => {
        try {
            const linhas = JSON.parse(fs.readFileSync(path.join(caminhoDaPasta, arquivo), 'utf-8')).flat();
            return linhas.filter((linha) => linha.estado === 'Finalizada');
        } catch (erro) {
            // arquivo incompleto ou com JSON inválido: ignora em vez de derrubar a rota
            console.warn(`Não foi possível ler ${arquivo}: ${erro.message}`);
            return [];
        }
    });
}

// { aluno -> melhor nota em % } a partir das tentativas finalizadas.
function melhoresNotas(tentativas) {
    const melhores = {};

    tentativas.forEach((linha) => {
        // arquivos já anonimizados trazem "aluno"; os crus trazem o e-mail
        const aluno = linha.aluno || gerarIdAnonimo(linha['endereodee-mail']);
        const percentual = calcularPercentual(linha);
        melhores[aluno] = Math.max(melhores[aluno] ?? 0, percentual);
    });

    return melhores;
}

function lerMelhoresNotas(chaveDoCurso, pasta) {
    const tentativas = lerTentativasFinalizadas(chaveDoCurso, pasta);
    return tentativas === null ? null : melhoresNotas(tentativas);
}

const media = (lista) => (lista.length ? lista.reduce((a, b) => a + b, 0) / lista.length : 0);

// De qual edição do Enade veio cada questão do simulado de um curso (data/avaliaufop/simulados.json):
// { "ep": { "edicao": 2023, "questoes": [1, 3, ...] } }, na ordem das questões do simulado no Moodle
// (a 1ª da lista é a coluna q1 do export). Uma questão que veio de outra edição, que o curso não fez
// (ex.: Formação Geral de 2023 no simulado de Sistemas), é escrita como
// { "numero": 1, "edicao": 2023, "referencia": "ec" }: o tema, o gabarito, a imagem e os acertos da UFOP e
// do Brasil vêm da tabela do curso de referência, e a resposta avisa de qual curso são (campo "referencia").
// Devolve null se não houver mapa.
function lerMapaDoSimulado(chaveDoCurso) {
    try {
        return JSON.parse(fs.readFileSync(path.join(pastaDosDados(), 'simulados.json'), 'utf-8'))[chaveDoCurso] || null;
    } catch {
        return null;
    }
}

// Colunas das questões no export do Moodle, na ordem (q1, q2...): o nome traz o número e o máximo
// ("q1050" = questão 1 valendo 0,50; "q12050" = questão 12 valendo 0,50).
function colunasDasQuestoes(linha) {
    return Object.keys(linha)
        .filter((coluna) => /^q\d/.test(coluna))
        .map((coluna, i) => ({ coluna, maximo: Number(coluna.slice(`q${i + 1}`.length)) / 100 }));
}

// Melhor tentativa (a de maior nota) de cada aluno.
function melhoresTentativas(tentativas) {
    const melhores = new Map();
    tentativas.forEach((linha) => {
        const aluno = linha.aluno || gerarIdAnonimo(linha['endereodee-mail']);
        const atual = melhores.get(aluno);
        if (!atual || calcularPercentual(linha) > calcularPercentual(atual)) melhores.set(aluno, linha);
    });
    return [...melhores.values()];
}

const arredondar = (n) => Math.round(n * 10) / 10;

// Questão por questão: o acerto médio dos alunos no simulado (percentual dos pontos, com a melhor
// tentativa de cada um) ao lado do acerto oficial da UFOP e do Brasil naquela questão no Enade.
// Questões desconsideradas pelo INEP não têm percentual oficial (ufop e brasil ficam null).
// Devolve null se o curso não tem o mapa, se ninguém fez ou se o número de questões não bate.
function compararComOEnade(chaveDoCurso, tentativas) {
    const mapa = lerMapaDoSimulado(chaveDoCurso);
    const alunos = melhoresTentativas(tentativas);
    if (!mapa || alunos.length === 0) return null;

    const colunas = colunasDasQuestoes(alunos[0]);
    // cada item do mapa vira { numero, edicao, referencia? }
    const itens = mapa.questoes.map((item) =>
        typeof item === 'number' ? { numero: item, edicao: mapa.edicao } : { edicao: mapa.edicao, ...item }
    );

    const tabelas = new Map();
    const questoesDe = (curso, edicao) => {
        const chave = `${curso}-${edicao}`;
        if (!tabelas.has(chave)) {
            const tabela = buscarQuestoes(curso, edicao);
            tabelas.set(
                chave,
                tabela && new Map(tabela.componentes.flatMap((c) => c.questoes.map((q) => [q.numero, { ...q, componente: c.tipo }])))
            );
        }
        return tabelas.get(chave);
    };

    const origens = itens.map((item) => questoesDe(item.referencia || chaveDoCurso, item.edicao));
    if (colunas.length !== itens.length || origens.some((tabela) => !tabela)) {
        console.warn(`Simulado de ${chaveDoCurso}: o mapa das questões não corresponde ao export ou às tabelas do Enade.`);
        return null;
    }

    const questoes = itens.map(({ numero, edicao, referencia }, i) => {
        const oficial = origens[i].get(numero);
        const { coluna, maximo } = colunas[i];
        const notas = alunos.map((linha) => {
            const obtido = lerNumero(linha[coluna]);
            return Number.isFinite(obtido) && maximo > 0 ? Math.min(obtido / maximo, 1) : 0; // "-" = sem resposta
        });
        // desconsiderada ou anulada pelo INEP: não há percentual oficial
        const temResultado = oficial?.situacao === 'valida';

        return {
            posicao: i + 1,
            numero,
            edicao,
            componente: oficial?.componente ?? null,
            disciplina: oficial?.disciplina ?? null,
            tema: oficial?.tema ?? null,
            situacao: oficial?.situacao ?? null,
            // com "referencia", o curso não fez aquela prova: os percentuais são de outro curso
            referencia: referencia ? { curso: referencia, nome: buscarQuestoes(referencia, edicao).nome } : null,
            gabarito: oficial?.gabarito ?? oficial?.gabaritoDaProva ?? null,
            imagem: oficial?.imagem ?? null,
            simulado: arredondar(media(notas) * 100),
            ufop: temResultado ? oficial.acertos.curso : null,
            brasil: temResultado ? oficial.acertos.brasil : null,
        };
    });

    return { edicao: mapa.edicao, questoes };
}

// Resultado do Simulado Enade do curso: quantos alunos fizeram (com tentativa finalizada), a média das
// notas (vale a melhor de cada um) e quantas questões o simulado tem (colunas q1, q2... do Moodle).
function montarSimulado(chaveDoCurso) {
    const tentativas = lerTentativasFinalizadas(chaveDoCurso, PASTA_DO_SIMULADO) || [];
    const valores = Object.values(melhoresNotas(tentativas));
    const questoes = Math.max(0, ...tentativas.map((t) => Object.keys(t).filter((coluna) => /^q\d/.test(coluna)).length));

    return {
        realizado: valores.length > 0,
        alunos: valores.length,
        media: Math.round(media(valores)),
        questoes: questoes || null,
        comparacao: compararComOEnade(chaveDoCurso, tentativas),
    };
}

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
        simulado: montarSimulado(curso.chave),
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
