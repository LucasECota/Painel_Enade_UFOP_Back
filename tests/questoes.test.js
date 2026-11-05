const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
require('./helpers'); // chave de anonimização falsa

const app = require('../app');
const { interpretarLinha, extrairTabela, ligarTemas, dividirCsv } = require('../scripts/extrair-questoes');
const { anosComQuestoes, buscarQuestoes } = require('../src/data/questoesRepository');

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
    test('lista os anos com tabela de cada curso (hoje só Computação e Produção em 2023)', () => {
        assert.deepEqual(anosComQuestoes('ec'), [2023]);
        assert.deepEqual(anosComQuestoes('ep'), [2023]);
        assert.deepEqual(anosComQuestoes('si'), []);
        assert.deepEqual(anosComQuestoes('xx'), []);
    });

    test('buscarQuestoes devolve null para o que não existe e nunca lê fora da pasta', () => {
        assert.equal(buscarQuestoes('ec', 2019), null);
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
        });

        for (const caminho of [
            '/ec/questoes?ano=2019',
            '/si/questoes',
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

            assert.deepEqual(porChave, { ec: [2023], ep: [2023], si: [] });
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
                    assert.equal(q.acertos.curso, q.respostas[q.gabarito], `questão ${q.numero}`);
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
        });
    }
});

describe('relatórios de curso em data/relatorios-curso', () => {
    const pasta = path.join(__dirname, '..', 'data', 'relatorios-curso');

    test('todo PDF segue o padrão enade-AAAA-<curso>-relatorio-de-curso.pdf', () => {
        for (const f of fs.readdirSync(pasta).filter((n) => n.endsWith('.pdf'))) {
            assert.match(
                f,
                /^enade-\d{4}-(engenharia-de-computacao|engenharia-de-producao|sistemas-de-informacao)-relatorio-de-curso\.pdf$/,
                `nome fora do padrão: ${f}`
            );
        }
    });
});
