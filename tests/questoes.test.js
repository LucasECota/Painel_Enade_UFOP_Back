const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
require('./helpers'); // chave de anonimização falsa

const app = require('../app');
const { interpretarLinha, extrairTabela, ligarTemas, dividirCsv } = require('../scripts/extrair-questoes');
const { anosComQuestoes, buscarQuestoes, desempenhoPorArea } = require('../src/data/questoesRepository');

describe('extração da tabela do PDF (scripts/extrair-questoes.js)', () => {
    describe('interpretarLinha', () => {
        test('lê uma questão válida: acertos, gabarito e distribuição das respostas', () => {
            const q = interpretarLinha(
                ' 10   31,1   39,4   36,5   42,5   39,8   38,2   B   22,2   31,1   13,3   15,6   17,8   0,0'
            );

            assert.equal(q.numero, 10);
            assert.equal(q.gabarito, 'B');
            assert.equal(q.situacao, 'valida');
            assert.deepEqual(q.acertos, {
                curso: 31.1,
                uf: 39.4,
                regiao: 36.5,
                catAdm: 42.5,
                orgAcad: 39.8,
                brasil: 38.2,
            });
            assert.deepEqual(q.respostas, { A: 22.2, B: 31.1, C: 13.3, D: 15.6, E: 17.8, SI: 0 });
        });

        test('"**" é questão desconsiderada pelo bisserial: sem gabarito nem percentuais', () => {
            const q = interpretarLinha(' 17   -   -   -   -   -   -   **   -   -   -   -   -   -');

            assert.equal(q.numero, 17);
            assert.equal(q.situacao, 'desconsiderada');
            assert.equal(q.gabarito, null);
            assert.equal(q.acertos, null);
            assert.equal(q.respostas, null);
        });

        test('"*" é questão anulada pela comissão', () => {
            assert.equal(interpretarLinha('5 - - - - - - * - - - - - -').situacao, 'anulada');
        });

        test('ignora linhas que não são de questão (cabeçalho, título, número de página)', () => {
            for (const linha of [
                'Questão',
                'Brasil   A   B   C   D   E   SI*',
                'Percentual de a certo s',
                'ENADE/202 3   34',
                'Tabela 5.1.3 – Distribuição das respostas dos concluintes',
                '10   31,1   39,4', // faltam colunas
                '10   31,1   39,4   36,5   42,5   39,8   38,2   Z   22,2   31,1   13,3   15,6   17,8   0,0', // gabarito inválido
                'abc   31,1   39,4   36,5   42,5   39,8   38,2   B   22,2   31,1   13,3   15,6   17,8   0,0', // número inválido
            ]) {
                assert.equal(interpretarLinha(linha), null, `deveria ignorar: ${linha}`);
            }
        });
    });

    describe('extrairTabela', () => {
        const questao = (n) =>
            ` ${n}   50,0   40,0   40,0   40,0   40,0   40,0   A   50,0   10,0   10,0   10,0   10,0   10,0`;

        test('pega só as questões entre o título da tabela e o título da seguinte', () => {
            const linhas = [
                'Tabela 5.1.1 – FG',
                questao(1),
                questao(2),
                'Tabela 5.1.2 – discursiva',
                questao(99),
                'Tabela 5.1.3 – CE',
                questao(10),
            ];

            assert.deepEqual(
                extrairTabela(linhas, '5.1.1', '5.1.2').map((q) => q.numero),
                [1, 2]
            );
            assert.deepEqual(
                extrairTabela(linhas, '5.1.3', '5.1.4').map((q) => q.numero),
                [10]
            );
        });

        test('ignora a ocorrência do título no sumário, que não tem questões', () => {
            const linhas = [
                'Tabela 5.1.3 – CE ........ 33',
                'Tabela 5.1.4 – discursiva ........ 34',
                'Capítulo 5',
                'Tabela 5.1.3 – CE',
                questao(10),
                questao(11),
                'Tabela 5.1.4 – discursiva',
            ];

            assert.deepEqual(
                extrairTabela(linhas, '5.1.3', '5.1.4').map((q) => q.numero),
                [10, 11]
            );
        });

        test('sem a tabela, devolve lista vazia', () => {
            assert.deepEqual(extrairTabela(['nada aqui'], '5.1.3', '5.1.4'), []);
        });
    });

    describe('ligarTemas', () => {
        const prova = [
            { numero: 'D2', tipo: 'Componente Específico', disciplina: 'Algoritmos', discursiva: true },
            { numero: '33', tipo: 'Componente Específico', disciplina: 'Algoritmos', discursiva: false },
            { numero: '11', tipo: 'Componente Específico', disciplina: 'Redes', discursiva: false },
            { numero: '34', tipo: 'Componente Específico', disciplina: 'Redes', discursiva: false },
            { numero: '1', tipo: 'Formação Geral', disciplina: 'Sociedade', discursiva: false },
        ];

        test('a discursiva fica com o primeiro assunto e as objetivas seguem em ordem crescente', () => {
            const avisos = [];
            const temas = ligarTemas(
                prova,
                { Algoritmos: ['Quicksort', 'Pilha e fila'], Redes: ['OSPF', 'TCP e UDP'] },
                avisos
            );

            assert.equal(temas.D2, 'Quicksort');
            assert.equal(temas['33'], 'Pilha e fila');
            assert.equal(temas['11'], 'OSPF');
            assert.equal(temas['34'], 'TCP e UDP');
            assert.deepEqual(avisos, []);
        });

        test('se a quantidade de assuntos não bate, não inventa o tema e avisa', () => {
            const avisos = [];
            const temas = ligarTemas(prova, { Algoritmos: ['Só um'], Redes: ['OSPF', 'TCP e UDP'] }, avisos);

            assert.equal(temas['33'], undefined);
            assert.equal(temas['11'], 'OSPF');
            assert.equal(avisos.length, 1);
            assert.match(avisos[0], /Algoritmos/);
        });

        test('a Formação Geral não recebe tema', () => {
            assert.equal(ligarTemas(prova, { Algoritmos: ['a', 'b'], Redes: ['c', 'd'] }, [])['1'], undefined);
        });
    });

    test('dividirCsv respeita vírgulas dentro de aspas', () => {
        assert.deepEqual(dividirCsv('a,"b, c",d'), ['a', 'b, c', 'd']);
    });
});

