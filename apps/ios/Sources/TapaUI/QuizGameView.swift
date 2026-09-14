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
            if let error = model.actionError {
                Label(error, systemImage: "exclamationmark.triangle.fill").font(.callout.weight(.bold)).padding().paper()
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
                    TapaMessage(icon: "checkmark.seal.fill", title: "TÁ NA MÃO!", detail: "Resposta confirmada. Agora espera a galera — sem trocar de ideia.")
                } else {
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        VStack(spacing: 16) {
                            ForEach(Array(question.options.enumerated()), id: \.offset) { index, option in
                                Button { Task { await model.submitAnswer(index) } } label: {
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
            TapaMessage(icon: "sparkles", title: "A ROLETA\nDECIDIU.", detail: punishment ?? "Esperando o resultado oficial da roleta…")
            if let question {
                let losers = snapshot.players.filter {
                    snapshot.match?.seatOrder.contains($0.id) == true
                    && (question.correctAnswer == nil || snapshot.answers[$0.id] != question.correctAnswer)
                }
                VStack(alignment: .leading, spacing: 14) {
                    Text("QUEM VAI PAGAR").font(.headline.weight(.black))
                    ForEach(losers) { PlayerRow(player: $0, suffix: "👀") }
                }.frame(maxWidth: .infinity, alignment: .leading).padding(20).paper(fill: TapaPalette.lime)
            }
            waiting
        }
    }
    private var punishment: String? {
        guard let index = snapshot.match?.punishmentIndex, let list = QuizCatalog.bundled?.punishments,
              list.indices.contains(index) else { return nil }
        return list[index]
    }
    private var leaderboard: some View {
        VStack(spacing: 24) {
            TapaMessage(icon: "trophy.fill", title: "RESPEITA\nO PLACAR.", detail: "Os pontos são oficiais. A zoeira é por conta de vocês.")
            VStack(spacing: 18) {
                ForEach(Array(snapshot.players.sorted {
                    $0.score == $1.score ? $0.id < $1.id : $0.score > $1.score
                }.enumerated()), id: \.element.id) { index, player in
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
}
