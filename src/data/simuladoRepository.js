const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Leitura do respostas.json
// ---------------------------------------------------------------------------

// Lê o respostas.json e "achata" a lista de listas em uma lista só de alunos.
function carregarRespostasCruas(caminhoDoJson) {
    const conteudo = fs.readFileSync(caminhoDoJson, 'utf-8');
    const dados = JSON.parse(conteudo);
    return dados.flat(Infinity);
}

// Identifica chaves no formato "q<numero><peso>". Ex: "q11000" -> numero="1", peso="1000"
const PADRAO_QUESTAO = /^q(\d+)(1000|100)$/;

// Converte um número no formato brasileiro ("10,00") para um float (10.0)
function converterNumeroBr(valorTexto) {
    return parseFloat(valorTexto.replace(',', '.'));
}

// Recebe o objeto cru de um aluno e devolve só as respostas, já limpas:
// { q1: 10, q2: 10, q3: 1, ... }
function extrairRespostas(alunoCru) {
    const respostas = {};
    Object.entries(alunoCru).forEach(([chave, valor]) => {
        const encontrado = chave.match(PADRAO_QUESTAO);
        if (!encontrado) return;
        const numeroDaQuestao = encontrado[1];
        respostas[`q${numeroDaQuestao}`] = converterNumeroBr(valor);
    });
    return respostas;
}

// ---------------------------------------------------------------------------
// Cálculo da nota
// ---------------------------------------------------------------------------

// Arredonda um número para uma certa quantidade de casas decimais.
function arredondar(numero, casas) {
    const fator = 10 ** casas;
    return Math.round(numero * fator) / fator;
}

// Configurações de prova: quais questões são discursivas/objetivas em cada
// componente, e o peso de cada bloco. "padrao" vale pra maioria das edições;
// "ec-2023" segue a estrutura especial dessa edição.
const configuracaoEspecial2023 = {
    fgDiscursivas: ['q1'],
    fgObjetivas: Array.from({ length: 9 }, (_, i) => `q${i + 2}`),
    ceDiscursivas: ['q11'],
    ceObjetivas: Array.from({ length: 29 }, (_, i) => `q${i + 12}`),
    pesoFgDiscursiva: 0.35,
    pesoFgObjetiva: 0.65,
    pesoCeDiscursiva: 0.1,
    pesoCeObjetiva: 0.9,
};

const CONFIGURACOES_DE_PROVA = {
    padrao: {
        fgDiscursivas: ['q1', 'q2'],
        fgObjetivas: ['q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'],
        ceDiscursivas: ['q11', 'q12', 'q13'],
        ceObjetivas: Array.from({ length: 27 }, (_, i) => `q${i + 14}`),
        pesoFgDiscursiva: 0.4,
        pesoFgObjetiva: 0.6,
        pesoCeDiscursiva: 0.15,
        pesoCeObjetiva: 0.85,
    },
    'ec-2023': configuracaoEspecial2023,
    'ee-2023': configuracaoEspecial2023,
    'ep-2023': configuracaoEspecial2023,
};

// Soma os valores de um bloco de questões dentro do objeto de respostas.
function somarBloco(respostas, questoesDoBloco) {
    return questoesDoBloco.reduce((soma, questao) => soma + respostas[questao], 0);
}

// Filtra uma lista de questões, mantendo só as que existem nas respostas do
// aluno (questões anuladas simplesmente não aparecem lá).
function filtrarQuestoesExistentes(respostas, listaDeQuestoes) {
    return listaDeQuestoes.filter((questao) => questao in respostas);
}

