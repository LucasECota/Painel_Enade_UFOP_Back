const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Endereços do front liberados por padrão: o servidor de desenvolvimento e o preview do Vite.
// Em produção, defina CORS_ORIGINS com o(s) endereço(s) do site, separados por vírgula:
//   CORS_ORIGINS=https://painel.exemplo.edu.br
const ORIGENS_PADRAO = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
];

function origensPermitidas(valor = process.env.CORS_ORIGINS) {
    if (!valor) return ORIGENS_PADRAO;
    return valor.split(',').map((o) => o.trim()).filter(Boolean);
}

// CORS: só os endereços da lista leem a API pelo navegador. Chamadas sem "Origin"
// (curl, outro servidor) não passam pelo CORS e continuam funcionando.
function criarCors(origens = origensPermitidas()) {
    return cors({
        origin(origem, resposta) {
            resposta(null, !origem || origens.includes(origem));
        },
        methods: ['GET', 'HEAD'],
    });
}

// Cabeçalhos de segurança (remove X-Powered-By, ativa nosniff etc.). A política de recursos
// fica "cross-origin" porque o front, em outro endereço, baixa os PDFs desta API.
function criarHelmet() {
    return helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } });
}

// Limite de requisições por IP: protege contra abuso e varredura.
function criarLimitador({ max, janelaMs = 60 * 1000 }) {
    return rateLimit({
        windowMs: janelaMs,
        limit: max,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { erro: 'Muitas requisições. Tente de novo em instantes.' },
    });
}

// TRUST_PROXY = quantos proxies ficam entre o visitante e esta API (1 com o Nginx na frente).
// Sem isso, atrás de um proxy todos os visitantes parecem ter o mesmo IP (o do proxy) e
// dividem a mesma cota do limite de requisições. Sem a variável: nenhum proxy (acesso direto).
function lerTrustProxy(valor = process.env.TRUST_PROXY) {
    const quantidade = Number(valor);
    return Number.isInteger(quantidade) && quantidade > 0 ? quantidade : false;
}

const lerNumero = (valor, padrao) => (Number(valor) > 0 ? Number(valor) : padrao);

// Limites por minuto; podem ser mudados por variável de ambiente.
const limiteGeral = () => criarLimitador({ max: lerNumero(process.env.LIMITE_REQUISICOES, 120) });
const limiteDownloads = () => criarLimitador({ max: lerNumero(process.env.LIMITE_DOWNLOADS, 20) });

module.exports = {
    criarCors,
    criarHelmet,
    criarLimitador,
    limiteGeral,
    limiteDownloads,
    origensPermitidas,
    lerTrustProxy,
};
