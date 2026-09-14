import Foundation

/// Bundled from the web catalog. Indices, not question IDs, are the wire contract.
public struct QuizCatalog: Decodable, Sendable {
    public struct Question: Decodable, Sendable {
        public let id: Int
        public let question: String
        public let options: [String]
        public let correctAnswer: Int?
    }
    public let decks: [String: [Question]]
    public let punishments: [String]
    public static let bundled: QuizCatalog? = {
        guard let url = Bundle.module.url(forResource: "QuizCatalog", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(QuizCatalog.self, from: data)
    }()

    public func question(for snapshot: RoomSnapshot) -> Question? {
        guard let match = snapshot.match,
              match.questionOrder.indices.contains(snapshot.room.round - 1) else { return nil }
        let difficulty: String
        if case let .string(value) = snapshot.room.settings["difficulty"] { difficulty = value }
        else { difficulty = "medium" }
        let deck = decks[difficulty] ?? decks["medium"] ?? []
        let index = match.questionOrder[snapshot.room.round - 1]
        return deck.indices.contains(index) ? deck[index] : nil
    }
}

public extension RoomSnapshot {
    var matchParticipants: [SnapshotPlayer] {
        guard let order = match?.seatOrder else { return [] }
        let byID = Dictionary(uniqueKeysWithValues: players.map { ($0.id, $0) })
        return order.compactMap { byID[$0] }
    }

    var isQuizParticipant: Bool {
        guard let id = me.playerId, let match else { return false }
        return match.seatOrder.contains(id)
    }

    var myAnswer: Int? {
        guard let id = me.playerId else { return nil }
        return answers[id]
    }

    var quizRoundKey: String {
        "\(room.id):\(match?.id ?? ""):\(room.round)"
    }

    func quizOutcome(for question: QuizCatalog.Question) -> QuizRoundOutcome {
        var correct: [SnapshotPlayer] = []
        var wrong: [SnapshotPlayer] = []
        var pending: [SnapshotPlayer] = []

        for player in matchParticipants {
            let answer = answers[player.id]
            if answer == nil { pending.append(player) }
            if let expected = question.correctAnswer, answer == expected {
                correct.append(player)
            } else {
                // An unanswered player and every player on a trick question
                // lose the round, matching Postgres and the web client.
                wrong.append(player)
            }
        }
        return QuizRoundOutcome(correct: correct, wrong: wrong, pending: pending)
    }

    var matchRanking: [SnapshotPlayer] {
        matchParticipants.sorted {
            $0.score == $1.score ? $0.joinedAt < $1.joinedAt : $0.score > $1.score
        }
    }

    var currentPresenter: SnapshotPlayer? {
        guard let match, match.seatOrder.indices.contains(match.presenterIndex) else { return nil }
        let id = match.seatOrder[match.presenterIndex]
        return players.first { $0.id == id }
    }

    var isCurrentPresenter: Bool {
        currentPresenter?.id == me.playerId
    }

    var isMatchParticipant: Bool {
        guard let id = me.playerId, let match else { return false }
        return match.seatOrder.contains(id)
    }

    var currentTopicText: String? {
        guard let match else { return nil }
        if match.topicCandidates.indices.contains(match.topicWinner) {
            let candidateID = match.topicCandidates[match.topicWinner]
            if let exact = topics.first(where: { "\($0.source):\($0.id)" == candidateID }) {
                return exact.text
            }
            // Older snapshots used a bare ID. A namespaced ID must never fall
            // back to another source that happens to share the same ID.
            if !candidateID.contains(":"), let legacy = topics.first(where: { $0.id == candidateID }) {
                return legacy.text
            }
            return candidateID
        }
        return topics.first { $0.presenterId == currentPresenter?.id }?.text
    }

    var actionRoundKey: String {
        "\(room.id):\(match?.id ?? ""):\(room.gameId.rawValue):\(room.round):\(room.phase.rawValue)"
    }

    /// Rendering only: transitions and score changes always come from Supabase.
    func secondsRemaining(at date: Date, serverOffset: TimeInterval) -> Int? {
        guard let end = Self.parseDate(room.phaseEndsAt) else { return nil }
        let now = Self.parseDate(room.pausedAt) ?? date.addingTimeInterval(serverOffset)
        return max(0, Int(ceil(end.timeIntervalSince(now))))
    }

    static func parseDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}

public struct QuizRoundOutcome: Equatable, Sendable {
    public let correct: [SnapshotPlayer]
    public let wrong: [SnapshotPlayer]
    public let pending: [SnapshotPlayer]
}
