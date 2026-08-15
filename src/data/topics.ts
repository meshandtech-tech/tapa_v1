import type { Difficulty } from "../party/types";

/**
 * Teses do "Advogado do Diabo".
 *
 * O jogo é de improviso e argumentação: a pessoa recebe uma posição e tenta
 * defendê-la, concordando com ela ou não. As teses NÃO representam opinião de
 * quem joga, do grupo ou da plataforma, e o jogo deixa isso explícito em tela.
 *
 * REGRA DE CONTEÚDO — no nível `hard` os temas devem ser provocativos, mas
 * enquadrados como POLÍTICA, FILOSOFIA, CRÍTICA SOCIAL ou SISTEMA HIPOTÉTICO.
 * É proibido pedir que alguém defenda violência real, violência sexual ou
 * doméstica, escravidão, genocídio, perseguição étnica, ódio ou desumanização
 * de grupos protegidos, ou dano físico a pessoas reais.
 *
 * Sempre que possível, temas controversos entram EM PARES opostos — assim o
 * jogo não empurra um lado, ele exercita a defesa de qualquer lado.
 */
export interface Topic {
  id: string;
  text: string;
  difficulty: Difficulty;
}

const easy: readonly Topic[] = [
  { id: "e1", text: "Defenda que a Terra é plana", difficulty: "easy" },
  { id: "e2", text: "Defenda que abacaxi é a melhor cobertura de pizza", difficulty: "easy" },
  { id: "e3", text: "Defenda que segunda-feira é o melhor dia da semana", difficulty: "easy" },
  { id: "e4", text: "Defenda que café deveria ser proibido", difficulty: "easy" },
  { id: "e5", text: "Defenda que dormir é perda de tempo", difficulty: "easy" },
  { id: "e6", text: "Defenda que férias são desnecessárias", difficulty: "easy" },
  { id: "e7", text: "Defenda que todo adulto deveria morar com os pais até os 35", difficulty: "easy" },
  { id: "e8", text: "Defenda que faculdade é perda de tempo", difficulty: "easy" },
  { id: "e9", text: "Defenda que dinheiro resolve quase todos os problemas", difficulty: "easy" },
  { id: "e10", text: "Defenda que trabalhar 7 dias por semana deixaria as pessoas mais felizes", difficulty: "easy" },
  { id: "e11", text: "Defenda que banho quente é superior a banho frio, sem exceção", difficulty: "easy" },
  { id: "e12", text: "Defenda que filme dublado é melhor que legendado", difficulty: "easy" },
  { id: "e13", text: "Defenda que praia é um programa superestimado", difficulty: "easy" },
  { id: "e14", text: "Defenda que cachorro é melhor que gato — com argumentos científicos", difficulty: "easy" },
  { id: "e15", text: "Defenda que grupo de família no WhatsApp é a melhor invenção da internet", difficulty: "easy" },
  { id: "e16", text: "Defenda que acordar às 5 da manhã torna qualquer pessoa bem-sucedida", difficulty: "easy" },
  { id: "e17", text: "Defenda que ninguém deveria comemorar aniversário depois dos 30", difficulty: "easy" },
];

