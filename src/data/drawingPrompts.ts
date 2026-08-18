/**
 * Temas do Telefone Sem Fio de Desenho. Escritos para este jogo.
 *
 * Três regras valeram para cada frase:
 *
 * 1. **Tem que dar para desenhar em 90 segundos.** Nada de conceito abstrato
 *    ("saudade", "justiça") nem nome próprio — o desenho é a única ponte entre
 *    uma pessoa e a seguinte, e ninguém desenha uma ideia.
 * 2. **Tem que ter uma imagem forte.** "Cachorro" vira qualquer coisa;
 *    "cachorro pilotando moto" tem uma cena que sobrevive a um traço ruim.
 * 3. **A graça é o deslocamento**, não o exagero. Situação comum com um
 *    detalhe fora do lugar deforma melhor ao longo da corrente.
 *
 * O modelo já tem `category` e `difficulty` de propósito, mesmo sem aparecer
 * na interface ainda: filtrar por dificuldade depois é mexer aqui, não no jogo.
 */
export type DrawingPromptCategory =
  | "animais"
  | "pessoas"
  | "lugares"
  | "absurdo"
  | "objetos";

export interface DrawingPrompt {
  id: string;
  text: string;
  /** Outras formas de escrever a mesma resposta, para a comparação final. */
  acceptedAnswers?: string[];
  category?: DrawingPromptCategory;
  difficulty?: "easy" | "medium" | "hard";
  locale?: string;
}

/** `texto | alternativa, alternativa` — compacto para a lista não virar muro. */
function grupo(
  category: DrawingPromptCategory,
  difficulty: "easy" | "medium" | "hard",
  linhas: readonly string[],
): DrawingPrompt[] {
  return linhas.map((linha, indice) => {
    const [texto, alternativas] = linha.split("|");
    const accepted = alternativas
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return {
      id: `${category}-${String(indice + 1).padStart(2, "0")}`,
      text: texto.trim(),
      ...(accepted && accepted.length > 0 ? { acceptedAnswers: accepted } : {}),
      category,
      difficulty,
      locale: "pt-BR",
    };
  });
}

const ANIMAIS = grupo("animais", "easy", [
  "Cachorro pilotando moto | cachorro de moto",
  "Gato de terno | gato engravatado",
  "Elefante em cima de um skate",
  "Macaco tomando sorvete",
  "Galinha na academia | galinha malhando",
  "Jacaré escovando os dentes",
  "Tartaruga com pressa | tartaruga correndo",
  "Pinguim de óculos escuros",
  "Vaca dançando balé | vaca bailarina",
  "Peixe andando de bicicleta",
  "Coruja lendo jornal",
  "Cavalo com guarda-chuva",
  "Sapo jogando videogame",
  "Urso cortando o cabelo",
  "Formiga levantando peso | formiga na academia",
  "Girafa de gravata",
  "Porco tomando banho de banheira",
  "Coelho dirigindo ônibus",
  "Cobra pulando corda",
  "Panda comendo pizza",
  "Papagaio falando no telefone | papagaio no celular",
  "Camelo na praia",
  "Rato de capacete",
  "Preguiça correndo maratona",
  "Polvo tocando bateria",
]);

const PESSOAS = grupo("pessoas", "medium", [
  "Vovó andando de skate | vovo de skate",
  "Bebê trabalhando de garçom | bebe garcom",
  "Bombeiro pedindo ajuda",
  "Palhaço com medo de balão",
  "Astronauta pendurando roupa no varal",
  "Dentista com dor de dente",
  "Chef derrubando o bolo",
  "Motorista dormindo no volante",
  "Professor dançando na mesa",
  "Cabeleireiro careca",
  "Juiz de futebol chorando",
  "Ladrão pedindo desculpas",
  "Vovô jogando videogame | vovo no videogame",
  "Pintor caindo da escada",
  "Médico com medo de agulha",
  "Cantor sem microfone",
  "Nadador com medo de água",
  "Mágico serrando a si mesmo",
  "Fotógrafo escorregando",
  "Padeiro fazendo um pão gigante",
  "Pescador fisgando uma bota",
  "Segurança dormindo em pé",
  "Carteiro fugindo de cachorro",
  "Cientista com o cabelo em pé",
  "Garçom equilibrando dez pratos",
]);

