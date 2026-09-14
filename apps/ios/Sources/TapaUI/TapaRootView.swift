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
                            NativeLobby(model: model, snapshot: s)
                        } else {
                            NativeGameRouter(model: model, snapshot: s)
                            if model.isHost {
                                NativeHostControls(model: model, snapshot: s)
                            }
                        }
                        if let error = model.actionError {
                            Label(error, systemImage: "exclamationmark.triangle.fill")
                                .font(.callout.weight(.bold)).padding().paper()
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
            await model.activate()
            var pollCount = 0
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
                await model.synchronize()
                pollCount += 1
                if pollCount.isMultiple(of: 3) { await model.touchPresence() }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { model.stop() }
        }
        .onDisappear { model.stop() }
    }
}

private struct NativeGameRouter: View {
    @Bindable var model: LobbyViewModel
    let snapshot: RoomSnapshot
    @ViewBuilder
    var body: some View {
        // Late arrivals still receive the public game screen. Each game owns
        // its spectator behavior and independently disables private actions.
        switch snapshot.room.gameId {
        case .quemErraPaga:
            QuizGameView(model: model, snapshot: snapshot)
        case .advogadoDoDiabo:
            DebateGameView(model: model, snapshot: snapshot)
        case .drawingTelephone:
            DrawingGameView(model: model, snapshot: snapshot)
        case .improvSlides:
            SlidesGameView(model: model, snapshot: snapshot)
        }
    }
}

private struct NativeJoin: View {
    @Bindable var model: LobbyViewModel
    @State private var selectedGame: GameID = .quemErraPaga
    private let games: [GameID] = [
        .quemErraPaga, .advogadoDoDiabo, .drawingTelephone, .improvSlides,
    ]

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
                Button { Task { await model.join() } } label: {
                    Label(model.state == .connecting ? "ENTRANDO…" : "BORA PRA PARTY",
                          systemImage: model.state == .connecting ? "hourglass" : "arrow.right")
                }.buttonStyle(TapaButtonStyle(dark: true)).disabled(!model.canJoin).accessibilityIdentifier("join-button")

                HStack {
                    Rectangle().frame(height: 3)
                    Text("OU CRIE A SUA").font(.caption.weight(.black)).fixedSize()
                    Rectangle().frame(height: 3)
                }

