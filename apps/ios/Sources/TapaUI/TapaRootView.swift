import SwiftUI
import TapaCore

public struct TapaRootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var model: LobbyViewModel
    public init(service: any RoomService) {
        _model = State(initialValue: LobbyViewModel(service: service))
    }
    public var body: some View {
        ZStack {
            TapaBackground()
            ScrollView {
                VStack(spacing: 26) {
                    HStack {
                        TapaLogo()
                        Spacer()
                        if let s = model.snapshot, model.state == .joined {
                            Text("SALA \(s.room.pin)").font(.caption.weight(.black)).padding(10).paper()
                        }
                    }.padding(.top, 12)
                    if model.state == .joined, let s = model.snapshot {
                        if model.connectionState == .reconnecting || model.lastConnectionError != nil {
                            Label("Reconectando… mantendo sua partida.", systemImage: "wifi.exclamationmark")
                                .font(.callout.weight(.bold)).padding().paper()
                        }
                        if s.room.closedAt != nil {
                            TapaMessage(icon: "flag.checkered", title: "PARTY ENCERRADA", detail: "Esta sala foi encerrada pelo host.")
                        } else if s.room.phase == .lobby {
                            NativeLobby(snapshot: s)
                        } else if s.room.gameId == .quemErraPaga {
                            QuizGameView(model: model, snapshot: s)
                        } else {
                            TapaMessage(icon: "hammer.fill", title: "ESSE AINDA É NO WEB",
                                        detail: "\(s.room.gameId.displayName) ainda não tem telas nativas. Entre pelo navegador para jogar. Quem Erra, Paga já está disponível aqui.")
                        }
                    } else {
                        NativeJoin(model: model)
                    }
                    Text("JUNTO É MUITO MAIS CAÓTICO.")
                        .font(.system(.caption2, design: .monospaced, weight: .bold))
                        .foregroundStyle(.white.opacity(0.85)).padding(.top, 12)
                }.frame(maxWidth: 560).padding(.horizontal, 24).padding(.bottom, 32)
                    .frame(maxWidth: .infinity)
            }.scrollDismissesKeyboard(.interactively)
        }
        .foregroundStyle(.black).tint(.black).preferredColorScheme(.light)
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await model.resume()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
                await model.synchronize()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { model.stop() }
        }
        .onDisappear { model.stop() }
    }
}

private struct NativeJoin: View {
    @Bindable var model: LobbyViewModel
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("A PARTY\nTÁ ON.")
                .font(.system(size: 54, weight: .black, design: .rounded))
                .tracking(-2).foregroundStyle(.white).fixedSize(horizontal: false, vertical: true)
            Text("Um PIN. Seus amigos.\nZero chance de ficar sério.")
                .font(.title3.weight(.semibold)).foregroundStyle(.white)
            VStack(alignment: .leading, spacing: 20) {
                Text("CHEGA MAIS ↗").font(.title2.weight(.black))
                Text("PIN DA SALA").font(.caption.weight(.black))
                pinField.font(.system(size: 34, weight: .black, design: .monospaced))
                    .padding(14).background(Color.black.opacity(0.05))
                    .overlay(Rectangle().stroke(.black, lineWidth: 2)).accessibilityIdentifier("join-pin")
                Text("COMO VÃO TE CHAMAR?").font(.caption.weight(.black))
                TextField("Seu nome", text: $model.nickname)
                    .font(.title3.weight(.bold)).padding(14).background(Color.black.opacity(0.05))
                    .overlay(Rectangle().stroke(.black, lineWidth: 2)).accessibilityIdentifier("join-name")
                if case let .failed(message) = model.state {
                    Label(message, systemImage: "exclamationmark.triangle.fill")
                        .font(.callout.weight(.semibold)).foregroundStyle(.red).accessibilityIdentifier("join-error")
                }
                Button { Task { await model.join() } } label: {
                    Label(model.state == .connecting ? "ENTRANDO…" : "BORA PRA PARTY",
                          systemImage: model.state == .connecting ? "hourglass" : "arrow.right")
                }.buttonStyle(TapaButtonStyle(dark: true)).disabled(!model.canJoin).accessibilityIdentifier("join-button")
            }.padding(22).paper()
            Label("Crie a sala no web e coloque o PIN aqui.", systemImage: "link")
                .font(.callout.weight(.semibold)).foregroundStyle(.white)
        }
    }
    private var pinField: some View {
        #if os(iOS)
        TextField("0000", text: $model.pin).keyboardType(.numberPad).textContentType(.oneTimeCode)
        #else
        TextField("0000", text: $model.pin)
        #endif
    }
}

private struct NativeLobby: View {
    let snapshot: RoomSnapshot
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("TODO MUNDO\nPRA DENTRO.").font(.system(size: 40, weight: .black, design: .rounded)).foregroundStyle(.white)
            VStack(spacing: 12) {
                Text("O CÓDIGO DA BAGUNÇA").font(.caption.weight(.black)).tracking(2)
                Text(snapshot.room.pin).font(.system(size: 64, weight: .black, design: .monospaced))
                    .tracking(8).minimumScaleFactor(0.6).lineLimit(1)
                Label("Esperando o host começar no web", systemImage: "hourglass").font(.callout.weight(.semibold))
            }.frame(maxWidth: .infinity).padding(24).paper()
            HStack {
                Image(systemName: "bolt.fill").font(.title)
                VStack(alignment: .leading, spacing: 4) {
                    Text("PRÓXIMO JOGO").font(.caption.weight(.black))
                    Text(snapshot.room.gameId.displayName).font(.title2.weight(.black))
                }
                Spacer()
            }.padding(20).paper(fill: TapaPalette.lime)
            VStack(alignment: .leading, spacing: 16) {
                Text("NA PARTY · \(snapshot.players.count)").font(.headline.weight(.black))
                ForEach(snapshot.players) { player in
                    PlayerRow(player: player, suffix: player.id == snapshot.room.hostPlayerId ? "HOST" : player.id == snapshot.me.playerId ? "VOCÊ" : "")
                }
            }.padding(20).paper()
        }.accessibilityIdentifier("live-lobby")
    }
}

extension GameID {
    var displayName: String {
        switch self {
        case .quemErraPaga: "Quem Erra, Paga"
        case .advogadoDoDiabo: "Advogado do Diabo"
        case .drawingTelephone: "Telefone Sem Fio"
        case .improvSlides: "Pitch no Escuro"
        }
    }
}
