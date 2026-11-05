// Extrai a tabela de acertos por questão de um Relatório de Curso do INEP (Enade 2023)
// e junta a disciplina e o tema de cada questão. Gera data/questoes/<curso>-<ano>.json.
//
// Uso (exemplo, Engenharia de Computação 2023):
//   node scripts/extrair-questoes.js \
//     --curso ec --ano 2023 \
//     --pdf data/relatorios-curso/enade-2023-engenharia-de-computacao-relatorio-de-curso.pdf \
//     --prova "../Projeto Enade/Questoes/Engenharia da Computacao/2023/enade_2023_engenharia_computacao.jsonl" \
//     --assuntos data/ec.csv
//
//   --prova     arquivo .jsonl da prova (traz a disciplina associada e o gabarito de cada questão)
//   --assuntos  CSV da página Edições (lista de assuntos de cada disciplina)
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
        let altura = null;
        let atual = [];
        for (const item of conteudo.items) {
            const y = Math.round(item.transform[5]);
            if (altura !== null && Math.abs(y - altura) > 3) {
                linhas.push(atual.join(' '));
                atual = [];
            }
            altura = y;
            atual.push(item.str);
        }
        linhas.push(atual.join(' '));
    }
    return linhas.map((l) => l.trim()).filter(Boolean);
}

// ---------- interpretação da tabela ----------

const NUMERO = /^(\d+(,\d+)?|-)$/; // "31,1" ou "-" (sem dado)
const COLUNAS_ACERTO = ['curso', 'uf', 'regiao', 'catAdm', 'orgAcad', 'brasil'];
const ALTERNATIVAS = ['A', 'B', 'C', 'D', 'E', 'SI'];

const paraNumero = (texto) => (texto === '-' ? null : Number(texto.replace(',', '.')));

// "10   31,1  39,4  ...  B  22,2 ..." -> objeto da questão, ou null se a linha não for de questão.
// Uma linha de questão tem 14 campos: número, 6 percentuais de acerto, gabarito, 6 respostas.
function interpretarLinha(linha) {
    const campos = linha.trim().split(/\s+/);
    if (campos.length !== 14 || !/^\d+$/.test(campos[0])) return null;

    const acertos = campos.slice(1, 7);
    const gabarito = campos[7];
    const respostas = campos.slice(8, 14);
    if (!acertos.every((c) => NUMERO.test(c)) || !respostas.every((c) => NUMERO.test(c))) return null;
    if (!/^([A-E]|\*{1,2})$/.test(gabarito)) return null;

    // "*" = anulada pela comissão; "**" = desconsiderada pelo bisserial (a questão não entrou no cálculo)
    const situacao = gabarito === '*' ? 'anulada' : gabarito === '**' ? 'desconsiderada' : 'valida';
    const valida = situacao === 'valida';

    return {
        numero: Number(campos[0]),
        gabarito: valida ? gabarito : null,
        situacao,
        acertos: valida ? Object.fromEntries(COLUNAS_ACERTO.map((c, i) => [c, paraNumero(acertos[i])])) : null,
        respostas: valida ? Object.fromEntries(ALTERNATIVAS.map((a, i) => [a, paraNumero(respostas[i])])) : null,
    };
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

function lerProva(caminho) {
    return fs
        .readFileSync(caminho, 'utf-8')
        .trim()
        .split(/\r?\n/)
        .map((linha) => JSON.parse(linha))
        .map((q) => ({
            numero: String(q.numero),
            tipo: q.tipo_questao,
            disciplina: q.disciplina_associada || null,
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

function montarQuestoes(tabela, prova, temas, avisos, tipo) {
    const daProva = Object.fromEntries(prova.filter((p) => p.tipo === tipo).map((p) => [String(Number(p.numero)), p]));
    return tabela.map((questao) => {
        const p = daProva[String(questao.numero)];
        if (!p) avisos.push(`questão ${questao.numero} (${tipo}) não encontrada na prova`);
        else if (questao.gabarito && p.gabarito && questao.gabarito !== p.gabarito) {
            avisos.push(`gabarito diferente na questão ${questao.numero}: relatório ${questao.gabarito}, prova ${p.gabarito}`);
        }
        return {
            numero: questao.numero,
            disciplina: p ? p.disciplina : null,
            tema: p ? temas[p.numero] || null : null,
            situacao: questao.situacao,
            gabarito: questao.gabarito,
            acertos: questao.acertos,
            respostas: questao.respostas,
        };
    });
}

async function extrair({ curso, ano, pdf, prova, assuntos }) {
    const avisos = [];
    const linhas = await lerLinhasDoPdf(pdf);
    const provaLida = lerProva(prova);
    const temas = ligarTemas(provaLida, lerAssuntos(assuntos, ano), avisos);

    const formacaoGeral = montarQuestoes(extrairTabela(linhas, '5.1.1', '5.1.2'), provaLida, temas, avisos, 'Formação Geral');
    const especifico = montarQuestoes(extrairTabela(linhas, '5.1.3', '5.1.4'), provaLida, temas, avisos, 'Componente Específico');

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

async function principal() {
    const args = lerArgumentos(process.argv.slice(2));
    for (const obrigatorio of ['curso', 'ano', 'pdf', 'prova', 'assuntos']) {
        if (!args[obrigatorio]) throw new Error(`falta --${obrigatorio} (veja o cabeçalho de scripts/extrair-questoes.js)`);
    }
    if (!NOMES[args.curso]) throw new Error(`curso inválido: ${args.curso} (use ec, ep ou si)`);

    const { dados, avisos } = await extrair(args);
    const destino = path.join(__dirname, '..', 'data', 'questoes', `${args.curso}-${args.ano}.json`);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, JSON.stringify(dados, null, 2) + '\n');

    const [fg, ce] = dados.componentes;
    console.log(`${path.relative(process.cwd(), destino)}: ${fg.questoes.length} de Formação Geral e ${ce.questoes.length} do Componente Específico`);
    avisos.forEach((aviso) => console.warn(`  aviso: ${aviso}`));
}

if (require.main === module) {
    principal().catch((erro) => {
        console.error(erro.message);
        process.exit(1);
    });
}

module.exports = { interpretarLinha, extrairTabela, ligarTemas, dividirCsv };
