import Foundation
import XCTest
@testable import TapaCore

@MainActor
final class LobbyViewModelTests: XCTestCase {
    func testCreateRoomUsesConfirmedPinAndJoinsHost() async throws {
        let service = RoomServiceMock(snapshot: try fixture("lobby"))
        await service.configureCreatedRoom(.init(
            id: "b14c6ca7-929b-47aa-a2ab-3281420e6c66",
            pin: "0427"
        ))
        let model = makeModel(service: service)
        model.nickname = "Nick"

        await model.create(gameID: .drawingTelephone)

        XCTAssertEqual(model.state, .joined)
        XCTAssertEqual(model.pin, "0427")
        let requests = await service.createRequests()
        XCTAssertEqual(requests.count, 1)
        XCTAssertEqual(requests.first?.gameID, .drawingTelephone)
        model.stop()
    }

    func testHostStartsMatchWithPayloadAndAuthoritativeConfirmation() async throws {
        let lobby = try fixture("lobby_two_players")
        let started = try snapshotByChanging(lobby) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["phase"] = "GAME_INTRO"
                payload["room"] = room
            }
        }
        let service = RoomServiceMock(snapshot: lobby)
        await service.configureStartedMatch(started)
        let model = makeModel(service: service)
        model.pin = "0427"
        model.nickname = "Nick"
        await model.join()

        await model.startMatch()

        XCTAssertEqual(model.snapshot?.room.phase, .gameIntro)
        XCTAssertNil(model.actionError)
        let payloads = await service.startPayloads()
        XCTAssertEqual(payloads.count, 1)
        XCTAssertEqual(payloads.first?.questionOrder.count, 10)
        XCTAssertEqual(payloads.first?.correctOptions.count, 10)
        model.stop()
    }

    func testHostChangesLobbyGameThroughAuthoritativeSettings() async throws {
        let lobby = try fixture("lobby_two_players")
        let changed = try snapshotByChanging(lobby) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["gameId"] = "advogado-do-diabo"
                payload["room"] = room
            }
        }
        let service = RoomServiceMock(snapshot: lobby)
        await service.configureSettings(snapshot: changed)
        let model = makeModel(service: service)
        model.pin = "0427"
        model.nickname = "Nick"
        await model.join()

        await model.changeGame(to: .advogadoDoDiabo)

        XCTAssertEqual(model.snapshot?.room.gameId, .advogadoDoDiabo)
        XCTAssertNil(model.actionError)
        let requests = await service.settingsRequests()
        XCTAssertEqual(requests.last?.gameID, .advogadoDoDiabo)
        XCTAssertNil(requests.last?.settings)
        model.stop()
    }

    func testHostAddsDebateTopicWithoutErasingOtherSettings() async throws {
        let debateLobby = try snapshotByChanging(try fixture("lobby_two_players")) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["gameId"] = "advogado-do-diabo"
                payload["room"] = room
            }
        }
        let service = RoomServiceMock(snapshot: debateLobby)
        await service.configureSettingsEcho()
        let model = makeModel(service: service)
        model.pin = "0427"
        model.nickname = "Nick"
        await model.join()

        await model.addCustomDebateTopic("Tese do iPhone")

        XCTAssertNil(model.actionError)
        XCTAssertEqual(model.snapshot?.room.customDebateTopics.map(\.text), ["Tese do iPhone"])
        let requests = await service.settingsRequests()
        let settings = try XCTUnwrap(requests.last?.settings)
        XCTAssertEqual(settings["difficulty"], .string("medium"))
        XCTAssertEqual(settings["maxPlayers"], .number(10))
        guard case let .array(topics) = settings["customTopics"] else {
            return XCTFail("Expected customTopics array")
        }
        XCTAssertEqual(topics.count, 1)
        model.stop()
    }

    func testHostForceAdvanceUsesCompareAndSetAndConfirmsPhase() async throws {
        let voting = try snapshotByChanging(try fixture("game_voting")) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["hostPlayerId"] = "player-2"
                payload["room"] = room
            }
        }
        let results = try snapshotByChanging(try fixture("game_results")) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["hostPlayerId"] = "player-2"
                payload["room"] = room
            }
        }
        let service = RoomServiceMock(snapshot: voting)
        await service.configureAdvancedPhase(results)
        let model = makeModel(service: service)
        model.pin = "7319"
        model.nickname = "Bia"
        await model.join()

        await model.forceAdvance()

        XCTAssertEqual(model.snapshot?.room.phase, .scoreReveal)
        XCTAssertNil(model.actionError)
        let requests = await service.advanceRequests()
        XCTAssertEqual(requests.last?.phase, .voting)
        XCTAssertEqual(requests.last?.force, true)
        model.stop()
    }

    func testHostCanResetFinishedGameToLobby() async throws {
        let finished = try snapshotByChanging(try fixture("game_over")) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["hostPlayerId"] = "player-2"
                payload["room"] = room
            }
        }
        let lobby = try snapshotByChanging(finished) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["phase"] = "LOBBY"
                payload["room"] = room
            }
        }
        let service = RoomServiceMock(snapshot: finished)
        await service.configureReset(snapshot: lobby)
        let model = makeModel(service: service)
        model.pin = "0427"
        model.nickname = "Bia"
        await model.join()

        await model.resetToLobby()

        XCTAssertEqual(model.snapshot?.room.phase, .lobby)
        let resetCount = await service.resetCount()
        XCTAssertEqual(resetCount, 1)
        XCTAssertNil(model.actionError)
        model.stop()
    }

    func testHostPauseIsConfirmedByAuthoritativeSnapshot() async throws {
        let active = try snapshotByChanging(try fixture("game_question")) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["hostPlayerId"] = "player-2"
                room["phaseEndsAt"] = "2099-09-09T12:00:40.000Z"
                payload["room"] = room
            }
        }
        let paused = try snapshotByChanging(active) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["pausedAt"] = "2026-09-14T12:00:00.000Z"
                payload["room"] = room
            }
        }
        let service = RoomServiceMock(snapshot: active)
        await service.configurePause(snapshot: paused)
        let model = makeModel(service: service)
        model.pin = "0427"
        model.nickname = "Bia"
        await model.join()

        await model.setPaused(true)

        XCTAssertNotNil(model.snapshot?.room.pausedAt)
        XCTAssertNil(model.actionError)
        let requests = await service.pauseRequests()
        XCTAssertEqual(requests, [true])
        model.stop()
    }

    func testHostCanValidateDrawingComparisonAndEnableAutoplay() async throws {
        let reveal = try drawingRevealSnapshot(countedAsMatch: false, autoplay: false)
        let counted = try drawingRevealSnapshot(countedAsMatch: true, autoplay: false)
        let automatic = try drawingRevealSnapshot(countedAsMatch: true, autoplay: true)
        let service = RoomServiceMock(snapshot: reveal)
        await service.configureCountAsMatch(snapshot: counted)
        let model = makeModel(service: service)
        model.pin = "8642"
        model.nickname = "Bia"
        await model.join()

        XCTAssertTrue(model.canCountCurrentDrawingAsMatch)
        await model.countCurrentDrawingAsMatch()

        XCTAssertFalse(model.canCountCurrentDrawingAsMatch)
        let countedChain = await service.lastCountedChain()
        XCTAssertEqual(countedChain, "chain-1")
        XCTAssertNil(model.actionError)

        await service.configureAutoplay(snapshot: automatic)
        await model.setRevealAutoplay(true)

        XCTAssertEqual(model.snapshot?.match?.revealAutoplay, true)
        let autoplayRequests = await service.autoplayRequests()
        XCTAssertEqual(autoplayRequests, [true])
        XCTAssertNil(model.actionError)
        model.stop()
    }

    func testDuePhaseRequestsCompareAndSetAdvance() async throws {
        let due = try snapshotByChanging(try fixture("game_question")) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["phaseEndsAt"] = "2026-09-09T12:00:40.000Z"
                payload["room"] = room
            }
        }
        let service = RoomServiceMock(snapshot: due)
        let model = makeModel(service: service)
        model.pin = "0427"
        model.nickname = "Bia"
        await model.join()
        let requests = await service.advanceRequests()
        XCTAssertEqual(requests.count, 1)
        XCTAssertEqual(requests.first?.phase, .roundActive)
        XCTAssertEqual(requests.first?.endsAt, "2026-09-09T12:00:40.000Z")
        XCTAssertEqual(requests.first?.force, false)
        model.stop()
    }

    func testPausedDuePhaseDoesNotAdvance() async throws {
        let paused = try snapshotByChanging(try fixture("game_question")) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["phaseEndsAt"] = "2026-09-09T12:00:40.000Z"
                room["pausedAt"] = "2026-09-09T12:00:35.000Z"
                payload["room"] = room
            }
        }
        let service = RoomServiceMock(snapshot: paused)
        let model = makeModel(service: service)
        model.pin = "0427"
        model.nickname = "Bia"
        await model.join()
        let requests = await service.advanceRequests()
        XCTAssertTrue(requests.isEmpty)
        model.stop()
    }

    func testVoteUsesConfirmedRPCAndAuthoritativeSnapshot() async throws {
        let initial = try snapshotByChanging(try fixture("game_voting")) { payload in
            payload["votes"] = [String: Double]()
        }
        let voted = try fixture("game_voting")
        let service = RoomServiceMock(snapshot: initial)
        await service.configureVote(snapshot: voted)
        let model = makeModel(service: service)
        model.pin = "7319"
        model.nickname = "Bia"
        await model.join()
        await model.submitVote(4)
        XCTAssertEqual(model.snapshot?.votes["player-2"], 4)
        XCTAssertNil(model.actionError)
        await model.submitVote(5)
        let voteCount = await service.voteCount()
        XCTAssertEqual(voteCount, 1)
        model.stop()
    }

    func testDrawingRequiresSnapshotConfirmationAndBlocksDuplicate() async throws {
        let initial = try fixture("drawing_step")
        let submitted = try snapshotByChanging(initial) { payload in
            payload["me"] = ["playerId": "player-2", "submitted": true]
            if var match = payload["match"] as? [String: Any] {
                match["submittedPlayerIds"] = ["player-2"]
                payload["match"] = match
            }
        }
        let service = RoomServiceMock(snapshot: initial)
        await service.configureContribution(snapshot: submitted)
        let model = makeModel(service: service)
        model.pin = "8642"
        model.nickname = "Bia"
        await model.join()
        await model.submitDrawing(strokes: .object(["v": .number(2), "g": .number(2048), "s": .array([])]))
        XCTAssertTrue(model.hasCurrentDrawingSubmission)
        XCTAssertNil(model.actionError)
        await model.submitDrawing(strokes: .object([:]))
        let contributionCount = await service.contributionCount()
        XCTAssertEqual(contributionCount, 1)
        model.stop()
    }

    func testSuccessfulRPCWithoutPersistedAnswerDoesNotConfirm() async throws {
        let service = RoomServiceMock(snapshot: try fixture("game_question"))
        let model = makeModel(service: service)
        model.pin = "0427"
        model.nickname = "Bia"
        await model.join()
        await model.submitAnswer(1)
        XCTAssertFalse(model.hasAnswered)
        XCTAssertNotNil(model.actionError)
        model.stop()
    }

    func testPersistedAnswerIsConfirmedEvenWhenTransportFails() async throws {
        let initial = try fixture("game_question")
        var payload = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(initial)) as? [String: Any])
        payload["answers"] = ["player-2": 1]
        let persisted = try JSONDecoder().decode(RoomSnapshot.self, from: JSONSerialization.data(withJSONObject: payload))
        let service = RoomServiceMock(snapshot: initial)
        await service.configureSubmission(snapshot: persisted, fail: true)
        let model = makeModel(service: service)
        model.pin = "0427"
        model.nickname = "Bia"
        await model.join()
        await model.submitAnswer(1)
        XCTAssertTrue(model.hasAnswered)
        XCTAssertNil(model.actionError)
        await model.submitAnswer(2)
        let count = await service.submissionCount()
        XCTAssertEqual(count, 1)
        model.stop()
    }

    func testQuizCatalogKeepsWireIndexAndTrickQuestion() throws {
        let catalog = try XCTUnwrap(QuizCatalog.bundled)
        let question = try XCTUnwrap(catalog.question(for: fixture("game_question")))
        XCTAssertEqual(question.id, 213)
        XCTAssertNil(question.correctAnswer)
        XCTAssertEqual(question.options.count, 4)
        XCTAssertEqual(catalog.decks.values.map(\.count).sorted(), [13, 13, 13])
    }

    func testRealtimeInvalidationRefreshesAuthoritativeSnapshot() async throws {
        let lobby = try fixture("lobby")
        let twoPlayers = try fixture("lobby_two_players")
        let service = RoomServiceMock(snapshot: lobby)
        let model = makeModel(service: service)

        model.pin = "04 27"
        model.nickname = " Nick "
        await model.join()

        await eventually {
            model.state == .joined && model.connectionState == .connected
        }
        XCTAssertEqual(model.snapshot?.players.count, 1)

        await service.replaceSnapshot(twoPlayers)
        await service.send(.changed)

        await eventually { model.snapshot?.players.count == 2 }
        XCTAssertEqual(model.snapshot?.players.map(\.nickname), ["Nick", "Bia"])
        XCTAssertEqual(model.state, .joined)
    }

    func testJoinNetworkFailureShowsFriendlyMessage() async throws {
        let lobby = try fixture("lobby")
        let service = RoomServiceMock(snapshot: lobby)
        let model = makeModel(service: service)

        await service.failPrepareSession(with: URLError(.notConnectedToInternet))
        model.pin = "0427"
        model.nickname = "Nick"

        await model.join()

        XCTAssertEqual(
            model.state,
            .failed("Falha temporária de rede. Verifique sua conexão e tente novamente.")
        )
        XCTAssertEqual(model.connectionState, .idle)
        XCTAssertNil(model.snapshot)
    }

    func testDisconnectKeepsSnapshotAndSubscribesAgain() async throws {
        let lobby = try fixture("lobby")
        let service = RoomServiceMock(snapshot: lobby)
        let model = makeModel(service: service)

        model.pin = "0427"
        model.nickname = "Nick"
        await model.join()
        await eventually { model.connectionState == .connected }

        await service.send(.disconnected)

        await eventually { await service.observationCount() >= 2 }
        await eventually { model.connectionState == .connected }
        XCTAssertEqual(model.state, .joined)
        XCTAssertEqual(model.snapshot, lobby)
    }

    func testTransientRealtimeFailureKeepsSnapshotAndRetries() async throws {
        let lobby = try fixture("lobby")
        let service = RoomServiceMock(snapshot: lobby)
        let model = makeModel(service: service)

        model.pin = "0427"
        model.nickname = "Nick"
        await model.join()
        await eventually { model.connectionState == .connected }

        await service.failNextObservation()
        await service.send(.disconnected)

        await eventually { await service.observationCount() >= 3 }
        await eventually { model.connectionState == .connected }
        XCTAssertEqual(model.state, .joined)
        XCTAssertEqual(model.snapshot, lobby)
    }

    func testForegroundResumeFetchesSnapshotBeforeResubscribing() async throws {
        let lobby = try fixture("lobby")
        let twoPlayers = try fixture("lobby_two_players")
        let service = RoomServiceMock(snapshot: lobby)
        let model = makeModel(service: service)

        model.pin = "0427"
        model.nickname = "Nick"
        await model.join()
        await eventually { model.connectionState == .connected }

        let observationsBeforeResume = await service.observationCount()
        await service.replaceSnapshot(twoPlayers)
        await model.resume()

        XCTAssertEqual(model.snapshot?.players.count, 2)
        let presenceTouches = await service.presenceTouchCount()
        XCTAssertEqual(presenceTouches, 1)
        await eventually { await service.observationCount() > observationsBeforeResume }
        await eventually { model.connectionState == .connected }
    }

    func testActivationRestoresLastJoinedRoomAfterRelaunch() async throws {
        let service = RoomServiceMock(snapshot: try fixture("lobby"))
        let saved = LobbyViewModel.SavedRoomSession(pin: "0427", nickname: "Nick")
        let model = LobbyViewModel(
            service: service,
            reconnectDelay: { _ in await Task.yield() },
            loadSavedSession: { saved }
        )

        await model.activate()

        XCTAssertEqual(model.state, .joined)
        XCTAssertEqual(model.pin, "0427")
        XCTAssertEqual(model.nickname, "Nick")
        XCTAssertEqual(model.snapshot?.room.id, "b14c6ca7-929b-47aa-a2ab-3281420e6c66")
        model.stop()
    }

    func testSuccessfulJoinPersistsNormalizedCredentials() async throws {
        let service = RoomServiceMock(snapshot: try fixture("lobby"))
        var persisted: LobbyViewModel.SavedRoomSession?
        let model = LobbyViewModel(
            service: service,
            reconnectDelay: { _ in await Task.yield() },
            saveSession: { persisted = $0 }
        )
        model.pin = "04 27"
        model.nickname = " Nick "

        await model.join()

        XCTAssertEqual(persisted, .init(pin: "0427", nickname: "Nick"))
        model.stop()
    }

    private func makeModel(service: RoomServiceMock) -> LobbyViewModel {
        LobbyViewModel(service: service, reconnectDelay: { _ in await Task.yield() })
    }

    private func fixture(_ name: String) throws -> RoomSnapshot {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json"))
        return try JSONDecoder().decode(RoomSnapshot.self, from: Data(contentsOf: url))
    }

    private func snapshotByChanging(
        _ snapshot: RoomSnapshot,
        change: (inout [String: Any]) -> Void
    ) throws -> RoomSnapshot {
        var payload = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(snapshot)) as? [String: Any]
        )
        change(&payload)
        return try JSONDecoder().decode(
            RoomSnapshot.self, from: JSONSerialization.data(withJSONObject: payload)
        )
    }

    private func drawingRevealSnapshot(
        countedAsMatch: Bool,
        autoplay: Bool
    ) throws -> RoomSnapshot {
        try snapshotByChanging(try fixture("drawing_step")) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["phase"] = "REVEAL_PAGE"
                room["hostPlayerId"] = "player-2"
                room["phaseEndsAt"] = autoplay ? "2099-09-09T12:00:40.000Z" : NSNull()
                payload["room"] = room
            }
            if var match = payload["match"] as? [String: Any] {
                match["revealChainIndex"] = 0
                match["revealPageIndex"] = 3
                match["revealAutoplay"] = autoplay
                payload["match"] = match
            }
            payload["chains"] = [[
                "id": "chain-1",
                "ownerPlayerId": "player-1",
                "position": 0,
                "originalPrompt": "carro",
                "acceptedAnswers": [],
                "countedAsMatch": countedAsMatch,
                "pages": [[
                    "stepIndex": 1,
                    "kind": "guess",
                    "playerId": "player-2",
                    "text": "automóvel",
                    "status": "submitted",
                ]],
            ]]
        }
    }

    private func eventually(
        timeout: Duration = .seconds(1),
        _ condition: @escaping () async -> Bool
    ) async {
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: timeout)

        while clock.now < deadline {
            if await condition() { return }
            try? await Task.sleep(for: .milliseconds(10))
        }

        XCTFail("Condition was not met before timeout")
    }
}

