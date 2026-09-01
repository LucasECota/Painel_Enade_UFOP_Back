const express = require('express');
const { listarSimuladosDisponiveis, buscarSimulado } = require('../data/simuladoRepository');

const router = express.Router();

// GET /simulados
// Lista os simulados disponíveis (curso, ano, quantidade de alunos), sem
// os dados detalhados de cada aluno — só pra "descobrir o que existe".
router.get('/', (req, res) => {
    res.json(listarSimuladosDisponiveis());
});

// GET /simulados/:curso/:ano
// Devolve o simulado completo (curso, ano, lista de alunos com as notas).
router.get('/:curso/:ano', (req, res) => {
    const { curso, ano } = req.params;

    const simulado = buscarSimulado(curso, Number(ano));

    if (!simulado) {
        return res.status(404).json({
            erro: `Nenhum simulado encontrado para curso="${curso}" ano="${ano}".`,
        });
    }

    res.json(simulado);
});

module.exports = router;