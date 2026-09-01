const express = require('express');
const { calcularRankingPorDisciplina, encontrarDestaques } = require('../data/rankingRepository');

const router = express.Router();

// GET /ranking/:curso/:ano
// Devolve o ranking de disciplinas por percentual de acerto, do maior pro menor.
router.get('/:curso/:ano', (req, res) => {
    const { curso, ano } = req.params;

    const ranking = calcularRankingPorDisciplina(curso, Number(ano));

    if (!ranking) {
        return res.status(404).json({
            erro: `Nenhum ranking encontrado para curso="${curso}" ano="${ano}".`,
        });
    }

    const ordenado = [...ranking].sort((a, b) => b.percentualDeAcerto - a.percentualDeAcerto);

    res.json(ordenado);
});

// GET /:curso/:ano/destaques
// Devolve a questão com maior e menor percentual de acerto.
router.get('/:curso/:ano/destaques', (req, res) => {
    const { curso, ano } = req.params;

    const destaques = encontrarDestaques(curso, Number(ano));

    if (!destaques) {
        return res.status(404).json({
            erro: `Nenhum destaque encontrado para curso="${curso}" ano="${ano}".`,
        });
    }

    res.json(destaques);
});

module.exports = router;