# Tapa iOS

Native SwiftUI participant app backed by the same authoritative Supabase room
used by the web app. It does not duplicate the server's phase or scoring rules.

## What is here

- `TapaCore`: shared `Codable` models, recoverable anonymous auth, room RPCs,
  snapshot reconciliation and reconnecting lobby state
- `TapaUI`: join/lobby plus native participant flows for all four games
- `TapaApp`: the thin iOS application entry point
- `project.yml`: reproducible Xcode project definition

## Run the tests

```sh
cd apps/ios
swift test
```

## Open the iOS app

1. Install full Xcode and select it with `xcode-select`.
2. Install XcodeGen (`brew install xcodegen`).
3. Copy `Config/Secrets.xcconfig.example` to `Config/Secrets.xcconfig` and fill
   in the Supabase URL (preserving the `https:/$()/...` xcconfig syntax) and
   **anon/publishable** key. Never use `service_role`.
4. Run `xcodegen generate`, open `Tapa.xcodeproj`, and choose an iPhone
   simulator.

The host still creates and controls the room on the web. The iOS app joins that
PIN and follows Quem Erra, Paga, Advogado do Diabo, Telefone Sem Fio and Pitch
no Escuro from the same `room_snapshot` contract.

The lobby treats Realtime as an invalidation signal only. After subscribing,
reconnecting, or returning from the background, it fetches a fresh
`room_snapshot` from the authoritative backend. Transient failures preserve
the last known lobby instead of ejecting the player to the join screen.
