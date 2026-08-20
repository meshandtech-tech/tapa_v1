import type { Difficulty } from "../party/types";

/**
 * Teses do "Advogado do Diabo".
 *
 * ESTILO: frase curta, direta, na cara. Tem que dar para entender o tamanho do
 * problema em um segundo — o texto guarda só a AFIRMAÇÃO, e a tela põe o
 * "defende essa" embaixo. A versão anterior escrevia "Defenda que o feminismo
 * moderno gerou consequências sociais não intencionais", que soa como enunciado
 * de prova; agora é "O feminismo foi longe demais", que soa como o amigo do
 * lado jogando a pior opinião possível na sua mesa.
 *
 * As teses NÃO representam opinião de quem joga, do grupo ou da plataforma, e
 * a tela diz isso antes de começar.
 *
 * REGRA DE CONTEÚDO — provocar é o ponto, mas o tema é sempre POLÍTICA,
 * FILOSOFIA, CRÍTICA SOCIAL ou SISTEMA HIPOTÉTICO. Nunca pedir que alguém
 * defenda nazismo, holocausto, supremacia racial, escravidão de um povo,
 * genocídio, perseguição étnica ou religiosa, violência sexual ou doméstica,
 * ou ódio e desumanização de grupos protegidos. O desconforto tem que vir de
 * a OPINIÃO ser difícil de sustentar, não de o jogo mandar alguém justificar
 * atrocidade.
 *
 * Temas controversos entram EM PARES OPOSTOS sempre que possível — o jogo
 * treina defender qualquer lado, não empurra um.
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

/** Bobas. Servem para o grupo pegar o jeito antes de apertar o parafuso. */
const easy = deck("easy", "e", [
  "A Terra é plana",
  "Abacaxi na pizza é o certo",
  "Segunda é o melhor dia da semana",
  "Café devia ser proibido",
  "Dormir é perda de tempo",
  "Férias são desnecessárias",
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
  "Videochamada é melhor que encontrar pessoalmente",
  "Bolo de chocolate no café da manhã é o certo",
  "Reunião devia durar o dobro",
  "Andar descalço na rua é libertador",
  "Trabalhar sete dias por semana deixaria todo mundo mais feliz",
  "Aniversário não devia ser comemorado",
  "Mercado sem lista é mais eficiente",
]);

/** Vida real. Cutuca sem entrar em política. */
const medium = deck("medium", "m", [
  "Faculdade é perda de tempo",
  "Dinheiro compra felicidade",
  "Ciúme faz bem para o relacionamento",
  "Casamento é superestimado",
  "Traição já salvou relacionamento",
  "Casal tem que dividir todas as senhas",
  "Privacidade não existe dentro de um casamento",
  "Seu parceiro tem direito de opinar sobre as suas amizades",
  "Morar junto antes de casar é erro",
  "Ter filho é uma decisão egoísta",
  "Não ter filho é uma decisão egoísta",
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
  "Se ofender é uma escolha",
  "Terapia virou modismo",
  "Fofoca é saudável",
  "Mentir por educação é obrigação",
  "Quem não bebe não se diverte igual",
  "Segunda chance não devia existir",
  "Chegar atrasado é falta de respeito, sem exceção",
  "Autoajuda faz mais mal do que bem",
  "Presente ruim é pior que presente nenhum",
]);

/**
 * Difíceis. A sala tem que reagir na hora — "sem chance", "como é que você vai
 * defender isso?". Quase todas vêm em par com o oposto.
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
  "Papel tradicional de gênero é justamente o que quebrou as famílias",
  "O feminismo foi longe demais",
  "O feminismo ainda não foi longe o suficiente",
  "Aborto devia ser livre, sem quase nenhuma restrição",
  "Aborto devia ter muito mais restrição do que tem hoje",
  "Religião devia influenciar a política",
  "Religião não devia ter influência nenhuma na política",
  "Rede social devia censurar muito mais",
  "Rede social não devia censurar quase nada",
  "Liberdade de expressão foi longe demais",
  "Censura nunca se justifica, em hipótese nenhuma",
  "Herança devia ser inteiramente taxada",
  "Herança não é da conta do Estado",
  "Meritocracia é um mito que serve para justificar desigualdade",
  "Meritocracia é o critério mais justo que existe",
  "Ter filho devia exigir licença",
  "Pais deviam escolher a carreira dos filhos",
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
]);

export const TOPIC_DECKS: Record<Difficulty, readonly Topic[]> = { easy, medium, hard };

/**
 * A frase que vai embaixo da tese, na tela.
 *
 * Mora aqui — e não dentro de cada tese — porque repetir "defende essa" em
 * cem linhas de dado seria ruído, e porque assim a tese pode aparecer sozinha
 * e enorme, que é o efeito que faz a sala reagir.
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
