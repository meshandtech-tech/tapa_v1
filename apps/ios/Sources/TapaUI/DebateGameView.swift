import SwiftUI
import TapaCore

struct DebateGameView: View {
    @Bindable var model: LobbyViewModel
    let snapshot: RoomSnapshot

    var body: some View {
        VStack(spacing: 22) {
            GameHeader(title: "ADVOGADO DO DIABO", snapshot: snapshot)
            if !snapshot.isMatchParticipant {
                SpectatorNotice()
            }
            switch snapshot.room.phase {
            case .gameIntro:
                TapaMessage(
                    icon: "flame.fill",
                    title: "DEFENDA O\nINDEFENSÁVEL.",
                    detail: "Você vai defender uma opinião absurda. É improviso, não é o que você pensa. Se um tema incomodar de verdade, avise e pule."
                )
            case .topicSpin:
                if snapshot.debateTopicCandidates.isEmpty {
                    SpinCard(title: "SORTEANDO A TESE", items: [])
                } else {
                    DebateTopicWheel(
                        topics: snapshot.debateTopicCandidates,
                        winnerIndex: snapshot.match?.topicWinner ?? 0
                    )
                }
            case .topicReveal:
                VStack(spacing: 14) {
                    TopicCard(topic: snapshot.currentTopicText ?? "Sorteando…", caption: "A TESE É")
                    Text("DEFENDE ESSA.")
                        .font(.title3.weight(.black))
                        .foregroundStyle(.white)
                }
            case .playerSpin:
                DebatePresenterSpinner(
                    players: snapshot.remainingDebatePresenters + currentPresenterArray,
                    winnerID: snapshot.currentPresenter?.id
                )
            case .playerReveal:
                TapaMessage(
                    icon: snapshot.isCurrentPresenter ? "person.fill.questionmark" : "person.fill",
                    title: snapshot.isCurrentPresenter ? "É VOCÊ." : (snapshot.currentPresenter?.nickname.uppercased() ?? "QUEM SERÁ?"),
                    detail: snapshot.isCurrentPresenter ? "Respira. A mesa sabe que é brincadeira." : "Boa sorte para quem caiu nessa."
                )
            case .preparation, .countdown, .presentation:
                presentation
            case .voting:
                voting
            case .scoreReveal:
                scoreReveal
            case .gameOver:
                RankingView(snapshot: snapshot, usesDecimalScores: true, title: "FIM DO DEBATE")
            default:
                WaitingForHost()
            }
        }
        .accessibilityIdentifier("native-devil-\(snapshot.room.phase.rawValue)")
    }

    private var currentPresenterArray: [SnapshotPlayer] {
        snapshot.currentPresenter.map { [$0] } ?? []
    }

    private var presentation: some View {
        VStack(spacing: 18) {
            TapaMessage(
                icon: snapshot.room.phase == .presentation ? "megaphone.fill" : "brain.head.profile",
                title: snapshot.isCurrentPresenter
                    ? (snapshot.room.phase == .presentation ? "DEFENDA AGORA" : "SUA TESE")
                    : (snapshot.currentPresenter?.nickname.uppercased() ?? "PREPARANDO"),
                detail: snapshot.currentTopicText ?? "Aguardando a tese…"
            )
            PartyTimer(snapshot: snapshot, serverOffset: model.serverOffset)
        }
    }

