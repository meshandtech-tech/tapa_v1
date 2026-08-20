/**
 * Temas do Telefone Sem Fio de Desenho.
 *
 * A regra que manda em tudo: **dá para comunicar isso com o dedo numa tela de
 * celular?** Se não dá, simplifica.
 *
 * A versão anterior errava aqui. "Panda comendo pizza" pede quatro coisas de
 * uma vez — um panda, uma pizza, o ato de comer e a relação entre os dois — e
 * quem desenha não é ilustrador, é alguém rabiscando com o polegar. O caos do
 * jogo tem de vir de gente INTERPRETANDO errado um desenho simples, nunca de o
 * tema ser impossível de desenhar. A graça é "como CACHORRO virou SUBMARINO?",
 * e não "como eu desenho essa frase?".
 *
 * Por isso:
 * - `simple` — UM objeto. É a maioria.
 * - `action`  — UM personagem + UMA ação óbvia. Nada além disso.
 *
 * Não existe nível difícil de propósito: o desenho já é a parte difícil.
 */
export type DrawingComplexity = "simple" | "action";

export interface DrawingPrompt {
  id: string;
  text: string;
  complexity: DrawingComplexity;
  /** Outras formas de escrever a mesma resposta, para a comparação final. */
  acceptedAnswers?: string[];
  category?: string;
  locale?: string;
}

/** `texto | alternativa, alternativa` — compacto para a lista não virar muro. */
function bloco(complexity: DrawingComplexity, prefixo: string, linhas: readonly string[]): DrawingPrompt[] {
  return linhas.map((linha, indice) => {
    const [texto, alternativas] = linha.split("|");
    const accepted = alternativas?.split(",").map((item) => item.trim()).filter(Boolean);
    return {
      id: `${prefixo}-${String(indice + 1).padStart(2, "0")}`,
      text: texto.trim(),
      complexity,
      ...(accepted && accepted.length > 0 ? { acceptedAnswers: accepted } : {}),
      locale: "pt-BR",
    };
  });
}

/** UM objeto. Desenhável em 15 segundos, reconhecível mesmo torto. */
const SIMPLES = bloco("simple", "s", [
  "Maçã", "Tubarão", "Avião", "Vulcão", "Pizza", "Fantasma", "Dinossauro",
  "Robô", "Coroa", "Banana", "Violão | guitarra", "Cobra", "Castelo",
  "Diamante", "Martelo", "Anjo", "Diabo", "Pirata", "Bomba", "Cérebro",
  "Moto | motocicleta", "Coração partido", "Disco voador | ovni, nave",
  "Aliança | anel", "Vaso sanitário | privada",
  "Cachorro", "Gato", "Sol", "Lua", "Estrela", "Árvore", "Casa", "Carro",
  "Barco", "Foguete", "Óculos", "Chapéu", "Chinelo | sandália", "Chave",
  "Relógio", "Celular", "Computador", "Televisão | tv", "Geladeira",
  "Cadeira", "Cama", "Porta", "Janela", "Escada", "Ponte", "Montanha",
  "Nuvem", "Raio", "Fogo", "Ovo", "Bolo", "Sorvete", "Hambúrguer",
  "Cachorro-quente", "Xícara de café | café", "Garrafa", "Copo", "Faca",
  "Garfo", "Panela", "Vassoura", "Guarda-chuva", "Mochila", "Livro",
  "Lápis", "Tesoura", "Balão", "Presente", "Bandeira", "Sino", "Âncora",
  "Caveira", "Aranha", "Abelha", "Borboleta", "Peixe", "Polvo", "Elefante",
  "Girafa", "Leão", "Macaco", "Pinguim", "Coelho", "Sapo", "Galinha",
  "Porco", "Vaca", "Cavalo", "Cacto", "Sereia", "Múmia", "Zumbi",
  "Palhaço", "Bruxa", "Ninja", "Astronauta", "Trem", "Bicicleta",
]);

/** UM personagem + UMA ação. Nunca mais que isso. */
const ACOES = bloco("action", "a", [
  "Porco voando", "Bebê chorando", "Banana dançando", "Cachorro correndo",
  "Gato dormindo", "Galinha brava", "Carro explodindo", "Homem caindo",
  "Vovó dançando", "Palhaço chorando", "Tubarão voando", "Casa pegando fogo",
  "Celular quebrado", "Chefe bravo", "Pirata bêbado", "Alien dançando",
  "Robô chorando", "Gato voando", "Cachorro dormindo", "Homem correndo",
  "Peixe pulando", "Cobra dançando", "Macaco gritando", "Elefante pulando",
  "Sapo cantando", "Vaca dormindo", "Fantasma dançando", "Esqueleto correndo",
  "Menino gritando", "Coelho pulando", "Leão dormindo", "Pinguim escorregando",
  "Robô dançando", "Vulcão explodindo", "Homem chorando", "Cavalo correndo",
  "Bruxa voando", "Ninja pulando", "Astronauta flutuando", "Passarinho cantando",
]);

export const drawingPrompts: readonly DrawingPrompt[] = [...SIMPLES, ...ACOES];

export function getPromptById(id: string): DrawingPrompt | undefined {
  return drawingPrompts.find((prompt) => prompt.id === id);
}

/**
 * Sorteia `quantidade` temas distintos, pulando os que já saíram na partida.
 *
 * Recebe o embaralhador de fora para o reducer continuar puro e testável — e
 * para os testes conseguirem uma partida determinística.
 */
export function drawPrompts(
  quantidade: number,
  usedIds: readonly string[] = [],
  random: () => number = Math.random,
): DrawingPrompt[] {
  const usados = new Set(usedIds);
  const livres = drawingPrompts.filter((prompt) => !usados.has(prompt.id));
  // Acabaram os inéditos: recomeça do acervo inteiro em vez de devolver menos
  // temas do que correntes, o que deixaria alguém sem o que desenhar.
  const acervo = livres.length >= quantidade ? [...livres] : [...drawingPrompts];

  for (let i = acervo.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [acervo[i], acervo[j]] = [acervo[j], acervo[i]];
  }
  return acervo.slice(0, quantidade);
}
