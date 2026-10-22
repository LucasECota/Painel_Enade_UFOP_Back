const fs = require('fs');
const os = require('os');
const path = require('path');

// Segredo fixo só para os testes (nunca usa o .env de verdade).
process.env.ANONIMIZACAO_SEGREDO = 'segredo-de-teste';

// Cria uma pasta temporária com a mesma estrutura de data/avaliaufop e aponta o código para ela.
// Assim os testes jamais leem ou alteram os dados reais.
function criarPastaDeDados() {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'avaliaufop-teste-'));
    process.env.DADOS_AVALIAUFOP = pasta;

    return {
        pasta,
        // grava um export do Moodle em <curso>/<atividade>/<nome>.json
        gravar(curso, atividade, linhas, nomeDoArquivo = 'export-notas.json') {
            const destino = path.join(pasta, curso, atividade);
            fs.mkdirSync(destino, { recursive: true });
            const conteudo = typeof linhas === 'string' ? linhas : JSON.stringify([linhas]);
            fs.writeFileSync(path.join(destino, nomeDoArquivo), conteudo);
        },
        gravarParticipantes(objeto) {
            fs.writeFileSync(path.join(pasta, 'participantes.json'), JSON.stringify(objeto));
        },
        limpar() {
            fs.rmSync(pasta, { recursive: true, force: true });
            delete process.env.DADOS_AVALIAUFOP;
        },
    };
}

// Uma tentativa no formato do export do Moodle (nota de 0 a 10 na coluna avaliar1000).
function tentativa(email, nota, extra = {}) {
    return {
        sobrenome: 'Silva',
        nome: 'Ana',
        'endereodee-mail': email,
        estado: 'Finalizada',
        iniciadoem: '7 outubro 2026  22:36 PM',
        completo: '7 outubro 2026  22:41 PM',
        tempoutilizado: '5 minutos',
        avaliar1000: Number(nota).toFixed(2).replace('.', ','), // como o Moodle: "7,50"
        ...extra,
    };
}

const linhaDeResumo = {
    sobrenome: 'Média geral',
    nome: '',
    'endereodee-mail': '',
    estado: '',
    avaliar1000: '6,25',
};

module.exports = { criarPastaDeDados, tentativa, linhaDeResumo };
