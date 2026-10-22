const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buscarResultados, listarRelatorios } = require('../src/data/resultadosRepository');

// Estes testes protegem os números copiados à mão dos PDFs do INEP e do painel da CAVIN:
// pegam erros de digitação conferindo regras que os próprios dados precisam respeitar.
describe('integridade de data/resultados-enade.json', () => {
    const { cursos } = buscarResultados();

    test('tem os três cursos do ICEA, sem Engenharia Elétrica', () => {
        assert.deepEqual(cursos.map((c) => c.chave), ['ec', 'ep', 'si']);
    });

    for (const curso of cursos) {
        describe(curso.nome, () => {
            test('edições em ordem crescente de ano, sem repetir', () => {
                const anos = curso.edicoes.map((e) => e.ano);
                assert.deepEqual(anos, [...new Set(anos)].sort((a, b) => a - b));
            });

            test('conceito entre 1 e 5 (inteiro) e presentes não passam da população', () => {
                for (const e of curso.edicoes) {
                    assert.ok(Number.isInteger(e.conceito) && e.conceito >= 1 && e.conceito <= 5, `conceito inválido em ${e.ano}`);
                    assert.ok(e.presentes > 0 && e.presentes <= e.populacao, `participantes inválidos em ${e.ano}`);
                }
            });

            test('o CPC tem as mesmas edições do Enade e valores entre 0 e 5', () => {
                assert.deepEqual(curso.cpc.map((c) => c.ano), curso.edicoes.map((e) => e.ano));
                assert.ok(curso.cpc.every((c) => c.valor >= 0 && c.valor <= 5));
            });

            test('nota geral = 75% do Específico + 25% da Formação Geral (regra do INEP, tolerância de 0,15)', () => {
                const { geral, formacaoGeral, especifico } = curso.comparacao;
                for (const quem of ['curso', 'brasil']) {
                    const esperado = 0.75 * especifico[quem] + 0.25 * formacaoGeral[quem];
                    assert.ok(Math.abs(geral[quem] - esperado) <= 0.15, `${quem}: geral ${geral[quem]} ≠ ${esperado.toFixed(2)}`);
                }
            });

            test('médias entre 0 e 100 e percentuais do perfil entre 0 e 100', () => {
                const valores = [
                    ...Object.values(curso.comparacao).filter((v) => typeof v === 'object').flatMap((v) => [v.curso, v.brasil]),
                    ...['renda', 'auxilio', 'bolsa'].flatMap((k) => [curso.perfil[k].curso, curso.perfil[k].brasil]),
                ];
                assert.ok(valores.every((v) => v >= 0 && v <= 100));
            });

            test('o ano da comparação e do perfil é uma edição que existe', () => {
                const anos = curso.edicoes.map((e) => e.ano);
                assert.ok(anos.includes(curso.comparacao.ano));
                assert.ok(anos.includes(curso.perfil.ano));
            });

            test('o número de concluintes do perfil bate com o da edição', () => {
                const edicao = curso.edicoes.find((e) => e.ano === curso.perfil.ano);
                assert.equal(curso.perfil.presentes, edicao.presentes);
            });
        });
    }
});

describe('relatórios do INEP em data/relatorios-inep', () => {
    const pasta = path.join(__dirname, '..', 'data', 'relatorios-inep');

    test('todo PDF da pasta segue o padrão enade-AAAA-... e aparece na lista', () => {
        const arquivos = fs.readdirSync(pasta).filter((f) => f.endsWith('.pdf'));
        assert.ok(arquivos.length > 0);
        for (const f of arquivos) assert.match(f, /^enade-\d{4}-.+\.pdf$/, `nome fora do padrão: ${f}`);
        assert.equal(listarRelatorios().length, arquivos.length);
    });

    test('cada edição com dados tem o relatório correspondente para baixar', () => {
        const anosComRelatorio = new Set(listarRelatorios().map((r) => r.ano));
        const { cursos } = buscarResultados();
        for (const curso of cursos) {
            for (const e of curso.edicoes) assert.ok(anosComRelatorio.has(e.ano), `${curso.nome} ${e.ano}: falta o PDF`);
        }
    });
});
