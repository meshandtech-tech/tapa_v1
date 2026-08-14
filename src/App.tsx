import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { JoinScreen } from "./screens/JoinScreen";
import { LandingScreen } from "./screens/LandingScreen";
import { ThemeProvider } from "./theme/ThemeProvider";

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
