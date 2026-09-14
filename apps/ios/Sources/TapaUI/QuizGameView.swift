import SwiftUI
import TapaCore

struct QuizGameView: View {
    @Bindable var model: LobbyViewModel
    let snapshot: RoomSnapshot
    private var question: QuizCatalog.Question? { QuizCatalog.bundled?.question(for: snapshot) }
    var body: some View {
        VStack(spacing: 24) {
            HStack {
                Text("QUEM ERRA, PAGA").font(.caption.weight(.black)).tracking(1)
                Spacer()
                Text("\(max(snapshot.room.round, 1)) / \(snapshot.match?.questionOrder.count ?? 0)")
                    .font(.system(.headline, design: .monospaced, weight: .black))
            }.padding(14).paper(fill: TapaPalette.lime)
            if snapshot.room.pausedAt != nil {
                Label("PARTIDA PAUSADA PELO HOST", systemImage: "pause.fill").font(.callout.weight(.black)).padding().paper()
            }
            if !snapshot.isQuizParticipant {
                Label("Você está assistindo. Jogue na próxima partida.", systemImage: "eye.fill").font(.callout.weight(.bold)).padding().paper()
            }
            switch snapshot.room.phase {
            case .gameIntro:
                TapaMessage(icon: "bolt.fill", title: "SABE OU\nVAI PAGAR?",
                            detail: "Escolha uma das quatro alternativas antes do tempo acabar. Acertou? Ganha ponto. Errou? A roleta decide a prenda!")
                waiting
            case .roundActive: activeQuestion
            case .revealAnswer: reveal
            case .forfeitWheel: forfeit
            case .leaderboard, .gameOver: leaderboard
            default:
                TapaMessage(icon: "hourglass", title: "PRÓXIMA RODADA", detail: "Aguardando a sala atualizar. Sua conexão continua ativa.")
            }
        }.accessibilityIdentifier("native-quiz-\(snapshot.room.phase.rawValue)")
    }
    private var activeQuestion: some View {
        VStack(spacing: 22) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let remaining = snapshot.secondsRemaining(at: context.date, serverOffset: model.serverOffset)
                HStack {
                    Text(remaining == 0 ? "TEMPO ESGOTADO" : "PENSA RÁPIDO.").font(.headline.weight(.black)).foregroundStyle(.white)
                    Spacer()
                    Label(remaining.map { "\($0)s" } ?? "—", systemImage: "timer")
                        .font(.system(.title2, design: .monospaced, weight: .black)).padding(12).paper()
                }
            }
            if let question {
                Text(question.question).font(.system(.title2, design: .rounded, weight: .black))
                    .frame(maxWidth: .infinity, alignment: .leading).padding(24).paper()
                if model.hasAnswered {
                    TapaMessage(
                        icon: "checkmark.seal.fill",
                        title: "TÁ NA MÃO!",
                        detail: selectedAnswerText
                    )
                } else {
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        VStack(spacing: 16) {
                            ForEach(Array(question.options.enumerated()), id: \.offset) { index, option in
                                Button {
                                    runProtectedGameAction(named: "Enviar resposta") {
                                        await model.submitAnswer(index)
                                    }
                                } label: {
                                    HStack(spacing: 14) {
                                        Text(["A", "B", "C", "D"][index]).font(.title2.weight(.black))
                                            .frame(width: 38, height: 38).background(TapaPalette.lime)
                                            .overlay(Rectangle().stroke(.black, lineWidth: 2))
                                        Text(option).multilineTextAlignment(.leading)
                                        Spacer(minLength: 0)
                                    }
                                }.buttonStyle(TapaButtonStyle())
                                    .disabled(model.isSubmitting || !snapshot.isQuizParticipant || snapshot.room.pausedAt != nil
                                              || (snapshot.secondsRemaining(at: context.date, serverOffset: model.serverOffset) ?? 1) == 0)
                                    .accessibilityIdentifier("quiz-option-\(index)")
                            }
                        }
                    }
                    if model.isSubmitting {
                        Text("CONFIRMANDO SUA RESPOSTA…").font(.caption.weight(.black)).foregroundStyle(.white)
                    }
                }
            } else {
                TapaMessage(icon: "exclamationmark.triangle", title: "PERGUNTA INDISPONÍVEL",
                            detail: "O catálogo desta versão não reconhece a pergunta da sala. Atualize o app antes de responder.")
            }
        }
    }
    @ViewBuilder private var reveal: some View {
        if let question {
            let correct = question.correctAnswer
            let won = correct != nil && snapshot.myAnswer == correct
            TapaMessage(icon: won ? "star.fill" : "face.dashed",
                        title: !snapshot.isQuizParticipant ? "RESPOSTA REVELADA" : won ? "MANDOU BEM!" : "IH, DEU RUIM.",
                        detail: correct.flatMap { question.options.indices.contains($0) ? "Resposta: \(question.options[$0])" : nil }
                            ?? "Era pegadinha! Nenhuma alternativa estava certa.")
            waiting
        } else {
            TapaMessage(icon: "exclamationmark.triangle", title: "CATÁLOGO DESATUALIZADO", detail: "Não foi possível mostrar esta resposta. Aguarde a próxima fase.")
        }
    }
    private var forfeit: some View {
        VStack(spacing: 24) {
            if let index = snapshot.match?.punishmentIndex,
               let punishments = QuizCatalog.bundled?.punishments,
               punishments.indices.contains(index) {
                PunishmentWheel(
                    items: punishments,
                    winnerIndex: index,
                    losers: question.map { snapshot.quizOutcome(for: $0).wrong } ?? []
                )
                .id("\(snapshot.quizRoundKey):\(index)")
            } else {
                TapaMessage(icon: "sparkles", title: "GIRANDO…",
                            detail: "Esperando o resultado oficial da roleta.")
            }
            waiting
        }
    }
    private var leaderboard: some View {
        VStack(spacing: 24) {
            TapaMessage(icon: "trophy.fill", title: "RESPEITA\nO PLACAR.", detail: "Os pontos são oficiais. A zoeira é por conta de vocês.")
            VStack(spacing: 18) {
                ForEach(Array(snapshot.matchRanking.enumerated()), id: \.element.id) { index, player in
                    HStack {
                        Text("\(index + 1)").font(.title2.weight(.black)).frame(width: 26)
                        PlayerRow(player: player, suffix: "\(player.score) PTS")
                    }
                }
            }.padding(20).paper()
            waiting
        }
    }
    private var waiting: some View {
        Label("Acompanhe o host. A próxima fase entra sozinha.", systemImage: "arrow.triangle.2.circlepath")
            .font(.callout.weight(.semibold)).foregroundStyle(.white).multilineTextAlignment(.center)
    }
    private var selectedAnswerText: String {
        guard let answer = snapshot.myAnswer, (0..<4).contains(answer) else {
            return "Resposta confirmada. Agora espera a galera — sem trocar de ideia."
        }
        return "Você marcou \(["A", "B", "C", "D"][answer]). Não dá para trocar."
    }
}

