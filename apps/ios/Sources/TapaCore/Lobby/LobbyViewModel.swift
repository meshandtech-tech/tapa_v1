import Foundation
import Observation

@MainActor
@Observable
public final class LobbyViewModel {
    struct SavedRoomSession: Codable, Equatable, Sendable {
        let pin: String
        let nickname: String
    }

    public enum ViewState: Equatable, Sendable {
        case idle
        case connecting
        case joined
        case failed(String)
    }

    public enum ConnectionState: Equatable, Sendable {
        case idle
        case connected
        case reconnecting
    }

    public var pin = ""
    public var nickname = ""
    public private(set) var state: ViewState = .idle
    public private(set) var connectionState: ConnectionState = .idle
    public private(set) var lastConnectionError: String?
    public private(set) var snapshot: RoomSnapshot?
    public private(set) var serverOffset: TimeInterval = 0
    public private(set) var isSubmitting = false
    public private(set) var actionError: String?

    @ObservationIgnored private let service: any RoomService
    @ObservationIgnored private let reconnectDelay: @Sendable (Int) async -> Void
    @ObservationIgnored private let loadSavedSession: () -> SavedRoomSession?
    @ObservationIgnored private let saveSession: (SavedRoomSession) -> Void
    @ObservationIgnored private var observationTask: Task<Void, Never>?
    @ObservationIgnored private var roomID: String?
    @ObservationIgnored private var latestAdvanceAttempt: (key: String, at: Date)?

    public init(service: any RoomService) {
        self.service = service
        loadSavedSession = Self.loadPersistedSession
        saveSession = Self.persistSession
        reconnectDelay = { attempt in
            let seconds = min(1 << min(max(attempt - 1, 0), 3), 5)
            try? await Task.sleep(for: .seconds(seconds))
        }
    }

    init(
        service: any RoomService,
        reconnectDelay: @escaping @Sendable (Int) async -> Void,
        loadSavedSession: @escaping () -> SavedRoomSession? = { nil },
        saveSession: @escaping (SavedRoomSession) -> Void = { _ in }
    ) {
        self.service = service
        self.reconnectDelay = reconnectDelay
        self.loadSavedSession = loadSavedSession
        self.saveSession = saveSession
    }

    public var canJoin: Bool {
        normalizedPIN.count == 4
            && !nickname.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && state != .connecting
    }

    public var canCreate: Bool {
        !nickname.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && state != .connecting
    }

    public var isHost: Bool {
        guard let snapshot, snapshot.me.playerId != nil else { return false }
        return snapshot.me.playerId == snapshot.room.hostPlayerId
    }

    public var canCountCurrentDrawingAsMatch: Bool {
        guard let snapshot, isHost, snapshot.room.gameId == .drawingTelephone,
              snapshot.room.phase == .revealPage, let match = snapshot.match,
              match.revealPageIndex == match.stepCount + 1,
              snapshot.chains.indices.contains(match.revealChainIndex)
        else { return false }
        let chain = snapshot.chains[match.revealChainIndex]
        guard !chain.countedAsMatch else { return false }
        let finalGuess = chain.pages
            .filter { $0.kind == "guess" }
            .max { $0.stepIndex < $1.stepIndex }?.text ?? ""
        return !AnswerMatcher.matches(
            guess: finalGuess,
            prompt: chain.originalPrompt,
            acceptedAnswers: chain.acceptedAnswers
        )
    }

