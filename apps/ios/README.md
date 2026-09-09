# Tapa iOS

Phase 6 of `PLANO-IOS-E-BACKEND.md`: a native SwiftUI shell backed by the same
Supabase room used by the web app.

## What is here

- `TapaCore`: shared `Codable` models, anonymous auth, room RPCs and lobby state
- `TapaUI`: the SwiftUI join flow and live lobby
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

The first vertical checkpoint is: create a room on the web, enter the same PIN
in the simulator, and see the lobby update as players join or leave.
