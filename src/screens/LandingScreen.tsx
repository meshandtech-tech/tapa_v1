import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { LogIn, Sparkles, Users } from "lucide-react";
import { DecorativeDoodles } from "../components/DecorativeDoodles";
import { GAMES } from "../games/registry";
import { generateFreePin } from "../party/pin";
import { loadPartyState, markHostDevice } from "../party/partyStorage";
import { ThemeSwitcher } from "../theme/ThemeSwitcher";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Logo } from "../ui/Logo";
import { tiltByIndex } from "../ui/cn";

export function LandingScreen() {
  const navigate = useNavigate();

  const createParty = (gameId?: string) => {
    // Evita cair num PIN cuja sala antiga ainda está salva — senão o host
    // reidrataria o roster da festa passada em vez de abrir uma sala limpa.
    const pin = generateFreePin((candidate) => loadPartyState(candidate) !== null);
    // Guarda o token: quando este aparelho entrar pelo /play, ele assume o
    // comando da sala — o host joga como todo mundo.
    markHostDevice(pin);
    navigate(gameId ? `/host/${pin}?game=${gameId}` : `/host/${pin}`);
  };

  return (
    <div className="zine-grain relative min-h-dvh overflow-x-hidden bg-accent">
      <DecorativeDoodles />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-5 py-12">
        <Card variant="speech" tilt="tilt-1" className="px-5 py-2">
          <p className="font-hand text-lg uppercase tracking-wide sm:text-xl">
            16+ · Party games para amigos
          </p>
        </Card>

        <Logo size="hero" className="mt-4" />

        <p className="max-w-2xl text-center font-hand text-2xl text-on-accent sm:text-3xl">
          Cria a sala na TV, todo mundo entra pelo celular e a bagunça começa.
          Sem instalar nada.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button size="tv" variant="paper" tilt="tilt-3" onClick={() => createParty()}>
            <Sparkles strokeWidth={3} className="size-7" />
            Criar Party
          </Button>
          <Button size="tv" variant="knockout" tilt="tilt-2" onClick={() => navigate("/join")}>
            <LogIn strokeWidth={3} className="size-7" />
            Entrar com PIN
          </Button>
        </div>

        <section className="mt-8 w-full">
          <h2 className="mb-6 text-center font-display text-4xl font-bold uppercase text-on-accent">
            Escolha o estrago
          </h2>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {GAMES.map((game, index) => {
              const Icon = game.icon;
              return (
                <motion.button
                  key={game.id}
                  type="button"
                  onClick={() => createParty(game.id)}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08, type: "spring", stiffness: 260, damping: 20 }}
                  whileHover={{ y: -6, rotate: index % 2 === 0 ? -1.5 : 1.5 }}
                  whileTap={{ scale: 0.97 }}
                  className="cursor-pointer text-left focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ink"
                >
                  <Card tilt={tiltByIndex(index)} className="flex h-full flex-col gap-3 p-6">
                    <span className="grid size-14 place-items-center border-4 border-ink bg-accent text-on-accent">
                      <Icon strokeWidth={2.5} className="size-8" />
                    </span>
                    <h3 className="font-display text-2xl font-bold uppercase leading-tight">
                      {game.title}
                    </h3>
                    <p className="font-action text-sm uppercase text-accent-dark">{game.tagline}</p>
                    <p className="font-ui text-base leading-snug">{game.description}</p>
                    <p className="mt-auto flex items-center gap-2 pt-3 font-hand text-lg">
                      <Users strokeWidth={2.5} className="size-5" />
                      {game.minPlayers}–{game.maxPlayers} jogadores
                    </p>
                  </Card>
                </motion.button>
              );
            })}
          </div>
        </section>

        <ThemeSwitcher className="mt-6" />

        <p className="pb-6 text-center font-hand text-lg text-on-accent opacity-80">
          Tapa · jogue com moderação, pague as prendas com dignidade
        </p>
      </main>
    </div>
  );
}
