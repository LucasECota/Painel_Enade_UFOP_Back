const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { criarPastaDeDados, tentativa } = require('./helpers');

const app = require('../app');

describe('rotas da API', () => {
    let servidor;
    let dados;
    let base;
    const buscar = (caminho) => fetch(`${base}${caminho}`);

    before(async () => {
        dados = criarPastaDeDados(); // desempenho lê notas desta pasta temporária
        dados.gravar('ec', 'fg', [tentativa('a@x.com', 7.5)]);
        servidor = app.listen(0);
        await new Promise((r) => servidor.once('listening', r));
        base = `http://127.0.0.1:${servidor.address().port}/api`;
    });
    after(() => {
        servidor.close();
        dados.limpar();
    });

    describe('/enade', () => {
        test('lista só os cursos do AvaliaUFOP, nessa ordem (sem Engenharia Elétrica)', async () => {
            const cursos = await (await buscar('/enade/cursos')).json();
            assert.deepEqual(cursos.map((c) => c.chave), ['ec', 'ep', 'si']);
        });

        test('devolve os dados de um curso e ano', async () => {
            const res = await buscar('/enade/ep?ano=2023');
            assert.equal(res.status, 200);
            const curso = await res.json();
            assert.ok(curso.totalQuestoes > 0);
            assert.ok(Array.isArray(curso.ce.disciplinas));
        });

        for (const [caminho, motivo] of [
            ['/enade/ee', 'curso removido (Elétrica)'],
            ['/enade/ec?ano=1900', 'ano inexistente'],
            ['/enade/constructor', 'nome especial do JavaScript'],
            ['/enade/__proto__', 'nome especial do JavaScript'],
        ]) {
            test(`404 para ${motivo}: ${caminho}`, async () => {
                assert.equal((await buscar(caminho)).status, 404);
            });
        }
    });

    describe('/desempenho', () => {
        test('devolve os três cursos com as atividades e a média geral', async () => {
            const lista = await (await buscar('/desempenho')).json();
            assert.deepEqual(lista.map((c) => c.chave), ['ec', 'ep', 'si']);
            assert.equal(lista[0].atividades.length, 4);
        });

        test('usa as notas da pasta de dados', async () => {
            const ec = await (await buscar('/desempenho/ec')).json();
            assert.equal(ec.inscritos, 1);
            assert.equal(ec.atividades.find((a) => a.nome.startsWith('Formação Geral')).aproveitamento, 75);
        });

        test('404 para curso inexistente', async () => {
            assert.equal((await buscar('/desempenho/xx')).status, 404);
        });

        test('não vaza nome, e-mail nem código de aluno na resposta', async () => {
            const texto = await (await buscar('/desempenho')).text();
            assert.ok(!texto.includes('@'));
            assert.ok(!texto.includes('"aluno"'));
        });
    });

    describe('/avaliaufop', () => {
        test('traz os três cursos com link do Moodle e os módulos', async () => {
            const d = await (await buscar('/avaliaufop')).json();
            assert.deepEqual(d.cursos.map((c) => c.chave), ['ec', 'ep', 'si']);
            assert.ok(d.cursos.every((c) => c.url.startsWith('https://moodle.aberta.ufop.br/course/view.php?id=')));
            assert.equal(d.modulos.length, 4);
        });
    });

    describe('/resultados e /relatorios', () => {
        test('resultados traz os três cursos', async () => {
            const d = await (await buscar('/resultados')).json();
            assert.deepEqual(d.cursos.map((c) => c.chave), ['ec', 'ep', 'si']);
        });

        test('lista os relatórios do mais recente para o mais antigo', async () => {
            const lista = await (await buscar('/relatorios')).json();
            const anos = lista.map((r) => r.ano);
            assert.ok(anos.length > 0);
            assert.deepEqual(anos, [...anos].sort((a, b) => b - a));
        });

        test('baixa o PDF de um ano existente como anexo', async () => {
            const res = await buscar('/relatorios/2019/download');
            assert.equal(res.status, 200);
            assert.equal(res.headers.get('content-type'), 'application/pdf');
            assert.match(res.headers.get('content-disposition'), /attachment; filename="enade-2019-/);
            const inicio = Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString();
            assert.equal(inicio, '%PDF-');
        });

        for (const ano of ['1999', 'abc', '20', '201', '..%2F..%2Fapp.js', '2019.pdf']) {
            test(`404 ao tentar baixar o relatório "${ano}" (ano inexistente, parcial ou tentativa de sair da pasta)`, async () => {
                assert.equal((await buscar(`/relatorios/${ano}/download`)).status, 404);
            });
        }
    });
});
