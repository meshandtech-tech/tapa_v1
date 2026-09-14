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
                SpinCard(title: "SORTEANDO A TESE", items: topicCandidates)
            case .topicReveal:
                TopicCard(topic: snapshot.currentTopicText ?? "Sorteando…", caption: "A TESE É")
            case .playerSpin:
                SpinCard(title: "QUEM VAI DEFENDER?", items: participantNames)
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

    private var topicCandidates: [String] {
        guard let match = snapshot.match else { return [] }
        return match.topicCandidates.compactMap { key in
            snapshot.topics.first {
                "\($0.source):\($0.id)" == key || $0.id == key
            }?.text
        }
    }

    private var participantNames: [String] {
        guard let order = snapshot.match?.seatOrder else { return [] }
        return order.compactMap { id in snapshot.players.first { $0.id == id }?.nickname }
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
                        detail: "\(snapshot.votes.count) voto(s) chegaram. Você não vota em si mesmo.")
        } else if let id = snapshot.me.playerId, let vote = snapshot.votes[id] {
            TapaMessage(icon: "checkmark.seal.fill", title: "VOTO ENVIADO",
                        detail: VoteScale.debate.first { $0.value == Int(vote) }?.label ?? "Esperando a mesa…")
        } else {
            VotePanel(
                title: "Quão bem \(snapshot.currentPresenter?.nickname ?? "a pessoa") defendeu?",
                items: VoteScale.debate,
                disabled: model.isSubmitting || !snapshot.isMatchParticipant,
                action: model.submitVote
            )
        }
    }

    private var scoreReveal: some View {
        let presenter = snapshot.currentPresenter
        let score = presenter.flatMap { snapshot.scores[$0.id] }
        return TapaMessage(
            icon: "chart.bar.fill",
            title: score.map { String(format: "%.1f / 5", $0) } ?? "— / 5",
            detail: "Nota de \(presenter?.nickname ?? "quem apresentou")."
        )
    }
}