    public func join() async {
        guard canJoin else { return }
        state = .connecting
        connectionState = .reconnecting
        lastConnectionError = nil

        do {
            try await service.prepareSession()
            let resolution = try await service.resolveRoom(pin: normalizedPIN)
            guard resolution.status == .open, let roomID = resolution.roomID else {
                switch resolution.status {
                case .roomNotFound: throw RoomServiceError.roomNotFound
                case .roomClosed: throw RoomServiceError.roomClosed
                case .roomExpired: throw RoomServiceError.roomExpired
                case .invalidPIN: throw RoomServiceError.invalidPIN
                case .authError: throw RoomServiceError.authentication
                case .open: throw RoomServiceError.roomNotFound
                }
            }

            let result = try await service.joinRoom(
                pin: normalizedPIN,
                nickname: nickname.trimmingCharacters(in: .whitespacesAndNewlines),
                color: Self.playerColors.randomElement() ?? "#ff5c8a",
                avatarSeed: UUID().uuidString.lowercased()
            )
            if let message = result.error {
                throw RoomServiceError.rejected(message)
            }

            self.roomID = result.roomID ?? roomID
            try await refresh()
            state = .joined
            saveSession(SavedRoomSession(pin: normalizedPIN, nickname: nickname.trimmingCharacters(in: .whitespacesAndNewlines)))
            observeRoom()
        } catch {
            connectionState = .idle
            state = .failed(Self.message(for: error))
        }
    }

    /// Creates the authoritative room and immediately joins it with the same
    /// anonymous identity. `create_room` resolves PIN collisions atomically
    /// and returns the actual PIN that must be shared.
    public func create(gameID: GameID) async {
        guard canCreate else { return }
        state = .connecting
        connectionState = .reconnecting
        lastConnectionError = nil

        do {
            try await service.prepareSession()
            let proposedPIN = String(format: "%04d", Int.random(in: 0...9_999))
            let room = try await service.createRoom(pin: proposedPIN, gameID: gameID)
            pin = room.pin
            // Reuse the regular join path so host creation has exactly the
            // same validation, snapshot confirmation and persistence.
            state = .idle
            connectionState = .idle
            await join()
        } catch {
            connectionState = .idle
            state = .failed(Self.isNetworkError(error)
                ? "Falha temporária de rede. Verifique sua conexão e tente novamente."
                : "Não foi possível criar a sala. Tente novamente.")
        }
    }

    public func retry() async {
        await join()
    }

    public func stop() {
        observationTask?.cancel()
        observationTask = nil
        connectionState = .idle
        Task { await service.stopObserving() }
    }

    /// Restores the room after a process relaunch, or reconciles the current
    /// room after returning from the background. The anonymous Supabase
    /// identity remains the server-side source of the player identity.
    public func activate() async {
        if state == .joined {
            await resume()
            return
        }
        guard state == .idle, let saved = loadSavedSession() else { return }
        pin = saved.pin
        nickname = saved.nickname
        await join()
    }

    /// Called when the app becomes active. The snapshot is refreshed before
    /// Realtime is subscribed again so background gaps never become game state.
    public func resume() async {
        guard state == .joined, let roomID else { return }

        let previousTask = observationTask
        observationTask = nil
        previousTask?.cancel()
        // Closing the socket first also releases a subscription attempt that
        // was suspended during the network switch. Waiting first could leave
        // foreground recovery stuck behind the old connection.
        await service.stopObserving()
        await previousTask?.value

        connectionState = .reconnecting
        do {
            try await service.prepareSession()
            try await service.touchPresence(roomID: roomID)
            try await refresh()
            lastConnectionError = nil
        } catch {
            lastConnectionError = Self.message(for: error)
        }
        observeRoom()
    }

    private var normalizedPIN: String {
        String(pin.filter(\.isNumber).prefix(4))
    }

    private func refresh() async throws {
        guard let roomID else { return }
        let received = try await service.snapshot(roomID: roomID)
        guard self.roomID == roomID else { return }
        if let current = snapshot,
           let old = RoomSnapshot.parseDate(current.serverTime),
           let new = RoomSnapshot.parseDate(received.serverTime), new < old { return }
        if snapshot?.quizRoundKey != received.quizRoundKey || snapshot?.room.phase != received.room.phase {
            actionError = nil
        }
        snapshot = received
        if let server = RoomSnapshot.parseDate(received.serverTime) {
            serverOffset = server.timeIntervalSinceNow
        }
        await requestAdvanceIfEligible(received)
    }

