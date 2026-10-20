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

## Atualizando os dados (anonimização)

1. Exporte o JSON de notas no Moodle e coloque na pasta da atividade (pode sobrescrever o antigo).
2. Rode `npm run anonimizar` dentro do backend.

O script troca `nome`, `sobrenome` e `endereodee-mail` por um código (`aluno`) gerado com
HMAC-SHA256 do e-mail + a chave `ANONIMIZACAO_SEGREDO` do arquivo `.env`. É determinístico: o
mesmo aluno recebe o mesmo código em todas as atividades e em todas as exportações, mas não dá
para descobrir o e-mail a partir do código. Linhas já anonimizadas não são alteradas.

**Guarde a chave do `.env` em local seguro.** Se ela for perdida ou trocada, os códigos novos não
vão mais bater com os antigos (o mesmo aluno viraria duas pessoas). O `.env` não vai para o git.

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
