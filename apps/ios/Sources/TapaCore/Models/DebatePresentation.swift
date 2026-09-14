import Foundation

public extension RoomSnapshot {
    var debateTopicCandidates: [SnapshotTopic] {
        guard let match else { return [] }
        let byKey = Dictionary(uniqueKeysWithValues: topics.map { ("\($0.source):\($0.id)", $0) })
        return match.topicCandidates.compactMap { byKey[$0] }
    }

    var remainingDebatePresenters: [SnapshotPlayer] {
        guard let match else { return [] }
        let start = max(match.presenterIndex + 1, 0)
        let remainingIDs = match.seatOrder.indices.contains(start)
            ? Array(match.seatOrder[start...])
            : []
        let byID = Dictionary(uniqueKeysWithValues: players.map { ($0.id, $0) })
        return remainingIDs.compactMap { byID[$0] }
    }

    var eligibleDebateVoters: [SnapshotPlayer] {
        matchParticipants.filter { $0.id != currentPresenter?.id }
    }

    var debateVotesIn: Int {
        let eligible = Set(eligibleDebateVoters.map(\.id))
        return votes.keys.filter { eligible.contains($0) }.count
    }

    var debateVotesMissing: Int {
        max(0, eligibleDebateVoters.count - debateVotesIn)
    }

    var debateRanking: [(player: SnapshotPlayer, score: Double)] {
        let rows: [(player: SnapshotPlayer, score: Double)] = matchParticipants.map { player in
            (player: player, score: scores[player.id] ?? 0)
        }
        return rows.sorted { lhs, rhs in
            if lhs.score == rhs.score {
                return lhs.player.joinedAt < rhs.player.joinedAt
            }
            return lhs.score > rhs.score
        }
    }
}
