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

    public func createRoom(pin: String, gameID: GameID) async throws -> CreateRoomResult {
        struct Parameters: Encodable {
            let p_pin: String
            let p_game_id: String
        }
        let request = try await authenticatedRPC(
            "create_room",
            params: Parameters(p_pin: pin, p_game_id: gameID.rawValue)
        )
        return try await Self.withTimeout(.seconds(8)) {
            try await request.execute().value
        }
    }

    public func resolveRoom(pin: String) async throws -> RoomResolution {
        struct Parameters: Encodable {
            let pin: String

            enum CodingKeys: String, CodingKey {
                case pin = "p_pin"
            }
        }
        let request = try await authenticatedRPC(
            "resolve_room_state",
            params: Parameters(pin: pin)
        )
        return try await Self.withTimeout(.seconds(8)) {
            try await request.execute().value
        }
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

        let request = try await authenticatedRPC(
            "join_room",
            params: Parameters(
                pin: pin,
                nickname: nickname,
                color: color,
                avatarSeed: avatarSeed
            )
        )
        return try await Self.withTimeout(.seconds(8)) {
            try await request.execute().value
        }
    }

    public func snapshot(roomID: String) async throws -> RoomSnapshot {
        struct Parameters: Encodable {
            let room: String

            enum CodingKeys: String, CodingKey {
                case room = "p_room"
            }
        }
        let request = try await authenticatedRPC(
            "room_snapshot",
            params: Parameters(room: roomID)
        )
        let value: RoomSnapshot = try await Self.withTimeout(.seconds(5)) {
            try await request.execute().value
        }

        if let error = value.error {
            throw RoomServiceError.invalidSnapshot(error)
        }
        return value
    }

    public func setSettings(
        roomID: String,
        gameID: GameID?,
        settings: [String: JSONValue]?
    ) async throws {
        struct Parameters: Encodable {
            let p_room: String
            let p_game_id: String?
            let p_settings: [String: JSONValue]?
        }
        let request = try await authenticatedRPC(
            "set_settings",
            params: Parameters(
                p_room: roomID,
                p_game_id: gameID?.rawValue,
                p_settings: settings
            )
        )
        _ = try await Self.withTimeout(.seconds(5)) {
            _ = try await request.execute()
            return ()
        }
    }

    public func startMatch(roomID: String, payload: StartMatchPayload) async throws {
        struct Parameters: Encodable {
            let p_room: String
            let p_prompts: [StartMatchPrompt]
            let p_topics: [StartMatchTopic]
            let p_question_order: [Int]
            let p_correct: [Int]
            let p_slide_ids: [String]
            let p_punishment_count: Int
        }
        let request = try await authenticatedRPC(
            "start_match",
            params: Parameters(
                p_room: roomID,
                p_prompts: payload.prompts,
                p_topics: payload.topics,
                p_question_order: payload.questionOrder,
                p_correct: payload.correctOptions,
                p_slide_ids: payload.slideIDs,
                p_punishment_count: payload.punishmentCount
            )
        )
        _ = try await Self.withTimeout(.seconds(8)) {
            _ = try await request.execute()
            return ()
        }
    }

    public func submitAnswer(roomID: String, option: Int) async throws {
        struct Parameters: Encodable {
            let p_room: String
            let p_option: Int
        }
        var latestError: Error?
        for attempt in 0..<3 {
            do {
                let request = try await authenticatedRPC(
                    "submit_answer", params: Parameters(p_room: roomID, p_option: option)
                )
                _ = try await Self.withTimeout(.milliseconds(2_500)) {
                    _ = try await request.execute()
                    return ()
                }
                return
            } catch {
                latestError = error
                if attempt < 2 { try? await Task.sleep(for: .milliseconds(250 * (attempt + 1))) }
            }
        }
        throw latestError ?? RoomServiceError.rejected("falha ao enviar resposta")
    }

    public func submitVote(roomID: String, rating: Int) async throws -> VoteSubmissionResult {
        struct Parameters: Encodable {
            let p_room: String
            let p_rating: Int
        }
        var latestError: Error?
        for attempt in 0..<3 {
            do {
                let request = try await authenticatedRPC(
                    "submit_vote_confirmed",
                    params: Parameters(p_room: roomID, p_rating: rating)
                )
                return try await Self.withTimeout(.milliseconds(2_500)) {
                    try await request.execute().value
                }
            } catch {
                latestError = error
                if attempt < 2 { try? await Task.sleep(for: .milliseconds(250 * (attempt + 1))) }
            }
        }
        throw latestError ?? RoomServiceError.rejected("falha ao enviar voto")
    }

    public func submitContribution(
        roomID: String,
        strokes: JSONValue?,
        text: String,
        status: SubmissionStatus
    ) async throws -> ContributionSubmissionResult {
        struct Parameters: Encodable {
            let p_room: String
            let p_storage_path: String?
            let p_strokes: JSONValue?
            let p_text: String
            let p_status: String
        }
        let parameters = Parameters(
            p_room: roomID,
            p_storage_path: nil,
            p_strokes: strokes,
            p_text: text,
            p_status: status.rawValue
        )
        var latestError: Error?
        for attempt in 0..<3 {
            do {
                let request = try await authenticatedRPC(
                    "submit_contribution", params: parameters
                )
                return try await Self.withTimeout(.milliseconds(2_500)) {
                    try await request.execute().value
                }
            } catch {
                latestError = error
                if attempt < 2 {
                    try? await Task.sleep(for: .milliseconds(250 * (attempt + 1)))
                }
            }
        }
        throw latestError ?? RoomServiceError.rejected("falha ao enviar contribuição")
    }

    public func publicDrawingURL(path: String) async -> URL? {
        try? client.storage.from("tapa-desenhos").getPublicURL(path: path)
    }

    public func advancePhase(
        roomID: String,
        expectedPhase: PartyPhase,
        expectedEndsAt: String?,
        force: Bool
    ) async throws {
        struct Parameters: Encodable {
            let p_room: String
            let p_expected_phase: String
            let p_expected_ends_at: String?
            let p_force: Bool
        }
        let request = try await authenticatedRPC(
            "advance_phase",
            params: Parameters(
                p_room: roomID,
                p_expected_phase: expectedPhase.rawValue,
                p_expected_ends_at: expectedEndsAt,
                p_force: force
            )
        )
        _ = try await Self.withTimeout(.seconds(5)) {
            _ = try await request.execute()
            return ()
        }
    }

    public func resetToLobby(roomID: String) async throws {
        struct Parameters: Encodable { let p_room: String }
        let request = try await authenticatedRPC(
            "reset_to_lobby", params: Parameters(p_room: roomID)
        )
        _ = try await Self.withTimeout(.seconds(8)) {
            _ = try await request.execute()
            return ()
        }
    }

    public func pauseRoom(roomID: String, paused: Bool) async throws {
        struct Parameters: Encodable {
            let p_room: String
            let p_paused: Bool
        }
        let request = try await authenticatedRPC(
            "pause_room", params: Parameters(p_room: roomID, p_paused: paused)
        )
        _ = try await Self.withTimeout(.seconds(5)) {
            _ = try await request.execute()
            return ()
        }
    }

    public func rerollTopic(roomID: String) async throws {
        struct Parameters: Encodable { let p_room: String }
        let request = try await authenticatedRPC(
            "reroll_topic", params: Parameters(p_room: roomID)
        )
        _ = try await Self.withTimeout(.seconds(5)) {
            _ = try await request.execute()
            return ()
        }
    }

    public func rerollPunishment(roomID: String) async throws {
        struct Parameters: Encodable { let p_room: String }
        let request = try await authenticatedRPC(
            "reroll_punishment", params: Parameters(p_room: roomID)
        )
        _ = try await Self.withTimeout(.seconds(5)) {
            _ = try await request.execute()
            return ()
        }
    }

    public func setRevealAutoplay(roomID: String, enabled: Bool) async throws {
        struct Parameters: Encodable {
            let p_room: String
            let p_on: Bool
        }
        let request = try await authenticatedRPC(
            "set_reveal_autoplay",
            params: Parameters(p_room: roomID, p_on: enabled)
        )
        _ = try await Self.withTimeout(.seconds(5)) {
            _ = try await request.execute()
            return ()
        }
    }

    public func countAsMatch(roomID: String, chainID: String) async throws {
        struct Parameters: Encodable {
            let p_room: String
            let p_chain: String
        }
        let request = try await authenticatedRPC(
            "count_as_match",
            params: Parameters(p_room: roomID, p_chain: chainID)
        )
        _ = try await Self.withTimeout(.seconds(5)) {
            _ = try await request.execute()
            return ()
        }
    }

    public func touchPresence(roomID: String) async throws {
        struct Parameters: Encodable { let p_room: String }
        let request = try await authenticatedRPC(
            "touch_presence", params: Parameters(p_room: roomID)
        )
        _ = try await Self.withTimeout(.seconds(5)) {
            _ = try await request.execute()
            return ()
        }
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

    /// A mobile request can remain pending while iOS moves from Wi-Fi to 5G.
    /// Bounding each attempt lets idempotent game actions retry within the
    /// server grace period instead of disabling the screen indefinitely.
    private static func withTimeout<Value: Sendable>(
        _ duration: Duration,
        operation: @escaping @Sendable () async throws -> Value
    ) async throws -> Value {
        try await withThrowingTaskGroup(of: Value.self) { group in
            group.addTask { try await operation() }
            group.addTask {
                try await Task.sleep(for: duration)
                try Task.checkCancellation()
                throw URLError(.timedOut)
            }
            defer { group.cancelAll() }
            guard let first = try await group.next() else {
                throw URLError(.unknown)
            }
            return first
        }
    }
}
