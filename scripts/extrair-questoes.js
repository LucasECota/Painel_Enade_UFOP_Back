// Extrai a tabela de acertos por questão de um Relatório de Curso do INEP (2008 a 2023)
// e junta a disciplina e o tema de cada questão. Gera data/questoes/<curso>-<ano>.json.
//
// Para refazer todos os arquivos de uma vez (usa scripts/relatorios.json):
//   node scripts/extrair-questoes.js --todos
//
// Uso para um relatório só (exemplo, Engenharia de Computação 2023):
//   node scripts/extrair-questoes.js \
//     --curso ec --ano 2023 \
//     --pdf data/relatorios-curso/enade-2023-engenharia-de-computacao-relatorio-de-curso.pdf \
//     --prova "../Projeto Enade/Questoes/Engenharia da Computacao/2023/enade_2023_engenharia_computacao.jsonl" \
//     --assuntos data/ec.csv
//
//   --prova     arquivo .jsonl da prova (traz a disciplina associada e o gabarito de cada questão)
//   --assuntos  CSV da página Edições (lista de assuntos de cada disciplina)
//   --formato   layout da tabela do relatório: padrao (2014 em diante), 2011 ou 2008
//
// A disciplina e o tema das questões de Formação Geral vêm de data/formacao-geral.json
// (a prova de Formação Geral é a mesma para todos os cursos do ano).
//
// Depende do pdfjs-dist (ferramenta de desenvolvimento: o servidor da API não usa).
const fs = require('fs');
const path = require('path');

const NOMES = {
    ec: 'Engenharia de Computação',
    ep: 'Engenharia de Produção',
    si: 'Sistemas de Informação',
};

// ---------- leitura do PDF ----------

// Devolve as linhas de texto de todas as páginas (itens com a mesma altura viram uma linha).
async function lerLinhasDoPdf(caminho) {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const documento = await getDocument({
        data: new Uint8Array(fs.readFileSync(caminho)),
        useSystemFonts: true,
        verbosity: 0,
    }).promise;

    const linhas = [];
    for (let pagina = 1; pagina <= documento.numPages; pagina++) {
        const conteudo = await (await documento.getPage(pagina)).getTextContent();
        // agrupa pela posição na página (não pela ordem do arquivo, que em alguns relatórios
        // lista a tabela coluna por coluna): itens à mesma altura formam uma linha, da esquerda
        // para a direita
        const itens = conteudo.items
            .filter((item) => item.str.trim() !== '')
            .map((item) => ({ texto: item.str, x: item.transform[4], y: item.transform[5] }))
            .sort((a, b) => b.y - a.y || a.x - b.x);
        let altura = null;
        let atual = [];
        for (const item of itens) {
            if (altura !== null && Math.abs(item.y - altura) > 3) {
                linhas.push(atual.sort((a, b) => a.x - b.x).map((i) => i.texto).join(' '));
                atual = [];
            }
            altura = item.y;
            atual.push(item);
        }
        linhas.push(atual.sort((a, b) => a.x - b.x).map((i) => i.texto).join(' '));
    }
    return linhas.map((l) => l.trim()).filter(Boolean);
}

// ---------- interpretação da tabela ----------

const NUMERO = /^(\d+(,\d+)?|-)$/; // "31,1" ou "-" (sem dado)
const ALTERNATIVAS = ['A', 'B', 'C', 'D', 'E', 'SI'];

// Ordem das colunas de "% de acertos" em cada layout de relatório. Valores ausentes ficam null.
const COLUNAS_ACERTO = {
    padrao: ['curso', 'uf', 'regiao', 'catAdm', 'orgAcad', 'brasil'], // 2014 em diante
    2011: ['curso', 'catAdm', 'orgAcad', 'regiao', 'brasil'],
    2008: ['curso', 'regiao', 'brasil', 'catAdm', 'orgAcad'],
};
const TODAS_AS_COLUNAS = ['curso', 'uf', 'regiao', 'catAdm', 'orgAcad', 'brasil'];

const paraNumero = (texto) => (texto === '-' ? null : Number(texto.replace(',', '.')));