                Text("QUAL É O ESTRAGO?").font(.caption.weight(.black))
                LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 10) {
                    ForEach(games, id: \.rawValue) { game in
                        Button {
                            selectedGame = game
                        } label: {
                            Text(game.shortName)
                                .font(.caption.weight(.black))
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity, minHeight: 46)
                                .padding(6)
                                .background(selectedGame == game ? TapaPalette.lime : Color.white)
                                .overlay(Rectangle().stroke(.black, lineWidth: 3))
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(selectedGame == game ? .isSelected : [])
                    }
                }
                Button { Task { await model.create(gameID: selectedGame) } } label: {
                    Label(model.state == .connecting ? "CRIANDO…" : "CRIAR PARTY",
                          systemImage: model.state == .connecting ? "hourglass" : "party.popper.fill")
                }
                .buttonStyle(TapaButtonStyle())
                .disabled(!model.canCreate)
                .accessibilityIdentifier("create-room-button")

                if case let .failed(message) = model.state {
                    Label(message, systemImage: "exclamationmark.triangle.fill")
                        .font(.callout.weight(.semibold)).foregroundStyle(.red).accessibilityIdentifier("join-error")
                }
            }.padding(22).paper()
            Label("Entre numa sala existente ou crie a party direto no iPhone.", systemImage: "link")
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
    @Bindable var model: LobbyViewModel
    let snapshot: RoomSnapshot
    @State private var customTopicText = ""
    private let games: [GameID] = [
        .quemErraPaga, .advogadoDoDiabo, .drawingTelephone, .improvSlides,
    ]
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("TODO MUNDO\nPRA DENTRO.").font(.system(size: 40, weight: .black, design: .rounded)).foregroundStyle(.white)
            VStack(spacing: 12) {
                Text("O CÓDIGO DA BAGUNÇA").font(.caption.weight(.black)).tracking(2)
                Text(snapshot.room.pin).font(.system(size: 64, weight: .black, design: .monospaced))
                    .tracking(8).minimumScaleFactor(0.6).lineLimit(1)
                Label(
                    model.isHost ? "Você controla esta party" : "Esperando o host começar",
                    systemImage: model.isHost ? "crown.fill" : "hourglass"
                ).font(.callout.weight(.semibold))
            }.frame(maxWidth: .infinity).padding(24).paper()
            HStack {
                Image(systemName: "bolt.fill").font(.title)
                VStack(alignment: .leading, spacing: 4) {
                    Text("PRÓXIMO JOGO").font(.caption.weight(.black))
                    Text(snapshot.room.gameId.displayName).font(.title2.weight(.black))
                }
                Spacer()
            }.padding(20).paper(fill: TapaPalette.lime)
            if model.isHost {
                VStack(alignment: .leading, spacing: 14) {
                    Text("ESCOLHA O JOGO").font(.caption.weight(.black))
                    LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 10) {
                        ForEach(games, id: \.rawValue) { game in
                            Button { Task { await model.changeGame(to: game) } } label: {
                                Text(game.shortName)
                                    .font(.caption.weight(.black))
                                    .multilineTextAlignment(.center)
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .padding(6)
                                    .background(snapshot.room.gameId == game ? TapaPalette.lime : Color.white)
                                    .overlay(Rectangle().stroke(.black, lineWidth: 3))
                            }
                            .buttonStyle(.plain)
                            .disabled(model.isSubmitting)
                            .accessibilityAddTraits(snapshot.room.gameId == game ? .isSelected : [])
                        }
                    }

                    Text("DIFICULDADE").font(.caption.weight(.black))
                    HStack(spacing: 8) {
                        ForEach(GameDifficulty.allCases, id: \.rawValue) { difficulty in
                            Button(difficulty.title) {
                                Task { await model.changeDifficulty(to: difficulty) }
                            }
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(snapshot.room.difficulty == difficulty ? TapaPalette.lime : Color.white)
                            .overlay(Rectangle().stroke(.black, lineWidth: 2))
                            .buttonStyle(.plain)
                            .disabled(model.isSubmitting)
                            .accessibilityAddTraits(snapshot.room.difficulty == difficulty ? .isSelected : [])
                        }
                    }
                }
                .padding(20)
                .paper()

                if snapshot.room.gameId == .advogadoDoDiabo {
                    customDebateTopics
                }
            }
            VStack(alignment: .leading, spacing: 16) {
                Text("NA PARTY · \(snapshot.players.count)").font(.headline.weight(.black))
                ForEach(snapshot.players) { player in
                    PlayerRow(player: player, suffix: player.id == snapshot.room.hostPlayerId ? "HOST" : player.id == snapshot.me.playerId ? "VOCÊ" : "")
                }
            }.padding(20).paper()
            if model.isHost {
                let missing = max(0, snapshot.room.gameId.minimumPlayers - snapshot.players.count)
                Button { Task { await model.startMatch() } } label: {
                    Label(
                        model.isSubmitting ? "COMEÇANDO…" : "COMEÇAR JOGO",
                        systemImage: model.isSubmitting ? "hourglass" : "play.fill"
                    )
                }
                .buttonStyle(TapaButtonStyle(dark: true))
                .disabled(model.isSubmitting || missing > 0)
                .accessibilityIdentifier("start-match-button")
                if missing > 0 {
                    Text("FALTA\(missing == 1 ? "" : "M") \(missing) JOGADOR\(missing == 1 ? "" : "ES")")
                        .font(.caption.weight(.black))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                }
            }
        }.accessibilityIdentifier("live-lobby")
    }

    private var customDebateTopics: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("TESES DA CASA").font(.headline.weight(.black))
                Spacer()
                Text("\(snapshot.room.customDebateTopics.count)/10")
                    .font(.system(.caption, design: .monospaced, weight: .black))
            }
            Text("Elas entram junto com as teses oficiais desta partida.")
                .font(.callout.weight(.semibold))

            ForEach(snapshot.room.customDebateTopics) { topic in
                HStack(alignment: .top, spacing: 12) {
                    Text(topic.text).font(.callout.weight(.bold)).frame(maxWidth: .infinity, alignment: .leading)
                    Button {
                        Task { await model.removeCustomDebateTopic(id: topic.id) }
                    } label: {
                        Image(systemName: "trash.fill").foregroundStyle(.red)
                    }
                    .buttonStyle(.plain)
                    .disabled(model.isSubmitting)
                    .accessibilityLabel("Remover tese \(topic.text)")
                }
                .padding(12)
                .background(Color.black.opacity(0.05))
                .overlay(Rectangle().stroke(.black, lineWidth: 2))
            }

            TextField("Ex.: Pizza com ketchup é superior", text: $customTopicText, axis: .vertical)
                .lineLimit(2...4)
                .font(.body.weight(.semibold))
                .padding(12)
                .background(Color.black.opacity(0.05))
                .overlay(Rectangle().stroke(.black, lineWidth: 2))
                .onChange(of: customTopicText) { _, value in
                    if value.count > 140 { customTopicText = String(value.prefix(140)) }
                }
                .accessibilityIdentifier("custom-debate-topic")

            Button {
                let topic = customTopicText
                Task {
                    await model.addCustomDebateTopic(topic)
                    if model.actionError == nil { customTopicText = "" }
                }
            } label: {
                Label(model.isSubmitting ? "SALVANDO…" : "ADICIONAR TESE", systemImage: "plus")
            }
            .buttonStyle(TapaButtonStyle())
            .disabled(
                model.isSubmitting
                    || customTopicText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    || snapshot.room.customDebateTopics.count >= 10
            )
        }
        .padding(20)
        .paper(fill: TapaPalette.lime)
    }
}

