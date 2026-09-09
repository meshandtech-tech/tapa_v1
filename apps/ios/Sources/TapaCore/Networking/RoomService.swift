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

public enum RoomServiceError: LocalizedError, Equatable {
    case roomNotFound
    case rejected(String)
    case invalidSnapshot(String)

    public var errorDescription: String? {
        switch self {
        case .roomNotFound:
            "Sala não encontrada. Confira o PIN."
        case let .rejected(message):
            "Não foi possível entrar: \(message)."
        case let .invalidSnapshot(message):
            "A sala respondeu com um estado inválido: \(message)."
        }
    }
}

public protocol RoomService: Sendable {
    func prepareSession() async throws
    func resolveRoom(pin: String) async throws -> String?
    func joinRoom(pin: String, nickname: String, color: String, avatarSeed: String) async throws -> JoinRoomResult
    func snapshot(roomID: String) async throws -> RoomSnapshot
    func roomChanges(roomID: String) async throws -> AsyncStream<Void>
    func stopObserving() async
}
