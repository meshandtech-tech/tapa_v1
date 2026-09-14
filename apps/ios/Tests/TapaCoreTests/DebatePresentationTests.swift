import Foundation
import XCTest
@testable import TapaCore

final class DebatePresentationTests: XCTestCase {
    func testTopicCandidatesPreserveSourceAndIDIdentity() throws {
        let snapshot = try changed(try fixture("game_voting")) { payload in
            if var match = payload["match"] as? [String: Any] {
                match["topicCandidates"] = ["custom:same", "default:same"]
                match["topicWinner"] = 0
                payload["match"] = match
            }
            payload["topics"] = [
                topic(id: "same", source: "default", text: "Tese oficial", position: 1),
                topic(id: "same", source: "custom", text: "Tese da casa", position: 0),
            ]
        }

        XCTAssertEqual(snapshot.debateTopicCandidates.map(\.text), ["Tese da casa", "Tese oficial"])
        XCTAssertEqual(snapshot.currentTopicText, "Tese da casa")
    }

    func testVotingExcludesPresenterAndLateSpectator() throws {
        let snapshot = try changed(try fixture("game_voting")) { payload in
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

        XCTAssertEqual(snapshot.eligibleDebateVoters.map(\.id), ["player-2"])
        XCTAssertEqual(snapshot.debateVotesIn, 1)
        XCTAssertEqual(snapshot.debateVotesMissing, 0)
    }

    func testRankingUsesFrozenSeatsAndJoinedAtTieBreak() throws {
        let snapshot = try changed(try fixture("game_voting")) { payload in
            payload["scores"] = ["player-1": 3.5, "player-2": 3.5, "late-player": 5.0]
            if var players = payload["players"] as? [[String: Any]] {
                players.append([
                    "id": "late-player", "nickname": "Cheguei tarde", "color": "#c9ff4c",
                    "avatarSeed": "late", "score": 999,
                    "joinedAt": "2026-09-09T11:59:00.000Z",
                    "lastSeenAt": "2026-09-09T12:03:50.000Z",
                ])
                payload["players"] = players
            }
        }

        XCTAssertEqual(snapshot.debateRanking.map(\.player.id), ["player-1", "player-2"])
        XCTAssertEqual(snapshot.debateRanking.map(\.score), [3.5, 3.5])
    }

    func testCustomTopicsDecodeFromRoomSettings() throws {
        let snapshot = try changed(try fixture("game_voting")) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["settings"] = [
                    "difficulty": "hard",
                    "customTopics": [
                        ["id": "c-1", "text": "Tese criada no iPhone"],
                        ["id": "c-2", "text": "Sobre alguém", "aboutPlayerId": "player-2"],
                    ],
                ]
                payload["room"] = room
            }
        }

        XCTAssertEqual(snapshot.room.difficulty, .hard)
        XCTAssertEqual(snapshot.room.customDebateTopics.map(\.id), ["c-1", "c-2"])
        XCTAssertEqual(snapshot.room.customDebateTopics.last?.aboutPlayerID, "player-2")
        XCTAssertEqual(snapshot.room.customDebateTopics.last?.startMatchTopic.source, "custom")
    }

    private func topic(id: String, source: String, text: String, position: Int) -> [String: Any] {
        [
            "id": id, "source": source, "text": text, "position": position,
            "usedAt": NSNull(), "rejectedAt": NSNull(), "presenterId": NSNull(),
        ]
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
