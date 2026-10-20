const express = require('express');
const { listarDesempenho, buscarDesempenho } = require('../data/desempenhoRepository');

const router = express.Router();

// GET /desempenho
// Desempenho geral dos alunos em cada curso (inscritos, concluintes,
// aprovados, média e aproveitamento por atividade).
router.get('/', (req, res) => {
    res.json(listarDesempenho());
});

// GET /desempenho/:curso
// Desempenho de um curso só ("ec", "ep" ou "si").
router.get('/:curso', (req, res) => {
    const { curso } = req.params;

    const desempenho = buscarDesempenho(curso);

    if (!desempenho) {
        return res.status(404).json({
            erro: `Nenhum desempenho encontrado para curso="${curso}".`,
        });
    }

    res.json(desempenho);
});

module.exports = router;
