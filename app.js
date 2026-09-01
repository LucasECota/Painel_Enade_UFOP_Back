const express = require('express');
const cors = require('cors');
const enadeRoutes = require('./src/routes/enade.routes');
const simuladoRoutes = require('./src/routes/simulado.routes');
const rankingRoutes = require('./src/routes/ranking.routes');

const app = express();
app.use(cors());
const port = 3000;

app.get('/', (req, res) => {
    res.send('Ola Mundo');
});

app.use('/api/enade', enadeRoutes);
app.use('/api/simulados', simuladoRoutes);
app.use('/api/ranking', rankingRoutes);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});