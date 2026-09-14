import SwiftUI
import TapaCore
#if canImport(UIKit)
import UIKit
#endif

/// Keeps a last-second vote/drawing/guess alive while iOS moves the app to
/// the background. It does not schedule future work; it only gives an already
/// started, short authoritative RPC time to finish.
@MainActor
func runProtectedGameAction(
    named name: String,
    operation: @escaping @MainActor () async -> Void
) {
    #if canImport(UIKit)
    let lease = BackgroundExecutionLease(name: name)
    Task { @MainActor in
        await operation()
        lease.end()
    }
    #else
    Task { @MainActor in await operation() }
    #endif
}

#if canImport(UIKit)
@MainActor
private final class BackgroundExecutionLease {
    private var identifier: UIBackgroundTaskIdentifier = .invalid

    init(name: String) {
        identifier = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
            Task { @MainActor in self?.end() }
        }
    }

    func end() {
        guard identifier != .invalid else { return }
        UIApplication.shared.endBackgroundTask(identifier)
        identifier = .invalid
    }

}
#endif

struct GameHeader: View {
    let title: String
    let snapshot: RoomSnapshot
    var body: some View {
        HStack {
            Text(title).font(.caption.weight(.black)).tracking(1)
            Spacer()
            if snapshot.room.round > 0 {
                Text("RODADA \(snapshot.room.round)")
                    .font(.system(.caption, design: .monospaced, weight: .black))
            }
        }.padding(14).paper(fill: TapaPalette.lime)
    }
}

struct PartyTimer: View {
    let snapshot: RoomSnapshot
    let serverOffset: TimeInterval
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let seconds = snapshot.secondsRemaining(at: context.date, serverOffset: serverOffset)
            Label(seconds.map { "\($0)s" } ?? "—", systemImage: snapshot.room.pausedAt == nil ? "timer" : "pause.fill")
                .font(.system(size: 48, weight: .black, design: .monospaced))
                .frame(maxWidth: .infinity).padding(20).paper()
                .accessibilityLabel("Tempo restante: \(seconds ?? 0) segundos")
        }
    }
}

struct SpectatorNotice: View {
    var body: some View {
        Label("Você entrou durante a partida e joga na próxima.", systemImage: "eye.fill")
            .font(.callout.weight(.bold)).padding().paper()
    }
}

struct WaitingForHost: View {
    var body: some View {
        TapaMessage(icon: "arrow.triangle.2.circlepath", title: "SEGURA AÍ",
                    detail: "Aguardando a próxima fase oficial da sala.")
    }
}

struct TopicCard: View {
    let topic: String
    let caption: String
    var body: some View {
        VStack(spacing: 14) {
            Text(caption).font(.caption.weight(.black)).tracking(2)
            Text(topic).font(.system(.title, design: .rounded, weight: .black))
                .multilineTextAlignment(.center)
        }.frame(maxWidth: .infinity).padding(26).paper()
    }
}

struct SpinCard: View {
    let title: String
    let items: [String]
    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "arrow.triangle.2.circlepath.circle.fill")
                .font(.system(size: 68, weight: .black))
            Text(title).font(.title2.weight(.black)).multilineTextAlignment(.center)
            if !items.isEmpty {
                Text(items.prefix(4).joined(separator: " · "))
                    .font(.callout.weight(.semibold)).multilineTextAlignment(.center)
            }
        }.frame(maxWidth: .infinity).padding(28).paper()
    }
}

struct VoteItem: Identifiable {
    let value: Int
    let emoji: String
    let label: String
    var id: Int { value }
}

enum VoteScale {
    static let debate = [
        VoteItem(value: 1, emoji: "👎", label: "PÉSSIMO"),
        VoteItem(value: 2, emoji: "😬", label: "FRACO"),
        VoteItem(value: 3, emoji: "😐", label: "OK"),
        VoteItem(value: 4, emoji: "👏", label: "BOM"),
        VoteItem(value: 5, emoji: "🔥", label: "INCRÍVEL"),
    ]
    static let slides = [
        VoteItem(value: 1, emoji: "😬", label: "O QUE FOI ISSO"),
        VoteItem(value: 2, emoji: "😂", label: "CAÓTICO"),
        VoteItem(value: 3, emoji: "👏", label: "ATÉ QUE SIM"),
        VoteItem(value: 4, emoji: "🔥", label: "MANDOU BEM"),
        VoteItem(value: 5, emoji: "🧠", label: "NÍVEL TED"),
    ]
}

struct VotePanel: View {
    let title: String
    let items: [VoteItem]
    let disabled: Bool
    let action: (Int) async -> Void
    var body: some View {
        VStack(spacing: 16) {
            Text(title).font(.title2.weight(.black)).multilineTextAlignment(.center)
                .frame(maxWidth: .infinity).padding(20).paper()
            ForEach(items) { item in
                Button { Task { await action(item.value) } } label: {
                    HStack {
                        Text(item.emoji).font(.title)
                        Text(item.label)
                        Spacer()
                    }
                }.buttonStyle(TapaButtonStyle()).disabled(disabled)
            }
        }
    }
}

struct RankingView: View {
    let snapshot: RoomSnapshot
    let usesDecimalScores: Bool
    let title: String
    var body: some View {
        VStack(spacing: 20) {
            TapaMessage(icon: "trophy.fill", title: title, detail: "O placar oficial da sala.")
            VStack(spacing: 16) {
                ForEach(Array(ranking.enumerated()), id: \.element.player.id) { index, entry in
                    HStack {
                        Text("\(index + 1)").font(.title2.weight(.black)).frame(width: 28)
                        PlayerRow(player: entry.player, suffix: formatted(entry.score))
                    }
                }
            }.padding(20).paper()
        }
    }
    private var ranking: [(player: SnapshotPlayer, score: Double)] {
        snapshot.players.map { player in
            (player, usesDecimalScores ? (snapshot.scores[player.id] ?? 0) : Double(player.score))
        }.sorted {
            $0.score == $1.score ? $0.player.joinedAt < $1.player.joinedAt : $0.score > $1.score
        }
    }
    private func formatted(_ score: Double) -> String {
        usesDecimalScores ? String(format: "%.1f PTS", score) : "\(Int(score)) PTS"
    }
}