describe('repositório e rota de questões', () => {
    test('lista os anos com tabela de cada curso (um por relatório de curso do INEP na pasta)', () => {
        assert.deepEqual(anosComQuestoes('ec'), [2023, 2019, 2017, 2014]);
        assert.deepEqual(anosComQuestoes('ep'), [2023, 2019, 2017, 2014]);
        assert.deepEqual(anosComQuestoes('si'), [2021, 2017, 2014]);
        assert.deepEqual(anosComQuestoes('xx'), []);
    });

    test('buscarQuestoes devolve null para o que não existe e nunca lê fora da pasta', () => {
        assert.equal(buscarQuestoes('ec', 2008), null);
        assert.equal(buscarQuestoes('ec', '../../package'), null);
        assert.equal(buscarQuestoes('../package', 2023), null);
        assert.ok(buscarQuestoes('ec', '2023'));
    });

    describe('GET /api/enade/:curso/questoes', () => {
        let servidor;
        let base;
        before(async () => {
            servidor = app.listen(0);
            await new Promise((r) => servidor.once('listening', r));
            base = `http://127.0.0.1:${servidor.address().port}/api/enade`;
        });
        after(() => servidor.close());

        test('devolve a tabela do curso e ano pedidos', async () => {
            const res = await fetch(`${base}/ep/questoes?ano=2023`);
            const dados = await res.json();

            assert.equal(res.status, 200);
            assert.equal(dados.curso, 'ep');
            assert.equal(dados.ano, 2023);
            assert.deepEqual(
                dados.componentes.map((c) => c.tipo),
                ['formacaoGeral', 'especifico']
            );
        });

        test('sem o ano, devolve a edição mais recente que tem a tabela', async () => {
            assert.equal((await (await fetch(`${base}/ec/questoes`)).json()).ano, 2023);
            assert.equal((await (await fetch(`${base}/si/questoes`)).json()).ano, 2021);
        });

        for (const caminho of [
            '/ec/questoes?ano=2008',
            '/si/questoes?ano=2019',
            '/xx/questoes?ano=2023',
            '/ec/questoes?ano=../../package',
            '/ec/questoes?ano=2023.json',
        ]) {
            test(`404 para ${caminho}`, async () => {
                assert.equal((await fetch(`${base}${caminho}`)).status, 404);
            });
        }

        test('/cursos informa em quais anos cada curso tem a tabela', async () => {
            const cursos = await (await fetch(`${base}/cursos`)).json();
            const porChave = Object.fromEntries(cursos.map((c) => [c.chave, c.anosComQuestoes]));

            assert.deepEqual(porChave, {
                ec: [2023, 2019, 2017, 2014],
                ep: [2023, 2019, 2017, 2014],
                si: [2021, 2017, 2014],
            });
        });

        test('/cursos informa em quais anos cada curso tem os assuntos por disciplina', async () => {
            const cursos = await (await fetch(`${base}/cursos`)).json();
            const porChave = Object.fromEntries(cursos.map((c) => [c.chave, c.anosComAssuntos]));

            assert.deepEqual(porChave, { ec: [2023, 2019, 2017, 2014], ep: [2023, 2019, 2017, 2014], si: [2021, 2017, 2014] });
        });
    });
});

