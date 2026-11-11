const fs = require('fs');
const path = require('path');

// Lê o arquivo CSV do disco e devolve um array de linhas (uma string por linha),
// já sem linhas vazias. Aceita tanto quebra de linha Unix (\n) quanto Windows (\r\n).
function lerLinhasDoArquivo(caminho) {
  const conteudo = fs.readFileSync(caminho, 'utf-8');

  return conteudo
    .trim()
    .split(/\r?\n/);
}

// Divide uma linha de CSV em campos, mas sem quebrar campos que estão
// entre aspas — mesmo que tenham vírgula dentro. Isso é necessário porque
// o campo "assunto" às vezes contém vírgulas no próprio texto.
function dividirLinhaCsv(linha) {
  const campos = [];
  let campoAtual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const caractere = linha[i];

    if (caractere === '"') {
      dentroDeAspas = !dentroDeAspas; // liga/desliga o modo "dentro de aspas"
    } else if (caractere === ',' && !dentroDeAspas) {
      campos.push(campoAtual);
      campoAtual = '';
    } else {
      campoAtual += caractere;
    }
  }

  campos.push(campoAtual); // adiciona o último campo, depois da última vírgula
  return campos;
}

// Transforma uma linha de texto em um objeto, usando os nomes das colunas
// (vindos do cabeçalho do CSV) como chaves.
function transformarLinhaEmObjeto(linha, colunas) {
  const valores = dividirLinhaCsv(linha);

  const objeto = {};
  colunas.forEach((nomeDaColuna, indice) => {
    objeto[nomeDaColuna] = valores[indice];
  });

  return objeto;
}

// Transforma "Assunto A | Assunto B | Assunto C" numa lista de textos.
// Se o campo estiver vazio, devolve uma lista vazia.
function dividirAssuntos(textoDeAssunto) {
  if (!textoDeAssunto) return [];
  return textoDeAssunto.split('|').map((assunto) => assunto.trim());
}

// Lê o arquivo CSV inteiro e devolve um array de objetos — um objeto por
// linha de dado. A primeira linha do arquivo (o cabeçalho) não vira um
// objeto: ela só serve para descobrir os nomes das colunas.
function carregarCsvComoObjetos(caminho) {
  const linhas = lerLinhasDoArquivo(caminho);

  const linhaDeCabecalho = linhas[0];
  const linhasDeDados = linhas.slice(1); // tudo, menos a primeira linha

  const colunas = dividirLinhaCsv(linhaDeCabecalho);

  return linhasDeDados.map((linha) => transformarLinhaEmObjeto(linha, colunas));
}

// Recebe a lista de objetos soltos (uma linha = uma disciplina) e devolve
// um objeto organizado por ano
function agruparPorAno(linhasDeObjetos) {
  const resultado = {};

  linhasDeObjetos.forEach((linha) => {
    const ano = linha.ano;
    const quantidade = Number(linha.quantidade); // vem como texto ("9"), precisamos de número

    // Se ainda não vimos esse ano, cria a "gaveta" dele vazia
    if (!resultado[ano]) {
      resultado[ano] = {
        totalQuestoes: 0,
        fg: { total: 0, disciplinas: [] },
        ce: { total: 0, disciplinas: [] },
      };
    }

    // Decide se essa disciplina vai pra gaveta de Formação Geral ou de Componente Específico
    const ehFormacaoGeral = linha.tipo === 'Formação Geral';
    const bloco = ehFormacaoGeral ? resultado[ano].fg : resultado[ano].ce;

    bloco.disciplinas.push({
      nome: linha.disciplina,
      qtd: quantidade,
      assuntos: dividirAssuntos(linha.assunto),
      // quantas das questões são discursivas: são os primeiros assuntos da lista
      discursivas: Number(linha.discursivas) || 0,
    });
    bloco.total += quantidade;
    resultado[ano].totalQuestoes += quantidade;
  });

  return resultado;
}

