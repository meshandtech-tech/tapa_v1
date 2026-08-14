import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { isValidPin, sanitizePinInput } from "../party/pin";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Logo } from "../ui/Logo";

/**
 * Entrada pelo celular. O link de convite (`/join?pin=1234`) já chega com o
 * PIN preenchido; quem veio pela landing digita os 4 dígitos.
 */
export function JoinScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [pin, setPin] = useState(() => sanitizePinInput(params.get("pin") ?? ""));
  const [error, setError] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValidPin(pin)) {
      setError("O PIN tem 4 dígitos.");
      return;
    }
    navigate(`/play/${pin}`);
  };

  return (
    <div className="zine-grain flex min-h-dvh flex-col items-center justify-center gap-8 bg-accent px-5 py-10">
      <Logo size="md" />

      <Card variant="plain" tilt="tilt-3" className="w-full max-w-md p-7">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <label htmlFor="pin" className="font-display text-3xl font-bold uppercase leading-tight">
            Qual o PIN da sala?
          </label>
          <p className="font-hand text-lg">Está gigante na TV. Digita aí.</p>

          <input
            id="pin"
            value={pin}
            onChange={(event) => {
              setPin(sanitizePinInput(event.target.value));
              setError("");
            }}
            inputMode="numeric"
            autoComplete="off"
            placeholder="0000"
            aria-describedby={error ? "pin-error" : undefined}
            className="w-full border-4 border-ink bg-paper px-4 py-5 text-center font-display text-6xl font-bold tracking-[0.35em] text-ink placeholder:opacity-30 focus:outline-4 focus:outline-offset-2 focus:outline-ink"
          />

          {error ? (
            <p id="pin-error" role="alert" className="font-action text-base uppercase text-accent-dark">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="md" variant="knockout" disabled={!isValidPin(pin)}>
            Entrar
            <ArrowRight strokeWidth={3} className="size-6" />
          </Button>
        </form>
      </Card>

      <button
        type="button"
        onClick={() => navigate("/")}
        className="cursor-pointer font-hand text-lg text-on-accent underline underline-offset-4"
      >
        Voltar para o início
      </button>
    </div>
  );
}