// Estes testes protegem os dados extraídos dos relatórios do INEP, conferindo regras que a
// própria tabela precisa respeitar (por exemplo: o acerto do curso é a resposta do gabarito).
describe('integridade de data/questoes', () => {
    const pasta = path.join(__dirname, '..', 'data', 'questoes');
    const arquivos = fs.readdirSync(pasta).filter((f) => f.endsWith('.json'));
    const slugs = {
        ec: 'engenharia-de-computacao',
        ep: 'engenharia-de-producao',
        si: 'sistemas-de-informacao',
    };

    test('existe pelo menos uma tabela', () => {
        assert.ok(arquivos.length > 0);
    });

    for (const arquivo of arquivos) {
        describe(arquivo, () => {
            const dados = JSON.parse(fs.readFileSync(path.join(pasta, arquivo), 'utf-8'));
            const todas = dados.componentes.flatMap((c) => c.questoes);

            test('o nome do arquivo bate com o curso e o ano do conteúdo', () => {
                assert.equal(arquivo, `${dados.curso}-${dados.ano}.json`);
            });

            test('o relatório de origem está na pasta data/relatorios-curso', () => {
                const pdf = `enade-${dados.ano}-${slugs[dados.curso]}-relatorio-de-curso.pdf`;
                assert.ok(fs.existsSync(path.join(__dirname, '..', 'data', 'relatorios-curso', pdf)), `falta ${pdf}`);
            });

            test('Formação Geral antes do Componente Específico, com números crescentes sem repetir', () => {
                const numeros = todas.map((q) => q.numero);
                assert.deepEqual(
                    numeros,
                    [...numeros].sort((a, b) => a - b)
                );
                assert.equal(new Set(numeros).size, numeros.length);
                const [fg, ce] = dados.componentes.map((c) => c.questoes.map((q) => q.numero));
                assert.ok(Math.max(...fg) < Math.min(...ce));
            });

            test('questão válida: gabarito A–E, percentuais de 0 a 100 e acerto do curso = resposta do gabarito', () => {
                for (const q of todas.filter((x) => x.situacao === 'valida')) {
                    assert.match(q.gabarito, /^[A-E]$/, `questão ${q.numero}`);
                    for (const v of [...Object.values(q.acertos), ...Object.values(q.respostas)]) {
                        assert.ok(v >= 0 && v <= 100, `questão ${q.numero}: ${v}`);
                    }
                    // alguns relatórios antigos trazem "-" no acerto do curso: aí não há o que comparar
                    if (q.acertos.curso !== null) assert.equal(q.acertos.curso, q.respostas[q.gabarito], `questão ${q.numero}`);
                }
            });

            test('as respostas de cada questão somam 100% (tolerância de arredondamento)', () => {
                for (const q of todas.filter((x) => x.situacao === 'valida')) {
                    const soma = Object.values(q.respostas).reduce((a, b) => a + b, 0);
                    assert.ok(Math.abs(soma - 100) <= 0.5, `questão ${q.numero}: soma ${soma}`);
                }
            });

            test('questão anulada ou desconsiderada não tem gabarito nem percentuais', () => {
                for (const q of todas.filter((x) => x.situacao !== 'valida')) {
                    assert.ok(['anulada', 'desconsiderada'].includes(q.situacao), `questão ${q.numero}`);
                    assert.equal(q.gabarito, null);
                    assert.equal(q.acertos, null);
                    assert.equal(q.respostas, null);
                }
            });

            test('disciplina e tema são texto ou nulos (nunca vazios)', () => {
                for (const q of todas) {
                    for (const campo of [q.disciplina, q.tema])
                        assert.ok(campo === null || (typeof campo === 'string' && campo.trim() !== ''));
                }
            });

            test('toda questão do Componente Específico tem disciplina', () => {
                const ce = dados.componentes.find((c) => c.tipo === 'especifico').questoes;
                assert.ok(ce.every((q) => q.disciplina));
            });

            test('toda questão de Formação Geral tem disciplina e tema', () => {
                const fg = dados.componentes.find((c) => c.tipo === 'formacaoGeral').questoes;
                assert.ok(fg.every((q) => q.disciplina && q.tema));
            });
        });
    }
});

