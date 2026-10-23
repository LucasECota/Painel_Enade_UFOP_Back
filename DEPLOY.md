# Publicação do Painel Enade (guia para a TI)

Este guia vale para o **front** (`Painel_Enade_UFOP_Front`) e para a **API** (este repositório),
publicados juntos em uma máquina Linux, no mesmo endereço.

> Os arquivos de exemplo em `deploy/` (Nginx, systemd e script de atualização) **não foram
> testados em um servidor real**. Teste a sintaxe do Nginx com `sudo nginx -t` antes de recarregar.

## Como funciona

```
Navegador ──HTTPS──▶ Nginx (portas 80/443)
                      ├─ /        → arquivos do site (React, pasta /var/www/painel-enade)
                      └─ /api/    → API Node (127.0.0.1:3000, só acessível dentro da máquina)
```

- O site e a API ficam no **mesmo endereço**, então não há CORS e basta um certificado HTTPS.
- A API **não é aberta para a internet**: escuta só em `127.0.0.1` e o Nginx faz a ponte.
- Não há banco de dados. Os dados são arquivos do repositório (`data/`).

## 1. O que pedir à TI

Texto sugerido:

> Preciso de uma máquina virtual Linux (Ubuntu Server 22.04 ou 24.04 LTS) para publicar o Painel
> Enade do ICEA, um site em React com uma API em Node.js. Requisitos: 1 vCPU, 2 GB de RAM e 10 GB
> de disco; Nginx e Node.js 22 ou superior (ou permissão para instalar); saída HTTPS para
> github.com (para baixar atualizações); portas 80 e 443 liberadas; um endereço (por exemplo, um
> subdomínio de ufop.br) apontando para a máquina, com certificado HTTPS; e acesso SSH para
> manutenção.

## 2. Instalação

Na máquina, como administrador (adapte o endereço e os caminhos):

```bash
# 1) usuário e pastas
sudo useradd --system --home /opt/painel-enade --shell /usr/sbin/nologin painel-enade
sudo mkdir -p /opt/painel-enade /var/www/painel-enade
sudo chown painel-enade: /opt/painel-enade

# 2) código (rodar como o usuário painel-enade, ou ajustar as permissões depois)
sudo -u painel-enade git clone https://github.com/LucasECota/Painel_Enade_UFOP_Back.git  /opt/painel-enade/back
sudo -u painel-enade git clone https://github.com/LucasECota/Painel_Enade_UFOP_Front.git /opt/painel-enade/front

# 3) API
cd /opt/painel-enade/back
sudo -u painel-enade npm ci --omit=dev
sudo -u painel-enade cp .env.example .env      # depois edite o .env (veja a seção 3)

# 4) site (a API fica em /api, no mesmo endereço)
cd /opt/painel-enade/front
sudo -u painel-enade npm ci
sudo -u painel-enade env VITE_API_URL=/api npm run build
sudo rsync -a --delete dist/ /var/www/painel-enade/

# 5) serviço da API e Nginx (copie os exemplos de /opt/painel-enade/back/deploy e ajuste)
sudo cp /opt/painel-enade/back/deploy/painel-enade.service.example /etc/systemd/system/painel-enade.service
sudo systemctl daemon-reload && sudo systemctl enable --now painel-enade
sudo cp /opt/painel-enade/back/deploy/nginx.conf.example /etc/nginx/sites-available/painel-enade
sudo ln -s /etc/nginx/sites-available/painel-enade /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 3. Variáveis de ambiente (arquivo `.env` da API)

| Variável | Valor em produção | Para quê |
| --- | --- | --- |
| `ANONIMIZACAO_SEGREDO` | a **mesma chave** usada no seu computador | obrigatória: a API não sobe sem ela |
| `NODE_ENV` | `production` | já definida no serviço do systemd |
| `PORT` | `3000` | porta local da API |
| `HOST` | `127.0.0.1` | a API aceita só conexões locais |
| `TRUST_PROXY` | `1` | o limite de requisições enxerga o IP real do visitante (há 1 proxy: o Nginx) |
| `LIMITE_REQUISICOES` / `LIMITE_DOWNLOADS` | opcionais (120 e 20 por minuto, por IP) | limites contra abuso |

Como site e API estão no mesmo endereço, **não é preciso** definir `CORS_ORIGINS`.

**Guarde a `ANONIMIZACAO_SEGREDO` em local seguro** (fora do repositório). Se ela for trocada, os
códigos dos alunos mudam e o mesmo aluno passa a contar como duas pessoas.

## 4. Conferindo que está no ar

```bash
curl -I https://SEU-ENDERECO/                       # 200, página do site
curl -I https://SEU-ENDERECO/resultados             # 200 também (F5 não pode dar 404)
curl -s https://SEU-ENDERECO/api/avaliaufop | head  # JSON do AvaliaUFOP
curl -I https://SEU-ENDERECO/api/relatorios/2023/download   # application/pdf
sudo systemctl status painel-enade                  # "active (running)"
```

Problemas comuns:

| Sintoma | Causa provável |
| --- | --- |
| 502 Bad Gateway em `/api/` | a API não está rodando: `journalctl -u painel-enade -n 50` |
| A API não sobe e pede a chave | falta `ANONIMIZACAO_SEGREDO` no `.env` |
| 404 ao apertar F5 em `/resultados` | falta o `try_files $uri /index.html;` no Nginx |
| 429 "Muitas requisições" para todos | falta `TRUST_PROXY=1` no `.env` |
| A página abre mas fica sem dados | o site foi gerado sem `VITE_API_URL=/api` |

## 5. Atualizações

Código novo (depois de um `git push` no GitHub): na máquina, rodar o script
`deploy/atualizar.sh.example` (copiado para `/opt/painel-enade/atualizar.sh`). Ele baixa as
mudanças, gera o site de novo, reinicia a API e confere se ela responde.

**Dados do AvaliaUFOP** (notas dos simulados):

1. no seu computador, coloque o export do Moodle em `data/avaliaufop/<curso>/<atividade>/`;
2. rode `npm run anonimizar` (troca nome e e-mail por um código);
3. faça commit e `git push`;
4. na máquina, rode o `atualizar.sh`.

Os números de inscritos e concluintes ficam em `data/avaliaufop/participantes.json`.

## 6. Cuidados

- Abrir **apenas as portas 80 e 443** no firewall. A porta 3000 não deve ficar acessível de fora.
- Os repositórios são públicos: tudo o que for commitado em `data/` fica visível. Só envie dados
  **já anonimizados**, e nunca o `.env`.
- Mantenha o sistema e o Node atualizados e rode `npm audit` de tempos em tempos.
