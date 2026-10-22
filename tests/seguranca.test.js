const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { spawnSync } = require('child_process');
const path = require('path');
require('./helpers'); // define a chave de anonimização falsa

// limite de downloads baixo só neste arquivo, para testar sem fazer dezenas de requisições
process.env.LIMITE_DOWNLOADS = '3';

const app = require('../app');
const { criarCors, criarLimitador, limiteGeral, origensPermitidas } = require('../src/middlewares/seguranca');
const { tratarErros } = require('../src/middlewares/erros');

// sobe um app qualquer numa porta livre e devolve { base, fechar }
async function subir(aplicacao) {
    const servidor = aplicacao.listen(0);
    await new Promise((r) => servidor.once('listening', r));
    return { base: `http://127.0.0.1:${servidor.address().port}`, fechar: () => servidor.close() };
}

describe('cabeçalhos de segurança (helmet)', () => {
    let api;
    before(async () => (api = await subir(app)));
    after(() => api.fechar());

    test('não anuncia que usa Express', async () => {
        const res = await fetch(`${api.base}/api/avaliaufop`);
        assert.equal(res.headers.get('x-powered-by'), null);
    });

    test('manda os cabeçalhos de proteção', async () => {
        const res = await fetch(`${api.base}/api/avaliaufop`);
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.ok(res.headers.get('content-security-policy'));
        assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
    });
});

describe('CORS', () => {
    let api;
    before(async () => (api = await subir(app)));
    after(() => api.fechar());
    const comOrigem = (origem) => fetch(`${api.base}/api/avaliaufop`, { headers: { Origin: origem } });

    test('libera o front de desenvolvimento (localhost:5173)', async () => {
        const res = await comOrigem('http://localhost:5173');
        assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    });

    test('não libera um site qualquer', async () => {
        const res = await comOrigem('https://site-malicioso.example');
        assert.equal(res.headers.get('access-control-allow-origin'), null);
    });

    test('chamadas sem Origin (curl, outros servidores) continuam funcionando', async () => {
        assert.equal((await fetch(`${api.base}/api/avaliaufop`)).status, 200);
    });

    test('só aceita leitura: o pré-voo de um POST não é liberado', async () => {
        const res = await fetch(`${api.base}/api/avaliaufop`, {
            method: 'OPTIONS',
            headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' },
        });
        assert.ok(!(res.headers.get('access-control-allow-methods') || '').includes('POST'));
    });

    test('CORS_ORIGINS define a lista de endereços liberados', async () => {
        assert.deepEqual(origensPermitidas('https://a.com, https://b.com ,'), ['https://a.com', 'https://b.com']);

        const pequeno = express().use(criarCors(['https://painel.exemplo.edu.br'])).get('/', (q, r) => r.send('ok'));
        const { base, fechar } = await subir(pequeno);
        try {
            const liberado = await fetch(base, { headers: { Origin: 'https://painel.exemplo.edu.br' } });
            const negado = await fetch(base, { headers: { Origin: 'http://localhost:5173' } });
            assert.equal(liberado.headers.get('access-control-allow-origin'), 'https://painel.exemplo.edu.br');
            assert.equal(negado.headers.get('access-control-allow-origin'), null);
        } finally {
            fechar();
        }
    });
});

describe('limite de requisições', () => {
    test('depois do limite responde 429 em JSON, com cabeçalhos do limite', async () => {
        const pequeno = express().use(criarLimitador({ max: 3 })).get('/', (q, r) => r.send('ok'));
        const { base, fechar } = await subir(pequeno);
        try {
            const status = [];
            for (let i = 0; i < 4; i++) status.push((await fetch(base)).status);
            assert.deepEqual(status, [200, 200, 200, 429]);

            const bloqueada = await fetch(base);
            assert.match(bloqueada.headers.get('ratelimit') || bloqueada.headers.get('ratelimit-policy') || '', /\d/);
            assert.deepEqual(await bloqueada.json(), { erro: 'Muitas requisições. Tente de novo em instantes.' });
        } finally {
            fechar();
        }
    });

    test('LIMITE_REQUISICOES muda o limite geral', async () => {
        process.env.LIMITE_REQUISICOES = '2';
        const pequeno = express().use(limiteGeral()).get('/', (q, r) => r.send('ok'));
        delete process.env.LIMITE_REQUISICOES;
        const { base, fechar } = await subir(pequeno);
        try {
            const status = [];
            for (let i = 0; i < 3; i++) status.push((await fetch(base)).status);
            assert.deepEqual(status, [200, 200, 429]);
        } finally {
            fechar();
        }
    });

    test('o download de PDF tem limite próprio (3 neste teste) e o resto da API não é afetado', async () => {
        const api = await subir(app);
        try {
            const status = [];
            for (let i = 0; i < 4; i++) status.push((await fetch(`${api.base}/api/relatorios/2019/download`)).status);
            assert.deepEqual(status, [200, 200, 200, 429]);

            assert.equal((await fetch(`${api.base}/api/enade/cursos`)).status, 200);
        } finally {
            api.fechar();
        }
    });
});

describe('tratamento de erros', () => {
    test('rota inexistente responde 404 em JSON', async () => {
        const api = await subir(app);
        try {
            const res = await fetch(`${api.base}/api/nada`);
            assert.equal(res.status, 404);
            assert.deepEqual(await res.json(), { erro: 'Rota não encontrada.' });
        } finally {
            api.fechar();
        }
    });

    test('erro inesperado vira 500 genérico, sem stack nem detalhes internos na resposta', async (t) => {
        const registrado = t.mock.method(console, 'error', () => {});
        const quebrado = express()
            .get('/', () => {
                throw new Error('falhou ao ler /home/lucas/data/segredo.json');
            })
            .use(tratarErros);
        const { base, fechar } = await subir(quebrado);
        try {
            const res = await fetch(base);
            const texto = await res.text();

            assert.equal(res.status, 500);
            assert.deepEqual(JSON.parse(texto), { erro: 'Erro interno do servidor.' });
            assert.ok(!texto.includes('/home/lucas') && !texto.includes('segredo.json') && !texto.includes('at '));
            // o detalhe fica só no log do servidor
            assert.equal(registrado.mock.callCount(), 1);
        } finally {
            fechar();
        }
    });
});

describe('inicialização do servidor', () => {
    test('se recusa a subir sem ANONIMIZACAO_SEGREDO, com uma mensagem clara', () => {
        const resultado = spawnSync('node', [path.join(__dirname, '..', 'app.js')], {
            env: { ...process.env, ANONIMIZACAO_SEGREDO: '', PORT: '0' },
            encoding: 'utf-8',
            timeout: 10000,
        });

        assert.equal(resultado.status, 1);
        assert.match(resultado.stderr, /ANONIMIZACAO_SEGREDO não definida/);
    });
});
