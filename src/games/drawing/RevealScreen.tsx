import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Share2, Sparkles, SkullIcon } from "lucide-react";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { cn } from "../../ui/cn";
import { DrawingReplay, preloadDrawing } from "./DrawingReplay";
import { renderChainStrip } from "./export";
import { chainSurvived, comparisonPageIndex, finalGuess } from "./state";
import type { DrawingChain, DrawingState, PartyState, Player } from "../../party/types";

/**
 * A revelação — o produto inteiro.
 *
 * Uma página por tela, no ritmo do host, com a autoria aparecendo só AQUI. É
 * o único momento em que o jogo mostra quem fez o quê, e é de propósito: saber
 * de quem foi o desenho que descarrilou a corrente é o que faz a mesa rir e
 * apontar dedo.
 *
 * Todo mundo vê a MESMA página ao mesmo tempo. Deixar cada um folhear o seu
 * caderno mataria a reação coletiva, que é o ponto.
 */
export function RevealScreen({
  state,
  drawing,
}: {
  state: PartyState;
  drawing: DrawingState;
}) {
  const chain = drawing.chains[drawing.revealChainIndex];
  const ultima = comparisonPageIndex(drawing.stepCount);
  const pagina = drawing.revealPageIndex;

  const dono = state.players.find((player) => player.id === chain?.ownerPlayerId);
  const contribuicao = pagina > 0 && pagina <= drawing.stepCount ? chain?.pages[pagina - 1] : null;
  const autor = contribuicao
    ? state.players.find((player) => player.id === contribuicao.playerId)
    : null;

  // Busca a próxima imagem enquanto esta ainda está na tela: o "avança" nunca
  // pode virar tela branca esperando download.
  useEffect(() => {
    const proxima = chain?.pages[pagina];
    if (proxima?.type === "drawing") preloadDrawing(proxima.url);
    const primeiraDoProximo = drawing.chains[drawing.revealChainIndex + 1]?.pages[0];
    if (pagina >= ultima - 1 && primeiraDoProximo?.type === "drawing") {
      preloadDrawing(primeiraDoProximo.url);
    }
  }, [chain, pagina, ultima, drawing.chains, drawing.revealChainIndex]);

  if (!chain) return null;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Card className="min-w-0 flex-1 px-3 py-2">
          <p className="font-action text-[0.65rem] uppercase tracking-wide opacity-70">
            Caderno {drawing.revealChainIndex + 1} de {drawing.chains.length}
          </p>
          <p className="truncate font-display text-lg font-extrabold uppercase leading-tight">
            de {dono?.nickname ?? "alguém"}
          </p>
        </Card>
        <span className="shrink-0 border-4 border-ink bg-paper px-3 py-2 font-display text-xl font-extrabold tabular-nums">
          {pagina + 1}/{ultima + 1}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${drawing.revealChainIndex}-${pagina}`}
          initial={{ opacity: 0, x: 40, rotate: 1.5 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          exit={{ opacity: 0, x: -40, rotate: -1.5 }}
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
        >
          {pagina === 0 ? (
            <PaginaTema chain={chain} dono={dono} />
          ) : pagina <= drawing.stepCount && contribuicao ? (
            <PaginaContribuicao contribuicao={contribuicao} autor={autor} />
          ) : (
            <PaginaConfronto chain={chain} drawing={drawing} dono={dono} state={state} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function PaginaTema({ chain, dono }: { chain: DrawingChain; dono?: Player }) {
  return (
    <Card tilt="tilt-2" className="p-7 text-center">
      <p className="font-action text-xs uppercase tracking-wide opacity-70">Tudo começou com</p>
      <p className="mt-3 break-words font-display text-4xl font-extrabold uppercase leading-tight">
        {chain.originalPrompt}
      </p>
      {dono ? (
        <div className="mt-5 flex items-center justify-center gap-2">
          <Avatar seed={dono.avatarSeed} color={dono.color} size="sm" />
          <span className="font-hand text-lg">a palavra de {dono.nickname}</span>
        </div>
      ) : null}
    </Card>
  );
}

function PaginaContribuicao({
  contribuicao,
  autor,
}: {
  contribuicao: DrawingChain["pages"][number];
  autor?: Player | null;
}) {
  const desenhou = contribuicao.type === "drawing";
  return (
    <Card tilt="tilt-1" className="p-4">
      <div className="flex items-center gap-2">
        {autor ? <Avatar seed={autor.avatarSeed} color={autor.color} size="sm" /> : null}
        <p className="font-display text-lg font-extrabold uppercase leading-tight">
          {autor?.nickname ?? "alguém"} {desenhou ? "desenhou" : "achou que era"}
        </p>
      </div>

      {desenhou ? (
        <div className="mt-3 aspect-square w-full border-4 border-ink">
          <DrawingReplay page={contribuicao} />
        </div>
      ) : (
        <p className="mt-4 break-words border-4 border-ink bg-paper p-5 text-center font-display text-3xl font-extrabold uppercase leading-tight">
          {contribuicao.text || "não escreveu nada"}
        </p>
      )}
    </Card>
  );
}

function PaginaConfronto({
  chain,
  drawing,
  dono,
  state,
}: {
  chain: DrawingChain;
  drawing: DrawingState;
  dono?: Player;
  state: PartyState;
}) {
  const sobreviveu = chainSurvived(chain, drawing.manualMatches);
  const fim = finalGuess(chain);
  const [compartilhando, setCompartilhando] = useState(false);

  const paginas = useMemo(
    () => [
      { titulo: "Começou como", texto: chain.originalPrompt },
      ...chain.pages.map((page) => {
        const autor = state.players.find((player) => player.id === page.playerId);
        return page.type === "drawing"
          ? { titulo: `${autor?.nickname ?? "alguém"} desenhou`, url: page.url }
          : { titulo: `${autor?.nickname ?? "alguém"} achou que era`, texto: page.text };
      }),
      { titulo: "Terminou como", texto: fim ?? "nada" },
    ],
    [chain, fim, state.players],
  );

  return (
    <Card tilt="tilt-3" className="p-6 text-center">
      <p className="font-action text-xs uppercase tracking-wide opacity-70">Começou como</p>
      <p className="mt-1 break-words font-display text-2xl font-extrabold uppercase leading-tight">
        {chain.originalPrompt}
      </p>

      <p className="my-3 font-display text-3xl">↓</p>

      <p className="font-action text-xs uppercase tracking-wide opacity-70">Terminou como</p>
      <p className="mt-1 break-words font-display text-2xl font-extrabold uppercase leading-tight">
        {fim || "ninguém escreveu"}
      </p>

      <div
        className={cn(
          "mt-5 flex items-center justify-center gap-2 border-4 border-ink px-4 py-3",
          sobreviveu ? "bg-accent text-on-accent" : "bg-ink text-paper",
        )}
      >
        {sobreviveu ? (
          <Sparkles strokeWidth={3} className="size-6" />
        ) : (
          <SkullIcon strokeWidth={3} className="size-6" />
        )}
        <span className="font-display text-xl font-extrabold uppercase">
          {sobreviveu ? "Sobreviveu!" : "Perdeu no caminho"}
        </span>
      </div>

      {sobreviveu && dono ? (
        <p className="mt-2 font-hand text-lg">+1 ponto para {dono.nickname}</p>
      ) : null}

      {/* Print de tela corta e sai torto; aqui a corrente vira uma imagem só. */}
      <Button
        size="sm"
        variant="paper"
        className="mt-5 w-full"
        disabled={compartilhando}
        onClick={async () => {
          setCompartilhando(true);
          await compartilharCorrente(paginas, dono?.nickname);
          setCompartilhando(false);
        }}
      >
        <Share2 strokeWidth={3} className="size-5" />
        {compartilhando ? "Montando…" : "Compartilhar este caderno"}
      </Button>
    </Card>
  );
}

/** Monta a tira e entrega ao sistema. Falhar aqui não pode travar a revelação. */
async function compartilharCorrente(
  paginas: ReadonlyArray<{ titulo: string; texto?: string; url?: string | null }>,
  dono?: string,
): Promise<void> {
  try {
    const comImagens = await Promise.all(
      paginas.map(async (pagina) => ({
        titulo: pagina.titulo,
        texto: pagina.texto,
        imagem: pagina.url ? await carregarImagem(pagina.url) : null,
      })),
    );
    const blob = await renderChainStrip(comImagens);
    if (!blob) return;

    const arquivo = new File([blob], "tapa-caderno.png", { type: "image/png" });
    const share = navigator.share?.bind(navigator);
    if (share && navigator.canShare?.({ files: [arquivo] })) {
      await share({ files: [arquivo], title: `Caderno de ${dono ?? "Tapa"}` });
      return;
    }
    // Sem compartilhamento nativo (desktop): abre numa aba para salvar na mão.
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (erro) {
    console.error("[tapa] não deu para compartilhar o caderno", erro);
  }
}

function carregarImagem(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const imagem = new Image();
    imagem.crossOrigin = "anonymous";
    imagem.onload = () => resolve(imagem);
    imagem.onerror = () => resolve(null);
    imagem.src = url;
  });
}