private struct PunishmentWheel: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let items: [String]
    let winnerIndex: Int
    let losers: [SnapshotPlayer]
    @State private var rotation = 0.0
    @State private var revealed = false

    var body: some View {
        VStack(spacing: 18) {
            Text(revealed ? "A PRENDA É" : "RODANDO…")
                .font(.title2.weight(.black))
                .foregroundStyle(.white)

            ZStack(alignment: .top) {
                NumberedWheelSegments(count: items.count)
                    .rotationEffect(.degrees(rotation))
                    .frame(maxWidth: 330)
                    .aspectRatio(1, contentMode: .fit)
                    .shadow(color: .black.opacity(0.5), radius: 0, x: 8, y: 8)

                Image(systemName: "arrowtriangle.down.fill")
                    .font(.system(size: 38, weight: .black))
                    .foregroundStyle(.black)
                    .offset(y: -13)
            }

            if revealed {
                TapaMessage(icon: "sparkles", title: "A ROLETA\nDECIDIU.", detail: items[winnerIndex])
                    .transition(.scale.combined(with: .opacity))
                VStack(alignment: .leading, spacing: 14) {
                    Text("QUEM VAI PAGAR").font(.headline.weight(.black))
                    ForEach(losers) { PlayerRow(player: $0, suffix: "👀") }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
                .paper(fill: TapaPalette.lime)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .task(id: winnerIndex) {
            guard items.indices.contains(winnerIndex), !items.isEmpty else { return }
            rotation = 0
            revealed = reduceMotion
            guard !reduceMotion else { return }

            // The database chooses the index. Animation only rotates that
            // authoritative segment under the pointer and never rerolls it.
            let segment = 360.0 / Double(items.count)
            let target = (360.0 * 6) - ((Double(winnerIndex) + 0.5) * segment)
            withAnimation(.timingCurve(0.12, 0.72, 0.18, 1, duration: 2.8)) {
                rotation = target
            }
            do { try await Task.sleep(for: .milliseconds(2_800)) } catch { return }
            withAnimation(.spring(response: 0.45, dampingFraction: 0.72)) {
                revealed = true
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(revealed ? "Prenda: \(items[winnerIndex])" : "Roleta girando")
    }
}

struct NumberedWheelSegments: View {
    let count: Int

    var body: some View {
        Canvas { context, size in
            guard count > 0 else { return }
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = min(size.width, size.height) / 2 - 5
            let angle = (2 * Double.pi) / Double(count)

            for index in 0..<count {
                let start = -Double.pi / 2 + Double(index) * angle
                let end = start + angle
                var path = Path()
                path.move(to: center)
                path.addArc(
                    center: center,
                    radius: radius,
                    startAngle: .radians(start),
                    endAngle: .radians(end),
                    clockwise: false
                )
                path.closeSubpath()
                context.fill(
                    path,
                    with: .color(index.isMultiple(of: 2) ? TapaPalette.lime : .white)
                )
                context.stroke(path, with: .color(.black), lineWidth: 3)

                let middle = start + angle / 2
                let labelPoint = CGPoint(
                    x: center.x + cos(middle) * radius * 0.7,
                    y: center.y + sin(middle) * radius * 0.7
                )
                context.draw(
                    Text("\(index + 1)").font(.caption.weight(.black)),
                    at: labelPoint,
                    anchor: .center
                )
            }

            let rim = Path(ellipseIn: CGRect(
                x: center.x - radius,
                y: center.y - radius,
                width: radius * 2,
                height: radius * 2
            ))
            context.stroke(rim, with: .color(.black), lineWidth: 7)
        }
    }
}
