const fs = require('fs');
const path = require('path');
const { encontrarArquivoJsonl, lerQuestoesDoArquivo } = require('../src/data/questaoRepository');

// Pega o nome de todas as pastas dentro de data/simulados/ (ex: 'ec-2023', 'ee-2019'...)
function listarPastasDeSimulados() {
    const raiz = path.join(__dirname, '..', 'data', 'simulados');
    return fs.readdirSync(raiz, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => item.name);
}

// Detecta "palavras coladas": uma letra minúscula seguida direto de uma
// maiúscula, sem espaço no meio — quase sempre é espaço faltando.
function pareceTerEspacoFaltando(disciplina) {
    return /[a-zà-úçã-õ][A-ZÀ-Ú]/.test(disciplina);
}

function checarTodosOsArquivos() {
    const pastas = listarPastasDeSimulados();
    const todasAsDisciplinas = new Map(); // normalizado -> Set de grafias originais

    pastas.forEach((pasta) => {
        const caminhoDaPasta = path.join(__dirname, '..', 'data', 'simulados', pasta);
        const caminhoDoJsonl = encontrarArquivoJsonl(caminhoDaPasta);
        const questoes = lerQuestoesDoArquivo(caminhoDoJsonl);

        questoes.forEach((questao) => {
            const disciplina = questao.disciplina_associada;
            if (!disciplina) {
                console.log(`⚠ ${pasta}: questão ${questao.numero} sem disciplina_associada (null)`);
                return;
            }

            if (pareceTerEspacoFaltando(disciplina)) {
                console.log(`⚠ ${pasta}: possível espaço faltando -> "${disciplina}"`);
            }

            const normalizado = disciplina.toLowerCase().replace(/\s+/g, '');
            if (!todasAsDisciplinas.has(normalizado)) {
                todasAsDisciplinas.set(normalizado, new Set());
            }
            todasAsDisciplinas.get(normalizado).add(disciplina);
        });
    });

    console.log('\n--- Disciplinas com grafias diferentes entre arquivos ---');
    todasAsDisciplinas.forEach((grafias) => {
        if (grafias.size > 1) {
            console.log([...grafias].map((g) => `"${g}"`).join('  vs  '));
        }
    });
}

checarTodosOsArquivos();