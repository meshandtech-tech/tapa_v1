import Foundation

public struct JoinRoomResult: Codable, Equatable, Sendable {
    public let roomID: String?
    public let playerID: String?
    public let error: String?

    enum CodingKeys: String, CodingKey {
        case roomID = "room_id"
        case playerID = "player_id"
        case error
    }
}

public struct CreateRoomResult: Codable, Equatable, Sendable {
    public let id: String
    public let pin: String
}

public struct VoteSubmissionResult: Codable, Equatable, Sendable {
    public let accepted: Bool?
    public let duplicate: Bool?
    public let skipped: String?
}

public struct ContributionSubmissionResult: Codable, Equatable, Sendable {
    public let contributionID: String?
    public let skipped: String?
    public let status: SubmissionStatus?

    enum CodingKeys: String, CodingKey {
        case contributionID = "contribution_id"
        case skipped
        case status
    }
}

public enum RoomResolutionStatus: String, Codable, Equatable, Sendable {
    case open
    case roomNotFound = "room_not_found"
    case roomClosed = "room_closed"
    case roomExpired = "room_expired"
    case invalidPIN = "invalid_pin"
    case authError = "auth_error"
}

public struct RoomResolution: Codable, Equatable, Sendable {
    public let status: RoomResolutionStatus
    public let roomID: String?

    enum CodingKeys: String, CodingKey {
        case status
        case roomID = "room_id"
    }
}

public enum RoomServiceError: LocalizedError, Equatable {
    case roomNotFound
    case roomClosed
    case roomExpired
    case invalidPIN
    case authentication
    case rejected(String)
    case invalidSnapshot(String)

    public var errorDescription: String? {
        switch self {
        case .roomNotFound:
            "Sala não encontrada. Confira o PIN."
        case .roomClosed:
            "Essa sala já foi encerrada. Peça um novo PIN ao host."
        case .roomExpired:
            "Essa sala expirou. Crie uma nova party."
        case .invalidPIN:
            "O PIN precisa ter quatro números."
        case .authentication:
            "Sua sessão expirou. Tente entrar novamente."
        case let .rejected(message):
            "Não foi possível entrar: \(message)."
        case let .invalidSnapshot(message):
            "A sala respondeu com um estado inválido: \(message)."
        }
    }
}

/// Realtime only invalidates the local snapshot. Supabase RPCs remain the
/// source of truth for every value rendered by the app.
public enum RoomObservationEvent: Equatable, Sendable {
    case connected
    case disconnected
    case changed
}

public protocol RoomService: Sendable {
    func prepareSession() async throws
    func createRoom(pin: String, gameID: GameID) async throws -> CreateRoomResult
    func resolveRoom(pin: String) async throws -> RoomResolution
    func joinRoom(pin: String, nickname: String, color: String, avatarSeed: String) async throws -> JoinRoomResult
    func snapshot(roomID: String) async throws -> RoomSnapshot
    func setSettings(
        roomID: String,
        gameID: GameID?,
        settings: [String: JSONValue]?
    ) async throws
    func startMatch(roomID: String, payload: StartMatchPayload) async throws
    func submitAnswer(roomID: String, option: Int) async throws
    func submitVote(roomID: String, rating: Int) async throws -> VoteSubmissionResult
    func submitContribution(
        roomID: String,
        strokes: JSONValue?,
        text: String,
        status: SubmissionStatus
    ) async throws -> ContributionSubmissionResult
    func publicDrawingURL(path: String) async -> URL?
    func advancePhase(
        roomID: String,
        expectedPhase: PartyPhase,
        expectedEndsAt: String?,
        force: Bool
    ) async throws
    func pauseRoom(roomID: String, paused: Bool) async throws
    func rerollTopic(roomID: String) async throws
    func rerollPunishment(roomID: String) async throws
    func setRevealAutoplay(roomID: String, enabled: Bool) async throws
    func countAsMatch(roomID: String, chainID: String) async throws
    func resetToLobby(roomID: String) async throws
    func touchPresence(roomID: String) async throws
    func roomChanges(roomID: String) async throws -> AsyncStream<RoomObservationEvent>
    func stopObserving() async
}
