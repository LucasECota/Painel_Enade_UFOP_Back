# Publicação do Painel Enade (guia para a TI)

O Painel Enade é publicado **somente com Docker**: o **site** (`Painel_Enade_UFOP_Front`) e a **API**
(este repositório) rodam cada um no seu container, na mesma máquina e no mesmo endereço. Não há
outra forma de publicação suportada (nada de instalar Node ou Nginx na máquina).

> **Não testado com Docker em um servidor real.** Teste com `docker compose up --build` e confira a
> seção 4 antes de contar com ele.

## Como funciona

```
Navegador ──HTTPS (TI)──▶ container "site" (Nginx, porta 8080)
                           ├─ /      → arquivos do site (React)
                           └─ /api/  → container "api" (Node, porta 3000, sem porta aberta para fora)
```

- Site e API ficam no **mesmo endereço**, então não há CORS e basta um certificado HTTPS.
- A API **não é publicada**: só o container do site consegue falar com ela.
- Não há banco de dados. Os dados são arquivos do repositório (`data/`), copiados para a imagem.
- O container do site fala só HTTP. O HTTPS fica com a TI, num proxy na frente (porta 443 apontando
  para a porta do site).

## 1. O que pedir à TI

Texto sugerido:

> Preciso de uma máquina virtual Linux (Ubuntu Server 22.04 ou 24.04 LTS) para publicar o Painel
> Enade do ICEA, um site em React com uma API em Node.js, ambos em containers Docker. Requisitos:
> 1 vCPU, 2 GB de RAM e 10 GB de disco; Docker Engine com o plugin Compose (ou Podman); saída HTTPS
> para github.com e para o registro de imagens do Docker (para baixar atualizações); um endereço (por
> exemplo, um subdomínio de ufop.br) apontando para a máquina, com certificado HTTPS (proxy da TI na
> frente da porta do site); e acesso SSH para manutenção.

## 2. Instalação

Na máquina (com o Docker instalado):

```bash
# código dos dois repositórios, lado a lado (o compose do back procura o site em ../front)
sudo mkdir -p /opt/painel-enade && cd /opt/painel-enade
git clone https://github.com/LucasECota/Painel_Enade_UFOP_Back.git  back
git clone https://github.com/LucasECota/Painel_Enade_UFOP_Front.git front

cd back
cp .env.example .env       # depois edite o .env (veja a seção 3)
docker compose up -d --build
```

O site fica em `http://ENDERECO:8080` (mude a porta com `PORTA_DO_SITE` no `.env`). Se o código do
site estiver em outra pasta, defina `FRONT_DIR` no `.env` (por exemplo, `FRONT_DIR=../Painel_Enade_UFOP_Front`).

## 3. Variáveis de ambiente (arquivo `.env`)

| Variável | Valor em produção | Para quê |
| --- | --- | --- |
| `ANONIMIZACAO_SEGREDO` | a **mesma chave** usada no seu computador | obrigatória: a API não sobe sem ela |
| `PORTA_DO_SITE` | `8080` (padrão) | porta do computador onde o site responde |
| `FRONT_DIR` | `../front` (padrão) | pasta com o código do site |
| `LIMITE_REQUISICOES` / `LIMITE_DOWNLOADS` | opcionais (120 e 20 por minuto, por IP) | limites contra abuso |

`NODE_ENV`, `PORT`, `HOST` e `TRUST_PROXY` já são definidos no `docker-compose.yml`. Com um proxy da
TI na frente do container do site, há 2 proxies na frente da API: troque `TRUST_PROXY` para `"2"` no
`docker-compose.yml`, para o limite de requisições enxergar o IP real do visitante. Como site e API
estão no mesmo endereço, **não é preciso** definir `CORS_ORIGINS`.

**Guarde a `ANONIMIZACAO_SEGREDO` em local seguro** (fora do repositório). Se ela for trocada, os
códigos dos alunos mudam e o mesmo aluno passa a contar como duas pessoas.

## 4. Conferindo que está no ar

```bash
docker compose ps                                   # api: healthy; site: running
curl -I http://localhost:8080/                      # 200, página do site
curl -I http://localhost:8080/dados                 # 200 também (F5 não pode dar 404)
curl -s http://localhost:8080/api/avaliaufop | head # JSON do AvaliaUFOP
curl -I http://localhost:8080/api/relatorios/2023/download   # application/pdf
curl -I http://localhost:8080/api/enade/imagens/2023/ec-11.webp  # image/webp
```

Problemas comuns:

| Sintoma | Causa provável |
| --- | --- |
| `api` reinicia sem parar | falta `ANONIMIZACAO_SEGREDO` no `.env`: `docker compose logs api` |
| `site` não sobe, "depends on api" | a API não ficou saudável: `docker compose logs api` |
| `502 Bad Gateway` em `/api/` | a API caiu: `docker compose ps` e `docker compose logs api` |
| 404 ao apertar F5 em `/dados` | o `docker/nginx.conf` do site perdeu o `try_files` |
| 429 "Muitas requisições" para todos | `TRUST_PROXY` com o número errado de proxies |
| A página abre mas fica sem dados | o site foi gerado sem `VITE_API_URL=/api` (argumento do build no compose) |
| "path ../front not found" | o código do site não está em `../front`: defina `FRONT_DIR` |

Comandos úteis: `docker compose logs -f api` (registros da API), `docker compose restart api`,
`docker compose down` (desliga).

## 5. Atualizações

Depois de um `git push` no GitHub, na máquina:

```bash
cd /opt/painel-enade/back  && git pull --ff-only
cd /opt/painel-enade/front && git pull --ff-only
cd /opt/painel-enade/back  && docker compose up -d --build
```

O Docker só refaz o que mudou (as dependências ficam em cache). Os dados (`data/`) são copiados para
dentro da imagem, então qualquer mudança neles também pede o `up -d --build`.

**Dados do AvaliaUFOP** (notas dos simulados):

1. no seu computador, coloque o export do Moodle em `data/avaliaufop/<curso>/<atividade>/`;
2. rode `npm run anonimizar` (troca nome e e-mail por um código);
3. faça commit e `git push`;
4. na máquina, faça a atualização acima.

Os números de inscritos e concluintes ficam em `data/avaliaufop/participantes.json`.

## 6. Cuidados

- Abrir **apenas** a porta do proxy da TI (80/443) para fora. A porta do site (8080) pode ficar só
  interna, e a API nem tem porta publicada.
- Os repositórios são públicos: tudo o que for commitado em `data/` fica visível. Só envie dados
  **já anonimizados**, e nunca o `.env`.
- Mantenha o sistema e o Docker atualizados; as imagens base (`node` e `nginx`) são refeitas a cada
  `docker compose build --pull`.
