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

    describe('Simulado Enade (separado das outras atividades)', () => {
        const comQuestoes = (email, nota) => tentativa(email, nota, { q1050: '0,50', q2050: '0,00', q3050: '0,50' });

        test('curso sem a pasta do simulado: não realizado, sem alunos', () => {
            assert.deepEqual(buscarDesempenho('ec').simulado, { realizado: false, alunos: 0, media: 0, questoes: null, comparacao: null });
        });

        test('conta quantos alunos fizeram e a média das notas, com o número de questões', () => {
            dados.gravar('ec', 'simulado', [comQuestoes('a@x.com', 5), comQuestoes('b@x.com', 7), linhaDeResumo]);

            assert.deepEqual(buscarDesempenho('ec').simulado, { realizado: true, alunos: 2, media: 60, questoes: 3, comparacao: null });
        });

        test('vale a melhor nota de cada aluno, e tentativa não finalizada não conta', () => {
            dados.gravar('si', 'simulado', [
                comQuestoes('a@x.com', 3),
                comQuestoes('a@x.com', 8),
                tentativa('b@x.com', 10, { estado: 'Em andamento' }),
            ]);

            const { simulado } = buscarDesempenho('si');
            assert.equal(simulado.alunos, 1);
            assert.equal(simulado.media, 80);
        });

        describe('comparação questão a questão com o Enade', () => {
            const gravarMapa = (mapa) => require('fs').writeFileSync(require('path').join(dados.pasta, 'simulados.json'), JSON.stringify(mapa));
            // 3 questões, cada uma valendo 0,50: Q1 (Formação Geral), Q10 e Q33 (desconsiderada) de EP 2023
            const tentativaCom = (email, a, b, c, nota) => tentativa(email, nota, { q1050: a, q2050: b, q3050: c });

            test('acerto médio dos alunos ao lado do acerto oficial da UFOP e do Brasil, na ordem do simulado', () => {
                gravarMapa({ ep: { edicao: 2023, questoes: [1, 10, 33] } });
                dados.gravar('ep', 'simulado', [
                    tentativaCom('a@x.com', '0,50', '0,50', '0,00', 6.67),
                    tentativaCom('b@x.com', '0,50', '-', '0,00', 3.33),
                    linhaDeResumo,
                ]);

                const { comparacao } = buscarDesempenho('ep').simulado;
                assert.equal(comparacao.edicao, 2023);
                assert.deepEqual(
                    comparacao.questoes.map((q) => [q.posicao, q.numero, q.simulado]),
                    [[1, 1, 100], [2, 10, 50], [3, 33, 0]]
                );
                const [q1, q10, q33] = comparacao.questoes;
                const oficial = require('../src/data/questoesRepository').buscarQuestoes('ep', 2023);
                const doRelatorio = (n) => oficial.componentes.flatMap((c) => c.questoes).find((q) => q.numero === n);
                assert.equal(q1.componente, 'formacaoGeral');
                assert.equal(q1.ufop, doRelatorio(1).acertos.curso);
                assert.equal(q1.brasil, doRelatorio(1).acertos.brasil);
                assert.equal(q10.gabarito, doRelatorio(10).gabarito);
                assert.ok(q10.imagem.endsWith('ep-10.webp'));
                // desconsiderada: sem percentual oficial, com o gabarito da prova
                assert.equal(q33.situacao, 'desconsiderada');
                assert.equal(q33.ufop, null);
                assert.equal(q33.brasil, null);
                assert.match(q33.gabarito, /^[A-E]$/);
            });

            test('questão de uma edição que o curso não fez usa os acertos do curso de referência e avisa de qual é', () => {
                // Sistemas não fez o Enade 2023: a Formação Geral é comparada com Computação 2023
                gravarMapa({ si: { edicao: 2021, questoes: [{ numero: 1, edicao: 2023, referencia: 'ec' }, 10, 17] } });
                dados.gravar('si', 'simulado', [tentativaCom('a@x.com', '0,50', '0,50', '0,00', 6.67)]);

                const { comparacao } = buscarDesempenho('si').simulado;
                assert.equal(comparacao.edicao, 2021);
                const [fg, valida, desconsiderada] = comparacao.questoes;
                const daComputacao = require('../src/data/questoesRepository')
                    .buscarQuestoes('ec', 2023)
                    .componentes[0].questoes.find((q) => q.numero === 1);

                assert.deepEqual([fg.numero, fg.edicao], [1, 2023]);
                assert.deepEqual(fg.referencia, { curso: 'ec', nome: 'Engenharia de Computação' });
                assert.equal(fg.ufop, daComputacao.acertos.curso);
                assert.equal(fg.brasil, daComputacao.acertos.brasil);
                assert.equal(fg.simulado, 100);
                assert.equal(fg.imagem, '2023/fg-1.webp');
                assert.match(fg.gabarito, /^[A-E]$/);

                assert.deepEqual([valida.edicao, valida.referencia], [2021, null]);
                assert.ok(valida.ufop > 0 && valida.brasil > 0);
                assert.deepEqual([desconsiderada.situacao, desconsiderada.ufop, desconsiderada.brasil], ['desconsiderada', null, null]);
            });

            test('o arquivo simulados.json do projeto liga as 20 questões de cada curso a questões que existem, com imagem', () => {
                const mapas = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'avaliaufop', 'simulados.json'), 'utf-8'));
                const { buscarQuestoes } = require('../src/data/questoesRepository');
                assert.deepEqual(Object.keys(mapas).sort(), ['ec', 'ep', 'si']);
                for (const [curso, mapa] of Object.entries(mapas)) {
                    assert.equal(mapa.questoes.length, 20, curso);
                    for (const item of mapa.questoes) {
                        const { numero, edicao = mapa.edicao, referencia = curso } = typeof item === 'number' ? { numero: item } : item;
                        const achada = buscarQuestoes(referencia, edicao).componentes.flatMap((c) => c.questoes).find((q) => q.numero === numero);
                        assert.ok(achada?.imagem, `${curso}: questão ${numero} de ${edicao}`);
                    }
                }
            });

            test('com várias tentativas, usa as respostas da melhor de cada aluno', () => {
                gravarMapa({ ep: { edicao: 2023, questoes: [1, 10, 33] } });
                dados.gravar('ep', 'simulado', [
                    tentativaCom('a@x.com', '0,00', '0,00', '0,00', 0),
                    tentativaCom('a@x.com', '0,50', '0,50', '0,50', 10),
                ]);

                const { comparacao } = buscarDesempenho('ep').simulado;
                assert.deepEqual(comparacao.questoes.map((q) => q.simulado), [100, 100, 100]);
            });

            test('sem mapa, ou com número de questões diferente, não há comparação (e o resumo continua)', () => {
                dados.gravar('ep', 'simulado', [tentativaCom('a@x.com', '0,50', '0,50', '0,50', 10)]);
                assert.equal(buscarDesempenho('ep').simulado.comparacao, null);

                gravarMapa({ ep: { edicao: 2023, questoes: [1, 10] } });
                const { simulado } = buscarDesempenho('ep');
                assert.equal(simulado.comparacao, null);
                assert.equal(simulado.alunos, 1);
            });
        });

        test('não entra na média geral, nas atividades, nos inscritos nem nos concluintes', () => {
            dados.gravar('ep', 'fg', [tentativa('a@x.com', 5)]);
            const antes = buscarDesempenho('ep');

            dados.gravar('ep', 'simulado', [comQuestoes('a@x.com', 10), comQuestoes('z@x.com', 10)]);
            const depois = buscarDesempenho('ep');

            assert.equal(depois.media, antes.media);
            assert.equal(depois.inscritos, antes.inscritos);
            assert.equal(depois.concluintes, antes.concluintes);
            assert.deepEqual(depois.atividades, antes.atividades);
            assert.equal(depois.simulado.alunos, 2);
        });
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
