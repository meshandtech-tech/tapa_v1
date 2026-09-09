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
}
