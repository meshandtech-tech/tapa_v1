import type { Question } from "../types/game";

// Troque somente os textos, alternativas e correctAnswer abaixo.
// correctAnswer usa índice: 0 = A, 1 = B, 2 = C, 3 = D; null = nenhuma alternativa.
export const questions = [
  { id: 1, player: "Lucas", question: "Qual é a comida favorita da sua noiva?", options: ["Hambúrguer", "Japonês", "Pizza", "Massa"], correctAnswer: 2 },
  { id: 2, player: "Samuel", question: "Se sua noiva pudesse escolher uma viagem agora, qual escolheria?", options: ["Praia no Nordeste", "Europa", "Estados Unidos", "Cabana no meio do nada"], correctAnswer: 1 },
  { id: 3, player: "Lucas", question: "Qual é o número exato do sapato dela?", options: ["34", "35", "36", "37"], correctAnswer: 1 },
  { id: 4, player: "Samuel", question: "Qual dessas coisas mais irrita sua noiva em você?", options: ["Demorar para responder", "Mexer demais no celular", "Ser desorganizado", "Não prestar atenção quando ela fala"], correctAnswer: 2 },
  { id: 5, player: "Lucas", question: "Quando ela está triste, o que ela mais prefere?", options: ["Ficar sozinha", "Receber carinho", "Comer alguma coisa", "Conversar até resolver tudo"], correctAnswer: 2 },
  { id: 6, player: "Samuel", question: "Qual é o pedido favorito dela quando vocês vão comer fora?", options: ["Pizza", "Hambúrguer", "Japonês", "Salad bowl ou Madero"], correctAnswer: 1 },
  { id: 7, player: "Lucas", question: "Qual é a maior mania da sua noiva?", options: ["Mexer no cabelo", "Dormir de um jeito específico", "Ficar olhando o celular", "Outra mania que ela tenha"], correctAnswer: 0 },
  { id: 8, player: "Samuel", question: "Se ela ganhasse R$ 10 mil hoje e tivesse que gastar tudo, com o que gastaria primeiro?", options: ["Viagem", "Roupas", "Casa e decoração", "Comida e experiências"], correctAnswer: 1 },
  { id: 9, player: "Lucas", question: "Qual dessas coisas ela considera o encontro perfeito?", options: ["Restaurante chique", "Filme em casa e comida", "Viagem surpresa", "Fazer alguma atividade juntos"], correctAnswer: 1 },
  { id: 10, player: "Samuel", question: "Qual parte da aparência dela ela mais gosta nela mesma?", options: ["Cabelo", "Olhos", "Sorriso", "Corpo"], correctAnswer: 2 },
  { id: 11, player: "Lucas", question: "Quantos centímetros mede o pé da sua noiva?", options: ["21,5 cm", "23,1 cm", "24,2 cm", "25 cm"], correctAnswer: 0 },
  { id: 12, player: "Samuel", question: "Qual é a circunferência da cabeça da sua noiva?", options: ["52 cm", "54 cm", "56 cm", "58 cm"], correctAnswer: null },
  { id: 13, player: "Lucas", question: "Qual é o primeiro lugar que ela gostaria de conhecer fora do Brasil?", options: ["Paris", "Roma", "Nova York", "Londres"], correctAnswer: 1 },
  { id: 14, player: "Samuel", question: "Qual foi a primeira impressão que ela teve de você?", options: ["Bonito", "Engraçado", "Metido", "Não tenho interesse nenhum nesse cara"], correctAnswer: 1 },
  { id: 15, player: "Lucas", question: "Qual característica sua ela mais gosta?", options: ["Olhos", "Nariz", "Personalidade", "Corpo"], correctAnswer: 0 },
  { id: 16, player: "Samuel", question: "Se ela tivesse que eliminar uma coisa da vida para sempre, qual escolheria?", options: ["Café", "Chocolate", "Redes sociais", "Refrigerante"], correctAnswer: 3 },
  { id: 17, player: "Lucas", question: "Sua esposa teve um dia horrível. Qual seria a atitude que ela mais gostaria que você tivesse?", options: ["Resolver os problemas dela", "Abraçar e ouvir", "Dar espaço", "Levar ela para comer"], correctAnswer: 1 },
  { id: 18, player: "Samuel", question: "Depois de uma discussão, quem normalmente procura o outro primeiro?", options: ["Ela", "Você", "Os dois quase juntos", "Ninguém; esperam a situação esfriar"], correctAnswer: 1 },
  { id: 19, player: "Lucas", question: "Qual dessas coisas sua noiva considera mais importante para um casamento feliz?", options: ["Comunicação", "Vida com Deus", "Carinho e romance", "Parceria e amizade"], correctAnswer: 1 },
  { id: 20, player: "Samuel", question: "Se sua futura esposa pudesse mudar uma coisa em você antes do casamento, qual seria?", options: ["Ser mais organizado", "Ser mais romântico", "Escutar melhor", "Passar menos tempo no celular"], correctAnswer: 0 },
] as const satisfies readonly Question[];

export function validateQuestions(items: readonly Question[]): void {
  if (items.length !== 20) throw new Error("O jogo precisa ter exatamente 20 perguntas.");

  const ids = new Set<number>();
  items.forEach((item, index) => {
    const expectedPlayer = index % 2 === 0 ? "Lucas" : "Samuel";
    if (ids.has(item.id)) throw new Error(`ID de pergunta duplicado: ${item.id}.`);
    if (item.player !== expectedPlayer) throw new Error(`A pergunta ${item.id} quebra a alternância Lucas/Samuel.`);
    if (item.options.length !== 4) throw new Error(`A pergunta ${item.id} precisa de quatro alternativas.`);
    if (item.correctAnswer !== null && (item.correctAnswer < 0 || item.correctAnswer > 3)) throw new Error(`Resposta inválida na pergunta ${item.id}.`);
    ids.add(item.id);
  });
}
