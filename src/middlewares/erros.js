// Rota que não existe: resposta em JSON, igual às outras da API.
function naoEncontrada(req, res) {
    res.status(404).json({ erro: 'Rota não encontrada.' });
}

// Qualquer erro inesperado (arquivo de dados corrompido, bug...) vira uma resposta 500 em JSON.
// O detalhe vai só para o log do servidor: o cliente nunca vê o stack nem caminhos de arquivos.
function tratarErros(erro, req, res, next) {
    if (res.headersSent) return next(erro);

    console.error(`Erro em ${req.method} ${req.originalUrl}:`, erro);
    res.status(erro.status || 500).json({ erro: 'Erro interno do servidor.' });
}

module.exports = { naoEncontrada, tratarErros };
