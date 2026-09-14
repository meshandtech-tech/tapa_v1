import Foundation
import XCTest
@testable import TapaCore

final class QuizPresentationTests: XCTestCase {
    func testTrickQuestionMakesParticipantsLoseButExcludesLateSpectator() throws {
        let snapshot = try changed(try fixture("game_question")) { payload in
            payload["answers"] = ["player-1": 0]
            if var players = payload["players"] as? [[String: Any]] {
                players.append([
                    "id": "late-player",
                    "nickname": "Cheguei tarde",
                    "color": "#c9ff4c",
                    "avatarSeed": "late",
                    "score": 999,
                    "joinedAt": "2026-09-09T12:00:20.000Z",
                    "lastSeenAt": "2026-09-09T12:00:20.000Z",
                ])
                payload["players"] = players
            }
        }
        let question = try XCTUnwrap(QuizCatalog.bundled?.question(for: snapshot))

        let outcome = snapshot.quizOutcome(for: question)

        XCTAssertEqual(outcome.correct.map(\.id), [])
        XCTAssertEqual(outcome.wrong.map(\.id), ["player-1", "player-2"])
        XCTAssertEqual(outcome.pending.map(\.id), ["player-2"])
    }

    func testRankingUsesOnlyOriginalMatchSeatsAndJoinedAtAsTieBreak() throws {
        let snapshot = try changed(try fixture("game_over")) { payload in
            if var players = payload["players"] as? [[String: Any]] {
                players[0]["score"] = 20
                players.append([
                    "id": "late-player",
                    "nickname": "Cheguei tarde",
                    "color": "#c9ff4c",
                    "avatarSeed": "late",
                    "score": 999,
                    "joinedAt": "2026-09-09T12:00:20.000Z",
                    "lastSeenAt": "2026-09-09T12:00:20.000Z",
                ])
                payload["players"] = players
            }
        }

        XCTAssertEqual(snapshot.matchRanking.map(\.id), ["player-1", "player-2"])
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
}
