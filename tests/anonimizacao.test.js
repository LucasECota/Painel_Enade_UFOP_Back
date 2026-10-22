const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { criarPastaDeDados, tentativa, linhaDeResumo } = require('./helpers');
const { gerarIdAnonimo } = require('../src/utils/anonimizacao');

describe('gerarIdAnonimo', () => {
    test('é determinístico: o mesmo e-mail gera sempre o mesmo código', () => {
        assert.equal(gerarIdAnonimo('ana@aluno.ufop.edu.br'), gerarIdAnonimo('ana@aluno.ufop.edu.br'));
    });

    test('ignora maiúsculas e espaços nas pontas', () => {
        assert.equal(gerarIdAnonimo('  ANA@Aluno.UFOP.edu.br '), gerarIdAnonimo('ana@aluno.ufop.edu.br'));
    });

    test('e-mails diferentes geram códigos diferentes', () => {
        assert.notEqual(gerarIdAnonimo('ana@x.com'), gerarIdAnonimo('bia@x.com'));
    });

    test('o código tem 16 caracteres hexadecimais e não contém o e-mail', () => {
        const id = gerarIdAnonimo('ana@x.com');
        assert.match(id, /^[0-9a-f]{16}$/);
        assert.ok(!id.includes('ana'));
    });

    test('chaves secretas diferentes geram códigos diferentes', () => {
        const original = process.env.ANONIMIZACAO_SEGREDO;
        const comChaveA = gerarIdAnonimo('ana@x.com');
        process.env.ANONIMIZACAO_SEGREDO = 'outra-chave';
        const comChaveB = gerarIdAnonimo('ana@x.com');
        process.env.ANONIMIZACAO_SEGREDO = original;

        assert.notEqual(comChaveA, comChaveB);
    });

    test('sem a chave secreta, recusa gerar o código', () => {
        const original = process.env.ANONIMIZACAO_SEGREDO;
        delete process.env.ANONIMIZACAO_SEGREDO;
        try {
            assert.throws(() => gerarIdAnonimo('ana@x.com'), /ANONIMIZACAO_SEGREDO/);
        } finally {
            process.env.ANONIMIZACAO_SEGREDO = original;
        }
    });
});

describe('script npm run anonimizar', () => {
    let dados;
    const script = path.join(__dirname, '..', 'scripts', 'anonimizar.js');
    const rodar = () =>
        execFileSync('node', [script], {
            env: { ...process.env, DADOS_AVALIAUFOP: dados.pasta },
            encoding: 'utf-8',
        });
    const arquivo = () => path.join(dados.pasta, 'ec', 'fg', 'export-notas.json');

    beforeEach(() => {
        dados = criarPastaDeDados();
        dados.gravar('ec', 'fg', [tentativa('ana@aluno.ufop.edu.br', 5), tentativa('ana@aluno.ufop.edu.br', 7.5), tentativa('bia@aluno.ufop.edu.br', 10), linhaDeResumo]);
    });
    afterEach(() => dados.limpar());

    test('remove nome, sobrenome e e-mail e troca por um código', () => {
        rodar();

        const texto = fs.readFileSync(arquivo(), 'utf-8');
        assert.ok(!texto.includes('@'), 'ainda há e-mail no arquivo');
        assert.ok(!texto.includes('"Ana"') && !texto.includes('"Silva"'), 'ainda há nome no arquivo');

        const linhas = JSON.parse(texto).flat();
        const alunos = linhas.filter((l) => l.aluno);
        assert.equal(alunos.length, 3);
        assert.equal(alunos[0].aluno, gerarIdAnonimo('ana@aluno.ufop.edu.br'));
        assert.equal(alunos[0].aluno, alunos[1].aluno); // mesma pessoa, mesmo código
        assert.notEqual(alunos[0].aluno, alunos[2].aluno);
    });

    test('mantém as notas, o estado e a estrutura aninhada do export', () => {
        rodar();

        const dadosDepois = JSON.parse(fs.readFileSync(arquivo(), 'utf-8'));
        assert.ok(Array.isArray(dadosDepois[0]), 'perdeu a lista de listas do Moodle');
        const primeira = dadosDepois[0][0];
        assert.equal(primeira.avaliar1000, '5,00');
        assert.equal(primeira.estado, 'Finalizada');
    });

    test('a linha de resumo "Média geral" não é alterada', () => {
        rodar();

        const resumo = JSON.parse(fs.readFileSync(arquivo(), 'utf-8')).flat().find((l) => l.sobrenome === 'Média geral');
        assert.ok(resumo);
        assert.equal(resumo.aluno, undefined);
    });

    test('é idempotente: rodar de novo não muda o arquivo', () => {
        rodar();
        const primeiraVez = fs.readFileSync(arquivo(), 'utf-8');
        const saida = rodar();

        assert.equal(fs.readFileSync(arquivo(), 'utf-8'), primeiraVez);
        assert.match(saida, /0 linha\(s\) anonimizada\(s\)/);
    });

    test('um export novo do mesmo aluno recebe o mesmo código de antes', () => {
        rodar();
        const antes = JSON.parse(fs.readFileSync(arquivo(), 'utf-8')).flat()[0].aluno;

        dados.gravar('ec', 'fg', [tentativa('ana@aluno.ufop.edu.br', 10)]); // novo export, com e-mail de novo
        rodar();
        const depois = JSON.parse(fs.readFileSync(arquivo(), 'utf-8')).flat()[0].aluno;

        assert.equal(depois, antes);
    });
});