private struct NativeHostControls: View {
    @Bindable var model: LobbyViewModel
    let snapshot: RoomSnapshot

    var body: some View {
        VStack(spacing: 12) {
            if snapshot.room.phase == .gameOver {
                Button { Task { await model.startMatch() } } label: {
                    Label(model.isSubmitting ? "COMEÇANDO…" : "JOGAR DE NOVO",
                          systemImage: model.isSubmitting ? "hourglass" : "arrow.clockwise")
                }
                .buttonStyle(TapaButtonStyle(dark: true))
                .disabled(model.isSubmitting)
                .accessibilityIdentifier("host-play-again")

                Button { Task { await model.resetToLobby() } } label: {
                    Label("ESCOLHER OUTRO JOGO", systemImage: "gamecontroller.fill")
                }
                .buttonStyle(TapaButtonStyle())
                .disabled(model.isSubmitting)
                .accessibilityIdentifier("host-reset-lobby")
            } else {
                if snapshot.room.phase == .forfeitWheel {
                    Button { Task { await model.rerollPunishment() } } label: {
                        Label("GIRAR OUTRA PRENDA", systemImage: "dice.fill")
                    }
                    .buttonStyle(TapaButtonStyle())
                    .disabled(model.isSubmitting)
                    .accessibilityIdentifier("host-reroll-punishment")
                }

                if snapshot.room.gameId == .advogadoDoDiabo,
                   snapshot.room.phase == .topicReveal || snapshot.room.phase == .preparation {
                    Button { Task { await model.rerollTopic() } } label: {
                        Label("TROCAR TESE", systemImage: "dice.fill")
                    }
                    .buttonStyle(TapaButtonStyle())
                    .disabled(model.isSubmitting)
                    .accessibilityIdentifier("host-reroll-topic")
                }

                if snapshot.room.gameId == .drawingTelephone,
                   snapshot.room.phase == .revealPage {
                    if model.canCountCurrentDrawingAsMatch {
                        Button { Task { await model.countCurrentDrawingAsMatch() } } label: {
                            Label("VALEU, CONTA COMO ACERTO", systemImage: "hand.thumbsup.fill")
                        }
                        .buttonStyle(TapaButtonStyle())
                        .disabled(model.isSubmitting)
                        .accessibilityIdentifier("host-count-drawing-match")
                    }

                    let autoplay = snapshot.match?.revealAutoplay == true
                    Button { Task { await model.setRevealAutoplay(!autoplay) } } label: {
                        Label(autoplay ? "PAUSAR AVANÇO AUTOMÁTICO" : "AVANÇAR SOZINHO",
                              systemImage: autoplay ? "pause.fill" : "play.fill")
                    }
                    .buttonStyle(TapaButtonStyle())
                    .disabled(model.isSubmitting)
                    .accessibilityIdentifier("host-toggle-reveal-autoplay")
                }

                if let action = action {
                    Button { Task { await model.forceAdvance() } } label: {
                        Label(model.isSubmitting ? "CONFIRMANDO…" : action.title,
                              systemImage: model.isSubmitting ? "hourglass" : action.icon)
                    }
                    .buttonStyle(TapaButtonStyle(dark: action.prominent))
                    .disabled(model.isSubmitting)
                    .accessibilityIdentifier("host-advance-phase")
                }

                if snapshot.room.phaseEndsAt != nil {
                    let paused = snapshot.room.pausedAt != nil
                    Button { Task { await model.setPaused(!paused) } } label: {
                        Label(paused ? "RETOMAR PARTIDA" : "PAUSAR PARTIDA",
                              systemImage: paused ? "play.fill" : "pause.fill")
                    }
                    .buttonStyle(TapaButtonStyle())
                    .disabled(model.isSubmitting)
                    .accessibilityIdentifier("host-toggle-pause")
                }
            }
        }
    }

