const fs = require('fs');
const path = require('path');

const pastaDasQuestoes = path.join(__dirname, '..', '..', 'data', 'questoes');

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

    return JSON.parse(fs.readFileSync(path.join(pastaDasQuestoes, item.arquivo), 'utf-8'));
}

module.exports = { anosComQuestoes, buscarQuestoes };
