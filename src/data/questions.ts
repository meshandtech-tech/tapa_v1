import type { Difficulty } from "../party/types";
import type { Question } from "../types/game";

// Decks do jogo "Quem Erra, Paga". Para editar o conteúdo, mexa só nos textos,
// nas alternativas e em correctAnswer (0 = A, 1 = B, 2 = C, 3 = D).

const easy = [
  { id: 101, question: "Qual bebida leva cachaça, limão, açúcar e gelo?", options: ["Caipiroska", "Caipirinha", "Mojito", "Batida"], correctAnswer: 1 },
  { id: 102, question: "Quantas cartas tem um baralho tradicional, sem os coringas?", options: ["48", "50", "52", "54"], correctAnswer: 2 },
  { id: 103, question: "Em que país fica a ilha de Ibiza?", options: ["Itália", "Grécia", "Espanha", "Portugal"], correctAnswer: 2 },
  { id: 104, question: "Qual desses NÃO é um destilado?", options: ["Vodka", "Cerveja", "Gin", "Rum"], correctAnswer: 1 },
  { id: 105, question: "\"Chandelier\" é música de qual cantora?", options: ["Adele", "Sia", "Pink", "Lorde"], correctAnswer: 1 },
  { id: 106, question: "Quantos jogadores um time de vôlei tem em quadra?", options: ["5", "6", "7", "11"], correctAnswer: 1 },
  { id: 107, question: "Qual é a capital da Austrália?", options: ["Sydney", "Melbourne", "Canberra", "Perth"], correctAnswer: 2 },
  // Pegadinha: correctAnswer null significa que NENHUMA alternativa está certa.
  { id: 113, question: "PEGADINHA: quantos fios de cabelo você tem na cabeça agora?", options: ["Uns 90 mil", "Uns 110 mil", "Uns 130 mil", "Uns 150 mil"], correctAnswer: null },
  { id: 108, question: "Qual dessas redes sociais foi lançada primeiro?", options: ["Instagram", "TikTok", "Facebook", "Twitter"], correctAnswer: 2 },
  { id: 109, question: "Quantos minutos tem cada tempo de uma partida de futebol?", options: ["40", "45", "50", "60"], correctAnswer: 1 },
  { id: 110, question: "Qual desses filmes foi dirigido por Quentin Tarantino?", options: ["Clube da Luta", "Pulp Fiction", "Cidade de Deus", "Interestelar"], correctAnswer: 1 },
  { id: 111, question: "Qual é o maior planeta do Sistema Solar?", options: ["Saturno", "Júpiter", "Netuno", "Terra"], correctAnswer: 1 },
  { id: 112, question: "Em \"Round 6\", qual é a primeira brincadeira da competição?", options: ["Cabo de guerra", "Batatinha frita 1, 2, 3", "Bafo", "Bolinha de gude"], correctAnswer: 1 },
] as const satisfies readonly Question[];

const medium = [
  { id: 201, question: "Além de tequila e triple sec, o que leva uma Margarita?", options: ["Limão", "Laranja", "Abacaxi", "Maracujá"], correctAnswer: 0 },
  { id: 202, question: "Quem escreveu \"Dom Casmurro\"?", options: ["José de Alencar", "Machado de Assis", "Aluísio Azevedo", "Lima Barreto"], correctAnswer: 1 },
  { id: 203, question: "Quantos ossos tem o corpo humano adulto?", options: ["186", "196", "206", "216"], correctAnswer: 2 },
  { id: 204, question: "Em que ano o Brasil ganhou o pentacampeonato?", options: ["1998", "2002", "2006", "1994"], correctAnswer: 1 },
  { id: 205, question: "Qual bebida japonesa é feita de arroz fermentado?", options: ["Soju", "Sakê", "Baijiu", "Makgeolli"], correctAnswer: 1 },
  { id: 206, question: "Qual banda lançou \"Bohemian Rhapsody\"?", options: ["Led Zeppelin", "Queen", "The Beatles", "Pink Floyd"], correctAnswer: 1 },
  { id: 207, question: "Quanto soma os ângulos internos de um triângulo?", options: ["90°", "180°", "270°", "360°"], correctAnswer: 1 },
  { id: 213, question: "PEGADINHA: quantos segundos exatos você está nesta festa?", options: ["Menos de 3 mil", "Uns 5 mil", "Uns 8 mil", "Mais de 10 mil"], correctAnswer: null },
  { id: 208, question: "Qual desses países NÃO faz fronteira com o Brasil?", options: ["Peru", "Chile", "Bolívia", "Guiana"], correctAnswer: 1 },
  { id: 209, question: "Qual é o processo que transforma mosto em cerveja?", options: ["Destilação", "Fermentação", "Maceração", "Pasteurização"], correctAnswer: 1 },
  { id: 210, question: "Quem interpretou o Coringa no filme \"Coringa\" (2019)?", options: ["Heath Ledger", "Joaquin Phoenix", "Jared Leto", "Jack Nicholson"], correctAnswer: 1 },
  { id: 211, question: "Qual estado brasileiro tem o maior litoral?", options: ["Bahia", "Ceará", "Rio Grande do Sul", "São Paulo"], correctAnswer: 0 },
  { id: 212, question: "Quantas casas tem um tabuleiro de xadrez?", options: ["36", "49", "64", "81"], correctAnswer: 2 },
] as const satisfies readonly Question[];

