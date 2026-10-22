const fs = require('fs');
const path = require('path');

const pastaDosRelatorios = path.join(__dirname, '..', '..', 'data', 'relatorios-inep');
const arquivoDosResultados = path.join(__dirname, '..', '..', 'data', 'resultados-enade.json');

// Resultados do Enade dos cursos do ICEA (conceito por edição, comparação com o Brasil
// e perfil dos concluintes), extraídos dos Relatórios de IES do INEP.
function buscarResultados() {
    return JSON.parse(fs.readFileSync(arquivoDosResultados, 'utf-8'));
}

// Lista os PDFs de data/relatorios-inep. O ano vem do nome do arquivo
// (padrão: enade-AAAA-ufop-joao-monlevade.pdf). Do mais recente para o mais antigo.
function listarRelatorios() {
    return fs
        .readdirSync(pastaDosRelatorios)
        .map((arquivo) => ({ arquivo, correspondencia: arquivo.match(/^enade-(\d{4})-.*\.pdf$/) }))
        .filter((item) => item.correspondencia)
        .map(({ arquivo, correspondencia }) => {
            const ano = Number(correspondencia[1]);
            const tamanho = fs.statSync(path.join(pastaDosRelatorios, arquivo)).size;

            return {
                ano,
                titulo: `Enade ${ano} — Relatório da IES`,
                descricao: 'UFOP, campus João Monlevade',
                tamanhoMb: Math.round((tamanho / 1024 / 1024) * 10) / 10,
                arquivo,
            };
        })
        .sort((a, b) => b.ano - a.ano);
}

// Devolve o caminho do PDF de um ano, ou null se não existir.
function caminhoDoRelatorio(ano) {
    const relatorio = listarRelatorios().find((r) => r.ano === Number(ano));
    return relatorio ? path.join(pastaDosRelatorios, relatorio.arquivo) : null;
}

module.exports = { buscarResultados, listarRelatorios, caminhoDoRelatorio };