// Disciplinas e assuntos da Formação Geral de cada ano (a prova é a mesma para todos os cursos).
// Devolve { ano: [{ nome, qtd, discursivas, assuntos }] }, com as discursivas primeiro em cada lista.
function carregarFormacaoGeral() {
  const caminho = path.join(__dirname, '..', '..', 'data', 'formacao-geral.json');
  if (!fs.existsSync(caminho)) return {};

  const porAno = JSON.parse(fs.readFileSync(caminho, 'utf-8'));
  const resultado = {};
  for (const [ano, questoes] of Object.entries(porAno)) {
    const porDisciplina = new Map();
    // discursivas antes das objetivas, cada grupo na ordem das questões
    const ordenadas = [...questoes.filter((q) => q.tipo === 'discursiva'), ...questoes.filter((q) => q.tipo !== 'discursiva')];
    for (const q of ordenadas) {
      if (!porDisciplina.has(q.disciplina)) porDisciplina.set(q.disciplina, { nome: q.disciplina, qtd: 0, discursivas: 0, assuntos: [], numeros: [] });
      const d = porDisciplina.get(q.disciplina);
      d.qtd += 1;
      if (q.tipo === 'discursiva') d.discursivas += 1;
      d.assuntos.push(q.tema);
      d.numeros.push(String(q.numero));
    }
    resultado[ano] = [...porDisciplina.values()].sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  return resultado;
}

const formacaoGeralPorAno = carregarFormacaoGeral();

const pastaDeImagens = path.join(__dirname, '..', '..', 'data', 'questoes-imagens');

// Para cada assunto das disciplinas de uma edição, a questão correspondente: { id, tipo, tema, gabarito,
// situacao, imagem }. A lista "questoes" de cada disciplina segue a ordem de "assuntos" (discursivas
// primeiro). A imagem é o recorte do caderno de prova (data/questoes-imagens/<ano>/); só entra se existir.
// Edições sem a tabela do INEP ou sem caderno ficam sem "questoes".
function ligarQuestoesAosAssuntos(chaveDoCurso, ano, edicao) {
  const caminho = path.join(__dirname, '..', '..', 'data', 'questoes', `${chaveDoCurso}-${ano}.json`);
  if (!fs.existsSync(caminho)) return;

  const tabela = JSON.parse(fs.readFileSync(caminho, 'utf-8'));
  const [fg, ce] = [tabela.componentes[0], tabela.componentes[1]];
  const gabaritos = (componente) => new Map(componente.questoes.map((q) => [String(q.numero), q]));
  const doFg = gabaritos(fg);
  const doCe = gabaritos(ce);

  const imagem = (prefixo, id) => {
    const nome = `${prefixo}-${id.toLowerCase()}.webp`;
    return fs.existsSync(path.join(pastaDeImagens, String(ano), nome)) ? `${ano}/${nome}` : null;
  };
  const montar = (id, tipo, tema, prefixo, tabelaDoComponente) => {
    const dados = tipo === 'objetiva' ? tabelaDoComponente.get(id) : null;
    // desconsiderada: o relatório não traz o gabarito, mas a prova tem; anulada fica sem
    const gabarito = dados ? (dados.gabarito ?? (dados.situacao === 'desconsiderada' ? dados.gabaritoDaProva ?? null : null)) : null;
    return {
      id,
      tipo,
      tema,
      gabarito,
      situacao: dados ? dados.situacao : null,
      imagem: imagem(prefixo, id),
    };
  };

  // Formação Geral: os números vêm da própria lista de disciplinas
  for (const disciplina of edicao.fg.disciplinas) {
    if (!disciplina.numeros) continue;
    disciplina.questoes = disciplina.assuntos.map((tema, i) => {
      const id = disciplina.numeros[i];
      return montar(id, id.startsWith('D') ? 'discursiva' : 'objetiva', tema, 'fg', doFg);
    });
  }

  // Componente Específico: casa disciplina e tema com as questões da tabela (objetivas) e da lista de discursivas
  const candidatas = [
    ...(ce.discursivas || []).map((q) => ({ id: q.numero, tipo: 'discursiva', disciplina: q.disciplina, tema: q.tema })),
    ...ce.questoes.map((q) => ({ id: String(q.numero), tipo: 'objetiva', disciplina: q.disciplina, tema: q.tema })),
  ];
  for (const disciplina of edicao.ce.disciplinas) {
    const lista = candidatas.filter((q) => q.disciplina === disciplina.nome);
    if (lista.length === 0) continue;
    const questoes = disciplina.assuntos.map((tema) => {
      const i = lista.findIndex((q) => q.tema === tema);
      if (i === -1) return null;
      const [q] = lista.splice(i, 1);
      return montar(q.id, q.tipo, tema, chaveDoCurso, doCe);
    });
    if (questoes.every(Boolean)) disciplina.questoes = questoes;
  }
}

// Recebe a chave do curso ("ec", "ep" ou "si") e devolve o objeto
// completo e organizado, pronto pra ser usado pelas rotas:
function montarDadosDoCurso(chaveDoCurso) {
  const caminhoDoArquivo = path.join(__dirname, '..', '..', 'data', `${chaveDoCurso}.csv`);

  const objetos = carregarCsvComoObjetos(caminhoDoArquivo);
  const agrupadoPorAno = agruparPorAno(objetos);

  // O "nome" do curso está dentro de qualquer uma das linhas (todas têm o mesmo)
  const nomeDoCurso = objetos[0].curso;

  // Separa o "geral" do resto: o resto vira "porAno"
  const { geral, ...porAno } = agrupadoPorAno;

  // Formação Geral: quando há disciplinas e assuntos do ano, substituem a linha "(sem disciplina associada)"
  for (const [ano, disciplinas] of Object.entries(formacaoGeralPorAno)) {
    if (porAno[ano]) porAno[ano].fg.disciplinas = disciplinas;
  }

  for (const [ano, edicao] of Object.entries(porAno)) ligarQuestoesAosAssuntos(chaveDoCurso, ano, edicao);

  // Quantas questões de cada componente são discursivas (o resto são objetivas)
  for (const edicao of Object.values(porAno)) {
    for (const bloco of [edicao.fg, edicao.ce]) {
      bloco.discursivas = bloco.disciplinas.reduce((soma, d) => soma + (d.discursivas || 0), 0);
    }
  }

  // As chaves de porAno são texto ("2023"), convertemos pra número e ordenamos do mais recente pro mais antigo
  const anos = Object.keys(porAno)
    .map(Number)
    .sort((a, b) => b - a);

  // Edições em que o Componente Específico tem assuntos cadastrados (as demais só têm as quantidades)
  const anosComAssuntos = anos.filter((ano) =>
    porAno[ano].ce.disciplinas.some((disciplina) => disciplina.assuntos.length > 0),
  );

  return {
    nome: nomeDoCurso,
    anos,
    anosComAssuntos,
    geral,
    porAno,
  };
}

// Carrega os dados dos cursos do AvaliaUFOP uma única vez, assim que esse
// arquivo é importado pela primeira vez. Fica guardado aqui na memória, pra
// não precisar ler o CSV do disco de novo a cada requisição.
// A ordem aqui é a mesma exibida no front (Computação, Produção, Sistemas).
// Engenharia Elétrica (ee.csv) não faz parte do AvaliaUFOP, então não é carregada.
const cursos = {
  ec: montarDadosDoCurso('ec'),
  ep: montarDadosDoCurso('ep'),
  si: montarDadosDoCurso('si'),
};

// Devolve todos os cursos já carregados.
function buscarTodosOsCursos() {
  return cursos;
}

// Devolve os dados de um curso específico ("ec", "ep" ou "si").
// Se a chave não existir, devolve null em vez de quebrar.
function buscarCurso(chaveDoCurso) {
  return cursos[chaveDoCurso] || null;
}

// Devolve o recorte de dados de um curso + ano.
// Se "ano" não for passado (ou for "geral"), devolve o agregado de todas as edições.
// Se o curso ou o ano não existirem, devolve null.
function buscarDadosDoCurso(chaveDoCurso, ano) {
  const curso = buscarCurso(chaveDoCurso);
  if (!curso) return null;

  if (!ano || ano === 'geral') {
    return curso.geral;
  }
  return curso.porAno[ano] || null;
}

module.exports = { buscarTodosOsCursos, buscarCurso, buscarDadosDoCurso };