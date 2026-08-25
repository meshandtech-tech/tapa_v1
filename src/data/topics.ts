import type { Difficulty } from "../party/types";

/**
 * Teses do "Advogado do Diabo".
 *
 * ====================================================================
 * COMO EDITAR
 * ====================================================================
 * Escreva uma frase por linha nos arrays abaixo. Só isso. Os ids saem da
 * posição, então acrescentar, remover ou reordenar não exige tocar em mais
 * nada — cole a sua lista e pronto.
 *
 * ====================================================================
 * O TOM
 * ====================================================================
 * A frase é a OPINIÃO, não o enunciado. A tela já põe "Defende essa." embaixo,
 * grande — a tese não precisa pedir nada, só afirmar.
 *
 *   RUIM: "Analise por que o feminismo pode ter tido efeitos não intencionais"
 *   BOM:  "O feminismo foi longe demais"
 *
 * Curta. Direta. Na cara. A pessoa tem que entender em UM segundo, e a mesa
 * tem que reagir na hora — "QUÊ?", "sem chance", "como é que você vai defender
 * isso?". Essa reação É o jogo.
 *
 * Fuja de tese fácil. "Defenda a meritocracia" tem argumento óbvio e não
 * causa desconforto nenhum; "Meritocracia é conto de fadas para justificar
 * desigualdade" obriga a pessoa a se virar.
 *
 * ====================================================================
 * REGRA DE CONTEÚDO
 * ====================================================================
 * Provocar é o ponto, mas o assunto é sempre POLÍTICA, FILOSOFIA, CRÍTICA
 * SOCIAL, COMPORTAMENTO ou SISTEMA HIPOTÉTICO. Nunca pedir que alguém defenda
 * nazismo, holocausto, supremacia racial, escravidão, genocídio, perseguição
 * étnica ou religiosa, violência sexual ou doméstica, ou ódio contra grupo
 * protegido. O desconforto tem que vir de a OPINIÃO ser difícil de sustentar —
 * não de o jogo mandar alguém justificar atrocidade.
 *
 * Sempre que der, entram EM PARES OPOSTOS: o jogo treina defender qualquer
 * lado, não empurra um. E as teses não representam opinião de quem joga, do
 * grupo ou da plataforma — a tela diz isso antes de começar.
 */
export interface Topic {
  id: string;
  text: string;
  difficulty: Difficulty;
}

function deck(difficulty: Difficulty, prefixo: string, linhas: readonly string[]): Topic[] {
  return linhas.map((text, i) => ({
    id: `${prefixo}${i + 1}`,
    text: text.trim(),
    difficulty,
  }));
}

/** Bobas. O grupo pega o jeito antes de apertar o parafuso. */
const easy = deck("easy", "e", [
  "A Terra é plana",
  "Abacaxi na pizza é o certo",
  "Segunda é o melhor dia da semana",
  "Café devia ser proibido",
  "Dormir é perda de tempo",
  "Férias não deviam existir",
  "Filme dublado é melhor que legendado",
  "Praia é superestimada",
  "Pizza fria é melhor que pizza quente",
  "Áudio de cinco minutos é superior a texto",
  "Toalha não precisa ser lavada",
  "Sorvete é uma refeição completa",
  "Refrigerante hidrata melhor que água",
  "Acordar às quatro da manhã é o segredo do sucesso",
  "Cachorro é melhor que gato, e tem ciência nisso",
  "Gato é melhor que cachorro, e tem ciência nisso",
  "Grupo de família no zap é a melhor invenção da internet",
  "Videochamada é melhor que ver a pessoa ao vivo",
  "Bolo de chocolate no café da manhã é o certo",
  "Reunião devia durar o dobro",
  "Andar descalço na rua é libertador",
  "Trabalhar sete dias por semana deixaria todo mundo mais feliz",
  "Aniversário não devia ser comemorado",
  "Mercado sem lista é mais eficiente",
  "Meia com chinelo é elegante",
  "Quem chega atrasado é mais inteligente",
  "Banho quente é frescura",
  "Legenda em português em filme brasileiro devia ser obrigatória",
]);