// "10   31,1  39,4  ...  B  22,2 ..." -> objeto da questão, ou null se a linha não for de questão.
// Uma linha de questão tem: número, os percentuais de acerto (6, ou 5 nos relatórios antigos),
// o gabarito e 6 respostas (A a E e SI).
function interpretarLinha(linha, formato = 'padrao') {
    const colunas = COLUNAS_ACERTO[formato];
    const campos = linha.trim().split(/\s+/);

    // no relatório de 2008 a questão anulada vem só com traços (11 campos depois do número)
    if (formato === '2008' && campos.length === 12 && /^\d+$/.test(campos[0]) && campos.slice(1).every((c) => c === '-')) {
        return { numero: Number(campos[0]), gabarito: null, situacao: 'anulada', acertos: null, respostas: null };
    }
    if (campos.length !== colunas.length + 8 || !/^\d+$/.test(campos[0])) return null;

    const acertos = campos.slice(1, 1 + colunas.length);
    const gabarito = campos[1 + colunas.length];
    const respostas = campos.slice(2 + colunas.length);
    if (!acertos.every((c) => NUMERO.test(c)) || !respostas.every((c) => NUMERO.test(c))) return null;
    if (!/^([A-E]|\*{1,2}|ANULADA)$/i.test(gabarito)) return null;

    // "*" ou ANULADA = anulada pela comissão; "**" = desconsiderada pelo bisserial (não entrou no cálculo)
    const situacao = gabarito === '**' ? 'desconsiderada' : /^(\*|ANULADA)$/i.test(gabarito) ? 'anulada' : 'valida';
    const valida = situacao === 'valida';
    const porColuna = Object.fromEntries(colunas.map((c, i) => [c, paraNumero(acertos[i])]));

    return {
        numero: Number(campos[0]),
        gabarito: valida ? gabarito.toUpperCase() : null,
        situacao,
        acertos: valida ? Object.fromEntries(TODAS_AS_COLUNAS.map((c) => [c, porColuna[c] ?? null])) : null,
        respostas: valida ? Object.fromEntries(ALTERNATIVAS.map((a, i) => [a, paraNumero(respostas[i])])) : null,
    };
}

// Em alguns relatórios antigos a linha quebra em duas: "2  E" e depois os 11 números.
function juntarLinhasQuebradas(linhas) {
    const resultado = [];
    for (let i = 0; i < linhas.length; i++) {
        const partes = linhas[i].trim().split(/\s+/);
        const seguinte = (linhas[i + 1] || '').trim().split(/\s+/);
        if (partes.length === 2 && /^\d+$/.test(partes[0]) && /^[A-E]$/.test(partes[1]) && seguinte.length === 11) {
            resultado.push([partes[0], ...seguinte.slice(0, 5), partes[1], ...seguinte.slice(5)].join(' '));
            i++;
        } else {
            resultado.push(linhas[i]);
        }
    }
    return resultado;
}

// Sem depender do título das tabelas (que muda de um relatório para outro): junta as linhas de
// questão em blocos de números seguidos. O bloco de Formação Geral começa na questão 1 e o de
// Componente Específico vem logo depois; se o relatório trouxer também os ingressantes, vale o
// último par (os concluintes). Devolve { formacaoGeral, especifico }.
function extrairTabelasPorBloco(linhas, formato = 'padrao') {
    const blocos = [];
    let atual = null;
    let semQuestao = 0;
    for (const linha of juntarLinhasQuebradas(linhas)) {
        const questao = interpretarLinha(linha, formato);
        if (!questao) {
            semQuestao++;
            continue;
        }
        // em 2008 a numeração pula (11 a 19, depois 61 a 78)
        const ultimo = atual && atual[atual.length - 1].numero;
        const continua = atual && semQuestao <= 8 && (questao.numero === ultimo + 1 || (formato === '2008' && questao.numero > ultimo));
        if (continua) atual.push(questao);
        else blocos.push((atual = [questao]));
        semQuestao = 0;
    }

    let resultado = { formacaoGeral: [], especifico: [] };
    blocos.forEach((bloco, i) => {
        const proximo = blocos[i + 1];
        if (bloco[0].numero === 1 && proximo && proximo[0].numero > bloco[bloco.length - 1].numero) {
            resultado = { formacaoGeral: bloco, especifico: proximo };
        }
    });
    return resultado;
}

// Pega as linhas de questão que vêm depois do título "Tabela <numero>" e antes do título seguinte.
function extrairTabela(linhas, numeroDaTabela, numeroDaSeguinte) {
    const inicio = new RegExp(`Tabela\\s+${numeroDaTabela.replace(/\./g, '\\.')}\\b`);
    const fim = new RegExp(`Tabela\\s+${numeroDaSeguinte.replace(/\./g, '\\.')}\\b`);

    // o título pode aparecer também no sumário: vale a ocorrência que tem questões logo depois
    for (let i = 0; i < linhas.length; i++) {
        if (!inicio.test(linhas[i])) continue;
        const questoes = [];
        for (let j = i + 1; j < linhas.length && !fim.test(linhas[j]); j++) {
            const questao = interpretarLinha(linhas[j]);
            if (questao) questoes.push(questao);
        }
        if (questoes.length > 0) return questoes;
    }
    return [];
}

