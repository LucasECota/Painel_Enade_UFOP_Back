# Notas do AvaliaUFOP

Coloque aqui o export de notas de cada questionário do Moodle (JSON). O nome do arquivo não
importa: o backend lê todos os `.json` da pasta da atividade.

    data/avaliaufop/
      ec/   (Engenharia de Computação)
      ep/   (Engenharia de Produção)
      si/   (Sistemas de Informação)
        teste-conhecimento/   (Enade: Teste o seu conhecimento)
        fg/                   (Simulado: Formação Geral – objetivas)
        ce/                   (Simulado: Componente Específico – objetivas)
        simulado/             (Simulado Enade completo, mostrado à parte)

## Atualizando os dados (anonimização)

1. Exporte o JSON de notas no Moodle e coloque na pasta da atividade (pode sobrescrever o antigo).
2. Rode `npm run anonimizar` dentro do backend.

O script troca `nome`, `sobrenome` e `endereodee-mail` por um código (`aluno`) gerado com
HMAC-SHA256 do e-mail + a chave `ANONIMIZACAO_SEGREDO` do arquivo `.env`. É determinístico: o
mesmo aluno recebe o mesmo código em todas as atividades e em todas as exportações, mas não dá
para descobrir o e-mail a partir do código. Linhas já anonimizadas não são alteradas.

**Guarde a chave do `.env` em local seguro.** Se ela for perdida ou trocada, os códigos novos não
vão mais bater com os antigos (o mesmo aluno viraria duas pessoas). O `.env` não vai para o git.

## Simulado Enade

A pasta `simulado/` é mostrada **à parte** no site: quantos alunos fizeram o simulado (tentativa
"Finalizada", um por aluno), a média das notas (a melhor de cada um) e o número de questões. Ela **não**
entra na média geral, nos inscritos, nos concluintes nem nos aprovados.

Para a tabela que compara o simulado com o Enade questão por questão, informe em `simulados.json` (nesta
pasta) de qual edição vieram as questões e os números delas **na ordem do simulado no Moodle** (a primeira
da lista é a coluna `q1` do export):

    { "ep": { "edicao": 2023, "questoes": [1, 3, 5, ...] } }

Uma questão de uma edição que o curso **não fez** (por exemplo, a Formação Geral de 2023 no simulado de
Sistemas, que não fez o Enade 2023) é escrita como `{ "numero": 1, "edicao": 2023, "referencia": "ec" }`:
o tema, o gabarito, a imagem e os acertos da UFOP e do Brasil vêm da tabela do curso de referência. Na tela elas aparecem
como as demais (a resposta da API guarda no campo `referencia` de qual curso vieram os números).

Sem essa entrada (ou se a quantidade não bater com as colunas do export), o site mostra só o número de alunos
e a média.

## Inscritos e concluintes (manual)

O Moodle só exporta quem já fez alguma atividade, então os inscritos que ainda não começaram
não aparecem nos arquivos. Por isso os dois números do topo da página de Desempenho podem ser
informados à mão em `participantes.json`:

    { "ec": { "inscritos": 20, "concluintes": 3 }, "ep": { ... }, "si": { ... } }

Campo `null` = usa o valor calculado a partir das notas. Vale na próxima requisição.

## Regras de cálculo

- Só entram tentativas com `estado` = "Finalizada". Vale a maior nota de cada aluno.
  Linhas de resumo (ex.: "Média geral") são ignoradas.
- A nota em % vem da coluna `avaliarNNNN` do Moodle (o máximo está no nome: `avaliar1000` =
  nota de 0 a 10,00). Se ela não existir, usa a soma das colunas `q1`, `q2`... dividida pela
  soma dos máximos (ex.: `q1250` = questão 1, máximo 2,50).
- As questões são sorteadas a cada tentativa, então a nota é calculada por tentativa, não por questão.
- Calculado: inscritos = alunos que aparecem em algum arquivo; concluinte = fez as três atividades.
- Atividade sem arquivo aparece como "ainda não foi feito", com 0%.
