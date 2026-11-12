# Imagem da API do Painel Enade (Node.js + Express).
# Só leva o que é preciso para rodar: dependências de produção, o código e a pasta data/.
# Gerar e rodar sozinha (exemplo):
#   docker build -t painel-enade-api .
#   docker run --rm -p 3000:3000 -e ANONIMIZACAO_SEGREDO=... -e HOST=0.0.0.0 painel-enade-api
# Para subir o site e a API juntos, use o docker-compose.yml.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# dependências primeiro: enquanto o package-lock não mudar, essa camada vem do cache
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app.js ./
COPY src ./src
COPY data ./data

# não roda como administrador dentro do container
USER node

EXPOSE 3000

# o container é marcado como saudável quando a API responde
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/avaliaufop > /dev/null || exit 1

CMD ["node", "app.js"]
