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

public protocol RoomService: Sendable {
    func prepareSession() async throws
    func resolveRoom(pin: String) async throws -> RoomResolution
    func joinRoom(pin: String, nickname: String, color: String, avatarSeed: String) async throws -> JoinRoomResult
    func snapshot(roomID: String) async throws -> RoomSnapshot
    func roomChanges(roomID: String) async throws -> AsyncStream<Void>
    func stopObserving() async
}
