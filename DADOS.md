# Dados do Painel Enade: de onde vêm e como refazer

Este guia é para quem for **atualizar ou corrigir os dados** do painel: uma pessoa, ou uma pessoa
trabalhando com o Claude (Claude Code). Ele diz quais PDFs são usados, onde ficam, o que cada um vira e
como conferir o resultado.

> **Leia antes:** nem tudo é automático. As tabelas de acertos e as imagens das questões são geradas por
> script. Os CSVs, a Formação Geral e os resultados dos cursos são **escritos à mão** (ou pelo Claude lendo
> os PDFs) e protegidos por testes. Nenhum script baixa PDF da internet: **uma pessoa baixa e coloca na
> pasta certa**.

## 1. Visão geral

| Arquivo gerado (em `data/`) | Vem de | Como é feito | Conferido por |
| --- | --- | --- | --- |
| `questoes/<curso>-<ano>.json` | Relatório de Curso (PDF) + arquivo da prova (`.jsonl`) + CSV + `formacao-geral.json` | **script** `scripts/extrair-questoes.js` | `tests/questoes.test.js` |
| `questoes-imagens/<ano>/*.webp` | Caderno de prova (PDF) | **script** `scripts/recortar-questoes.py` + conferência visual | testes de existência |
| `ec.csv`, `ep.csv`, `si.csv` | Caderno de prova | **manual** (ou Claude lendo os enunciados) | `tests/questoes.test.js` |
| `formacao-geral.json` | Caderno de prova | **manual** (ou Claude) | `tests/questoes.test.js` |
| `resultados-enade.json` | Relatórios da IES (PDF) e painel da CAVIN | **manual** (transcrição) | `tests/dados-enade.test.js` |
| `relatorios-inep/*.pdf`, `relatorios-curso/*.pdf` | INEP | cópia do PDF com o nome no padrão | testes de nome |
| `avaliaufop/**` | Exports de notas do Moodle | **script** `npm run anonimizar` | `tests/anonimizacao.test.js`, `tests/desempenho.test.js` |
| `avaliaufop/simulados.json` | Lista de questões do simulado | **manual** | `tests/desempenho.test.js` |

Siglas dos cursos: `ec` (Engenharia de Computação), `ep` (Engenharia de Produção), `si` (Sistemas de
Informação). Há também `ee.csv` (Engenharia Elétrica): **não é usado** pelo painel.

## 2. Preparando o computador

```bash
npm install                      # Node.js 22 ou mais novo
python3 -m venv .venv            # só para recortar as imagens
.venv/bin/pip install pymupdf pillow
```

## 3. Onde ficam os PDFs

### Dentro do repositório (são publicados no site, para download)

| Pasta | Nome obrigatório |
| --- | --- |
| `data/relatorios-curso/` | `enade-AAAA-<curso-por-extenso>-relatorio-de-curso.pdf` (`engenharia-de-computacao`, `engenharia-de-producao`, `sistemas-de-informacao`) |
| `data/relatorios-inep/` | `enade-AAAA-ufop-joao-monlevade.pdf` (relatório da IES) |

O site monta as listas de download a partir do **nome do arquivo**. Alguns PDFs ficam só no computador (estão
no `.gitignore`); para publicar um deles, tire a linha do `.gitignore`.

### Fora do repositório: a pasta `Projeto Enade`

Os cadernos de prova **não vão para o Git**. Os scripts esperam esta pasta **ao lado** da pasta do back:

```
<pasta de trabalho>/
├── Painel_Enade_UFOP_Back/
└── Projeto Enade/
    └── Questoes/
        ├── Engenharia da Computacao/<ano>/
        ├── Engenharia de Produção/<ano>/
        └── Sistema de Informacao/<ano>/
```

Em cada ano há (os nomes variam conforme o ano):

| Arquivo | Para que serve |
| --- | --- |
| Caderno de prova (PDF) | recorte das imagens e leitura dos enunciados. O nome exato usado está em `scripts/cadernos.json` |
| Gabarito oficial (`*_gab_*.pdf`, `*_GB_*.pdf`) | conferir gabaritos |
| Padrão de resposta (`padrao_resposta*`, `Pad_Resp*`) | temas das discursivas |
| `enade_AAAA_<curso>.jsonl` | prova em texto (veja abaixo) |

Os caminhos têm espaços e acentos: **use aspas** nos comandos.

### O arquivo da prova (`.jsonl`)

Uma questão por linha, em JSON. Campos que o script usa:

```json
{"numero": "9", "tipo_questao": "Formação Geral", "disciplina_associada": "...", "alternativa_correta": "E"}
{"numero": "D2", "tipo_questao": "Componente Específico", "disciplina_associada": "...", "alternativa_correta": "None"}
```