    /// Any connected participant may ask for a due transition. The RPC uses
    /// compare-and-set and the database rechecks deadline/all-submitted, so
    /// simultaneous phones cannot skip a phase.
    private func requestAdvanceIfEligible(_ snapshot: RoomSnapshot) async {
        guard snapshot.room.pausedAt == nil else { return }
        let due = snapshot.secondsRemaining(at: Date(), serverOffset: serverOffset) == 0
        let allDone: Bool
        let seats = Set(snapshot.match?.seatOrder ?? [])
        switch snapshot.room.phase {
        case .roundActive:
            allDone = !seats.isEmpty && seats.isSubset(of: Set(snapshot.answers.keys))
        case .drawStep, .guessStep:
            allDone = !seats.isEmpty
                && seats.isSubset(of: Set(snapshot.match?.submittedPlayerIds ?? []))
        case .voting:
            var eligible = seats
            if let presenter = snapshot.currentPresenter?.id { eligible.remove(presenter) }
            allDone = !eligible.isEmpty && eligible.isSubset(of: Set(snapshot.votes.keys))
        default:
            allDone = false
        }
        guard due || allDone else { return }
        let key = "\(snapshot.actionRoundKey):\(snapshot.room.phaseEndsAt ?? "none")"
        if let attempt = latestAdvanceAttempt, attempt.key == key,
           Date().timeIntervalSince(attempt.at) < 2 { return }
        latestAdvanceAttempt = (key, Date())
        do {
            try await service.advancePhase(
                roomID: snapshot.room.id,
                expectedPhase: snapshot.room.phase,
                expectedEndsAt: snapshot.room.phaseEndsAt,
                force: false
            )
        } catch {
            lastConnectionError = Self.message(for: error)
        }
    }

    /// Low-frequency recovery when an invalidation is lost; owned by the root
    /// view task, never by a particular phase's view.
    public func synchronize() async {
        guard state == .joined else { return }
        do {
            try await refresh()
            lastConnectionError = nil
        } catch {
            lastConnectionError = Self.message(for: error)
        }
    }

    public var hasAnswered: Bool {
        guard let snapshot else { return false }
        // Quiz submissions live in answers, not the drawing game's submitted IDs.
        return snapshot.myAnswer != nil
    }

    public var hasCurrentDrawingSubmission: Bool {
        snapshot?.me.submitted == true
    }

