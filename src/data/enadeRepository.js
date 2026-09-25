const fs = require('fs');
const path = require('path');

// Lê o arquivo CSV do disco e devolve um array de linhas (uma string por linha),
// já sem linhas vazias.
function lerLinhasDoArquivo(caminho) {
  const conteudo = fs.readFileSync(caminho, 'utf-8');

  return conteudo
    .trim()               // remove espaços/quebras de linha do início e do fim
    .split(/\r?\n/);        // quebra o texto em um array, uma posição por linha
}


// Transforma uma linha de texto "ec,geral,CE,Redes de Computadores I,9"
// em um objeto, usando os nomes das colunas como chaves.
function transformarLinhaEmObjeto(linha, colunas) {
  const valores = linha.split(',');   // separa a linha em pedaços, pela vírgula

  const objeto = {};
  colunas.forEach((nomeDaColuna, indice) => {
    objeto[nomeDaColuna] = valores[indice];
  });

  return objeto;
}

// Lê o arquivo CSV inteiro e devolve um array de objetos — um objeto por
// linha de dado. A primeira linha do arquivo (o cabeçalho) não vira um
// objeto: ela só serve para descobrir os nomes das colunas.
function carregarCsvComoObjetos(caminho) {
  const linhas = lerLinhasDoArquivo(caminho);

  const linhaDeCabecalho = linhas[0];
  const linhasDeDados = linhas.slice(1);   // tudo, menos a primeira linha

  const colunas = linhaDeCabecalho.split(',');

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

    bloco.disciplinas.push({ nome: linha.disciplina, qtd: quantidade });
    bloco.total += quantidade;
    resultado[ano].totalQuestoes += quantidade;
  });

  return resultado;
}

// Recebe a chave do curso ("ec" ou "si") e devolve o objeto completo e
// organizado, pronto pra ser usado pelas rotas:
function montarDadosDoCurso(chaveDoCurso) {
  const caminhoDoArquivo = path.join(__dirname, '..', '..', 'data', `${chaveDoCurso}.csv`);

  const objetos = carregarCsvComoObjetos(caminhoDoArquivo);
  const agrupadoPorAno = agruparPorAno(objetos);

  // O "nome" do curso está dentro de qualquer uma das linhas (todas têm o mesmo)
  const nomeDoCurso = objetos[0].curso;

  // Separa o "geral" do resto: o resto vira "porAno"
  const { geral, ...porAno } = agrupadoPorAno;

  // As chaves de porAno são texto ("2023"), convertemos pra número e ordenamos do mais recente pro mais antigo
  const anos = Object.keys(porAno)
    .map(Number)
    .sort((a, b) => b - a);

  return {
    nome: nomeDoCurso,
    anos,
    geral,
    porAno,
  };
}

// Carrega os dados dos dois cursos (ec e si) uma única vez, assim que esse
// arquivo é importado pela primeira vez. Fica guardado aqui na memória, pra
// não precisar ler o CSV do disco de novo a cada requisição.
const cursos = {
  ec: montarDadosDoCurso('ec'),
  si: montarDadosDoCurso('si'),
  ee: montarDadosDoCurso('ee'),
  ep: montarDadosDoCurso('ep'),
};

// Devolve todos os cursos já carregados.
function buscarTodosOsCursos() {
  return cursos;
}

// Devolve os dados de um curso específico ("ec" ou "si").
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