- `tipo_questao`: `Formação Geral` ou `Componente Específico`.
- `numero`: o número da prova. Discursivas começam com `D` (`D2`, `D3` ou `Discursiva 3`).
- `disciplina_associada`: disciplina do curso na UFOP. O script remove o código (`(CEA063)`, `CSI115 - `) e,
  em `A / B`, fica com a primeira.
- `alternativa_correta`: letra, ou `"None"`.

Os `.jsonl` de `Projeto Enade` são preparados à parte: **este repositório não tem script que os gere**.
Produção 2014 e 2017 não tinham `.jsonl`; os do painel estão em `scripts/fontes/` (disciplinas escolhidas
pelo projeto e gabaritos copiados dos gabaritos oficiais em PDF).

## 4. Tabelas de acertos (`data/questoes/`)

**Entrada:** o Relatório de Curso do INEP. Todo relatório (2008 a 2023) tem uma tabela por componente com,
por questão: percentual de acerto (curso na UFOP, estado, região, categoria administrativa, organização
acadêmica e Brasil, conforme o ano), gabarito e distribuição das respostas. Nos relatórios usados pelo painel
(2014 em diante) há também uma tabela com média e desvio padrão das discursivas. O painel só gera a tabela
dos anos que têm o caderno de prova (por isso 2008 e 2011 ficam de fora, embora o script saiba ler o formato).

**Como o script lê o PDF** (`scripts/extrair-questoes.js`, com `pdfjs-dist`):

1. Junta em linhas os textos que estão na mesma altura da página (alguns PDFs guardam a tabela por coluna).
2. Reconhece cada linha de questão pela quantidade de campos (formatos `padrao`, de 2014 em diante, `2011` e
   `2008`) e conserta linhas quebradas em duas.
3. Não depende do número da tabela: agrupa questões de numeração seguida. O bloco que começa na questão 1 é a
   Formação Geral e o seguinte é o Componente Específico (vale o último par, o dos concluintes).
4. Lê as notas das discursivas (12 números por linha: média e desvio de cada um dos seis grupos).
5. Junta a disciplina (do `.jsonl`) e o tema (do CSV, no Componente Específico; do `formacao-geral.json`, na
   Formação Geral).

**Situação de cada questão:**

| No relatório | `situacao` | Gabarito no painel |
| --- | --- | --- |
| letra | `valida` | o do relatório |
| `**` (desconsiderada pelo bisserial) | `desconsiderada` | `gabaritoDaProva`, vindo do `.jsonl` |
| `*` ou `ANULADA` | `anulada` | sem gabarito |

**Regra de gabarito:** vale **o do relatório do INEP** (o acerto do curso é a resposta do gabarito). As duas
divergências já conferidas com o `.jsonl` estão em `DIVERGENCIAS_CONHECIDAS`, no script (SI 2014, Formação
Geral, Q5, confirmada no gabarito oficial; e EP 2023, Q36). Uma divergência **nova** gera aviso: confira no
gabarito oficial antes de acrescentar à lista.

**Comandos** (a lista de relatórios fica em `scripts/relatorios.json`):

```bash
node scripts/extrair-questoes.js --todos
git diff --stat data/questoes     # sem mudança nas entradas, não deve haver diferença
```

Para um relatório só:

```bash
node scripts/extrair-questoes.js --curso ec --ano 2023 \
  --pdf data/relatorios-curso/enade-2023-engenharia-de-computacao-relatorio-de-curso.pdf \
  --prova "../Projeto Enade/Questoes/Engenharia da Computacao/2023/enade_2023_engenharia_computacao.jsonl" \
  --assuntos data/ec.csv
```

**Todo aviso do script precisa ser resolvido** (tema não ligado, questão não encontrada, discursiva sem nota,
gabarito diferente).

## 5. CSVs das edições (`ec.csv`, `ep.csv`, `si.csv`)

Alimentam "Assuntos por disciplina". São editados **à mão**. Codificação UTF-8, fim de linha **CRLF**
(preserve ao editar).

```
curso,ano,tipo,disciplina,quantidade,assunto,discursivas
Engenharia de Computação,2023,Componente Específico,Algoritmos e Estruturas de Dados I,2,"Assunto da discursiva | Assunto da objetiva",1
```

| Coluna | Regra |
| --- | --- |
| `ano` | ano da edição, ou `geral` (total entre edições) |
| `tipo` | `Formação Geral` ou `Componente Específico` |
| `quantidade` | número de questões da disciplina na edição |
| `assunto` | um assunto por questão, separados por ` \| ` (use aspas se houver vírgula) |
| `discursivas` | quantos dos **primeiros** assuntos são de discursivas |