/** Vida real. Cutuca de verdade, sem entrar em política. */
const medium = deck("medium", "m", [
  "Faculdade é perda de tempo",
  "Dinheiro compra felicidade",
  "Ciúme faz bem para o relacionamento",
  "Casamento é superestimado",
  "Traição já salvou relacionamento",
  "Casal tem que dividir todas as senhas",
  "Privacidade não existe dentro de um casamento",
  "Seu parceiro tem direito de escolher as suas amizades",
  "Morar junto antes de casar é erro",
  "Ter filho é decisão egoísta",
  "Não ter filho é decisão egoísta",
  "Amizade entre homem e mulher não existe",
  "Ex não pode continuar na sua vida",
  "Dividir a conta no encontro é obrigação",
  "Dormir em quartos separados salva casamento",
  "Trabalho remoto destruiu as empresas",
  "Trabalho remoto foi a melhor coisa que já aconteceu",
  "Quem não posta não viveu",
  "A internet foi um erro",
  "Rede social devia ser proibida para menor de idade",
  "Todo mundo é sensível demais hoje em dia",
  "Se ofender é escolha",
  "Terapia virou modismo",
  "Fofoca é saudável",
  "Mentir por educação é obrigação",
  "Quem não bebe não se diverte igual",
  "Segunda chance não devia existir",
  "Chegar atrasado é falta de respeito, sem exceção",
  "Autoajuda faz mais mal do que bem",
  "Presente ruim é pior que presente nenhum",
  "Amizade de infância tem prazo de validade",
  "Quem lê seu diário está certo",
  "Ninguém precisa saber que você foi infiel",
  "Dívida de amigo não se cobra, se esquece",
  "Trabalhar no que ama é péssimo conselho",
  "Quem nunca foi demitido não arriscou nada",
]);

/**
 * Difíceis. A sala tem que reagir na hora: "QUÊ?", "sem chance", "como é que
 * você vai defender ISSO?". Quase todas vêm em par com o oposto.
 */
const hard = deck("hard", "h", [
  "A democracia não funciona",
  "A democracia é a melhor coisa que a humanidade inventou",
  "Votar devia exigir prova de conhecimento",
  "Voto tem que ser de todo mundo, sem filtro nenhum",
  "Bilionário não devia existir",
  "Bilionário é consequência natural do mérito",
  "O capitalismo falhou com a sociedade",
  "O capitalismo é o melhor sistema que existe",
  "Papel tradicional de gênero fazia família mais estável",
  "Papel tradicional de gênero é o que quebrou as famílias",
  "O feminismo foi longe demais",
  "O feminismo ainda não foi longe o suficiente",
  "Quem é contra o aborto não pensou dois minutos no assunto",
  "Quem é a favor do aborto não pensou dois minutos no assunto",
  "Religião devia mandar na política",
  "Religião não devia ter influência nenhuma na política",
  "Rede social devia censurar muito mais",
  "Rede social não devia censurar quase nada",
  "Liberdade de expressão foi longe demais",
  "Censura nunca se justifica, em hipótese nenhuma",
  "Herança devia ser inteiramente taxada",
  "Herança não é da conta do Estado",
  "Meritocracia é conto de fadas para justificar desigualdade",
  "Meritocracia é o critério mais justo que existe",
  "Ter filho devia exigir licença",
  "Pais deviam escolher a carreira dos filhos",
  "Pais deviam escolher com quem os filhos casam",
  "Criança não devia escolher nada sozinha",
  "Governo autoritário é mais eficiente que democracia",
  "Sociedade às vezes precisa de pulso firme",
  "As pessoas têm liberdade política demais",
  "Governo devia poder banir ideia perigosa",
  "Cancelamento é necessário",
  "Cancelamento destruiu o debate",
  "Monogamia está ultrapassada",
  "Monogamia é o único modelo que funciona",
  "Divórcio devia ser muito mais difícil",
  "Divórcio devia ser muito mais fácil",
  "Voto não devia ser obrigatório",
  "Escola particular devia ser proibida",
  "O Estado não devia se meter em educação",
  "Privacidade acabou e isso é ótimo",
  "Anonimato na internet devia ser proibido",
  "Aposentadoria é um erro de projeto da sociedade",
  "Trabalho não deveria ser o centro da vida de ninguém",
  "Quem não trabalha não deveria receber nada do Estado",
  "Todo mundo devia receber dinheiro do Estado sem fazer nada",
  "Imposto é roubo",
  "Imposto baixo é o que mantém o país pobre",
  "Redes sociais deviam ser estatais",
  "Inteligência artificial devia decidir política pública",
  "Nenhuma decisão importante devia ser tomada por máquina",
]);

export const TOPIC_DECKS: Record<Difficulty, readonly Topic[]> = { easy, medium, hard };

/**
 * A frase que vai embaixo da tese, na tela.
 *
 * Mora aqui — e não dentro de cada tese — porque repetir "defende essa" em
 * cem linhas de dado seria ruído, e porque assim a tese aparece sozinha e
 * enorme, que é o efeito que faz a sala reagir.
 */
export const TOPIC_CHALLENGE = "Defende essa.";

export function getTopics(difficulty: Difficulty): readonly Topic[] {
  return TOPIC_DECKS[difficulty] ?? TOPIC_DECKS.medium;
}

/** Busca por id em qualquer deck — usado para reidratar o tema da rodada. */
export function findTopic(id: string): Topic | null {
  for (const deck of Object.values(TOPIC_DECKS)) {
    const found = deck.find((topic) => topic.id === id);
    if (found) return found;
  }
  return null;
}
