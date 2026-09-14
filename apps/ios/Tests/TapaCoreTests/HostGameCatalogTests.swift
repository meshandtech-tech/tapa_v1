import XCTest
@testable import TapaCore

final class HostGameCatalogTests: XCTestCase {
    func testBundledCatalogMatchesWebInventory() throws {
        let catalog = try XCTUnwrap(HostGameCatalog.bundled)
        XCTAssertEqual(catalog.version, 1)
        XCTAssertEqual(catalog.drawingPrompts.count, 143)
        XCTAssertEqual(catalog.debateTopics["easy"]?.count, 28)
        XCTAssertEqual(catalog.debateTopics["medium"]?.count, 36)
        XCTAssertEqual(catalog.debateTopics["hard"]?.count, 52)
        XCTAssertEqual(catalog.slideIDs.count, 32)
    }

    func testPayloadsCarryOnlyContentNeededByEachGame() throws {
        let catalog = try XCTUnwrap(HostGameCatalog.bundled)

        let quiz = try XCTUnwrap(catalog.payload(
            gameID: .quemErraPaga, difficulty: .medium, playerCount: 6
        ))
        XCTAssertEqual(quiz.questionOrder.count, 10)
        XCTAssertEqual(quiz.correctOptions.count, 10)
        XCTAssertEqual(quiz.punishmentCount, 12)
        XCTAssertTrue(quiz.prompts.isEmpty)

        let drawing = try XCTUnwrap(catalog.payload(
            gameID: .drawingTelephone, difficulty: .medium, playerCount: 10
        ))
        XCTAssertEqual(drawing.prompts.count, 10)
        XCTAssertEqual(Set(drawing.prompts.map(\.id)).count, 10)

        let debate = try XCTUnwrap(catalog.payload(
            gameID: .advogadoDoDiabo, difficulty: .hard, playerCount: 10
        ))
        XCTAssertEqual(debate.topics.count, 20)
        XCTAssertTrue(debate.topics.allSatisfy { $0.source == "default" })

        let slides = try XCTUnwrap(catalog.payload(
            gameID: .improvSlides, difficulty: .medium, playerCount: 4
        ))
        XCTAssertEqual(slides.slideIDs.count, 32)
    }
}
