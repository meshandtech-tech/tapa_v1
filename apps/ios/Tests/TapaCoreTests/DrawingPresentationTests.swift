import Foundation
import XCTest
@testable import TapaCore

final class DrawingPresentationTests: XCTestCase {
    func testRevealUsesChainPositionAndContributionStep() throws {
        let snapshot = try revealSnapshot(chainIndex: 0, pageIndex: 2)

        XCTAssertEqual(snapshot.currentDrawingChain?.id, "chain-zero")
        XCTAssertEqual(snapshot.currentDrawingPage?.kind, "guess")
        XCTAssertEqual(snapshot.currentDrawingPage?.text, "automóvel")
        XCTAssertEqual(snapshot.drawingRevealPageCount, 6)
    }

    func testFinalGuessAndAcceptedAnswerDetermineSurvival() throws {
        let snapshot = try revealSnapshot(chainIndex: 0, pageIndex: 5)
        let chain = try XCTUnwrap(snapshot.currentDrawingChain)

        XCTAssertEqual(snapshot.finalDrawingGuess(in: chain), "carro")
        XCTAssertTrue(snapshot.drawingChainSurvived(chain))
    }

    func testProgressIgnoresIdentifiersOutsideFrozenSeats() throws {
        let snapshot = try changed(try fixture("drawing_step")) { payload in
            if var match = payload["match"] as? [String: Any] {
                match["submittedPlayerIds"] = ["player-2", "late-player"]
                payload["match"] = match
            }
        }

        XCTAssertEqual(snapshot.drawingSubmittedParticipants.map(\.id), ["player-2"])
        XCTAssertEqual(snapshot.drawingPendingParticipants.map(\.id), ["player-1"])
    }

    private func revealSnapshot(chainIndex: Int, pageIndex: Int) throws -> RoomSnapshot {
        try changed(try fixture("drawing_step")) { payload in
            if var room = payload["room"] as? [String: Any] {
                room["phase"] = "REVEAL_PAGE"
                room["phaseEndsAt"] = NSNull()
                payload["room"] = room
            }
            if var match = payload["match"] as? [String: Any] {
                match["stepCount"] = 4
                match["revealChainIndex"] = chainIndex
                match["revealPageIndex"] = pageIndex
                payload["match"] = match
            }
            // Deliberately reversed: reveal identity comes from `position`,
            // not from whichever row happened to decode first.
            payload["chains"] = [
                chain(id: "chain-one", position: 1, prompt: "girafa", final: "cavalo"),
                chain(id: "chain-zero", position: 0, prompt: "automóvel", final: "carro"),
            ]
        }
    }

    private func chain(id: String, position: Int, prompt: String, final: String) -> [String: Any] {
        [
            "id": id,
            "ownerPlayerId": position == 0 ? "player-1" : "player-2",
            "position": position,
            "originalPrompt": prompt,
            "acceptedAnswers": position == 0 ? ["carro"] : [],
            "countedAsMatch": false,
            "pages": [
                page(step: 0, kind: "drawing", player: "player-1", text: ""),
                page(step: 1, kind: "guess", player: "player-2", text: prompt),
                page(step: 2, kind: "drawing", player: "player-1", text: ""),
                page(step: 3, kind: "guess", player: "player-2", text: final),
            ],
        ]
    }

    private func page(step: Int, kind: String, player: String, text: String) -> [String: Any] {
        [
            "stepIndex": step, "kind": kind, "playerId": player,
            "storagePath": NSNull(), "strokes": NSNull(), "text": text,
            "status": "submitted",
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
