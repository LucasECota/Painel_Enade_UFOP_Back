const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');

// Arquivo separado: as variáveis valem para o app inteiro, então precisa de um processo só dele.
process.env.TRUST_PROXY = '1';
process.env.LIMITE_REQUISICOES = '2';
const app = require('../app');
const { lerTrustProxy } = require('../src/middlewares/seguranca');

describe('API atrás de um proxy (TRUST_PROXY=1)', () => {
    let servidor;
    let base;
    before(async () => {
        servidor = app.listen(0);
        await new Promise((r) => servidor.once('listening', r));
        base = `http://127.0.0.1:${servidor.address().port}/api/avaliaufop`;
    });
    after(() => servidor.close());
    const como = (ip) => fetch(base, { headers: { 'X-Forwarded-For': ip } });

    test('cada visitante (IP do X-Forwarded-For) tem a sua própria cota', async () => {
        const a = [];
        for (let i = 0; i < 3; i++) a.push((await como('203.0.113.10')).status);
        assert.deepEqual(a, [200, 200, 429]); // o visitante A estourou o limite...

        assert.equal((await como('203.0.113.20')).status, 200); // ...e o visitante B não é afetado
    });
});

describe('lerTrustProxy', () => {
    test('valor vazio ou inválido: nenhum proxy', () => {
        for (const v of ['', '0', 'abc', '-1', '1.5']) assert.equal(lerTrustProxy(v), false, `valor: ${v}`);
    });

    test('sem a variável de ambiente: nenhum proxy', () => {
        const original = process.env.TRUST_PROXY;
        delete process.env.TRUST_PROXY;
        try {
            assert.equal(lerTrustProxy(), false);
        } finally {
            process.env.TRUST_PROXY = original;
        }
    });

    test('número inteiro positivo: quantidade de proxies', () => {
        assert.equal(lerTrustProxy('1'), 1);
        assert.equal(lerTrustProxy('2'), 2);
    });
});