private actor RoomServiceMock: RoomService {
    private var currentSnapshot: RoomSnapshot
    private var activeContinuation: AsyncStream<RoomObservationEvent>.Continuation?
    private var observations = 0
    private var observationFailuresRemaining = 0
    private var prepareSessionError: Error?
    private var submissionSnapshot: RoomSnapshot?
    private var submissionFails = false
    private var submissions = 0
    private var voteSnapshot: RoomSnapshot?
    private var votesSubmitted = 0
    private var contributionSnapshot: RoomSnapshot?
    private var contributionsSubmitted = 0
    private var advances: [(phase: PartyPhase, endsAt: String?, force: Bool)] = []
    private var presenceTouches = 0
    private var createdRoom: CreateRoomResult?
    private var creations: [(pin: String, gameID: GameID)] = []
    private var startSnapshot: RoomSnapshot?
    private var starts: [StartMatchPayload] = []
    private var settingsSnapshot: RoomSnapshot?
    private var echoesSettings = false
    private var settingsChanges: [(gameID: GameID?, settings: [String: JSONValue]?)] = []
    private var advanceSnapshot: RoomSnapshot?
    private var resetSnapshot: RoomSnapshot?
    private var resets = 0
    private var pauseSnapshot: RoomSnapshot?
    private var pauses: [Bool] = []
    private var autoplaySnapshot: RoomSnapshot?
    private var autoplayChanges: [Bool] = []
    private var countedSnapshot: RoomSnapshot?
    private var countedChainIDs: [String] = []

    init(snapshot: RoomSnapshot) {
        currentSnapshot = snapshot
    }

    func prepareSession() async throws {
        if let prepareSessionError {
            self.prepareSessionError = nil
            throw prepareSessionError
        }
    }

    func createRoom(pin: String, gameID: GameID) async throws -> CreateRoomResult {
        creations.append((pin, gameID))
        return createdRoom ?? CreateRoomResult(id: currentSnapshot.room.id, pin: pin)
    }

    func resolveRoom(pin: String) async throws -> RoomResolution {
        RoomResolution(status: .open, roomID: currentSnapshot.room.id)
    }

    func joinRoom(
        pin: String,
        nickname: String,
        color: String,
        avatarSeed: String
    ) async throws -> JoinRoomResult {
        JoinRoomResult(
            roomID: currentSnapshot.room.id,
            playerID: currentSnapshot.me.playerId,
            error: nil
        )
    }

    func snapshot(roomID: String) async throws -> RoomSnapshot {
        currentSnapshot
    }

    func setSettings(
        roomID: String,
        gameID: GameID?,
        settings: [String: JSONValue]?
    ) async throws {
        settingsChanges.append((gameID, settings))
        if let settingsSnapshot {
            currentSnapshot = settingsSnapshot
        } else if echoesSettings, let settings {
            let old = currentSnapshot
            let room = SnapshotRoom(
                id: old.room.id,
                pin: old.room.pin,
                gameId: gameID ?? old.room.gameId,
                phase: old.room.phase,
                phaseEndsAt: old.room.phaseEndsAt,
                pausedAt: old.room.pausedAt,
                round: old.room.round,
                settings: settings,
                hostPlayerId: old.room.hostPlayerId,
                closedAt: old.room.closedAt
            )
            currentSnapshot = RoomSnapshot(
                room: room, me: old.me, players: old.players, match: old.match,
                assignment: old.assignment, votes: old.votes, scores: old.scores,
                answers: old.answers, topics: old.topics, chains: old.chains,
                serverTime: old.serverTime, error: old.error
            )
        }
    }

    func startMatch(roomID: String, payload: StartMatchPayload) async throws {
        starts.append(payload)
        if let startSnapshot { currentSnapshot = startSnapshot }
    }

    func submitAnswer(roomID: String, option: Int) async throws {
        submissions += 1
        if let submissionSnapshot { currentSnapshot = submissionSnapshot }
        if submissionFails { throw URLError(.networkConnectionLost) }
    }

    func submitVote(roomID: String, rating: Int) async throws -> VoteSubmissionResult {
        votesSubmitted += 1
        if let voteSnapshot { currentSnapshot = voteSnapshot }
        return VoteSubmissionResult(accepted: true, duplicate: false, skipped: nil)
    }

    func submitContribution(
        roomID: String,
        strokes: JSONValue?,
        text: String,
        status: SubmissionStatus
    ) async throws -> ContributionSubmissionResult {
        contributionsSubmitted += 1
        if let contributionSnapshot { currentSnapshot = contributionSnapshot }
        return ContributionSubmissionResult(contributionID: "contribution-1", skipped: nil, status: status)
    }

    func publicDrawingURL(path: String) async -> URL? { nil }

    func advancePhase(
        roomID: String,
        expectedPhase: PartyPhase,
        expectedEndsAt: String?,
        force: Bool
    ) async throws {
        advances.append((expectedPhase, expectedEndsAt, force))
        if let advanceSnapshot { currentSnapshot = advanceSnapshot }
    }

    func advanceRequests() -> [(phase: PartyPhase, endsAt: String?, force: Bool)] { advances }

    func resetToLobby(roomID: String) async throws {
        resets += 1
        if let resetSnapshot { currentSnapshot = resetSnapshot }
    }

    func pauseRoom(roomID: String, paused: Bool) async throws {
        pauses.append(paused)
        if let pauseSnapshot { currentSnapshot = pauseSnapshot }
    }

    func rerollTopic(roomID: String) async throws {}
    func rerollPunishment(roomID: String) async throws {}
    func setRevealAutoplay(roomID: String, enabled: Bool) async throws {
        autoplayChanges.append(enabled)
        if let autoplaySnapshot { currentSnapshot = autoplaySnapshot }
    }
    func countAsMatch(roomID: String, chainID: String) async throws {
        countedChainIDs.append(chainID)
        if let countedSnapshot { currentSnapshot = countedSnapshot }
    }

    func touchPresence(roomID: String) async throws { presenceTouches += 1 }
    func presenceTouchCount() -> Int { presenceTouches }
    func configureCreatedRoom(_ room: CreateRoomResult) { createdRoom = room }
    func createRequests() -> [(pin: String, gameID: GameID)] { creations }
    func configureStartedMatch(_ snapshot: RoomSnapshot) { startSnapshot = snapshot }
    func startPayloads() -> [StartMatchPayload] { starts }
    func configureSettings(snapshot: RoomSnapshot) { settingsSnapshot = snapshot }
    func configureSettingsEcho() { echoesSettings = true }
    func settingsRequests() -> [(gameID: GameID?, settings: [String: JSONValue]?)] { settingsChanges }
    func configureAdvancedPhase(_ snapshot: RoomSnapshot) { advanceSnapshot = snapshot }
    func configureReset(snapshot: RoomSnapshot) { resetSnapshot = snapshot }
    func resetCount() -> Int { resets }
    func configurePause(snapshot: RoomSnapshot) { pauseSnapshot = snapshot }
    func pauseRequests() -> [Bool] { pauses }
    func configureAutoplay(snapshot: RoomSnapshot) { autoplaySnapshot = snapshot }
    func autoplayRequests() -> [Bool] { autoplayChanges }
    func configureCountAsMatch(snapshot: RoomSnapshot) { countedSnapshot = snapshot }
    func lastCountedChain() -> String? { countedChainIDs.last }

    func configureVote(snapshot: RoomSnapshot) { voteSnapshot = snapshot }
    func voteCount() -> Int { votesSubmitted }
    func configureContribution(snapshot: RoomSnapshot) { contributionSnapshot = snapshot }
    func contributionCount() -> Int { contributionsSubmitted }

    func configureSubmission(snapshot: RoomSnapshot, fail: Bool) {
        submissionSnapshot = snapshot
        submissionFails = fail
    }

    func submissionCount() -> Int { submissions }

    func roomChanges(roomID: String) async throws -> AsyncStream<RoomObservationEvent> {
        observations += 1
        if observationFailuresRemaining > 0 {
            observationFailuresRemaining -= 1
            throw RoomServiceError.rejected("Realtime temporarily unavailable")
        }

        return AsyncStream(bufferingPolicy: .bufferingNewest(1)) { continuation in
            activeContinuation = continuation
            continuation.yield(.connected)
        }
    }

    func stopObserving() async {
        activeContinuation?.finish()
        activeContinuation = nil
    }

    func replaceSnapshot(_ snapshot: RoomSnapshot) {
        currentSnapshot = snapshot
    }

    func send(_ event: RoomObservationEvent) {
        activeContinuation?.yield(event)
    }

    func failNextObservation() {
        observationFailuresRemaining += 1
    }

    func failPrepareSession(with error: Error) {
        prepareSessionError = error
    }

    func observationCount() -> Int {
        observations
    }
}