    private var action: (title: String, icon: String, prominent: Bool)? {
        switch (snapshot.room.gameId, snapshot.room.phase) {
        case (.quemErraPaga, .forfeitWheel):
            ("TODO MUNDO PAGOU, CONTINUAR", "checkmark.circle.fill", true)

        case (.advogadoDoDiabo, .gameIntro):
            ("ENTENDI, VAMOS JOGAR", "checkmark.circle.fill", true)
        case (.advogadoDoDiabo, .presentation):
            ("ENCERRAR APRESENTAÇÃO", "stop.fill", true)
        case (.advogadoDoDiabo, .voting):
            snapshot.debateVotesMissing > 0
                ? ("FECHAR VOTAÇÃO · FALTAM \(snapshot.debateVotesMissing)", "checkmark.circle.fill", true)
                : ("VER A NOTA", "checkmark.circle.fill", true)
        case (.advogadoDoDiabo, .scoreReveal):
            ("PRÓXIMO JOGADOR", "forward.fill", true)

        case (.drawingTelephone, .gameIntro):
            ("BORA DESENHAR", "pencil.tip", true)
        case (.drawingTelephone, .drawStep), (.drawingTelephone, .guessStep):
            ("PULAR A ESPERA", "forward.end.fill", false)
        case (.drawingTelephone, .revealIntro):
            ("COMEÇAR A REVELAÇÃO", "play.fill", true)
        case (.drawingTelephone, .revealPage):
            ("PRÓXIMA PÁGINA", "chevron.right", true)

        case (.improvSlides, .gameIntro):
            ("TODO MUNDO ENTENDEU, BORA", "checkmark.circle.fill", true)
        case (.improvSlides, .presentation):
            ("ENCERRAR APRESENTAÇÃO", "stop.fill", false)
        case (.improvSlides, .voting):
            snapshot.slidesVotesMissing > 0
                ? ("FECHAR VOTAÇÃO · FALTAM \(snapshot.slidesVotesMissing)", "checkmark.circle.fill", true)
                : ("VER A NOTA", "checkmark.circle.fill", true)
        case (.improvSlides, .scoreReveal):
            ("PRÓXIMO APRESENTADOR", "forward.fill", true)
        default:
            nil
        }
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

    var shortName: String {
        switch self {
        case .quemErraPaga: "QUEM ERRA, PAGA"
        case .advogadoDoDiabo: "ADVOGADO DO DIABO"
        case .drawingTelephone: "TELEFONE SEM FIO"
        case .improvSlides: "PITCH NO ESCURO"
        }
    }
}

private extension GameDifficulty {
    var title: String {
        switch self {
        case .easy: "LEVE"
        case .medium: "MÉDIA"
        case .hard: "PESADA"
        }
    }
}
