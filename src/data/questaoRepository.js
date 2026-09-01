const fs = require('fs');
const path = require('path');

// Procura, dentro de uma pasta, o primeiro arquivo que termina em ".jsonl".
// Isso evita depender do nome exato do arquivo, que muda de pasta pra pasta.
function encontrarArquivoJsonl(caminhoDaPasta) {
    const arquivos = fs.readdirSync(caminhoDaPasta);
    const nomeDoArquivo = arquivos.find((nome) => nome.endsWith('.jsonl'));

    if (!nomeDoArquivo) {
        throw new Error(`Nenhum arquivo .jsonl encontrado em: ${caminhoDaPasta}`);
    }

    return path.join(caminhoDaPasta, nomeDoArquivo);
}

function lerQuestoesDoArquivo(caminhoDoJsonl) {
    const conteudo = fs.readFileSync(caminhoDoJsonl, 'utf-8');
    const linhas = conteudo.trim().split('\n');

    return linhas.map((linha) => JSON.parse(linha));
}

// Devolve true se a questão for discursiva (número é uma letra "D" + dígito,
// tipo "D1", "D2"...), false se for objetiva (número é um inteiro).
function ehDiscursiva(questao) {
    return typeof questao.numero === 'string' && questao.numero.startsWith('D');
}

// Dá um "peso de ordenação" pra cada questão, seguindo a ordem real da prova:
// 0 = FG discursiva, 1 = FG objetiva, 2 = CE discursiva, 3 = CE objetiva.
function grupoDaQuestao(questao) {
    const ehFormacaoGeral = questao.tipo_questao === 'Formação Geral';
    const discursiva = ehDiscursiva(questao);

    if (ehFormacaoGeral && discursiva) return 0;
    if (ehFormacaoGeral && !discursiva) return 1;
    if (!ehFormacaoGeral && discursiva) return 2;
    return 3; // CE objetiva
}

// Extrai um número pra ordenar dentro do mesmo grupo.
// "D1" -> 1, "D2" -> 2, 15 -> 15 (já é número)
function numeroParaOrdenar(questao) {
    if (typeof questao.numero === 'number') return questao.numero;
    return Number(questao.numero.replace('D', ''));
}

// Remove as questões anuladas e ordena o restante na ordem real da prova:
// FG discursivas, FG objetivas, CE discursivas, CE objetivas.
function filtrarEOrdenarQuestoes(questoes) {
    return questoes
        .filter((questao) => questao.alternativa_correta !== 'ANULADA')
        .sort((a, b) => {
            const grupoDiferente = grupoDaQuestao(a) - grupoDaQuestao(b);
            if (grupoDiferente !== 0) return grupoDiferente;
            return numeroParaOrdenar(a) - numeroParaOrdenar(b);
        });
}

// Recebe a lista já filtrada e ordenada, e devolve um objeto relacionando
// cada posição da prova (q1, q2, q3...) com a disciplina daquela questão.
// Ex: { q1: 'Informática e Sociedade', q2: 'Informática e Sociedade', q3: 'Gestão da TI', ... }
function relacionarPosicaoComDisciplina(questoesOrdenadas) {
    const relacao = {};

    questoesOrdenadas.forEach((questao, indice) => {
        const posicao = indice + 1; // índice começa em 0, mas queremos q1, não q0
        relacao[`q${posicao}`] = questao.disciplina_associada;
    });

    return relacao;
}

// Monta o caminho da pasta de um simulado específico.
// (mesma lógica que você já usa no simuladoRepository.js)
function caminhoDaPasta(curso, ano) {
    return path.join(__dirname, '..', '..', 'data', 'simulados', `${curso}-${ano}`);
}

// Monta o mapa de disciplinas (q1, q2, q3... -> disciplina) de um curso+ano,
// juntando as quatro funções que você já escreveu.
function montarMapaDeDisciplinas(curso, ano) {
    const pasta = caminhoDaPasta(curso, ano);
    const caminhoDoJsonl = encontrarArquivoJsonl(pasta);
    const questoes = lerQuestoesDoArquivo(caminhoDoJsonl);
    const ordenadas = filtrarEOrdenarQuestoes(questoes);

    return relacionarPosicaoComDisciplina(ordenadas);
}

// Carrega os 4 mapas de disciplina uma única vez, quando esse arquivo é
// importado. Fica guardado em memória, organizado por "curso-ano".
const MAPAS_DE_DISCIPLINA = {
    'ec-2023': montarMapaDeDisciplinas('ec', 2023),
    'ec-2019': montarMapaDeDisciplinas('ec', 2019),
    'si-2021': montarMapaDeDisciplinas('si', 2021),
    'si-2017': montarMapaDeDisciplinas('si', 2017),
};

// Devolve o mapa de disciplinas de um curso+ano específico, ou null se não existir.
function buscarMapaDeDisciplinas(curso, ano) {
    const chave = `${curso}-${ano}`;
    return MAPAS_DE_DISCIPLINA[chave] || null;
}

module.exports = {
    encontrarArquivoJsonl,
    lerQuestoesDoArquivo,
    filtrarEOrdenarQuestoes,
    relacionarPosicaoComDisciplina,
    caminhoDaPasta,
    montarMapaDeDisciplinas,
    buscarMapaDeDisciplinas,
};