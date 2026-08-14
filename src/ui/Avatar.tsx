import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
// Importado direto do pacote do estilo, em vez de @dicebear/collection, que
// reexporta ~30 estilos. Pesa ~267 kB (o acervo de rostos desenhados), então as
// telas que usam avatar entram por lazy import — ver App.tsx.
import * as openPeeps from "@dicebear/open-peeps";
import { cn } from "./cn";

interface AvatarProps {
  /** Semente estável (id do jogador). O mesmo seed gera sempre o mesmo rosto. */
  seed: string;
  /** Cor de identidade do jogador, usada como fundo da moldura. */
  color?: string;
  size?: "sm" | "md" | "tv";
  tilt?: string;
  className?: string;
}

const SIZES = {
  sm: "size-14 border-[3px]",
  md: "size-24 border-4",
  tv: "size-32 border-4 md:size-40 md:border-[6px]",
} as const;

/**
 * Avatar Open Peeps (Pablo Stanley) gerado localmente pelo DiceBear.
 * Determinístico por seed, então TV e celular desenham o mesmo rosto sem
 * precisar sincronizar imagem alguma pelo canal — e sem requisição de rede.
 */
export function Avatar({ seed, color, size = "md", tilt, className }: AvatarProps) {
  const uri = useMemo(
    () =>
      createAvatar(openPeeps, {
        seed,
        size: 160,
        backgroundColor: ["transparent"],
      }).toDataUri(),
    [seed],
  );

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full border-ink bg-paper",
        "shadow-brutal",
        SIZES[size],
        tilt,
        className,
      )}
      style={color ? { backgroundColor: color } : undefined}
    >
      <img src={uri} alt="" aria-hidden="true" className="size-full object-cover" />
    </div>
  );
}
