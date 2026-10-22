const express = require('express');
const { listarRelatorios, caminhoDoRelatorio } = require('../data/resultadosRepository');

const router = express.Router();

// GET /relatorios
// Lista os relatórios do INEP disponíveis para baixar (com ano e tamanho).
router.get('/', (req, res) => {
    res.json(listarRelatorios());
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