const hard = [
  { id: 301, question: "Qual é a graduação alcoólica mínima da cachaça no Brasil?", options: ["35%", "38%", "40%", "45%"], correctAnswer: 1 },
  { id: 302, question: "Quem pintou \"O Jardim das Delícias Terrenas\"?", options: ["Hieronymus Bosch", "Pieter Bruegel", "Jan van Eyck", "Albrecht Dürer"], correctAnswer: 0 },
  { id: 303, question: "Em que ano caiu o Muro de Berlim?", options: ["1985", "1989", "1991", "1987"], correctAnswer: 1 },
  { id: 304, question: "Qual elemento químico tem o símbolo W?", options: ["Tungstênio", "Titânio", "Vanádio", "Zinco"], correctAnswer: 0 },
  { id: 305, question: "Qual é o livro de ficção mais vendido da história?", options: ["Dom Quixote", "O Pequeno Príncipe", "Harry Potter e a Pedra Filosofal", "O Senhor dos Anéis"], correctAnswer: 0 },
  { id: 306, question: "Quantos anos durou a Guerra dos Cem Anos?", options: ["100", "106", "116", "99"], correctAnswer: 2 },
  { id: 307, question: "Qual é a capital da Mongólia?", options: ["Astana", "Ulan Bator", "Bishkek", "Tashkent"], correctAnswer: 1 },
  { id: 313, question: "PEGADINHA: quantos grãos de arroz cabem numa colher de sopa?", options: ["Uns 200", "Uns 400", "Uns 600", "Uns 800"], correctAnswer: null },
  { id: 308, question: "Qual filme ganhou o Oscar de Melhor Filme em 2020?", options: ["1917", "Parasita", "Coringa", "Era uma Vez em Hollywood"], correctAnswer: 1 },
  { id: 309, question: "Qual é o osso mais longo do corpo humano?", options: ["Úmero", "Fêmur", "Tíbia", "Fíbula"], correctAnswer: 1 },
  { id: 310, question: "Em que ano a Netflix lançou o serviço de streaming?", options: ["2005", "2007", "2010", "2012"], correctAnswer: 1 },
  { id: 311, question: "Qual é o menor país do mundo em território?", options: ["Mônaco", "Vaticano", "San Marino", "Nauru"], correctAnswer: 1 },
  { id: 312, question: "De qual fruto o gin tira seu sabor característico?", options: ["Zimbro", "Cevada", "Uva", "Cana-de-açúcar"], correctAnswer: 0 },
] as const satisfies readonly Question[];

export const QUESTION_DECKS: Record<Difficulty, readonly Question[]> = {
  easy,
  medium,
  hard,
};

export function getDeck(difficulty: Difficulty): readonly Question[] {
  return QUESTION_DECKS[difficulty] ?? QUESTION_DECKS.medium;
}

export function validateQuestions(items: readonly Question[]): void {
  if (items.length === 0) throw new Error("Um deck precisa ter pelo menos uma pergunta.");

  const ids = new Set<number>();
  items.forEach((item) => {
    if (ids.has(item.id)) throw new Error(`ID de pergunta duplicado: ${item.id}.`);
    if (item.options.length !== 4) throw new Error(`A pergunta ${item.id} precisa de quatro alternativas.`);
    if (item.correctAnswer !== null && (item.correctAnswer < 0 || item.correctAnswer > 3)) {
      throw new Error(`Resposta inválida na pergunta ${item.id}.`);
    }
    ids.add(item.id);
  });
}

/** Valida todos os decks e garante que nenhum id se repete entre eles. */
export function validateAllDecks(): void {
  const seen = new Set<number>();
  (Object.keys(QUESTION_DECKS) as Difficulty[]).forEach((difficulty) => {
    const deck = QUESTION_DECKS[difficulty];
    validateQuestions(deck);
    deck.forEach((question) => {
      if (seen.has(question.id)) {
        throw new Error(`ID ${question.id} repetido entre decks diferentes.`);
      }
      seen.add(question.id);
    });
  });
}
