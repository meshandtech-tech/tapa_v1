import Foundation
import XCTest
@testable import TapaCore

final class SlidesPresentationTests: XCTestCase {
    func testNativeMinimumMatchesThreePlayerGameRule() {
        XCTAssertEqual(GameID.improvSlides.minimumPlayers, 3)
    }

    func testPresenterSpinnerUsesFrozenSeatOrder() throws {
        let snapshot = try slidesFixture()

        XCTAssertEqual(snapshot.slidesPresenterCandidates.map(\.id), ["player-1", "player-2"])
        XCTAssertEqual(snapshot.currentPresenter?.id, "player-1")
    }

    func testVotingExcludesPresenterAndLateSpectator() throws {
        let snapshot = try changed(try slidesFixture()) { payload in
            payload["votes"] = ["player-2": 4.0, "late-player": 5.0]
            if var players = payload["players"] as? [[String: Any]] {
                players.append([
                    "id": "late-player", "nickname": "Cheguei tarde", "color": "#c9ff4c",
                    "avatarSeed": "late", "score": 999,
                    "joinedAt": "2026-09-09T12:00:20.000Z",
                    "lastSeenAt": "2026-09-09T12:03:50.000Z",
                ])
                payload["players"] = players
            }
        }

        XCTAssertEqual(snapshot.eligibleSlidesVoters.map(\.id), ["player-2"])
        XCTAssertEqual(snapshot.slidesVotesIn, 1)
        XCTAssertEqual(snapshot.slidesVotesMissing, 0)
        XCTAssertEqual(snapshot.currentSlidesScore, 4.0)
    }

    func testSlideProgressUsesServerDeadlineAndFreezesWhilePaused() throws {
        let running = try changed(try slidesFixture()) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["phase"] = "PRESENTATION"
                room["phaseEndsAt"] = "2026-09-09T12:04:00.000Z"
                payload["room"] = room
            }
        }

        XCTAssertEqual(
            running.slidesProgress(at: try date("2026-09-09T12:02:20.000Z"), serverOffset: 0),
            SlidesProgress(index: 0, remainingSeconds: 20, isLast: false)
        )
        XCTAssertEqual(
            running.slidesProgress(at: try date("2026-09-09T12:02:40.000Z"), serverOffset: 0),
            SlidesProgress(index: 1, remainingSeconds: 20, isLast: false)
        )
        XCTAssertEqual(
            running.slidesProgress(at: try date("2026-09-09T12:03:59.000Z"), serverOffset: 0),
            SlidesProgress(index: 4, remainingSeconds: 1, isLast: true)
        )

        let paused = try changed(running) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["pausedAt"] = "2026-09-09T12:02:45.000Z"
                payload["room"] = room
            }
        }
        XCTAssertEqual(
            paused.slidesProgress(at: try date("2026-09-09T13:00:00.000Z"), serverOffset: 0),
            SlidesProgress(index: 1, remainingSeconds: 15, isLast: false)
        )
    }

    func testScoreFallsBackToPersistedResultAndVerdictsMatchWeb() throws {
        let snapshot = try changed(try slidesFixture()) { payload in
            payload["votes"] = [:]
            payload["scores"] = ["player-1": 4.6]
        }

        XCTAssertEqual(snapshot.currentSlidesScore, 4.6)
        XCTAssertEqual(slidesVerdict(for: snapshot.currentSlidesScore), "Isso aí fazia sentido. Assustador.")
        XCTAssertEqual(slidesVerdict(for: nil), "Ninguém votou. Constrangedor.")
        XCTAssertEqual(slidesVerdict(for: 1), "Melhor esquecer.")
    }

    private func slidesFixture() throws -> RoomSnapshot {
        try changed(try fixture("game_voting")) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["gameId"] = "improv-slides"
                payload["room"] = room
            }
            if var match = payload["match"] as? [String: Any] {
                match["gameId"] = "improv-slides"
                match["slideIds"] = ["a", "b", "c", "d", "e"]
                payload["match"] = match
            }
        }
    }

    private func fixture(_ name: String) throws -> RoomSnapshot {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json"))
        return try JSONDecoder().decode(RoomSnapshot.self, from: Data(contentsOf: url))
    }

    private func changed(
        _ snapshot: RoomSnapshot,
        change: (inout [String: Any]) -> Void
    ) throws -> RoomSnapshot {
        var payload = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(snapshot)) as? [String: Any]
        )
        change(&payload)
        return try JSONDecoder().decode(
            RoomSnapshot.self,
            from: JSONSerialization.data(withJSONObject: payload)
        )
    }

    private func date(_ value: String) throws -> Date {
        try XCTUnwrap(RoomSnapshot.parseDate(value))
    }
}
