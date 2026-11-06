const express = require('express');
const {
    listarRelatorios,
    caminhoDoRelatorio,
    listarRelatoriosDeCurso,
    caminhoDoRelatorioDeCurso,
} = require('../data/resultadosRepository');

const router = express.Router();

// GET /relatorios
// Lista os relatórios do INEP disponíveis para baixar (com ano e tamanho).
router.get('/', (req, res) => {
    res.json(listarRelatorios());
});

// GET /relatorios/curso
// Lista os Relatórios de Curso do INEP disponíveis (um por curso e ano).
router.get('/curso', (req, res) => {
    res.json(listarRelatoriosDeCurso());
});

// GET /relatorios/curso/:curso/:ano/download
// Baixa o PDF do Relatório de Curso (ex.: /relatorios/curso/ec/2023/download).
router.get('/curso/:curso/:ano/download', (req, res) => {
    const caminho = caminhoDoRelatorioDeCurso(req.params.curso, req.params.ano);

    if (!caminho) {
        return res.status(404).json({
            erro: `Nenhum relatório de curso encontrado para curso="${req.params.curso}" ano="${req.params.ano}".`,
        });
    }

    res.download(caminho);
});

// GET /relatorios/:ano/download
// Baixa o PDF do relatório daquele ano.
router.get('/:ano/download', (req, res) => {
    const caminho = caminhoDoRelatorio(req.params.ano);

    if (!caminho) {
        return res.status(404).json({
            erro: `Nenhum relatório encontrado para o ano "${req.params.ano}".`,
        });
    }

    res.download(caminho);
});

module.exports = router;
