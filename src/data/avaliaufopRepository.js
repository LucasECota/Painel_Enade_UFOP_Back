// Dados do projeto AvaliaUFOP (Pró-Ativa / ICEA) — curso "Preparação ENADE 2026".
// A estrutura (módulos e requisitos) é a mesma nos três cursos.

const info = {
    titulo: 'AvaliaUFOP',
    edicao: 'Preparação ENADE 2026',
    cargaHoraria: '15 horas',
    prazo: '02/10/2026 a 29/11/2026',
    aproveitamentoMinimo: 60,
    autor: 'Lucas Emanuel Cota Carneiro',
    orientador: 'Josemar Alves Caetano',
};

const objetivos = [
    'Entender a importância do Enade e do processo de avaliação do ensino superior;',
    'Conhecer as diretrizes, procedimentos e pontos principais do exame;',
    'Reconhecer como funcionam as questões de formação geral;',
    'Reconhecer como funcionam as questões específicas da área do curso.',
];

const metodologia = [
    'Curso a distância, pela plataforma Moodle (UFOP Aberta), em formato autoinstrucional — sem tutoria.',
    'Você acompanha os conteúdos e realiza as atividades por conta própria.',
    'Tentativas ilimitadas e sem limite de tempo; vale a maior pontuação obtida.',
];

const modulos = [
    {
        numero: 1,
        titulo: 'Enade: Fique por dentro',
        atividades: [
            { nome: 'Enade: Fique por dentro', tipo: 'Lição', requisito: 'Ler e estudar o conteúdo' },
            { nome: 'Enade: Teste o seu conhecimento', tipo: 'Questionário', requisito: 'Obter 60% ou mais de acertos' },
        ],
    },
    {
        numero: 2,
        titulo: 'Formação geral',
        atividades: [
            { nome: 'Simulado: Questões objetivas – Formação Geral', tipo: 'Questionário', requisito: 'Obter 60% ou mais de acertos' },
        ],
    },
    {
        numero: 3,
        titulo: 'Componente específico',
        atividades: [
            { nome: 'Simulado: Questões discursivas – Componente Específico', tipo: 'Questionário', requisito: 'Analisar todas as questões e identificar os padrões de resposta' },
            { nome: 'Simulado: Questões objetivas – Componente Específico', tipo: 'Questionário', requisito: 'Obter 60% ou mais de acertos' },
        ],
    },
    {
        numero: 4,
        titulo: 'Certificado',
        atividades: [
            { nome: 'Avaliação de satisfação com o curso', tipo: 'Pesquisa', requisito: 'Responder o questionário' },
            { nome: 'Confirmação de dados | Emissão de certificado', tipo: 'Formulário', requisito: 'Confirmar os dados' },
            { nome: 'Emissão do certificado', tipo: 'Certificado', requisito: 'Todos os requisitos cumpridos' },
        ],
    },
];

// A chave ("ec", "ep", "si") é a mesma usada em /api/enade e em /api/desempenho.
const cursos = [
    { chave: 'ec', nome: 'Engenharia de Computação', url: 'https://moodle.aberta.ufop.br/course/view.php?id=328' },
    { chave: 'ep', nome: 'Engenharia de Produção', url: 'https://moodle.aberta.ufop.br/course/view.php?id=329' },
    { chave: 'si', nome: 'Sistemas de Informação', url: 'https://moodle.aberta.ufop.br/course/view.php?id=322' },
];

function buscarAvaliaUfop() {
    return { info, objetivos, metodologia, modulos, cursos };
}

module.exports = { buscarAvaliaUfop, cursos };
