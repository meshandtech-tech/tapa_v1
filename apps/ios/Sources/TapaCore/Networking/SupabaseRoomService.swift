import Foundation
import Supabase

public actor SupabaseRoomService: RoomService {
    private let client: SupabaseClient
    private var channel: RealtimeChannelV2?

    public init(configuration: TapaConfiguration) {
        client = SupabaseClient(
            supabaseURL: configuration.supabaseURL,
            supabaseKey: configuration.supabaseAnonKey
        )
    }

    public func prepareSession() async throws {
        if client.auth.currentSession == nil {
            _ = try await client.auth.signInAnonymously()
        }
    }

    public func resolveRoom(pin: String) async throws -> RoomResolution {
        struct Parameters: Encodable {
            let pin: String

            enum CodingKeys: String, CodingKey {
                case pin = "p_pin"
            }
        }
        return try await client
            .rpc("resolve_room_state", params: Parameters(pin: pin))
            .execute()
            .value
    }

    public func joinRoom(
        pin: String,
        nickname: String,
        color: String,
        avatarSeed: String
    ) async throws -> JoinRoomResult {
        struct Parameters: Encodable {
            let pin: String
            let nickname: String
            let color: String
            let avatarSeed: String

            enum CodingKeys: String, CodingKey {
                case pin = "p_pin"
                case nickname = "p_nickname"
                case color = "p_color"
                case avatarSeed = "p_avatar_seed"
            }
        }

        return try await client
            .rpc(
                "join_room",
                params: Parameters(
                    pin: pin,
                    nickname: nickname,
                    color: color,
                    avatarSeed: avatarSeed
                )
            )
            .execute()
            .value
    }

    public func snapshot(roomID: String) async throws -> RoomSnapshot {
        struct Parameters: Encodable {
            let room: String

            enum CodingKeys: String, CodingKey {
                case room = "p_room"
            }
        }
        let value: RoomSnapshot = try await client
            .rpc("room_snapshot", params: Parameters(room: roomID))
            .execute()
            .value

        if let error = value.error {
            throw RoomServiceError.invalidSnapshot(error)
        }
        return value
    }

    public func roomChanges(roomID: String) async throws -> AsyncStream<Void> {
        await stopObserving()

        let nextChannel = client.channel("ios-room-\(roomID)")
        channel = nextChannel
        let playerChanges = nextChannel.postgresChange(
            AnyAction.self,
            schema: "public",
            table: "players",
            filter: .eq("room_id", value: roomID)
        )
        let roomChanges = nextChannel.postgresChange(
            AnyAction.self,
            schema: "public",
            table: "rooms",
            filter: .eq("id", value: roomID)
        )
        let matchChanges = nextChannel.postgresChange(
            AnyAction.self,
            schema: "public",
            table: "matches",
            filter: .eq("room_id", value: roomID)
        )
        try await nextChannel.subscribeWithError()

        return AsyncStream { continuation in
            let tasks = [playerChanges, roomChanges, matchChanges].map { changes in
                Task {
                    for await _ in changes {
                        guard !Task.isCancelled else { break }
                        continuation.yield()
                    }
                }
            }

            continuation.onTermination = { _ in
                tasks.forEach { $0.cancel() }
            }
        }
    }

    public func stopObserving() async {
        guard let channel else { return }
        await client.removeChannel(channel)
        self.channel = nil
    }
}