// Calcula notaFg, notaCe e notaFinal a partir das respostas + configuração
// da prova. Arredonda notaFg e notaCe ANTES de calcular notaFinal — mesma
// ordem usada no script Python de referência (saida.txt bate certinho).
function calcularNota(respostas, configuracao) {
    const fgDisc = filtrarQuestoesExistentes(respostas, configuracao.fgDiscursivas);
    const fgObj = filtrarQuestoesExistentes(respostas, configuracao.fgObjetivas);
    const ceDisc = filtrarQuestoesExistentes(respostas, configuracao.ceDiscursivas);
    const ceObj = filtrarQuestoesExistentes(respostas, configuracao.ceObjetivas);

    const fgDiscPct = fgDisc.length ? (somarBloco(respostas, fgDisc) / (fgDisc.length * 10)) * 100 : 0;
    const fgObjPct = fgObj.length ? (somarBloco(respostas, fgObj) / fgObj.length) * 100 : 0;
    const notaFg = arredondar(fgDiscPct * configuracao.pesoFgDiscursiva + fgObjPct * configuracao.pesoFgObjetiva, 1);

    const ceDiscPct = ceDisc.length ? (somarBloco(respostas, ceDisc) / (ceDisc.length * 10)) * 100 : 0;
    const ceObjPct = ceObj.length ? (somarBloco(respostas, ceObj) / ceObj.length) * 100 : 0;
    const notaCe = arredondar(ceDiscPct * configuracao.pesoCeDiscursiva + ceObjPct * configuracao.pesoCeObjetiva, 1);

    const notaFinal = arredondar(notaFg * 0.25 + notaCe * 0.75, 1);

    return { notaFg, notaCe, notaFinal };
}

// Decide qual configuração de prova usar, de acordo com o curso e o ano.
// Por enquanto só EC-2023 tem uma regra especial; todo o resto usa a padrão.
function escolherConfiguracao(curso, ano) {
    const chave = `${curso}-${ano}`; // ex: "ec-2023", "si-2021"

    if (CONFIGURACOES_DE_PROVA[chave]) {
        return CONFIGURACOES_DE_PROVA[chave];
    }
    return CONFIGURACOES_DE_PROVA.padrao;
}

// ---------------------------------------------------------------------------
// Montagem do simulado completo
// ---------------------------------------------------------------------------

// Monta o caminho da pasta de um simulado específico.
function caminhoDaPasta(curso, ano) {
    return path.join(__dirname, '..', '..', 'data', 'simulados', `${curso}-${ano}`);
}

// Monta o simulado completo de um curso+ano: lê o respostas.json, calcula a
// nota de cada aluno com a configuração de prova certa, e devolve a lista
// pronta pra virar resposta da API.
function montarSimulado(curso, ano) {
    const caminhoDoJson = path.join(caminhoDaPasta(curso, ano), 'respostas.json');
    const alunosCrus = carregarRespostasCruas(caminhoDoJson);
    const configuracao = escolherConfiguracao(curso, ano);

    const alunos = alunosCrus.map((alunoCru) => {
        const respostas = extrairRespostas(alunoCru);
        const notas = calcularNota(respostas, configuracao);

        return {
            nome: `${alunoCru.nome || ''} ${alunoCru.sobrenome || ''}`.trim(),
            email: alunoCru['endereodee-mail'] || '',
            ...notas,
        };
    });

    return { curso, ano, alunos };
}

// Carrega os 4 simulados (2 por curso) uma única vez, quando esse arquivo é
// importado pela primeira vez. Fica guardado em memória, organizado por
// "curso-ano", pra não precisar reler os JSONs a cada requisição.
const SIMULADOS = {
    'ec-2023': montarSimulado('ec', 2023),
    'ec-2019': montarSimulado('ec', 2019),
    'si-2021': montarSimulado('si', 2021),
    'si-2017': montarSimulado('si', 2017),
    'ee-2023': montarSimulado('ee', 2023),
    'ee-2019': montarSimulado('ee', 2019),
    'ep-2023': montarSimulado('ep', 2023),
    'ep-2019': montarSimulado('ep', 2019),
};

// Devolve o simulado de um curso+ano específico, ou null se não existir.
function buscarSimulado(curso, ano) {
    const chave = `${curso}-${ano}`;
    return SIMULADOS[chave] || null;
}

// Devolve a lista de simulados disponíveis (curso + ano de cada um), sem os
// dados detalhados dos alunos — útil pra montar uma rota tipo "/simulados"
// que lista o que existe, parecido com o /cursos do enadeRepository.
function listarSimuladosDisponiveis() {
    return Object.values(SIMULADOS).map((s) => ({
        curso: s.curso,
        ano: s.ano,
        quantidadeDeAlunos: s.alunos.length,
    }));
}

module.exports = {
    carregarRespostasCruas,
    extrairRespostas,
    calcularNota,
    arredondar,
    CONFIGURACOES_DE_PROVA,
    escolherConfiguracao,
    caminhoDaPasta,
    montarSimulado,
    buscarSimulado,
    listarSimuladosDisponiveis,
};