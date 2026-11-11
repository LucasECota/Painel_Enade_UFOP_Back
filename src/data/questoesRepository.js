const fs = require('fs');
const path = require('path');

const pastaDasQuestoes = path.join(__dirname, '..', '..', 'data', 'questoes');
const pastaDeImagens = path.join(__dirname, '..', '..', 'data', 'questoes-imagens');

// Caminho (relativo a /api/enade/imagens) do recorte da questão no caderno de prova, ou null se não existir.
// Formação Geral vem como "fg-<número>"; Componente Específico como "<curso>-<número>".
function imagemDaQuestao(chaveDoCurso, ano, tipoDoComponente, numero) {
    const prefixo = tipoDoComponente === 'formacaoGeral' ? 'fg' : chaveDoCurso;
    const nome = `${prefixo}-${String(numero).toLowerCase()}.webp`; // discursivas: fg-d1, ec-d3
    return fs.existsSync(path.join(pastaDeImagens, String(ano), nome)) ? `${ano}/${nome}` : null;
}

// Lista os arquivos de data/questoes no padrão <curso>-<ano>.json (ex.: ec-2023.json).
// O nome do arquivo escolhido vem sempre desta lista, nunca direto do que o visitante digitou.
function listarArquivos() {
    if (!fs.existsSync(pastaDasQuestoes)) return [];

    return fs
        .readdirSync(pastaDasQuestoes)
        .map((arquivo) => ({ arquivo, correspondencia: arquivo.match(/^([a-z]+)-(\d{4})\.json$/) }))
        .filter((item) => item.correspondencia)
        .map(({ arquivo, correspondencia }) => ({
            arquivo,
            curso: correspondencia[1],
            ano: Number(correspondencia[2]),
        }));
}

// Anos que têm a tabela de acertos por questão para um curso, do mais recente para o mais antigo.
function anosComQuestoes(chaveDoCurso) {
    return listarArquivos()
        .filter((item) => item.curso === chaveDoCurso)
        .map((item) => item.ano)
        .sort((a, b) => b - a);
}

// Tabela de acertos por questão de um curso e ano. Devolve null se não existir.
function buscarQuestoes(chaveDoCurso, ano) {
    const item = listarArquivos().find((i) => i.curso === chaveDoCurso && i.ano === Number(ano));
    if (!item) return null;

    const tabela = JSON.parse(fs.readFileSync(path.join(pastaDasQuestoes, item.arquivo), 'utf-8'));
    // cada questão aponta para o recorte dela no caderno de prova (ou null, se não houver)
    for (const componente of tabela.componentes) {
        for (const q of [...componente.questoes, ...(componente.discursivas || [])]) {
            q.imagem = imagemDaQuestao(chaveDoCurso, item.ano, componente.tipo, q.numero);
        }
    }
    return tabela;
}

const arredondar = (n) => Math.round(n * 10) / 10;
const media = (valores) => arredondar(valores.reduce((soma, v) => soma + v, 0) / valores.length);

// Desempenho por área (disciplina) e por tema, edição por edição, calculado a partir das tabelas de
// acertos por questão. Só entram as questões válidas (não anuladas nem desconsideradas) que têm
// disciplina e percentual do curso e do Brasil. O desempenho de uma área é a média simples do
// percentual de acerto das suas questões.
function desempenhoPorArea(chaveDoCurso) {
    const anos = anosComQuestoes(chaveDoCurso);
    if (anos.length === 0) return null;

    const porEdicao = anos.map((ano) => {
        const tabela = buscarQuestoes(chaveDoCurso, ano);
        const temas = [];

        for (const componente of tabela.componentes) {
            for (const q of componente.questoes) {
                if (q.situacao !== 'valida' || !q.disciplina) continue;
                if (q.acertos.curso === null || q.acertos.brasil === null) continue;
                temas.push({
                    componente: componente.tipo,
                    numero: q.numero,
                    disciplina: q.disciplina,
                    tema: q.tema,
                    ufop: q.acertos.curso,
                    brasil: q.acertos.brasil,
                    gabarito: q.gabarito,
                    imagem: imagemDaQuestao(chaveDoCurso, ano, componente.tipo, q.numero),
                });
            }
        }

        const grupos = new Map();
        for (const t of temas) {
            const chave = `${t.componente}|${t.disciplina}`;
            if (!grupos.has(chave)) grupos.set(chave, { componente: t.componente, disciplina: t.disciplina, itens: [] });
            grupos.get(chave).itens.push(t);
        }
        const areas = [...grupos.values()].map(({ componente, disciplina, itens }) => ({
            componente,
            disciplina,
            questoes: itens.length,
            ufop: media(itens.map((t) => t.ufop)),
            brasil: media(itens.map((t) => t.brasil)),
            // as questões da disciplina, para o site mostrar a imagem e o gabarito de cada uma
            lista: itens.map(({ numero, tema, gabarito, imagem }) => ({ numero, tema, gabarito, imagem })),
        }));

        return { ano, areas, temas: temas.filter((t) => t.tema) };
    });

    return {
        curso: chaveDoCurso,
        nome: buscarQuestoes(chaveDoCurso, anos[0]).nome,
        edicoes: anos,
        porEdicao,
    };
}

module.exports = { anosComQuestoes, buscarQuestoes, desempenhoPorArea };
