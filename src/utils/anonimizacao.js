const crypto = require('crypto');
const path = require('path');

// Carrega o .env (se existir) sem precisar de biblioteca extra.
try {
    process.loadEnvFile(path.join(__dirname, '..', '..', '.env'));
} catch {
    // sem .env: a chave pode vir direto do ambiente
}

// Gera um código anônimo e determinístico a partir do e-mail do aluno.
// Mesmo e-mail + mesma chave = sempre o mesmo código (então o aluno continua
// ligado entre as atividades), mas não dá pra voltar do código ao e-mail
// sem a chave secreta (HMAC-SHA256).
function gerarIdAnonimo(email) {
    const segredo = process.env.ANONIMIZACAO_SEGREDO;

    if (!segredo) {
        throw new Error('Defina ANONIMIZACAO_SEGREDO no arquivo .env (veja .env.example).');
    }

    const normalizado = String(email).trim().toLowerCase();

    return crypto.createHmac('sha256', segredo).update(normalizado).digest('hex').slice(0, 16);
}

module.exports = { gerarIdAnonimo };
