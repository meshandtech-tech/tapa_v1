import Foundation
import XCTest
@testable import TapaCore

@MainActor
final class LobbyViewModelTests: XCTestCase {
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
        await eventually { await service.observationCount() > observationsBeforeResume }
        await eventually { model.connectionState == .connected }
    }

    private func makeModel(service: RoomServiceMock) -> LobbyViewModel {
        LobbyViewModel(service: service, reconnectDelay: { _ in await Task.yield() })
    }

    private func fixture(_ name: String) throws -> RoomSnapshot {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json"))
        return try JSONDecoder().decode(RoomSnapshot.self, from: Data(contentsOf: url))
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

    init(snapshot: RoomSnapshot) {
        currentSnapshot = snapshot
    }

    func prepareSession() async throws {
        if let prepareSessionError {
            self.prepareSessionError = nil
            throw prepareSessionError
        }
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

    func submitAnswer(roomID: String, option: Int) async throws {
        submissions += 1
        if let submissionSnapshot { currentSnapshot = submissionSnapshot }
        if submissionFails { throw URLError(.networkConnectionLost) }
    }

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
