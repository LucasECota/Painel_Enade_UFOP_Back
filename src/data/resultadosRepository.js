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

const pastaDosRelatoriosDeCurso = path.join(__dirname, '..', '..', 'data', 'relatorios-curso');
const CURSOS_DOS_RELATORIOS = {
    'engenharia-de-computacao': { chave: 'ec', nome: 'Engenharia de Computação' },
    'engenharia-de-producao': { chave: 'ep', nome: 'Engenharia de Produção' },
    'sistemas-de-informacao': { chave: 'si', nome: 'Sistemas de Informação' },
};

// Lista os Relatórios de Curso de data/relatorios-curso (padrão enade-AAAA-<curso>-relatorio-de-curso.pdf),
// por curso e, em cada um, do ano mais recente ao mais antigo. O curso e o ano vêm do nome do arquivo.
function listarRelatoriosDeCurso() {
    if (!fs.existsSync(pastaDosRelatoriosDeCurso)) return [];

    return fs
        .readdirSync(pastaDosRelatoriosDeCurso)
        .map((arquivo) => ({ arquivo, correspondencia: arquivo.match(/^enade-(\d{4})-([a-z-]+)-relatorio-de-curso\.pdf$/) }))
        .filter((item) => item.correspondencia && CURSOS_DOS_RELATORIOS[item.correspondencia[2]])
        .map(({ arquivo, correspondencia }) => {
            const ano = Number(correspondencia[1]);
            const { chave, nome } = CURSOS_DOS_RELATORIOS[correspondencia[2]];
            const tamanho = fs.statSync(path.join(pastaDosRelatoriosDeCurso, arquivo)).size;

            return {
                curso: chave,
                ano,
                titulo: `Enade ${ano} — Relatório do curso de ${nome}`,
                descricao: 'UFOP, campus João Monlevade',
                tamanhoMb: Math.round((tamanho / 1024 / 1024) * 10) / 10,
                arquivo,
            };
        })
        .sort((a, b) => a.curso.localeCompare(b.curso) || b.ano - a.ano);
}

// Caminho do PDF de um curso e ano, ou null. O nome do arquivo sai sempre da lista acima.
function caminhoDoRelatorioDeCurso(curso, ano) {
    const relatorio = listarRelatoriosDeCurso().find((r) => r.curso === curso && r.ano === Number(ano));
    return relatorio ? path.join(pastaDosRelatoriosDeCurso, relatorio.arquivo) : null;
}

module.exports = {
    buscarResultados,
    listarRelatorios,
    caminhoDoRelatorio,
    listarRelatoriosDeCurso,
    caminhoDoRelatorioDeCurso,
};
