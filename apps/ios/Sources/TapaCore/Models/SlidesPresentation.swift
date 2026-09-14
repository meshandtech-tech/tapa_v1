import Foundation

public struct SlidesProgress: Equatable, Sendable {
    public let index: Int
    public let remainingSeconds: Int
    public let isLast: Bool
}

public enum SlidesRules {
    public static let slidesPerPresentation = 5
    public static let slideDurationSeconds = 20
    public static let presentationDurationSeconds = slidesPerPresentation * slideDurationSeconds
    public static let beats = [
        "O começo",
        "Desenvolve",
        "A virada",
        "Encaminha",
        "O grand finale",
    ]
}

public extension RoomSnapshot {
    /// The frozen order is also the authoritative slot-machine inventory.
    /// No device is allowed to pick a winner locally.
    var slidesPresenterCandidates: [SnapshotPlayer] {
        matchParticipants
    }

    var eligibleSlidesVoters: [SnapshotPlayer] {
        matchParticipants.filter { $0.id != currentPresenter?.id }
    }

    var slidesVotesIn: Int {
        let eligible = Set(eligibleSlidesVoters.map(\.id))
        return votes.keys.filter { eligible.contains($0) }.count
    }

    var slidesVotesMissing: Int {
        max(0, eligibleSlidesVoters.count - slidesVotesIn)
    }

    /// The current slide comes only from the server phase deadline. This keeps
    /// every iPhone and the web client on the same page without another clock.
    func slidesProgress(at date: Date, serverOffset: TimeInterval) -> SlidesProgress {
        let total = SlidesRules.presentationDurationSeconds
        let remaining = secondsRemaining(at: date, serverOffset: serverOffset) ?? total
        let elapsed = min(max(total - remaining, 0), total - 1)
        let index = min(SlidesRules.slidesPerPresentation - 1,
                        elapsed / SlidesRules.slideDurationSeconds)
        return SlidesProgress(
            index: index,
            remainingSeconds: max(1, SlidesRules.slideDurationSeconds - elapsed % SlidesRules.slideDurationSeconds),
            isLast: index == SlidesRules.slidesPerPresentation - 1
        )
    }

    /// Mirrors the web fallback: use live eligible votes when they are still
    /// present, otherwise use the score persisted by the authoritative RPC.
    var currentSlidesScore: Double? {
        let eligible = Set(eligibleSlidesVoters.map(\.id))
        let ratings = votes.compactMap { eligible.contains($0.key) ? $0.value : nil }
        if !ratings.isEmpty {
            let average = ratings.reduce(0, +) / Double(ratings.count)
            return (average * 10).rounded() / 10
        }
        guard let presenterID = currentPresenter?.id else { return nil }
        return scores[presenterID]
    }
}

public func slidesVerdict(for score: Double?) -> String {
    guard let score else { return "Ninguém votou. Constrangedor." }
    switch score {
    case 4.5...: return "Isso aí fazia sentido. Assustador."
    case 3.5...: return "Quase convenceu a mesa."
    case 2.5...: return "Teve momentos."
    case 1.5...: return "Foi um passeio."
    default: return "Melhor esquecer."
    }
}
