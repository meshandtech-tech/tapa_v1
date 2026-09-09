import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { JoinScreen } from "./screens/JoinScreen";
import { LandingScreen } from "./screens/LandingScreen";
import { ThemeProvider } from "./theme/ThemeProvider";
import { isSupabaseConfigured } from "./lib/supabase";

// As telas de lobby carregam os avatares Open Peeps (~267 kB) e o QR Code.
// Separadas em chunk próprio para a landing não pagar por isso no primeiro load.
const HostLobbyScreen = lazy(() =>
  import("./screens/HostLobbyScreen").then((module) => ({ default: module.HostLobbyScreen })),
);
const PlayerLobbyScreen = lazy(() =>
  import("./screens/PlayerLobbyScreen").then((module) => ({ default: module.PlayerLobbyScreen })),
);

function LoadingRoom() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-accent">
      <p className="font-display text-4xl font-bold uppercase text-on-accent">
        Montando a sala...
      </p>
    </div>
  );
}

export default function App() {
  // O transporte local é útil no desenvolvimento, mas seria uma armadilha em
  // deploy: cada navegador criaria uma sala diferente e pareceria problema de
  // Wi-Fi. Produção sem env falha de forma explícita e nunca finge multiplayer.
  if (import.meta.env.PROD && !isSupabaseConfigured) {
    return (
      <div className="zine-grain flex min-h-dvh items-center justify-center bg-accent px-5 text-center">
        <div className="max-w-lg border-4 border-ink bg-paper p-7 shadow-brutal">
          <h1 className="font-display text-4xl font-bold uppercase">Servidor não configurado</h1>
          <p className="mt-3 font-hand text-xl">
            Esta versão do Tapa não está conectada ao multiplayer. Avise quem publicou o site.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingRoom />}>
            <Routes>
              <Route path="/" element={<LandingScreen />} />
              <Route path="/join" element={<JoinScreen />} />
              <Route path="/host/:pin" element={<HostLobbyScreen />} />
              <Route path="/play/:pin" element={<PlayerLobbyScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