**Ordem obrigatória dos assuntos:** primeiro as discursivas, depois as objetivas em **ordem crescente de
número**. É por essa ordem que o script liga cada tema à sua questão; fora de ordem, os temas trocam de
questão **sem erro aparente** (o teste só confere a quantidade).

A Formação Geral não precisa de linhas por disciplina nos CSVs: vem do `formacao-geral.json`.

> Observação: as linhas `geral` não são calculadas por script e o site atual não as exibe. Em `ep.csv` a soma
> delas (80) não bate com a soma das edições (160). Se um dia forem usadas, recalcule antes.

## 6. Formação Geral (`formacao-geral.json`)

A prova de Formação Geral é **a mesma para todos os cursos** do ano. Um item por questão:

```json
{ "2023": [ { "numero": "1", "tipo": "objetiva", "disciplina": "Sociologia", "tema": "..." },
            { "numero": "D1", "tipo": "discursiva", "disciplina": "...", "tema": "..." } ] }
```

- Objetivas numeradas de 1 em diante, sem pular; a quantidade deve bater com a tabela do relatório.
- 2 discursivas por ano (1 em 2023).
- As disciplinas são **gerais de propósito** (Sociologia, Geografia, Meio Ambiente e Sustentabilidade...).
  Reaproveite os nomes que já existem. A escolha segue o **assunto central** do enunciado.

Depois de editar, rode `node scripts/extrair-questoes.js --todos`.

## 7. Imagens das questões

`scripts/cadernos.json` tem um item por caderno:

| Campo | O que é |
| --- | --- |
| `curso`, `ano` | de qual prova |
| `pdf` | caminho dentro de `Projeto Enade/Questoes` |
| `ultimaObjetiva` | número da última objetiva (depois dela o caderno tem o questionário do estudante) |
| `objetivasFg` | quantas objetivas são de Formação Geral (8 até 2021; 9 em 2023) |

```bash
.venv/bin/python scripts/recortar-questoes.py                    # todos
.venv/bin/python scripts/recortar-questoes.py --curso ec --ano 2023
```

O script (biblioteca em `scripts/recortar_questoes_lib.py`) acha os títulos `QUESTÃO NN` (inclusive os de
fonte "embaralhada" de alguns cadernos), trata páginas de uma ou duas colunas, para em `ÁREA LIVRE` e
`RASCUNHO`, tira cabeçalho e rodapé e junta os pedaços. Saída: WebP com até 900 px de largura em
`data/questoes-imagens/<ano>/`, com os nomes `fg-<n>`, `fg-d<n>`, `<curso>-<n>` e `<curso>-d<n>`.

**Conferência obrigatória:** o script lista questões que faltam ou que podem ter sido cortadas, mas **só olhar
a imagem garante**. Abra as listadas e algumas de cada caderno, olhando principalmente o **começo e o fim**
(primeira linha e alternativa E). Um caderno com layout novo pode exigir ajuste na biblioteca.

## 8. Resultados dos cursos (`resultados-enade.json`)

Transcrito **à mão** dos relatórios da IES (e do painel da CAVIN). Para cada curso: `edicoes` (`ano`,
`conceito`, `presentes`, `populacao`), `comparacao` do último ano (`geral`, `formacaoGeral`, `especifico`,
cada um com `curso` e `brasil`) e `perfil` (`renda`, `auxilio`, `bolsa`).

Os testes pegam erros de digitação: conceito inteiro de 1 a 5; presentes não passam da população; **nota geral
= 75% do Específico + 25% da Formação Geral** (tolerância 0,15); percentuais de 0 a 100; e todo ano citado
precisa ter o PDF em `relatorios-inep/`. Passar nos testes **não garante** que o número está certo: confira
cada valor no PDF.

> O INEP avisa que as notas **não são comparáveis entre edições**. Não calcule variações entre anos.

## 9. AvaliaUFOP (Moodle) e Simulado Enade

Passo a passo completo em [`data/avaliaufop/README.md`](data/avaliaufop/README.md). O essencial:

1. Coloque o export de notas (JSON) em `data/avaliaufop/<curso>/<atividade>/`.
2. **Rode `npm run anonimizar` antes de qualquer outra coisa.** Os exports têm nome e e-mail, e o
   repositório é **público**.
3. A chave `ANONIMIZACAO_SEGREDO` (arquivo `.env`, fora do Git) precisa ser **sempre a mesma**; se mudar, o
   mesmo aluno vira duas pessoas.
4. Simulado Enade: export em `<curso>/simulado/` e a lista das questões em `simulados.json`, **na ordem do
   simulado no Moodle**.
5. Antes do commit, confirme que não sobrou e-mail (não deve aparecer nada):

```bash
grep -rEl "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}" data/avaliaufop --include=*.json
```

