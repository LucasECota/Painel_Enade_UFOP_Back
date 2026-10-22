const express = require('express');
const cors = require('cors');
const enadeRoutes = require('./src/routes/enade.routes');
const avaliaufopRoutes = require('./src/routes/avaliaufop.routes');
const desempenhoRoutes = require('./src/routes/desempenho.routes');
const resultadosRoutes = require('./src/routes/resultados.routes');
const relatoriosRoutes = require('./src/routes/relatorios.routes');

const app = express();
app.use(cors());
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Ola Mundo');
});

app.use('/api/enade', enadeRoutes);
app.use('/api/avaliaufop', avaliaufopRoutes);
app.use('/api/desempenho', desempenhoRoutes);
app.use('/api/resultados', resultadosRoutes);
app.use('/api/relatorios', relatoriosRoutes);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