const LUGARES = grupo("lugares", "medium", [
  "Fila enorme na padaria",
  "Praia lotada num dia de chuva",
  "Elevador cheio de gente",
  "Ponto de ônibus na tempestade",
  "Sala de aula vazia",
  "Supermercado com carrinho quebrado",
  "Aeroporto com voo atrasado",
  "Consultório com aquário de peixe",
  "Parque com pipa presa na árvore",
  "Rua alagada com gente de bote",
  "Estádio com um torcedor só",
  "Cinema com pipoca no chão",
  "Metrô superlotado",
  "Feira com barraca de fruta",
  "Piscina com boia de flamingo",
  "Camping com a barraca caindo",
  "Farmácia de madrugada",
  "Lava-jato com carro sujo",
  "Biblioteca com alguém roncando",
  "Salão de festa sem convidados",
]);

const ABSURDO = grupo("absurdo", "hard", [
  "Alienígena pedindo pizza | et pedindo pizza",
  "Robô lavando louça",
  "Fantasma com medo de gente",
  "Nuvem chorando embaixo de guarda-chuva",
  "Lua de pijama",
  "Batata com braço e perna",
  "Prédio dando cambalhota",
  "Sol de óculos escuros na chuva",
  "Dinossauro no ponto de ônibus",
  "Sereia de tênis",
  "Vampiro tomando sol",
  "Múmia se enrolando no papel higiênico",
  "Zumbi correndo de gente",
  "Bruxa presa no trânsito",
  "Pirata com medo do mar",
  "Robô com soluço",
  "Cachorro-quente fugindo do prato",
  "Geladeira falando ao telefone",
  "Árvore fazendo exercício",
  "Montanha de chapéu",
  "Ovo de capacete",
  "Sanduíche gigante devorando alguém",
  "Cadeira sentada numa cadeira",
  "Relógio derretendo no calor",
  "Estrela cadente de paraquedas",
  "Foguete indo para o trabalho",
  "Boneco de neve no deserto",
  "Ventilador com frio",
  "Espelho fugindo do próprio reflexo",
  "Escada rolante subindo até a lua",
]);

const OBJETOS = grupo("objetos", "easy", [
  "Escova de dente gigante",
  "Guarda-chuva virado do avesso",
  "Meia perdida dentro da máquina",
  "Chinelo quebrado no meio da rua",
  "Bolo de aniversário caindo",
  "Vassoura voando sozinha",
  "Panela fervendo demais",
  "Bicicleta sem uma roda",
  "Óculos com uma lente só",
  "Mochila cheia demais",
  "Chave presa na fechadura",
  "Balão preso no fio de luz",
  "Sofá abandonado na calçada",
  "Ventilador amarrado com fita",
  "Carrinho de supermercado sem roda",
  "Caneta vazando na camisa",
  "Copo caindo em câmera lenta",
  "Poste torto na esquina",
  "Guarda-roupa transbordando",
  "Controle remoto sem pilha",
]);

export const drawingPrompts: readonly DrawingPrompt[] = [
  ...ANIMAIS,
  ...PESSOAS,
  ...LUGARES,
  ...ABSURDO,
  ...OBJETOS,
];

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
  // Acabaram os temas inéditos: recomeça do acervo inteiro em vez de devolver
  // menos temas do que correntes, o que deixaria alguém sem o que desenhar.
  const acervo = livres.length >= quantidade ? [...livres] : [...drawingPrompts];

  for (let i = acervo.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [acervo[i], acervo[j]] = [acervo[j], acervo[i]];
  }
  return acervo.slice(0, quantidade);
}
