import Foundation
import XCTest
@testable import TapaCore

final class RoomSnapshotTests: XCTestCase {
    func testDecodesLobbyFixture() throws {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "lobby", withExtension: "json"))
        let snapshot = try JSONDecoder().decode(RoomSnapshot.self, from: Data(contentsOf: url))

        XCTAssertEqual(snapshot.room.pin, "0427")
        XCTAssertEqual(snapshot.room.gameId, .quemErraPaga)
        XCTAssertEqual(snapshot.room.phase, .lobby)
        XCTAssertEqual(snapshot.players.map(\.nickname), ["Nick"])
        XCTAssertEqual(snapshot.room.settings["difficulty"], .string("medium"))
        XCTAssertEqual(snapshot.room.settings["maxPlayers"], .number(10))
    }

    func testDecodesDetailedRoomResolution() throws {
        let open = try JSONDecoder().decode(
            RoomResolution.self,
            from: Data(#"{"status":"open","room_id":"room-123"}"#.utf8)
        )
        let expired = try JSONDecoder().decode(
            RoomResolution.self,
            from: Data(#"{"status":"room_expired"}"#.utf8)
        )

        XCTAssertEqual(open, RoomResolution(status: .open, roomID: "room-123"))
        XCTAssertEqual(expired, RoomResolution(status: .roomExpired, roomID: nil))
    }
}
