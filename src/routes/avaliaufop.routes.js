const express = require('express');
const { buscarAvaliaUfop } = require('../data/avaliaufopRepository');

const router = express.Router();

// GET /avaliaufop
// Devolve as informações do curso de preparação: dados gerais, objetivos,
// metodologia, módulos/atividades e a lista de cursos com o link do Moodle.
router.get('/', (req, res) => {
    res.json(buscarAvaliaUfop());
});

module.exports = router;