describe('relatórios de curso em data/relatorios-curso', () => {
    const pasta = path.join(__dirname, '..', 'data', 'relatorios-curso');

    test('todo PDF segue o padrão enade-AAAA-<curso>-relatorio-de-curso.pdf', () => {
        for (const f of fs.readdirSync(pasta).filter((n) => n.endsWith('.pdf'))) {
            assert.match(
                f,
                /^enade-\d{4}-(engenharia-de-computacao|engenharia-de-producao|engenharia-eletrica|sistemas-de-informacao)-relatorio-de-curso\.pdf$/,
                `nome fora do padrão: ${f}`
            );
        }
    });
});

// Nos anos com assuntos, cada questão do Componente Específico precisa ter o seu: se faltar ou
// sobrar um, os temas ficam trocados de questão.
describe('assuntos por disciplina (data/*.csv)', () => {
    const { buscarTodosOsCursos } = require('../src/data/enadeRepository');

    for (const [chave, curso] of Object.entries(buscarTodosOsCursos())) {
        for (const ano of curso.anosComAssuntos) {
            test(`${chave} ${ano}: um assunto por questão em cada disciplina`, () => {
                for (const d of curso.porAno[ano].ce.disciplinas) {
                    assert.equal(d.assuntos.length, d.qtd, `${d.nome}: ${d.qtd} questões e ${d.assuntos.length} assuntos`);
                    assert.ok(d.discursivas >= 0 && d.discursivas <= d.qtd, `${d.nome}: discursivas fora do possível`);
                }
            });
        }
    }

    test('EC 2017: discursivas por disciplina vêm dos arquivos da prova', () => {
        const { ce } = buscarTodosOsCursos().ec.porAno[2017];
        const discursivas = Object.fromEntries(ce.disciplinas.filter((d) => d.discursivas).map((d) => [d.nome, d.discursivas]));

        assert.deepEqual(discursivas, {
            'Algoritmos e Estruturas de Dados I': 1,
            'Microprocessadores e Microcontroladores': 1,
            'Sistemas Operacionais': 1,
        });
    });

    test('a API informa quantas questões de cada componente são discursivas, e o resto são objetivas', () => {
        for (const [chave, curso] of Object.entries(buscarTodosOsCursos())) {
            for (const ano of curso.anosComAssuntos) {
                const { fg, ce } = curso.porAno[ano];
                assert.equal(fg.discursivas, ano === 2023 ? 1 : 2, `${chave} ${ano} FG`);
                assert.equal(ce.discursivas, ano === 2023 ? 1 : 3, `${chave} ${ano} CE`);
                assert.ok(fg.discursivas <= fg.total && ce.discursivas <= ce.total);
            }
        }
    });

    test('cada edição tem 3 discursivas de Componente Específico (2023 tem 1)', () => {
        for (const [chave, curso] of Object.entries(buscarTodosOsCursos())) {
            for (const ano of curso.anosComAssuntos) {
                const total = curso.porAno[ano].ce.disciplinas.reduce((soma, d) => soma + d.discursivas, 0);
                assert.equal(total, ano === 2023 ? 1 : 3, `${chave} ${ano}`);
            }
        }
    });
});

