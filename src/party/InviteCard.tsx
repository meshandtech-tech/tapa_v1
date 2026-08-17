import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, QrCode, Share2, Tv } from "lucide-react";
import { buildInviteUrl } from "./pin";
import { Button } from "../ui/Button";
import { Card, Knockout } from "../ui/Card";
import { cn } from "../ui/cn";

/**
 * Como as pessoas entram na sala. Vive num componente só porque a TV e o
 * celular do host precisam MOSTRAR A MESMA COISA — quando o convite existia só
 * numa das telas, criar a party pelo celular deixava o host sem nenhuma forma
 * de chamar os amigos.
 *
 * No celular o caminho natural é o menu de compartilhar do sistema (WhatsApp);
 * na tela grande é o QR. Os dois aparecem, com destaque conforme o tamanho.
 */
export function InviteCard({
  pin,
  variant = "phone",
  className,
}: {
  pin: string;
  /** `tv` dá destaque ao QR; `phone` dá destaque ao botão de compartilhar. */
  variant?: "tv" | "phone";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [qrAberto, setQrAberto] = useState(variant === "tv");
  const inviteUrl = buildInviteUrl(pin, window.location.origin);
  const naTv = variant === "tv";

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const compartilhar = async () => {
    // Menu nativo: no celular é daqui que sai o WhatsApp. Sem suporte, copia.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Tapa",
          text: `Entra na minha party do Tapa! PIN ${pin}`,
          url: inviteUrl,
        });
        return;
      } catch {
        // Cancelou o menu. Não é erro.
        return;
      }
    }
    void copiar();
  };

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <Knockout tilt="tilt-1" className={cn("text-center", naTv ? "p-6" : "px-5 py-4")}>
        <p className="font-hand uppercase tracking-widest opacity-80">Entre com o PIN</p>
        <p
          className={cn(
            "font-display font-extrabold leading-none tracking-[0.15em]",
            naTv ? "text-[clamp(4rem,12vw,7rem)]" : "text-5xl",
          )}
        >
          {pin}
        </p>
      </Knockout>

      {!naTv ? (
        <Button size="md" variant="solid" onClick={compartilhar}>
          <Share2 strokeWidth={3} className="size-5" />
          Chamar a galera
        </Button>
      ) : null}

      {qrAberto ? (
        <Card className="flex flex-col items-center gap-3 p-4">
          <div className="border-4 border-ink bg-paper p-2">
            <QRCodeSVG
              value={inviteUrl}
              size={naTv ? 180 : 150}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>
          <code className="w-full break-all text-center font-ui text-xs">{inviteUrl}</code>
        </Card>
      ) : null}

      <div className="flex gap-2">
        {!naTv ? (
          <Button size="sm" variant="paper" className="flex-1" onClick={() => setQrAberto((v) => !v)}>
            <QrCode strokeWidth={3} className="size-4" />
            {qrAberto ? "Esconder QR" : "Mostrar QR"}
          </Button>
        ) : null}
        <Button size="sm" variant="paper" className="flex-1" onClick={copiar}>
          {copied ? <Check strokeWidth={3} className="size-4" /> : <Copy strokeWidth={3} className="size-4" />}
          {copied ? "Copiado" : "Copiar link"}
        </Button>
      </div>

      {!naTv ? (
        // A TV é opcional, então o caminho para ela precisa estar à mão.
        <a
          href={`/host/${pin}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 border-4 border-dashed border-ink px-3 py-2
                     font-action text-sm uppercase text-ink
                     focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <Tv strokeWidth={3} className="size-4" />
          Abrir tela grande
        </a>
      ) : null}
    </div>
  );
}
