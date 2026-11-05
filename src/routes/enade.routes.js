const express = require('express');
const { buscarTodosOsCursos, buscarDadosDoCurso } = require('../data/enadeRepository');
const { anosComQuestoes, buscarQuestoes } = require('../data/questoesRepository');

// Cria um roteador — é nele que vamos pendurar as rotas /cursos e /:curso
const router = express.Router();

// GET /cursos
// Devolve a lista de cursos disponíveis, com nome e anos de cada um.
// Não devolve o objeto inteiro (com todas as disciplinas) porque essa rota
// é só pra "descobrir o que existe" — os detalhes vêm na próxima rota.
router.get('/cursos', (req, res) => {
    const cursos = buscarTodosOsCursos();

    // Transforma { ec: {...}, si: {...} } em uma lista: [{ chave, nome, anos, anosComQuestoes }, ...]
    // "anosComQuestoes" são as edições que têm a tabela de acertos por questão.
    const lista = Object.entries(cursos).map(([chave, curso]) => ({
        chave,
        nome: curso.nome,
        anos: curso.anos,
        anosComQuestoes: anosComQuestoes(chave),
    }));

    res.json(lista);
});

// GET /:curso/questoes?ano=2023
// Tabela de acertos por questão (Relatório de Curso do INEP), com a disciplina e o tema
// de cada questão. Sem "ano", devolve a edição mais recente que tiver a tabela.
router.get('/:curso/questoes', (req, res) => {
    const { curso } = req.params;
    const ano = req.query.ano || anosComQuestoes(curso)[0];

    const questoes = ano ? buscarQuestoes(curso, ano) : null;

    if (!questoes) {
        return res.status(404).json({
            erro: `Nenhuma tabela de questões para curso="${curso}" ano="${req.query.ano || 'mais recente'}".`,
        });
    }

    res.json(questoes);
});

// GET /:curso            -> dados agregados (todas as edições)
// GET /:curso?ano=2023   -> dados só daquela edição
router.get('/:curso', (req, res) => {
    const { curso } = req.params;   // pega o pedaço da URL no lugar de ":curso"
    const ano = req.query.ano;      // pega o "?ano=..." da URL, se tiver

    const dados = buscarDadosDoCurso(curso, ano);

    if (!dados) {
        // curso ou ano não existem — devolve erro 404 (Não Encontrado)
        return res.status(404).json({
            erro: `Nenhum dado encontrado para curso="${curso}" ano="${ano || 'geral'}".`,
        });
    }

    res.json(dados);
});

module.exports = router;