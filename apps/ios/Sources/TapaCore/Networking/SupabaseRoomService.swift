import Foundation
import Supabase

public actor SupabaseRoomService: RoomService {
    private let client: SupabaseClient
    private var channel: RealtimeChannelV2?
    private var rpcAccessToken: String?

    public init(configuration: TapaConfiguration) {
        client = SupabaseClient(
            supabaseURL: configuration.supabaseURL,
            supabaseKey: configuration.supabaseAnonKey
        )
    }

    public func prepareSession() async throws {
        guard let currentSession = client.auth.currentSession else {
            let session = try await client.auth.signInAnonymously()
            rpcAccessToken = session.accessToken
            return
        }

        do {
            let validSession = try await client.auth.session
            _ = try await client.auth.user(jwt: validSession.accessToken)
            rpcAccessToken = validSession.accessToken
        } catch AuthError.sessionMissing where currentSession.user.isAnonymous {
            try await replaceAnonymousSession()
        } catch let AuthError.api(_, _, _, response)
            where currentSession.user.isAnonymous && [401, 403, 404].contains(response.statusCode)
        {
            // Only replace terminal anonymous sessions. A transport failure is
            // propagated and a future permanent account is never discarded.
            try await replaceAnonymousSession()
        }
    }

    public func resolveRoom(pin: String) async throws -> RoomResolution {
        struct Parameters: Encodable {
            let pin: String

            enum CodingKeys: String, CodingKey {
                case pin = "p_pin"
            }
        }
        return try await authenticatedRPC(
            "resolve_room_state",
            params: Parameters(pin: pin)
        )
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

        return try await authenticatedRPC(
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
        let value: RoomSnapshot = try await authenticatedRPC(
            "room_snapshot",
            params: Parameters(room: roomID)
        )
            .execute()
            .value

        if let error = value.error {
            throw RoomServiceError.invalidSnapshot(error)
        }
        return value
    }

    public func submitAnswer(roomID: String, option: Int) async throws {
        struct Parameters: Encodable {
            let p_room: String
            let p_option: Int
        }
        _ = try await authenticatedRPC(
            "submit_answer", params: Parameters(p_room: roomID, p_option: option)
        ).execute()
    }

    public func roomChanges(roomID: String) async throws -> AsyncStream<RoomObservationEvent> {
        await stopObserving()

        let nextChannel = client.channel("ios-room-\(roomID)")
        channel = nextChannel
        let statusChanges = nextChannel.statusChange
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

        return AsyncStream(bufferingPolicy: .bufferingNewest(1)) { continuation in
            let tasks = [playerChanges, roomChanges, matchChanges].map { changes in
                Task {
                    for await _ in changes {
                        guard !Task.isCancelled else { break }
                        continuation.yield(.changed)
                    }
                }
            }

            let statusTask = Task {
                var wasConnected = false
                for await status in statusChanges {
                    guard !Task.isCancelled else { break }
                    switch status {
                    case .subscribed:
                        wasConnected = true
                        continuation.yield(.connected)
                    case .unsubscribed where wasConnected:
                        continuation.yield(.disconnected)
                    case .unsubscribed, .subscribing, .unsubscribing:
                        break
                    }
                }
            }

            continuation.onTermination = { _ in
                tasks.forEach { $0.cancel() }
                statusTask.cancel()
            }
        }
    }

    public func stopObserving() async {
        guard let channel else { return }
        await client.removeChannel(channel)
        self.channel = nil
    }

    /// Supabase normally injects the current access token through its request
    /// adapter. Supplying it on each authoritative RPC also removes the brief
    /// cold-start window where a newly restored/created anonymous session can
    /// otherwise be sent with the publishable key's `anon` role.
    private func authenticatedRPC<Parameters: Encodable>(
        _ function: String,
        params: Parameters
    ) async throws -> PostgrestFilterBuilder {
        let token: String
        do {
            let session = try await client.auth.session
            token = session.accessToken
            rpcAccessToken = token
        } catch AuthError.sessionMissing {
            // `signInAnonymously()` already returned a valid JWT. On a fresh
            // simulator install the SDK's Keychain-backed lookup can lag or be
            // unavailable, so the first RPC uses that in-memory token directly.
            guard let rpcAccessToken else {
                throw RoomServiceError.authentication
            }
            token = rpcAccessToken
        }

        return try client
            .rpc(function, params: params)
            .setHeader(
                name: "Authorization",
                value: "Bearer \(token)"
            )
    }

    private func replaceAnonymousSession() async throws {
        rpcAccessToken = nil
        try? await client.auth.signOut(scope: .local)
        let session = try await client.auth.signInAnonymously()
        rpcAccessToken = session.accessToken
    }
}
