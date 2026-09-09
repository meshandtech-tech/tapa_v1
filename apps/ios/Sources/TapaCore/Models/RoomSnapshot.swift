import Foundation

public enum GameID: String, Codable, Sendable {
    case quemErraPaga = "quem-erra-paga"
    case advogadoDoDiabo = "advogado-do-diabo"
    case drawingTelephone = "drawing-telephone"
    case improvSlides = "improv-slides"
}

public enum PartyPhase: String, Codable, Sendable {
    case lobby = "LOBBY"
    case gameIntro = "GAME_INTRO"
    case leaderboard = "LEADERBOARD"
    case gameOver = "GAME_OVER"
    case roundActive = "ROUND_ACTIVE"
    case revealAnswer = "REVEAL_ANSWER"
    case forfeitWheel = "FORFEIT_WHEEL"
    case topicSpin = "TOPIC_SPIN"
    case topicReveal = "TOPIC_REVEAL"
    case playerSpin = "PLAYER_SPIN"
    case playerReveal = "PLAYER_REVEAL"
    case preparation = "PREPARATION"
    case countdown = "COUNTDOWN"
    case presentation = "PRESENTATION"
    case voting = "VOTING"
    case scoreReveal = "SCORE_REVEAL"
    case drawStep = "DRAW_STEP"
    case guessStep = "GUESS_STEP"
    case passing = "PASSING"
    case revealIntro = "REVEAL_INTRO"
    case revealPage = "REVEAL_PAGE"
}

public enum SubmissionStatus: String, Codable, Sendable {
    case submitted
    case timeout
    case failed
    case missed
    case pending
}

public struct SnapshotRoom: Codable, Equatable, Sendable {
    public let id: String
    public let pin: String
    public let gameId: GameID
    public let phase: PartyPhase
    public let phaseEndsAt: String?
    public let pausedAt: String?
    public let round: Int
    public let settings: [String: JSONValue]
    public let hostPlayerId: String?
    public let closedAt: String?
}

public struct SnapshotMe: Codable, Equatable, Sendable {
    public let playerId: String?
    public let submitted: Bool
}

public struct SnapshotPlayer: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let nickname: String
    public let color: String
    public let avatarSeed: String
    public let score: Int
    public let joinedAt: String
    public let lastSeenAt: String
}

public struct SnapshotMatch: Codable, Equatable, Sendable {
    public let id: String
    public let gameId: GameID
    public let seatOrder: [String]
    public let stepIndex: Int
    public let stepCount: Int
    public let submittedPlayerIds: [String]
    public let presenterIndex: Int
    public let revealChainIndex: Int
    public let revealPageIndex: Int
    public let revealAutoplay: Bool
    public let questionOrder: [Int]
    public let slideIds: [String]
    public let usedSlideIds: [String]
    public let punishmentIndex: Int?
    public let topicCandidates: [String]
    public let topicWinner: Int
}

public struct SnapshotPrevious: Codable, Equatable, Sendable {
    public let kind: String
    public let text: String
    public let storagePath: String?
    public let strokes: JSONValue?
    public let status: SubmissionStatus
}

public struct SnapshotAssignment: Codable, Equatable, Sendable {
    public let chainId: String
    public let stepIndex: Int
    public let prompt: String?
    public let previous: SnapshotPrevious?
}

public struct SnapshotTopic: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let source: String
    public let text: String
    public let position: Int
    public let usedAt: String?
    public let rejectedAt: String?
    public let presenterId: String?
}

public struct SnapshotPage: Codable, Equatable, Sendable {
    public let stepIndex: Int
    public let kind: String
    public let playerId: String
    public let storagePath: String?
    public let strokes: JSONValue?
    public let text: String
    public let status: SubmissionStatus
}

public struct SnapshotChain: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let ownerPlayerId: String
    public let position: Int
    public let originalPrompt: String
    public let acceptedAnswers: [String]
    public let countedAsMatch: Bool
    public let pages: [SnapshotPage]
}

/// The exact payload returned by the `room_snapshot(uuid)` RPC.
public struct RoomSnapshot: Codable, Equatable, Sendable {
    public let room: SnapshotRoom
    public let me: SnapshotMe
    public let players: [SnapshotPlayer]
    public let match: SnapshotMatch?
    public let assignment: SnapshotAssignment?
    public let votes: [String: Double]
    public let scores: [String: Double]
    public let answers: [String: Int]
    public let topics: [SnapshotTopic]
    public let chains: [SnapshotChain]
    public let serverTime: String
    public let error: String?
}
