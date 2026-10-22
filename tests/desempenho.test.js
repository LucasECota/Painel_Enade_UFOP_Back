const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { criarPastaDeDados, tentativa, linhaDeResumo } = require('./helpers');
const { buscarDesempenho, listarDesempenho } = require('../src/data/desempenhoRepository');
const { gerarIdAnonimo } = require('../src/utils/anonimizacao');

describe('desempenho dos alunos', () => {
    let dados;

    beforeEach(() => {
        dados = criarPastaDeDados();
        // os avisos de arquivo inválido não precisam poluir a saída dos testes
        test.mock.method(console, 'warn', () => {});
    });
    afterEach(() => {
        dados.limpar();
        test.mock.restoreAll();
    });

    const atividade = (curso, nome) => buscarDesempenho(curso).atividades.find((a) => a.nome === nome);

    test('curso sem nenhum arquivo: tudo zerado e nenhuma atividade realizada', () => {
        const d = buscarDesempenho('ec');

        assert.equal(d.inscritos, 0);
        assert.equal(d.concluintes, 0);
        assert.equal(d.media, 0);
        assert.equal(d.atividades.length, 4); // 3 atividades + média geral
        assert.ok(d.atividades.every((a) => a.realizada === false && a.aproveitamento === 0));
    });

    test('curso inexistente devolve null', () => {
        assert.equal(buscarDesempenho('xx'), null);
    });

    test('vale só a maior nota de cada aluno na atividade', () => {
        dados.gravar('ec', 'fg', [tentativa('a@x.com', 5), tentativa('a@x.com', 7.5), tentativa('a@x.com', 2.5)]);

        const fg = atividade('ec', 'Formação Geral (objetivas)');
        assert.equal(fg.aproveitamento, 75);
        assert.equal(fg.realizada, true);
    });

    test('a média da atividade usa a melhor nota de cada aluno', () => {
        dados.gravar('ec', 'fg', [
            tentativa('a@x.com', 10),
            tentativa('b@x.com', 2.5),
            tentativa('b@x.com', 5), // melhor do aluno b
        ]);

        // (100 + 50) / 2 = 75
        assert.equal(atividade('ec', 'Formação Geral (objetivas)').aproveitamento, 75);
    });

    test('ignora a linha de resumo "Média geral" e tentativas não finalizadas', () => {
        dados.gravar('ec', 'fg', [
            tentativa('a@x.com', 5),
            tentativa('b@x.com', 10, { estado: 'Em andamento' }),
            linhaDeResumo,
        ]);

        const d = buscarDesempenho('ec');
        assert.equal(d.inscritos, 1);
        assert.equal(atividade('ec', 'Formação Geral (objetivas)').aproveitamento, 50);
    });

    test('lê qualquer .json da pasta, com qualquer nome, e junta os arquivos', () => {
        dados.gravar('ep', 'ce', [tentativa('a@x.com', 10)], 'ICEA_EP-Simulado Componente-notas.json');
        dados.gravar('ep', 'ce', [tentativa('b@x.com', 5)], 'outro-export.json');

        const d = buscarDesempenho('ep');
        assert.equal(d.inscritos, 2);
        assert.equal(atividade('ep', 'Componente Específico (objetivas)').aproveitamento, 75);
    });

    test('arquivo com JSON inválido é ignorado em vez de derrubar a rota', () => {
        dados.gravar('si', 'fg', '{ isto nao é json', 'quebrado.json');
        dados.gravar('si', 'fg', [tentativa('a@x.com', 10)], 'bom.json');

        const d = buscarDesempenho('si');
        assert.equal(atividade('si', 'Formação Geral (objetivas)').aproveitamento, 100);
        assert.equal(d.inscritos, 1);
    });

    test('sem a coluna avaliar, calcula pela soma das questões', () => {
        const semAvaliar = { estado: 'Finalizada', 'endereodee-mail': 'a@x.com', q1250: '2,50', q2250: '0,00', q3250: '0,00', q4250: '2,50' };
        dados.gravar('ec', 'ce', [semAvaliar]);

        assert.equal(atividade('ec', 'Componente Específico (objetivas)').aproveitamento, 50);
    });

    test('coluna avaliar incoerente (nota maior que o máximo) cai para a soma das questões', () => {
        const incoerente = { estado: 'Finalizada', 'endereodee-mail': 'a@x.com', avaliar1000: '55,00', q1250: '2,50', q2250: '2,50', q3250: '2,50', q4250: '2,50' };
        dados.gravar('ec', 'ce', [incoerente]);

        assert.equal(atividade('ec', 'Componente Específico (objetivas)').aproveitamento, 100);
    });

    test('aluno é o mesmo seja pelo e-mail cru ou pelo código anonimizado', () => {
        const anonimizada = { ...tentativa('ana@x.com', 5), aluno: gerarIdAnonimo('ana@x.com') };
        delete anonimizada['endereodee-mail'];
        dados.gravar('ec', 'fg', [tentativa('ANA@x.com ', 10)], 'cru.json');
        dados.gravar('ec', 'ce', [anonimizada], 'anonimizado.json');

        // mesma pessoa nas duas atividades → 1 inscrito, 1 concluinte do que fez as duas
        assert.equal(buscarDesempenho('ec').inscritos, 1);
    });

    test('concluinte é quem fez as três atividades; aprovado, quem tirou 60% ou mais em todas', () => {
        for (const pasta of ['teste-conhecimento', 'fg', 'ce']) {
            dados.gravar('ec', pasta, [
                tentativa('aprovado@x.com', 8),
                tentativa('reprovado@x.com', pasta === 'ce' ? 5 : 9),
                tentativa('incompleto@x.com', 9), // só aparece abaixo na 1ª atividade
            ].filter((t) => pasta === 'teste-conhecimento' || t['endereodee-mail'] !== 'incompleto@x.com'));
        }

        const d = buscarDesempenho('ec');
        assert.equal(d.inscritos, 3);
        assert.equal(d.concluintes, 2);
        assert.equal(d.aprovados, 1);
    });

    test('participantes.json sobrescreve inscritos e concluintes; null usa o valor calculado', () => {
        dados.gravar('ec', 'fg', [tentativa('a@x.com', 10)]);
        dados.gravarParticipantes({ ec: { inscritos: 20, concluintes: null } });

        const d = buscarDesempenho('ec');
        assert.equal(d.inscritos, 20); // manual
        assert.equal(d.concluintes, 0); // calculado (ninguém fez as 3 atividades)
    });

    test('participantes.json ausente ou quebrado não atrapalha', () => {
        dados.gravar('ec', 'fg', [tentativa('a@x.com', 10)]);
        assert.equal(buscarDesempenho('ec').inscritos, 1);

        dados.gravarParticipantes({});
        require('fs').writeFileSync(require('path').join(dados.pasta, 'participantes.json'), '{ quebrado');
        assert.equal(buscarDesempenho('ec').inscritos, 1);
    });

    test('lista os cursos do AvaliaUFOP na ordem Computação, Produção, Sistemas', () => {
        assert.deepEqual(listarDesempenho().map((c) => c.chave), ['ec', 'ep', 'si']);
    });
});
