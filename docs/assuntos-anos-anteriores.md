# Assuntos de EC 2017, EC 2014, SI 2014, EP 2017 e EP 2014

Essas três edições não tinham os assuntos por disciplina em `data/ec.csv` e `data/si.csv`. Eles foram
escritos a partir do enunciado de cada questão (arquivos `enade_AAAA_<curso>.jsonl` do Projeto Enade).

Convenção (a mesma de 2023): em cada disciplina, os assuntos seguem a ordem das questões, com a
discursiva primeiro e depois as objetivas em ordem crescente de número. O teste
`assuntos por disciplina (data/*.csv)` confere que há um assunto por questão.

**Para revisar:** parte dos enunciados depende de figuras que o texto extraído não traz. Vale
conferir principalmente:

| Edição | Questão | Assunto escrito | Por quê |
| --- | --- | --- | --- |
| EC 2014 | 13 (Física I) | Cabos superleves de fibra de carbono em elevadores | tema inferido do contexto |
| EC 2014 | 14 (Prog. I) | Algoritmo para o fator de atrito em tubulações | alternativas são sequências de passos |
| EC 2014 | 28 (Instrumentação) | Sistema de aquisição de vibrações | depende do diagrama de blocos |
| SI 2014 | 21 e 25 (Ger. de Projetos) | Priorização de problemas / gráficos de apoio | enunciado curto, sem a resposta |
| SI 2014 | 11 (Estatística) | Probabilidade aplicada à classificação de erros | depende de tabela |
| SI 2014 | 9 (AED I) | Comparação de dois arrays de matrículas | resumido do enunciado |

## Engenharia de Produção 2017 e 2014

Não havia arquivo `.jsonl` com a disciplina de cada questão para esses dois anos, só os cadernos de
prova (PDF). Por isso **a disciplina de cada questão também foi escolhida por mim**, pelo conteúdo
do enunciado, usando os nomes de disciplina de EP 2019 e 2023. As questões 9 a 18 de EP 2017 e de
EP 2014 são as mesmas do bloco comum de Engenharia de Computação, e recebem as mesmas disciplinas
de lá. As discursivas 3, 4 e 5 vieram do caderno e do padrão de resposta.

Os gabaritos das objetivas de EP 2017 e 2014 (necessários para as questões desconsideradas, que o
relatório do INEP não traz) vieram dos gabaritos oficiais (`16_gab_engenharia_producao.pdf` e
`15_Engenharia_de_Producao.pdf`) e foram gravados em `scripts/fontes/ep-2014.jsonl` e `ep-2017.jsonl`;
conferem com os do relatório em todas as questões válidas.

A tabela de EP 2023/2019 usa os mesmos nomes. Vale conferir, pois a escolha é subjetiva quando o
tema cabe em mais de uma disciplina:

| Edição | Questão | Disciplina escolhida | Outra possível |
| --- | --- | --- | --- |
| EP 2014 | 21 (exatidão e precisão) | Controle Estatístico de Qualidade | Gestão da Qualidade |
| EP 2014 | 24 (mix e gargalo) | Processos de Produção | Planejamento e Controle de Produção I |
| EP 2014 | 26 (teoria das filas) | Simulação a Eventos Discretos | Programação Linear e Inteira |
| EP 2014 | 29 (FMEA e pensamento enxuto) | Gestão da Qualidade | Sistema de Desenvolvimento de Produtos |
| EP 2014 | 31 (compartilhamento de veículos) | Engenharia Econômica | Custos Industriais |
| EP 2017 | D3 (alumínio reciclado) | Logística e Gestão da Cadeia de Suprimentos | Logística Reversa |
| EP 2017 | D5 (balanceamento de linha) | Organização Industrial | Processos de Produção |
| EP 2017 | 27 (inovação tecnológica) | Sistema de Desenvolvimento de Produtos | Planejamento Estratégico e Mercadológico |
| EP 2017 | 29 (teoria das filas) | Simulação a Eventos Discretos | Programação Linear e Inteira |

## Formação Geral (todos os anos)

`data/formacao-geral.json` tem a disciplina e o tema de cada questão de Formação Geral de 2008, 2011, 2014,
2017, 2019, 2021 e 2023, escolhidos por mim a partir do enunciado. As disciplinas são gerais de propósito
(Sociologia, Meio Ambiente e Sustentabilidade, Geografia, Saúde e Sociedade, Direitos Humanos e Cidadania
etc.), e é fácil trocar: basta editar o arquivo e rodar `node scripts/extrair-questoes.js --todos`.

### Decisões sobre as questões discutíveis

Em todas ficou a disciplina que já estava; o que decide é o assunto central do enunciado:

| Questão | Disciplina | Por quê |
| --- | --- | --- |
| 2008 Q1 (Machado de Assis) | Literatura e Linguagens | o texto é literário; o contexto histórico é só pano de fundo |
| 2011 Q1 (poema) | Literatura e Linguagens | é interpretação de um poema |
| 2014 Q7 (tempo de deslocamento casa-trabalho) | Geografia | trata de mobilidade urbana, assim como a Q8 |
| 2017 Q3 (tarifa de energia por bandeiras) | Matemática | o centro da questão é interpretar a tabela e calcular a tarifa |
| 2023 Q1 (fome) | Sociologia | a questão liga a fome à desigualdade social, não à saúde |

## Divergências de gabarito

O gabarito de cada questão é o do **relatório do INEP** (pela regra "o acerto do curso é a resposta do
gabarito"). Nos arquivos de prova da pasta do Projeto Enade há duas divergências, já resolvidas a favor do
relatório e registradas em `DIVERGENCIAS_CONHECIDAS` (`scripts/extrair-questoes.js`), então não geram mais
aviso:

- **SI 2014, Formação Geral, Q5:** prova B, relatório D. O gabarito oficial (`39_gab_sistemas_informacao.pdf`)
  é **D**, ou seja, o relatório está certo e o arquivo de prova é que estava errado.
- **EP 2023, Q36:** prova B, relatório C. Não há gabarito oficial na pasta; vale o do relatório.

Nas questões **desconsideradas** o relatório não traz o gabarito (aparece "\*\*"); o do site vem da prova
(`gabaritoDaProva`). As **anuladas** ficam sem gabarito.