const medium: readonly Topic[] = [
  { id: "m1", text: "Defenda que ciúme melhora relacionamentos", difficulty: "medium" },
  { id: "m2", text: "Defenda que casais deveriam compartilhar todas as senhas", difficulty: "medium" },
  { id: "m3", text: "Defenda que não deveria existir privacidade dentro do casamento", difficulty: "medium" },
  { id: "m4", text: "Defenda que casamento arranjado funciona melhor que namoro", difficulty: "medium" },
  { id: "m5", text: "Defenda que é preciso pedir autorização ao parceiro antes de sair com amigos", difficulty: "medium" },
  { id: "m6", text: "Defenda que contrato de casamento deveria vencer a cada 5 anos", difficulty: "medium" },
  { id: "m7", text: "Defenda que mentir é necessário para um relacionamento saudável", difficulty: "medium" },
  { id: "m8", text: "Defenda que os pais deveriam escolher a carreira dos filhos", difficulty: "medium" },
  { id: "m9", text: "Defenda que celular deveria ser proibido para menores de 21 anos", difficulty: "medium" },
  { id: "m10", text: "Defenda que as redes sociais melhoraram a sociedade como um todo", difficulty: "medium" },
  { id: "m11", text: "Defenda que discutir é essencial num relacionamento saudável", difficulty: "medium" },
  { id: "m12", text: "Defenda que amizade entre ex-namorados nunca funciona", difficulty: "medium" },
  { id: "m13", text: "Defenda que dividir a conta igualmente é sempre injusto", difficulty: "medium" },
  { id: "m14", text: "Defenda que ninguém deveria trabalhar com aquilo que ama", difficulty: "medium" },
  { id: "m15", text: "Defenda que ter filhos é uma decisão egoísta", difficulty: "medium" },
  { id: "m16", text: "Defenda que morar sozinho deveria ser obrigatório antes de casar", difficulty: "medium" },
  { id: "m17", text: "Defenda que trabalho remoto destruiu a cultura das empresas", difficulty: "medium" },
];

const hard: readonly Topic[] = [
  { id: "h1", text: "Defenda que a democracia é um sistema político ultrapassado", difficulty: "hard" },
  { id: "h2", text: "Defenda que votar deveria exigir a aprovação em um teste de conhecimento", difficulty: "hard" },
  { id: "h3", text: "Defenda que bilionários não deveriam existir", difficulty: "hard" },
  { id: "h4", text: "Defenda que deveria haver um limite legal para a riqueza de uma pessoa", difficulty: "hard" },
  { id: "h5", text: "Defenda que o capitalismo causa mais dano do que benefício", difficulty: "hard" },
  { id: "h6", text: "Defenda que o capitalismo é o melhor sistema que a humanidade já criou", difficulty: "hard" },
  { id: "h7", text: "Defenda que papéis tradicionais de gênero produzem famílias mais estáveis", difficulty: "hard" },
  { id: "h8", text: "Defenda que o feminismo moderno gerou consequências sociais não intencionais", difficulty: "hard" },
  { id: "h9", text: "Defenda que a sociedade precisa de um movimento feminista muito mais forte", difficulty: "hard" },
  { id: "h10", text: "Defenda que o aborto deveria ser legal sem a maioria das restrições atuais", difficulty: "hard" },
  { id: "h11", text: "Defenda que o aborto deveria enfrentar restrições legais muito maiores", difficulty: "hard" },
  { id: "h12", text: "Defenda que valores religiosos devem influenciar as políticas públicas", difficulty: "hard" },
  { id: "h13", text: "Defenda que a religião não deveria ter nenhuma influência nas políticas públicas", difficulty: "hard" },
  { id: "h14", text: "Defenda que as redes sociais deveriam censurar muito mais conteúdo", difficulty: "hard" },
  { id: "h15", text: "Defenda que as redes sociais não deveriam censurar quase nada", difficulty: "hard" },
  { id: "h16", text: "Defenda que o governo deveria ter muito mais controle sobre o discurso online", difficulty: "hard" },
  { id: "h17", text: "Defenda que herança deveria ser integralmente taxada pelo Estado", difficulty: "hard" },
  { id: "h18", text: "Defenda que o voto deveria deixar de ser obrigatório no Brasil", difficulty: "hard" },
  { id: "h19", text: "Defenda que meritocracia é um mito que serve para justificar desigualdade", difficulty: "hard" },
  { id: "h20", text: "Defenda que a meritocracia é o critério mais justo que existe", difficulty: "hard" },
];

export const TOPIC_DECKS: Record<Difficulty, readonly Topic[]> = { easy, medium, hard };

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
