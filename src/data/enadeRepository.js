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
    });
    bloco.total += quantidade;
    resultado[ano].totalQuestoes += quantidade;
  });

  return resultado;
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