// ---------- disciplina e tema ----------

// Tira o código da disciplina ("Física III (CEA063)", "CSI115 - Sistemas Distribuídos") e, quando a
// questão é de duas disciplinas ("A / B"), fica com a primeira.
function normalizarDisciplina(nome) {
    if (!nome) return null;
    return nome
        .replace('Apoio a Decisão', 'Apoio à Decisão')
        .split(' / ')[0]
        .replace(/^[A-Z]{3}\d{3} - /, '')
        .replace(/ \([A-Z]{3}\d{3}\)$/, '')
        .trim();
}

function lerProva(caminho) {
    return fs
        .readFileSync(caminho, 'utf-8')
        .trim()
        .split(/\r?\n/)
        .map((linha) => JSON.parse(linha))
        .map((q) => ({
            numero: String(q.numero),
            tipo: q.tipo_questao,
            disciplina: normalizarDisciplina(q.disciplina_associada),
            gabarito: q.alternativa_correta && q.alternativa_correta !== 'None' ? q.alternativa_correta : null,
            discursiva: String(q.numero).startsWith('D'),
        }));
}

// Divide uma linha de CSV respeitando as aspas ("a, b" continua sendo um campo só).
function dividirCsv(linha) {
    const campos = [];
    let atual = '';
    let dentroDeAspas = false;
    for (const c of linha) {
        if (c === '"') dentroDeAspas = !dentroDeAspas;
        else if (c === ',' && !dentroDeAspas) {
            campos.push(atual);
            atual = '';
        } else atual += c;
    }
    campos.push(atual);
    return campos;
}

// { disciplina -> [assuntos] } de um ano, a partir do CSV da página Edições
function lerAssuntos(caminho, ano) {
    const [cabecalho, ...linhas] = fs.readFileSync(caminho, 'utf-8').trim().split(/\r?\n/);
    const colunas = dividirCsv(cabecalho);
    const assuntos = {};
    for (const linha of linhas) {
        const campos = Object.fromEntries(dividirCsv(linha).map((v, i) => [colunas[i], v]));
        if (campos.ano !== String(ano) || campos.tipo !== 'Componente Específico' || !campos.assunto) continue;
        assuntos[campos.disciplina] = campos.assunto.split('|').map((a) => a.trim());
    }
    return assuntos;
}

// O CSV lista os assuntos de cada disciplina na ordem das questões: a discursiva primeiro
// (se houver), depois as objetivas em ordem crescente. Devolve { numeroDaQuestao -> tema }.
function ligarTemas(prova, assuntos, avisos) {
    const temas = {};
    const porDisciplina = {};
    for (const q of prova.filter((p) => p.tipo === 'Componente Específico' && p.disciplina)) {
        (porDisciplina[q.disciplina] ||= []).push(q);
    }
    for (const [disciplina, questoes] of Object.entries(porDisciplina)) {
        const ordenadas = [
            ...questoes.filter((q) => q.discursiva).sort((a, b) => a.numero.localeCompare(b.numero)),
            ...questoes.filter((q) => !q.discursiva).sort((a, b) => Number(a.numero) - Number(b.numero)),
        ];
        const lista = assuntos[disciplina];
        if (!lista || lista.length !== ordenadas.length) {
            avisos.push(`tema não ligado em "${disciplina}": ${ordenadas.length} questões e ${lista ? lista.length : 0} assuntos`);
            continue;
        }
        ordenadas.forEach((q, i) => {
            temas[q.numero] = lista[i];
        });
    }
    return temas;
}

// ---------- montagem ----------

function montarQuestoes(tabela, prova, temas, avisos, tipo, formacaoGeral = {}) {
    const daProva = Object.fromEntries(prova.filter((p) => p.tipo === tipo).map((p) => [String(Number(p.numero)), p]));
    return tabela.map((questao) => {
        const p = daProva[String(questao.numero)];
        if (!p && prova.length > 0 && tipo === 'Componente Específico') {
            avisos.push(`questão ${questao.numero} (${tipo}) não encontrada na prova`);
        } else if (p && questao.gabarito && p.gabarito && questao.gabarito !== p.gabarito) {
            avisos.push(`gabarito diferente na questão ${questao.numero}: relatório ${questao.gabarito}, prova ${p.gabarito}`);
        }
        const fg = tipo === 'Formação Geral' ? formacaoGeral[String(questao.numero)] : null;
        return {
            numero: questao.numero,
            disciplina: fg ? fg.disciplina : p ? p.disciplina : null,
            tema: fg ? fg.tema : p ? temas[p.numero] || null : null,
            situacao: questao.situacao,
            gabarito: questao.gabarito,
            acertos: questao.acertos,
            respostas: questao.respostas,
        };
    });
}