Se um dado pessoal já tiver ido para o Git, apagar o arquivo **não basta**: ele continua no histórico. Fale
com o responsável pelo projeto.

## 10. Passo a passo: acrescentar uma nova edição do Enade

1. Baixe do INEP o caderno de prova, o gabarito, o padrão de resposta, o relatório de curso de cada curso e o
   relatório da IES.
2. Copie os relatórios para `data/relatorios-curso/` e `data/relatorios-inep/`, com os nomes da seção 3.
3. Guarde cadernos, gabaritos e padrões em `Projeto Enade/Questoes/<curso>/<ano>/` e prepare o `.jsonl`.
4. Acrescente o ano em `formacao-geral.json` (seção 6).
5. Acrescente as linhas do ano em cada CSV, na ordem certa (seção 5).
6. Acrescente cada relatório em `scripts/relatorios.json` e rode a extração (seção 4) até não haver avisos. Se
   o layout da tabela mudou, ajuste `interpretarLinha` e crie um teste com uma linha real.
7. Acrescente cada caderno em `scripts/cadernos.json`, recorte e **confira as imagens** (seção 7).
8. Atualize `resultados-enade.json` (seção 8).
9. Ajuste os **testes que citam anos e quantidades** (por exemplo, a lista de edições esperadas e o número de
   discursivas por ano, que mudou em 2023). Entenda cada falha antes de mudar o teste.
10. No **front**, se surgir uma disciplina nova, coloque-a em um grupo de `src/gruposDeDisciplinas.js` (senão
    ela aparece em "Outras").
11. Confira (seção 12) e olhe o site no computador **e no celular**.

Um **curso novo** exige também mudar código: `NOMES` em `extrair-questoes.js`, `CURSOS_DOS_RELATORIOS` em
`src/data/resultadosRepository.js`, a lista de cursos de `src/data/enadeRepository.js` e
`src/data/avaliaufopRepository.js` e, no front, `src/data/avaliaufop.js`.

## 11. Trabalhando com o Claude

O Claude **não busca os PDFs sozinho**. No projeto, os PDFs foram baixados e colocados nas pastas por uma
pessoa, e o Claude (no Claude Code, com acesso a essas pastas):

- rodou e ajustou os scripts de extração e de recorte;
- **leu os enunciados** para sugerir disciplina e assunto (CSVs, `formacao-geral.json`,
  `scripts/fontes/`);
- conferiu visualmente os recortes e criou os testes de integridade.

As associações de disciplina e assunto são **interpretação**, não dado oficial do INEP. Uma pessoa que conheça
o curso deve revisá-las.

### Pedido modelo

Abra o Claude Code na pasta que contém os dois repositórios e `Projeto Enade`, e adapte:

```text
Leia o arquivo Painel_Enade_UFOP_Back/DADOS.md e siga o que está nele.
Quero acrescentar o Enade <ANO> do curso <CURSO>. Já coloquei os PDFs em:
- caderno, gabarito e padrão de resposta: Projeto Enade/Questoes/<curso>/<ano>/
- relatório de curso: Painel_Enade_UFOP_Back/data/relatorios-curso/<arquivo>.pdf
Não mude os arquivos da pasta Projeto Enade. Não faça commit nem push sem eu pedir.
No fim, liste o que você decidiu por interpretação, para eu revisar.
```

### Regras para o Claude (e para quem revisar)

1. **Nunca inventar número.** Percentuais, notas, conceitos e gabaritos vêm do PDF. Se não der para ler,
   dizer que não deu e deixar sem o dado.
2. **Marcar o que é interpretação** (disciplina, assunto, imagem duvidosa) e listar para revisão humana.
3. **Dados de alunos:** anonimizar antes de ler o conteúdo; nunca mostrar nem commitar nome ou e-mail.
4. **Conferir contra a fonte:** sortear questões de cada tabela gerada e comparar com a página do PDF
   (número, percentuais e gabarito). Teste passando não substitui essa conferência.
5. **Não comparar um curso com os números de outro** sem decisão do responsável. Hoje há um caso assim: no
   simulado de Sistemas, a Formação Geral de 2023 (que Sistemas não fez) usa os acertos de Computação
   (campo `referencia` em `simulados.json`). **A tela não avisa isso**, por decisão do responsável.
6. Não alterar a pasta `Projeto Enade` (é a fonte original).

## 12. Conferência final

No back:

```bash
node scripts/extrair-questoes.js --todos   # sem avisos
npm test && npm run lint
git status --short                         # só os arquivos esperados
git diff --stat
```

No front:

```bash
npm test && npm run lint && npm run build
```

Para publicar, siga o [DEPLOY.md](DEPLOY.md). Os dados são copiados para dentro da imagem Docker, então toda
mudança em `data/` pede `docker compose up -d --build` no servidor.
