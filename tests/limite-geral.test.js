const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');

// Arquivo separado: o limite vale para o app inteiro, então precisa de um processo só dele.
process.env.LIMITE_REQUISICOES = '5';
const app = require('../app');

describe('limite geral da API', () => {
    let servidor;
    let base;
    before(async () => {
        servidor = app.listen(0);
        await new Promise((r) => servidor.once('listening', r));
        base = `http://127.0.0.1:${servidor.address().port}`;
    });
    after(() => servidor.close());

    test('depois de 5 requisições por minuto, qualquer rota de /api responde 429', async () => {
        const status = [];
        for (let i = 0; i < 6; i++) status.push((await fetch(`${base}/api/avaliaufop`)).status);
        assert.deepEqual(status, [200, 200, 200, 200, 200, 429]);

        // o bloqueio vale para o IP em toda a API, não só para a rota repetida
        assert.equal((await fetch(`${base}/api/enade/cursos`)).status, 429);
    });

    test('a página inicial do servidor (fora de /api) não entra no limite', async () => {
        assert.equal((await fetch(`${base}/`)).status, 200);
    });
});
