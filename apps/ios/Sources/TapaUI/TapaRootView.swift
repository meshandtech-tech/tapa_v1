import SwiftUI
import TapaCore

public struct TapaRootView: View {
    @State private var model: LobbyViewModel

    public init(service: any RoomService) {
        _model = State(initialValue: LobbyViewModel(service: service))
    }

    public var body: some View {
        @Bindable var model = model

        NavigationStack {
            Group {
                switch model.state {
                case .joined:
                    LobbyView(model: model)
                case .idle, .connecting, .failed:
                    JoinView(model: model)
                }
            }
            .navigationTitle("Tapa")
        }
        .tint(.black)
    }
}

private struct JoinView: View {
    @Bindable var model: LobbyViewModel

    var body: some View {
        Form {
            Section("Entrar numa sala") {
                pinField
                nicknameField
            }

            if case let .failed(message) = model.state {
                Text(message)
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("join-error")
            }

            Button {
                Task { await model.join() }
            } label: {
                HStack {
                    Spacer()
                    if model.state == .connecting {
                        ProgressView()
                    } else {
                        Text("ENTRAR")
                            .fontWeight(.black)
                    }
                    Spacer()
                }
            }
            .disabled(!model.canJoin)
            .accessibilityIdentifier("join-button")
        }
    }

    @ViewBuilder
    private var pinField: some View {
        #if os(iOS)
        TextField("PIN de 4 números", text: $model.pin)
            .keyboardType(.numberPad)
            .textContentType(.oneTimeCode)
        #else
        TextField("PIN de 4 números", text: $model.pin)
        #endif
    }

    @ViewBuilder
    private var nicknameField: some View {
        #if os(iOS)
        TextField("Seu nome", text: $model.nickname)
            .textInputAutocapitalization(.words)
            .textContentType(.nickname)
        #else
        TextField("Seu nome", text: $model.nickname)
        #endif
    }
}

private struct LobbyView: View {
    @Bindable var model: LobbyViewModel

    var body: some View {
        List {
            if let snapshot = model.snapshot {
                Section {
                    LabeledContent("Sala", value: snapshot.room.pin)
                    LabeledContent("Jogo", value: gameName(snapshot.room.gameId))
                    if model.isHost {
                        Label("Você é o host", systemImage: "crown.fill")
                    }
                }

                Section("Jogadores (\(snapshot.players.count))") {
                    ForEach(snapshot.players) { player in
                        HStack(spacing: 12) {
                            Circle()
                                .fill(Color(hex: player.color))
                                .frame(width: 16, height: 16)
                            Text(player.nickname)
                            Spacer()
                            if player.id == snapshot.room.hostPlayerId {
                                Image(systemName: "crown.fill")
                                    .accessibilityLabel("Host")
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Lobby")
        .onDisappear { model.stop() }
        .accessibilityIdentifier("live-lobby")
    }

    private func gameName(_ gameID: GameID) -> String {
        switch gameID {
        case .quemErraPaga: "Quem Erra, Paga"
        case .advogadoDoDiabo: "Advogado do Diabo"
        case .drawingTelephone: "Telefone Sem Fio"
        case .improvSlides: "Pitch no Escuro"
        }
    }
}

private extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        self.init(
            red: Double((value >> 16) & 0xff) / 255,
            green: Double((value >> 8) & 0xff) / 255,
            blue: Double(value & 0xff) / 255
        )
    }
}
