import Foundation

public extension RoomSnapshot {
    var currentDrawingChain: SnapshotChain? {
        guard let index = match?.revealChainIndex else { return nil }
        // `position` is the wire identity. Array order is normally the same,
        // but rendering must not silently open another notebook if it changes.
        return chains.first { $0.position == index }
    }

    var currentDrawingPage: SnapshotPage? {
        guard let match, let chain = currentDrawingChain,
              match.revealPageIndex > 0,
              match.revealPageIndex <= match.stepCount
        else { return nil }
        return chain.pages.first { $0.stepIndex == match.revealPageIndex - 1 }
    }

    var drawingRevealPageCount: Int {
        (match?.stepCount ?? 0) + 2
    }

    var drawingSubmittedParticipants: [SnapshotPlayer] {
        let submitted = Set(match?.submittedPlayerIds ?? [])
        return matchParticipants.filter { submitted.contains($0.id) }
    }

    var drawingPendingParticipants: [SnapshotPlayer] {
        let submitted = Set(match?.submittedPlayerIds ?? [])
        return matchParticipants.filter { !submitted.contains($0.id) }
    }

    func finalDrawingGuess(in chain: SnapshotChain) -> String? {
        chain.pages
            .filter { $0.kind == "guess" }
            .max { $0.stepIndex < $1.stepIndex }?
            .text
    }

    func drawingChainSurvived(_ chain: SnapshotChain) -> Bool {
        chain.countedAsMatch || AnswerMatcher.matches(
            guess: finalDrawingGuess(in: chain) ?? "",
            prompt: chain.originalPrompt,
            acceptedAnswers: chain.acceptedAnswers
        )
    }
}
