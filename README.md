# Painel Enade — ICEA/UFOP (back-end)

API em Express que serve os dados do site: edições do Enade, AvaliaUFOP, desempenho dos alunos,
resultados do INEP e download dos relatórios em PDF.

## Publicação

A publicação é feita **somente com Docker** (site e API em containers, com `docker compose up -d --build`).
O guia completo, com o texto de pedido para a TI, está em [DEPLOY.md](DEPLOY.md).

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe a API em `http://localhost:3000` e reinicia sozinha ao editar o código (`node --watch`) |
| `npm test` | Roda os testes automatizados (`node --test`, sem dependências extras) |
| `npm run lint` | Verifica o código com o Oxlint (variáveis não usadas ou inexistentes, `==`, `var` etc.) |
| `npm run anonimizar` | Troca nome/e-mail dos alunos por um código nos exports do Moodle |

## Lint

O [Oxlint](https://oxc.rs) lê o código sem executá-lo e aponta erros comuns. A configuração está em
`.oxlintrc.json`: regras de correção como erro, mais `no-undef`, `eqeqeq`, `no-var`, `prefer-const` e
`no-throw-literal`. Variáveis de propósito não usadas começam com `_`. A pasta `data/` é ignorada.

## Rotas

`/api/enade`, `/api/avaliaufop`, `/api/desempenho`, `/api/resultados` e `/api/relatorios`
(`/:ano/download` baixa o PDF do relatório da IES; `/curso` lista os relatórios de curso e
`/curso/:curso/:ano/download` baixa o de um curso, por exemplo `/curso/ec/2023/download`).

Em `/api/enade`, `GET /:curso/questoes?ano=2023` devolve a tabela de acertos por questão (com a disciplina e
o tema de cada uma), `GET /:curso/desempenho-areas` calcula, a partir dessas tabelas, o acerto médio da UFOP e do Brasil por área e por tema em cada edição, e `GET /cursos` informa em `anosComQuestoes` quais edições têm a tabela.

## Integração contínua (CI)

O arquivo `.github/workflows/ci.yml` faz o GitHub rodar, a cada push na `master` e em todo pull request:

1. **Lint e testes:** `npm ci`, `npm run lint` e `npm test`;
2. **Auditoria:** `npm audit --audit-level=high` (falha se houver vulnerabilidade alta ou crítica, inclusive nas ferramentas de desenvolvimento).

O `.github/dependabot.yml` abre pull requests semanais quando uma dependência tem versão nova.
O CI só passa a rodar depois que o projeto for enviado a um repositório no GitHub.

## Segurança

- **Cabeçalhos** de proteção com `helmet` (sem `X-Powered-By`, `nosniff`, CSP etc.).
- **CORS restrito:** só o front de desenvolvimento (`http://localhost:5173`) lê a API pelo navegador.
  Em produção, defina `CORS_ORIGINS` no `.env` com o endereço do site.
- **Limite de requisições** por IP: 120 por minuto na API e 20 por minuto nos downloads de PDF
  (`LIMITE_REQUISICOES` e `LIMITE_DOWNLOADS` mudam esses valores). Atrás de um proxy reverso, é
  preciso configurar `app.set('trust proxy', ...)` para o limite enxergar o IP real.
- **Erros** viram uma resposta JSON genérica; o detalhe vai só para o log do servidor.
- **Chave de anonimização** (`ANONIMIZACAO_SEGREDO`): o servidor não sobe sem ela.
- `npm audit` sem vulnerabilidades; rodar de tempos em tempos.

## Dados

- `data/avaliaufop/` — exports de notas do Moodle (veja o README dessa pasta).
- `data/resultados-enade.json` — conceito, comparação com o Brasil e perfil dos concluintes.
- `data/relatorios-inep/` — PDFs do INEP, no padrão `enade-AAAA-ufop-joao-monlevade.pdf`.
- `data/relatorios-curso/` — Relatórios de Curso do INEP, no padrão `enade-AAAA-<curso>-relatorio-de-curso.pdf`.
- `data/questoes/` — tabela de acertos por questão (`<curso>-<ano>.json`), gerada a partir dos relatórios de curso.

### Gerando a tabela de acertos por questão

Todo Relatório de Curso do INEP (2008 a 2023) tem uma tabela com o percentual de acerto de cada questão
(curso, UF, região, categoria administrativa, organização acadêmica e Brasil, conforme o ano), o gabarito
e a distribuição das respostas. O script lê essas tabelas do PDF (o layout muda de um ano para outro:
`padrao` de 2014 em diante; o script também lê os de 2011 e 2008) e junta a **disciplina** e o **tema** de cada questão:

- **Componente Específico:** a disciplina vem do arquivo da prova (`.jsonl`) e o tema da lista de assuntos
  do CSV, na ordem das questões (a coluna `discursivas` diz quantos dos primeiros assuntos são de questões
  discursivas). Para EP 2014 e 2017 não havia `.jsonl`; as disciplinas estão em `scripts/fontes/`. Só se gera a
  tabela dos anos que têm o caderno de prova (por isso não há EP 2011, SI 2011 nem SI 2008).
- **Formação Geral:** vem de `data/formacao-geral.json` (a prova é a mesma para todos os cursos do ano).

Para refazer todos os arquivos de uma vez, a partir de `scripts/relatorios.json`:

```bash
node scripts/extrair-questoes.js --todos
```

Para um relatório só:

```bash
node scripts/extrair-questoes.js --curso ec --ano 2023 \
  --pdf data/relatorios-curso/enade-2023-engenharia-de-computacao-relatorio-de-curso.pdf \
  --prova "../Projeto Enade/Questoes/Engenharia da Computacao/2023/enade_2023_engenharia_computacao.jsonl" \
  --assuntos data/ec.csv
```

O script avisa se o gabarito do relatório diferir do da prova ou se a quantidade de assuntos de uma disciplina
não bater com a de questões.

### Imagens das questões

Em `GET /:curso?ano=2023`, cada disciplina traz `questoes` (na mesma ordem de `assuntos`): `{ id, tipo, tema, gabarito, situacao, imagem }`.
As imagens (recortes dos cadernos de prova, WebP) ficam em `data/questoes-imagens/<ano>/` e são servidas em `/api/enade/imagens/<ano>/<arquivo>`.
Nas discursivas `gabarito` é `null`; nas anuladas ou desconsideradas também (veja `situacao`).

Para refazer os recortes (ferramenta de desenvolvimento; os PDFs dos cadernos ficam fora do repositório, listados em `scripts/cadernos.json`):

```bash
pip install pymupdf pillow
python3 scripts/recortar-questoes.py            # todos; ou --curso ec --ano 2023
```

O script avisa as questões não encontradas ou possivelmente cortadas; confira as imagens depois.

## Testes

Ficam em `tests/` e **nunca leem nem alteram `data/avaliaufop`**: criam uma pasta temporária e usam
uma chave de anonimização falsa. Cobrem:

- `desempenho.test.js` — cálculo das notas (maior nota do aluno, concluintes, aprovados, números
  manuais, arquivos inválidos);
- `anonimizacao.test.js` — código determinístico e o script `npm run anonimizar`;
- `rotas.test.js` — respostas, 404 e download de PDF da API;
- `dados-enade.test.js` — confere os números copiados dos PDFs (por exemplo, nota geral = 75% do
  Específico + 25% da Formação Geral).