// A Formação Geral é a mesma prova para todos os cursos do ano: o arquivo data/formacao-geral.json
// diz a disciplina e o tema de cada questão e precisa casar com as tabelas do INEP.
describe('data/formacao-geral.json', () => {
    const fg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'formacao-geral.json'), 'utf-8'));
    const { buscarTodosOsCursos } = require('../src/data/enadeRepository');

    test('cada ano tem 2 discursivas (1 em 2023) e as objetivas numeradas de 1 em diante, todas com disciplina e tema', () => {
        for (const [ano, questoes] of Object.entries(fg)) {
            const objetivas = questoes.filter((q) => q.tipo === 'objetiva');
            assert.equal(questoes.filter((q) => q.tipo === 'discursiva').length, ano === '2023' ? 1 : 2, ano);
            assert.deepEqual(
                objetivas.map((q) => Number(q.numero)),
                objetivas.map((_, i) => i + 1),
                ano
            );
            for (const q of questoes) assert.ok(q.disciplina && q.tema, `${ano} questão ${q.numero}`);
        }
    });

    test('o número de objetivas bate com a tabela de Formação Geral de cada relatório', () => {
        for (const arquivo of fs.readdirSync(path.join(__dirname, '..', 'data', 'questoes'))) {
            const dados = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'questoes', arquivo), 'utf-8'));
            const tabela = dados.componentes.find((c) => c.tipo === 'formacaoGeral').questoes;
            const objetivas = fg[dados.ano].filter((q) => q.tipo === 'objetiva');
            assert.equal(tabela.length, objetivas.length, arquivo);
        }
    });

    test('a API mostra as disciplinas da Formação Geral e as discursivas vêm primeiro na lista de assuntos', () => {
        const { fg: bloco } = buscarTodosOsCursos().ec.porAno[2017];
        const direitos = bloco.disciplinas.find((d) => d.nome === 'Direitos Humanos e Cidadania');

        assert.equal(bloco.total, 10);
        assert.equal(bloco.disciplinas.reduce((soma, d) => soma + d.qtd, 0), 10);
        assert.equal(direitos.discursivas, 1);
        assert.equal(direitos.assuntos[0], 'Nome social e identidade de gênero de pessoas trans');
    });
});

describe('desempenho por área e por tema', () => {
    test('uma edição por tabela, da mais recente para a mais antiga', () => {
        const d = desempenhoPorArea('ec');
        assert.deepEqual(d.edicoes, [2023, 2019, 2017, 2014]);
        assert.deepEqual(d.porEdicao.map((e) => e.ano), d.edicoes);
        assert.equal(d.nome, 'Engenharia de Computação');
    });

    test('curso sem tabela devolve null', () => {
        assert.equal(desempenhoPorArea('xx'), null);
    });

    test('o desempenho de uma área é a média do acerto das suas questões válidas (EC 2023, Circuitos Elétricos I)', () => {
        const tabela = buscarQuestoes('ec', 2023);
        const doCurso = tabela.componentes[1].questoes.filter((q) => q.disciplina === 'Circuitos Elétricos I' && q.situacao === 'valida');
        const esperadoUfop = Math.round((doCurso.reduce((s, q) => s + q.acertos.curso, 0) / doCurso.length) * 10) / 10;
        const esperadoBrasil = Math.round((doCurso.reduce((s, q) => s + q.acertos.brasil, 0) / doCurso.length) * 10) / 10;

        const area = desempenhoPorArea('ec').porEdicao[0].areas.find((a) => a.disciplina === 'Circuitos Elétricos I');
        assert.equal(area.questoes, doCurso.length);
        assert.equal(area.ufop, esperadoUfop);
        assert.equal(area.brasil, esperadoBrasil);
    });

    test('questões anuladas ou desconsideradas ficam de fora, e todo valor está entre 0 e 100', () => {
        for (const curso of ['ec', 'ep', 'si']) {
            for (const edicao of desempenhoPorArea(curso).porEdicao) {
                const validas = buscarQuestoes(curso, edicao.ano)
                    .componentes.flatMap((c) => c.questoes)
                    .filter((q) => q.situacao === 'valida' && q.disciplina).length;
                assert.equal(edicao.areas.reduce((s, a) => s + a.questoes, 0), validas, `${curso} ${edicao.ano}`);
                for (const t of [...edicao.areas, ...edicao.temas]) {
                    assert.ok(t.ufop >= 0 && t.ufop <= 100 && t.brasil >= 0 && t.brasil <= 100);
                }
            }
        }
    });

    test('GET /api/enade/:curso/desempenho-areas', async () => {
        const servidor = app.listen(0);
        await new Promise((r) => servidor.once('listening', r));
        const base = `http://127.0.0.1:${servidor.address().port}/api/enade`;
        try {
            const res = await fetch(`${base}/si/desempenho-areas`);
            const d = await res.json();
            assert.equal(res.status, 200);
            assert.deepEqual(d.edicoes, [2021, 2017, 2014]);
            assert.equal((await fetch(`${base}/xx/desempenho-areas`)).status, 404);
        } finally {
            servidor.close();
        }
    });
});