    @ViewBuilder private var voting: some View {
        if snapshot.isCurrentPresenter {
            TapaMessage(icon: "eye.fill", title: "ESTÃO TE JULGANDO",
                        detail: "\(snapshot.debateVotesIn) de \(snapshot.eligibleDebateVoters.count) votos chegaram. Você não vota em si mesmo.")
        } else if let id = snapshot.me.playerId, let vote = snapshot.votes[id] {
            VStack(spacing: 18) {
                TopicCard(topic: snapshot.currentTopicText ?? "Aguardando a tese…", caption: "A TESE")
                TapaMessage(icon: "checkmark.seal.fill", title: "VOTO ENVIADO",
                            detail: VoteScale.debate.first { $0.value == Int(vote) }?.label ?? "Esperando a mesa…")
            }
        } else if !snapshot.isMatchParticipant {
            TapaMessage(icon: "eye.fill", title: "ASSISTINDO A VOTAÇÃO",
                        detail: "Você entrou durante a partida e vota na próxima.")
        } else {
            VStack(spacing: 18) {
                TopicCard(topic: snapshot.currentTopicText ?? "Aguardando a tese…", caption: "A TESE")
                VotePanel(
                    title: "Quão bem \(snapshot.currentPresenter?.nickname ?? "a pessoa") defendeu?",
                    items: VoteScale.debate,
                    disabled: model.isSubmitting,
                    action: model.submitVote
                )
            }
        }
    }

    private var scoreReveal: some View {
        let presenter = snapshot.currentPresenter
        let score = presenter.flatMap { snapshot.scores[$0.id] }
        return TapaMessage(
            icon: "chart.bar.fill",
            title: String(format: "%.1f / 5", score ?? 0),
            detail: "Nota de \(presenter?.nickname ?? "quem apresentou")."
        )
    }
}

private struct DebateTopicWheel: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let topics: [SnapshotTopic]
    let winnerIndex: Int
    @State private var rotation = 0.0

    var body: some View {
        VStack(spacing: 18) {
            Text("SORTEANDO A TESE")
                .font(.title2.weight(.black))
                .foregroundStyle(.white)
            ZStack(alignment: .top) {
                NumberedWheelSegments(count: topics.count)
                    .rotationEffect(.degrees(rotation))
                    .frame(maxWidth: 330)
                    .aspectRatio(1, contentMode: .fit)
                    .shadow(color: .black.opacity(0.5), radius: 0, x: 8, y: 8)
                Image(systemName: "arrowtriangle.down.fill")
                    .font(.system(size: 38, weight: .black))
                    .offset(y: -13)
            }
            Text("\(topics.count) teses na roda")
                .font(.callout.weight(.black))
                .foregroundStyle(.white)
        }
        .task(id: winnerIndex) {
            guard topics.indices.contains(winnerIndex), !reduceMotion else { return }
            rotation = 0
            let segment = 360.0 / Double(topics.count)
            let target = (360.0 * 6) - ((Double(winnerIndex) + 0.5) * segment)
            withAnimation(.timingCurve(0.12, 0.72, 0.18, 1, duration: 2.8)) {
                rotation = target
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Sorteando uma entre \(topics.count) teses")
    }
}

private struct DebatePresenterSpinner: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let players: [SnapshotPlayer]
    let winnerID: String?
    @State private var displayedName = "QUEM SERÁ?"

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "person.3.sequence.fill")
                .font(.system(size: 58, weight: .black))
            Text("QUEM VAI DEFENDER?").font(.title2.weight(.black))
            Text(displayedName.uppercased())
                .font(.system(size: 34, weight: .black, design: .rounded))
                .multilineTextAlignment(.center)
                .contentTransition(.numericText())
                .frame(maxWidth: .infinity, minHeight: 84)
        }
        .padding(26)
        .paper(fill: TapaPalette.lime)
        .task(id: winnerID) {
            guard let winner = players.first(where: { $0.id == winnerID }) else { return }
            if reduceMotion || players.count < 2 {
                displayedName = winner.nickname
                return
            }
            for index in 0..<18 {
                if Task.isCancelled { return }
                withAnimation(.easeOut(duration: 0.08)) {
                    displayedName = players[index % players.count].nickname
                }
                do { try await Task.sleep(for: .milliseconds(75 + index * 4)) }
                catch { return }
            }
            withAnimation(.spring(response: 0.42, dampingFraction: 0.68)) {
                displayedName = winner.nickname
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Sorteando quem vai defender")
    }
}