function lerFormacaoGeral(ano) {
    const caminho = path.join(__dirname, '..', 'data', 'formacao-geral.json');
    const objetivas = (JSON.parse(fs.readFileSync(caminho, 'utf-8'))[ano] || []).filter((q) => q.tipo === 'objetiva');
    return Object.fromEntries(objetivas.map((q) => [String(q.numero), q]));
}

async function extrair({ curso, ano, pdf, prova, assuntos, formato = 'padrao' }) {
    const avisos = [];
    const linhas = await lerLinhasDoPdf(pdf);
    const provaLida = prova ? lerProva(prova) : [];
    const temas = prova ? ligarTemas(provaLida, lerAssuntos(assuntos, ano), avisos) : {};
    const formacaoGeralDoAno = lerFormacaoGeral(ano);

    const tabelas = extrairTabelasPorBloco(linhas, formato);
    if (tabelas.formacaoGeral.length === 0 || tabelas.especifico.length === 0) {
        throw new Error(`não achei as tabelas de acertos em ${path.basename(pdf)} (formato "${formato}")`);
    }
    if (Object.keys(formacaoGeralDoAno).length === 0) avisos.push(`sem disciplinas de Formação Geral para ${ano}`);
    if (!prova) avisos.push('sem prova do Componente Específico: as questões ficam sem disciplina e tema');

    const formacaoGeral = montarQuestoes(tabelas.formacaoGeral, provaLida, temas, avisos, 'Formação Geral', formacaoGeralDoAno);
    const especifico = montarQuestoes(tabelas.especifico, provaLida, temas, avisos, 'Componente Específico');

    return {
        dados: {
            curso,
            nome: NOMES[curso],
            ano: Number(ano),
            fonte: `INEP — Relatório de Curso do Enade ${ano} (${NOMES[curso]}, UFOP, João Monlevade)`,
            componentes: [
                { tipo: 'formacaoGeral', titulo: 'Formação Geral', questoes: formacaoGeral },
                { tipo: 'especifico', titulo: 'Componente Específico', questoes: especifico },
            ],
        },
        avisos,
    };
}

function lerArgumentos(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
    return args;
}

function gravar(dados, avisos) {
    const destino = path.join(__dirname, '..', 'data', 'questoes', `${dados.curso}-${dados.ano}.json`);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, JSON.stringify(dados, null, 2) + '\n');

    const [fg, ce] = dados.componentes;
    console.log(`${path.relative(process.cwd(), destino)}: ${fg.questoes.length} de Formação Geral e ${ce.questoes.length} do Componente Específico`);
    avisos.forEach((aviso) => console.warn(`  aviso: ${aviso}`));
}

async function principal() {
    const args = lerArgumentos(process.argv.slice(2));

    if (process.argv.includes('--todos')) {
        const raiz = path.join(__dirname, '..');
        const lista = JSON.parse(fs.readFileSync(path.join(__dirname, 'relatorios.json'), 'utf-8'));
        for (const item of lista) {
            const { dados, avisos } = await extrair({
                curso: item.curso,
                ano: item.ano,
                pdf: path.join(raiz, 'data', 'relatorios-curso', item.pdf),
                prova: item.prova ? path.resolve(raiz, item.prova) : null,
                assuntos: path.join(raiz, 'data', `${item.curso}.csv`),
                formato: item.formato,
            });
            gravar(dados, avisos);
        }
        return;
    }

    for (const obrigatorio of ['curso', 'ano', 'pdf', 'assuntos']) {
        if (!args[obrigatorio]) throw new Error(`falta --${obrigatorio} (veja o cabeçalho de scripts/extrair-questoes.js)`);
    }
    if (!NOMES[args.curso]) throw new Error(`curso inválido: ${args.curso} (use ec, ep ou si)`);

    const { dados, avisos } = await extrair(args);
    gravar(dados, avisos);
}

if (require.main === module) {
    principal().catch((erro) => {
        console.error(erro.message);
        process.exit(1);
    });
}

module.exports = { interpretarLinha, extrairTabela, extrairTabelasPorBloco, ligarTemas, dividirCsv, normalizarDisciplina };
