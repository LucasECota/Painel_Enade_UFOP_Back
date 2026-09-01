const path = require('path');
const { carregarRespostasCruas, extrairRespostas, caminhoDaPasta } = require('./simuladoRepository');
const { buscarMapaDeDisciplinas } = require('./questaoRepository');

// Lê o respostas.json de um curso+ano e devolve só a lista de respostas já
// limpas de cada aluno (tipo { q1: 10, q2: 1, ... }), sem nome/email/nota —
// é a informação "crua" que falta pra calcular ranking por disciplina.
function buscarRespostasDosAlunos(curso, ano) {
    const caminhoDoJson = path.join(caminhoDaPasta(curso, ano), 'respostas.json');
    const alunosCrus = carregarRespostasCruas(caminhoDoJson);

    return alunosCrus.map((alunoCru) => extrairRespostas(alunoCru));
}

// Conta quantos alunos "acertaram" uma questão. Em objetivas (0 ou 1),
// acerto é valor === 1. Em discursivas (nota de 0 a 10), consideramos
// acerto qualquer nota diferente de zero — só 0 exato conta como erro.
// As duas regras coincidem numa única condição: valor !== 0.
function contarAcertos(listaDeRespostas, chaveDaQuestao) {
    return listaDeRespostas.filter((respostas) => respostas[chaveDaQuestao] !== 0).length;
}

// Calcula o ranking de disciplinas por desempenho: para cada disciplina,
// soma quantos acertos e quantas questões objetivas ela teve no total
// (considerando todos os alunos), e calcula o percentual de acerto.
function calcularRankingPorDisciplina(curso, ano) {
    const mapaDeDisciplinas = buscarMapaDeDisciplinas(curso, ano);

    if (!mapaDeDisciplinas) {
        return null; // curso/ano não existe
    }

    const respostasDosAlunos = buscarRespostasDosAlunos(curso, ano);

    const totaisPorDisciplina = {};

    Object.entries(mapaDeDisciplinas).forEach(([chaveDaQuestao, disciplina]) => {
        const acertos = contarAcertos(respostasDosAlunos, chaveDaQuestao);
        const totalDeRespostas = respostasDosAlunos.length;

        if (!totaisPorDisciplina[disciplina]) {
            totaisPorDisciplina[disciplina] = { acertos: 0, totalDeRespostas: 0 };
        }
        totaisPorDisciplina[disciplina].acertos += acertos;
        totaisPorDisciplina[disciplina].totalDeRespostas += totalDeRespostas;
    });

    return Object.entries(totaisPorDisciplina).map(([disciplina, dados]) => ({
        disciplina,
        acertos: dados.acertos,
        total: dados.totalDeRespostas,
        percentualDeAcerto: Math.round((dados.acertos / dados.totalDeRespostas) * 1000) / 10,
    }));
}

// Calcula o desempenho de cada questão isoladamente (sem agrupar por
// disciplina): quantos alunos acertaram, de quantos, e o percentual.
// Devolve uma lista com uma entrada por questão, tipo:
// [{ questao: 'q1', disciplina: 'Formação Geral', acertos: 5, total: 5, percentualDeAcerto: 100 }, ...]
function calcularDesempenhoPorQuestao(curso, ano) {
    const mapaDeDisciplinas = buscarMapaDeDisciplinas(curso, ano);
    if (!mapaDeDisciplinas) return null;

    const respostasDosAlunos = buscarRespostasDosAlunos(curso, ano);

    return Object.entries(mapaDeDisciplinas).map(([chaveDaQuestao, disciplina]) => {
        const acertos = contarAcertos(respostasDosAlunos, chaveDaQuestao);
        const total = respostasDosAlunos.length;

        return {
            questao: chaveDaQuestao,
            disciplina,
            acertos,
            total,
            percentualDeAcerto: Math.round((acertos / total) * 1000) / 10,
        };
    });
}

// A partir da lista de desempenho por questão, encontra a questão com maior
// e a com menor percentual de acerto.
function encontrarDestaques(curso, ano) {
    const desempenhoPorQuestao = calcularDesempenhoPorQuestao(curso, ano);
    if (!desempenhoPorQuestao) return null;

    const maisAcertada = desempenhoPorQuestao.reduce((melhor, atual) =>
        atual.percentualDeAcerto > melhor.percentualDeAcerto ? atual : melhor
    );

    const maisErrada = desempenhoPorQuestao.reduce((pior, atual) =>
        atual.percentualDeAcerto < pior.percentualDeAcerto ? atual : pior
    );

    return { maisAcertada, maisErrada };
}

module.exports = {
    buscarRespostasDosAlunos,
    contarAcertos,
    calcularRankingPorDisciplina,
    calcularDesempenhoPorQuestao,
    encontrarDestaques,
};