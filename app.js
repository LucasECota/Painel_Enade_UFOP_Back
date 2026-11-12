const path = require('path');
const express = require('express');
const { criarCors, criarHelmet, limiteGeral, limiteDownloads, lerTrustProxy } = require('./src/middlewares/seguranca');
const { naoEncontrada, tratarErros } = require('./src/middlewares/erros');
const enadeRoutes = require('./src/routes/enade.routes');
const avaliaufopRoutes = require('./src/routes/avaliaufop.routes');
const desempenhoRoutes = require('./src/routes/desempenho.routes');
const resultadosRoutes = require('./src/routes/resultados.routes');
const relatoriosRoutes = require('./src/routes/relatorios.routes');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', lerTrustProxy());
app.use(criarHelmet());
app.use(criarCors());

app.get('/', (req, res) => {
    res.send('Ola Mundo');
});

// limite geral em toda a API e um limite mais apertado nos downloads de PDF
app.use('/api', limiteGeral());
app.use('/api/relatorios/:ano/download', limiteDownloads());

// recortes das questões dos cadernos de prova (somente leitura, sem listar a pasta)
app.use('/api/enade/imagens', express.static(path.join(__dirname, 'data', 'questoes-imagens'), { index: false, dotfiles: 'ignore', maxAge: '7d' }));
app.use('/api/enade', enadeRoutes);
app.use('/api/avaliaufop', avaliaufopRoutes);
app.use('/api/desempenho', desempenhoRoutes);
app.use('/api/resultados', resultadosRoutes);
app.use('/api/relatorios', relatoriosRoutes);

app.use(naoEncontrada);
app.use(tratarErros);

// Só sobe o servidor quando o arquivo é executado direto (node app.js).
// Nos testes o app é importado sem abrir porta.
if (require.main === module) {
    // A chave é necessária para ler exports do Moodle que ainda tenham e-mail.
    // Melhor falhar ao subir do que dar erro na primeira requisição.
    if (!process.env.ANONIMIZACAO_SEGREDO) {
        console.error('ANONIMIZACAO_SEGREDO não definida. Crie o arquivo .env (veja .env.example).');
        process.exit(1);
    }

    // HOST define em qual endereço a API escuta (no Docker, 0.0.0.0 dentro do container; a porta não é publicada).
    // Sem HOST, escuta em todas as interfaces, como antes.
    const host = process.env.HOST;
    const aoSubir = () => console.log(`Example app listening on ${host || 'todas as interfaces'}:${port}`);
    if (host) app.listen(port, host, aoSubir);
    else app.listen(port, aoSubir);
}

module.exports = app;