    public func submitAnswer(_ option: Int) async {
        guard let snapshot, snapshot.room.gameId == .quemErraPaga,
              snapshot.room.phase == .roundActive, snapshot.isQuizParticipant,
              snapshot.room.pausedAt == nil, !hasAnswered, !isSubmitting,
              (0..<4).contains(option),
              (snapshot.secondsRemaining(at: Date(), serverOffset: serverOffset) ?? 1) > 0
        else { return }
        let roundKey = snapshot.quizRoundKey
        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            try await service.submitAnswer(roomID: snapshot.room.id, option: option)
        } catch {
            // A network error may arrive after the server persisted the answer.
            // Reconcile below instead of assuming either success or failure.
        }
        await synchronize()
        if self.snapshot?.quizRoundKey == roundKey, !hasAnswered {
            actionError = "Não conseguimos confirmar sua resposta. Tente novamente."
        }
    }

    public func changeGame(to gameID: GameID) async {
        guard let snapshot, isHost, snapshot.room.phase == .lobby,
              snapshot.room.gameId != gameID, !isSubmitting
        else { return }
        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            try await service.setSettings(
                roomID: snapshot.room.id, gameID: gameID, settings: nil
            )
        } catch {
            // Confirm the room below in case the response was lost.
        }
        await synchronize()
        if self.snapshot?.room.gameId != gameID {
            actionError = "O jogo da sala não mudou. Tente novamente."
        }
    }

    public func changeDifficulty(to difficulty: GameDifficulty) async {
        guard let snapshot, isHost, snapshot.room.phase == .lobby,
              snapshot.room.difficulty != difficulty, !isSubmitting
        else { return }
        var settings = snapshot.room.settings
        settings["difficulty"] = .string(difficulty.rawValue)
        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            try await service.setSettings(
                roomID: snapshot.room.id, gameID: nil, settings: settings
            )
        } catch {
            // Confirm the room below in case the response was lost.
        }
        await synchronize()
        if self.snapshot?.room.difficulty != difficulty {
            actionError = "A dificuldade não mudou. Tente novamente."
        }
    }

    public func startMatch() async {
        guard let snapshot, isHost,
              snapshot.room.phase == .lobby || snapshot.room.phase == .gameOver,
              snapshot.players.count >= snapshot.room.gameId.minimumPlayers,
              !isSubmitting
        else { return }
        let initialPhase = snapshot.room.phase
        guard let payload = HostGameCatalog.bundled?.payload(
            gameID: snapshot.room.gameId,
            difficulty: snapshot.room.difficulty,
            playerCount: snapshot.players.count,
            customTopics: snapshot.room.customDebateTopics.map(\.startMatchTopic)
        ) else {
            actionError = "O conteúdo deste jogo não está disponível nesta versão."
            return
        }

        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            try await service.startMatch(roomID: snapshot.room.id, payload: payload)
        } catch {
            // The transaction may have committed before transport failed.
            // Reconcile before presenting a retry.
        }
        await synchronize()
        if self.snapshot?.room.phase == initialPhase {
            actionError = "A partida não começou. Confira os jogadores e tente novamente."
        }
    }

    public func addCustomDebateTopic(_ text: String) async {
        guard let snapshot, isHost, snapshot.room.phase == .lobby,
              snapshot.room.gameId == .advogadoDoDiabo,
              snapshot.room.customDebateTopics.count < 10, !isSubmitting
        else { return }
        let clean = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(140))
        guard !clean.isEmpty else { return }
        let topic = CustomDebateTopic(
            id: "c-\(UUID().uuidString.lowercased().prefix(8))",
            text: clean
        )
        await saveCustomDebateTopics(snapshot.room.customDebateTopics + [topic])
    }

    public func removeCustomDebateTopic(id: String) async {
        guard let snapshot, isHost, snapshot.room.phase == .lobby,
              snapshot.room.gameId == .advogadoDoDiabo, !isSubmitting
        else { return }
        let topics = snapshot.room.customDebateTopics.filter { $0.id != id }
        guard topics.count != snapshot.room.customDebateTopics.count else { return }
        await saveCustomDebateTopics(topics)
    }

    private func saveCustomDebateTopics(_ topics: [CustomDebateTopic]) async {
        guard let snapshot else { return }
        var settings = snapshot.room.settings
        settings["customTopics"] = .array(topics.map(\.jsonValue))
        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            try await service.setSettings(
                roomID: snapshot.room.id, gameID: nil, settings: settings
            )
        } catch {
            // The snapshot remains the only success confirmation.
        }
        await synchronize()
        if self.snapshot?.room.customDebateTopics != topics {
            actionError = "As teses da casa não foram salvas. Tente novamente."
        }
    }

    public func forceAdvance() async {
        guard let snapshot, isHost, snapshot.room.phase != .lobby,
              snapshot.room.phase != .gameOver, !isSubmitting
        else { return }
        let actionKey = snapshot.actionRoundKey
        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            try await service.advancePhase(
                roomID: snapshot.room.id,
                expectedPhase: snapshot.room.phase,
                expectedEndsAt: snapshot.room.phaseEndsAt,
                force: true
            )
        } catch {
            // A response can be lost after the transaction commits.
        }
        await synchronize()
        if self.snapshot?.actionRoundKey == actionKey {
            actionError = "O servidor não confirmou a próxima fase. Tente novamente."
        }
    }

    public func resetToLobby() async {
        guard let snapshot, isHost, snapshot.room.phase == .gameOver, !isSubmitting else { return }
        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            try await service.resetToLobby(roomID: snapshot.room.id)
        } catch {
            // Reconcile because the reset may have committed before the
            // transport reported a failure.
        }
        await synchronize()
        if self.snapshot?.room.phase != .lobby {
            actionError = "A sala não voltou ao lobby. Tente novamente."
        }
    }

    public func setPaused(_ paused: Bool) async {
        guard let snapshot, isHost, snapshot.room.phaseEndsAt != nil,
              snapshot.room.phase != .lobby, snapshot.room.phase != .gameOver,
              !isSubmitting
        else { return }
        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            try await service.pauseRoom(roomID: snapshot.room.id, paused: paused)
        } catch {
            // Always confirm the authoritative paused_at value below.
        }
        await synchronize()
        let confirmed = paused
            ? self.snapshot?.room.pausedAt != nil
            : self.snapshot?.room.pausedAt == nil
        if !confirmed {
            actionError = paused
                ? "Não conseguimos pausar a partida. Tente novamente."
                : "Não conseguimos retomar a partida. Tente novamente."
        }
    }

    public func rerollTopic() async {
        guard let snapshot, isHost, snapshot.room.gameId == .advogadoDoDiabo,
              snapshot.room.phase == .topicReveal || snapshot.room.phase == .preparation,
              !isSubmitting
        else { return }
        let previousTopic = snapshot.currentTopicText
        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            try await service.rerollTopic(roomID: snapshot.room.id)
        } catch {
            // Snapshot confirmation handles a response lost after commit.
        }
        await synchronize()
        if self.snapshot?.room.phase != .topicSpin,
           self.snapshot?.currentTopicText == previousTopic {
            actionError = "A tese não mudou. Tente novamente."
        }
    }

    public func rerollPunishment() async {
        guard let snapshot, isHost, snapshot.room.gameId == .quemErraPaga,
              snapshot.room.phase == .forfeitWheel, !isSubmitting
        else { return }
        let previous = snapshot.match?.punishmentIndex
        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            try await service.rerollPunishment(roomID: snapshot.room.id)
        } catch {
            // Snapshot confirmation handles a response lost after commit.
        }
        await synchronize()
        if self.snapshot?.match?.punishmentIndex == previous {
            actionError = "A roleta não confirmou uma nova prenda. Tente novamente."
        }
    }

    public func setRevealAutoplay(_ enabled: Bool) async {
        guard let snapshot, isHost, snapshot.room.gameId == .drawingTelephone,
              snapshot.room.phase == .revealPage, !isSubmitting
        else { return }
        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            try await service.setRevealAutoplay(roomID: snapshot.room.id, enabled: enabled)
        } catch {
            // Confirm from the snapshot even if the response was lost.
        }
        await synchronize()
        if self.snapshot?.match?.revealAutoplay != enabled {
            actionError = "O modo automático não foi confirmado. Tente novamente."
        }
    }

    public func countCurrentDrawingAsMatch() async {
        guard let snapshot, canCountCurrentDrawingAsMatch, let match = snapshot.match,
              snapshot.chains.indices.contains(match.revealChainIndex), !isSubmitting
        else { return }
        let chainID = snapshot.chains[match.revealChainIndex].id
        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            try await service.countAsMatch(roomID: snapshot.room.id, chainID: chainID)
        } catch {
            // Confirm from the snapshot even if the response was lost.
        }
        await synchronize()
        if self.snapshot?.chains.first(where: { $0.id == chainID })?.countedAsMatch != true {
            actionError = "O acerto manual não foi confirmado. Tente novamente."
        }
    }

    public func submitVote(_ rating: Int) async {
        guard let snapshot, snapshot.room.phase == .voting,
              snapshot.isMatchParticipant, !snapshot.isCurrentPresenter,
              let playerID = snapshot.me.playerId,
              snapshot.votes[playerID] == nil,
              (1...5).contains(rating), !isSubmitting
        else { return }
        let actionKey = snapshot.actionRoundKey
        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            let result = try await service.submitVote(roomID: snapshot.room.id, rating: rating)
            guard result.accepted == true, result.skipped == nil else {
                throw RoomServiceError.rejected(result.skipped ?? "voto recusado")
            }
            await synchronize()
        } catch {
            await synchronize()
        }
        if self.snapshot?.actionRoundKey == actionKey,
           self.snapshot?.votes[playerID] == nil {
            actionError = "A rede não confirmou seu voto. Toque novamente."
        }
    }

    public func submitGuess(_ text: String) async {
        let clean = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(60))
        guard !clean.isEmpty else { return }
        await submitDrawingContribution(strokes: nil, text: clean, status: .submitted)
    }

    public func submitDrawing(strokes: JSONValue, status: SubmissionStatus = .submitted) async {
        await submitDrawingContribution(strokes: strokes, text: "", status: status)
    }

    public func publicDrawingURL(path: String) async -> URL? {
        await service.publicDrawingURL(path: path)
    }

    public func touchPresence() async {
        guard state == .joined, let roomID else { return }
        try? await service.touchPresence(roomID: roomID)
    }

    private func submitDrawingContribution(
        strokes: JSONValue?,
        text: String,
        status: SubmissionStatus
    ) async {
        guard let snapshot,
              snapshot.room.phase == .drawStep || snapshot.room.phase == .guessStep,
              snapshot.isMatchParticipant, snapshot.assignment != nil,
              !snapshot.me.submitted, !isSubmitting
        else { return }
        let actionKey = snapshot.actionRoundKey
        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            let result = try await service.submitContribution(
                roomID: snapshot.room.id, strokes: strokes, text: text, status: status
            )
            guard result.contributionID != nil, result.skipped == nil else {
                throw RoomServiceError.rejected(result.skipped ?? "contribuição recusada")
            }
            await synchronize()
        } catch {
            await synchronize()
        }
        if self.snapshot?.actionRoundKey == actionKey,
           self.snapshot?.me.submitted != true {
            actionError = text.isEmpty
                ? "Seu desenho continua salvo nesta tela. Tente enviar novamente."
                : "Seu palpite continua aqui. Tente enviar novamente."
        }
    }

    private func observeRoom() {
        observationTask?.cancel()
        guard let roomID else { return }
        connectionState = .reconnecting
        let reconnectDelay = reconnectDelay

        observationTask = Task { [weak self, service] in
            var attempt = 0

            while !Task.isCancelled {
                do {
                    let events = try await service.roomChanges(roomID: roomID)

                    eventLoop: for await event in events {
                        guard !Task.isCancelled, let self else { break eventLoop }

                        switch event {
                        case .connected, .changed:
                            do {
                                try await self.refresh()
                                self.connectionState = .connected
                                self.lastConnectionError = nil
                                attempt = 0
                            } catch {
                                self.connectionState = .reconnecting
                                self.lastConnectionError = Self.message(for: error)
                                break eventLoop
                            }
                        case .disconnected:
                            self.connectionState = .reconnecting
                            break eventLoop
                        }
                    }
                } catch {
                    guard !Task.isCancelled, let self else { break }
                    self.connectionState = .reconnecting
                    self.lastConnectionError = Self.message(for: error)
                }

                await service.stopObserving()
                guard !Task.isCancelled else { break }

                attempt += 1
                await reconnectDelay(attempt)
            }
        }
    }

    private static let playerColors = [
        "#ff5c8a", "#ffb703", "#3ddc97", "#4cc9f0", "#b892ff",
        "#ff8c42", "#06d6a0", "#ef476f", "#8ecae6", "#c9ff4c",
    ]

    private static let persistedSessionKey = "tapa.joined-room.v1"

    private static func loadPersistedSession() -> SavedRoomSession? {
        guard let data = UserDefaults.standard.data(forKey: persistedSessionKey) else { return nil }
        return try? JSONDecoder().decode(SavedRoomSession.self, from: data)
    }

    private static func persistSession(_ session: SavedRoomSession) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        UserDefaults.standard.set(data, forKey: persistedSessionKey)
    }

    private static func message(for error: Error) -> String {
        if isNetworkError(error) {
            return "Falha temporária de rede. Verifique sua conexão e tente novamente."
        }

        return error.localizedDescription
    }

    private static func isNetworkError(_ error: Error) -> Bool {
        if error is URLError { return true }

        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain { return true }

        let message = nsError.localizedDescription.lowercased()
        return message.contains("network")
            || message.contains("offline")
            || message.contains("timed out")
            || message.contains("timeout")
            || message.contains("internet connection")
            || message.contains("fetch")
    }
}
