# Painel Enade — ICEA/UFOP (back-end)

API em Express que serve os dados do site: edições do Enade, AvaliaUFOP, desempenho dos alunos,
resultados do INEP e download dos relatórios em PDF.

## Publicação

O guia completo para publicar o site e a API em um servidor (com texto de pedido para a TI, Nginx,
systemd e script de atualização) está em [DEPLOY.md](DEPLOY.md).

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
(`/:ano/download` baixa o PDF).

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
- `data/resultados-enade.json` — conceito, CPC, comparação com o Brasil e perfil dos concluintes.
- `data/relatorios-inep/` — PDFs do INEP, no padrão `enade-AAAA-ufop-joao-monlevade.pdf`.

## Testes

Ficam em `tests/` e **nunca leem nem alteram `data/avaliaufop`**: criam uma pasta temporária e usam
uma chave de anonimização falsa. Cobrem:

- `desempenho.test.js` — cálculo das notas (maior nota do aluno, concluintes, aprovados, números
  manuais, arquivos inválidos);
- `anonimizacao.test.js` — código determinístico e o script `npm run anonimizar`;
- `rotas.test.js` — respostas, 404 e download de PDF da API;
- `dados-enade.test.js` — confere os números copiados dos PDFs (por exemplo, nota geral = 75% do
  Específico + 25% da Formação Geral).
