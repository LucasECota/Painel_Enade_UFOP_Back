const express = require('express');
const { buscarResultados } = require('../data/resultadosRepository');

const router = express.Router();

// GET /resultados
// Resultados do Enade por curso do ICEA: conceito em cada edição, comparação com a
// média do Brasil e perfil dos concluintes.
router.get('/', (req, res) => {
    res.json(buscarResultados());
});

module.exports = router;
