// Anonimiza os exports do Moodle em data/avaliaufop: troca nome, sobrenome e e-mail
// de cada aluno por um código determinístico ("aluno"), reescrevendo os arquivos no lugar.
// Pode rodar quantas vezes quiser: linhas já anonimizadas são mantidas como estão.
//
// Uso: npm run anonimizar
const fs = require('fs');
const path = require('path');
const { gerarIdAnonimo } = require('../src/utils/anonimizacao');

// DADOS_AVALIAUFOP permite apontar para outra pasta (usado nos testes).
const raiz = process.env.DADOS_AVALIAUFOP || path.join(__dirname, '..', 'data', 'avaliaufop');

function listarJsons(pasta) {
    return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((item) => {
        const caminho = path.join(pasta, item.name);
        if (item.isDirectory()) return listarJsons(caminho);
        return item.name.endsWith('.json') ? [caminho] : [];
    });
}

// Anonimiza uma linha; devolve true se ela foi alterada.
function anonimizarLinha(linha) {
    const email = linha['endereodee-mail'];
    if (!email) return false; // linha de resumo (ex.: "Média geral") ou já anonimizada

    // nome, sobrenome e e-mail são descartados de propósito (por isso o prefixo _)
    const { sobrenome: _sobrenome, nome: _nome, 'endereodee-mail': _email, ...resto } = linha;
    Object.keys(linha).forEach((chave) => delete linha[chave]);
    Object.assign(linha, { aluno: gerarIdAnonimo(email) }, resto);
    return true;
}

// Percorre a estrutura inteira (o export do Moodle costuma vir como lista de listas).
function percorrer(no) {
    if (Array.isArray(no)) return no.reduce((total, item) => total + percorrer(item), 0);
    return anonimizarLinha(no) ? 1 : 0;
}

let totalDeLinhas = 0;
const arquivos = listarJsons(raiz);

arquivos.forEach((arquivo) => {
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf-8'));
    const alteradas = percorrer(dados);

    if (alteradas > 0) {
        fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2) + '\n');
    }

    totalDeLinhas += alteradas;
    console.log(`${alteradas} linha(s) anonimizada(s) — ${path.relative(raiz, arquivo)}`);
});

console.log(`Pronto: ${totalDeLinhas} linha(s) em ${arquivos.length} arquivo(s).`);
