import Foundation
import XCTest
@testable import TapaCore

final class AnswerMatcherTests: XCTestCase {
    func testNormalizationMatchesWebRules() {
        XCTAssertEqual(AnswerMatcher.normalize("Macaco!"), "macaco")
        XCTAssertEqual(AnswerMatcher.normalize("AVIÃO"), "aviao")
        XCTAssertEqual(AnswerMatcher.normalize("pão-de-queijo"), "pao de queijo")
        XCTAssertEqual(AnswerMatcher.normalize("  cachorro   grande "), "cachorro grande")
        XCTAssertEqual(AnswerMatcher.normalize("???"), "")
    }

    func testLooseComparisonRemovesPortugueseFillerWords() {
        XCTAssertEqual(
            AnswerMatcher.loose("um cachorro pilotando uma moto"),
            "cachorro pilotando moto"
        )
        XCTAssertEqual(AnswerMatcher.loose("de"), "de")
    }

    func testMatchesPromptAndAlternativeAnswers() {
        XCTAssertTrue(AnswerMatcher.matches(
            guess: "Um cachorro pilotando uma moto!",
            prompt: "cachorro pilotando moto"
        ))
        XCTAssertTrue(AnswerMatcher.matches(
            guess: "smartphone",
            prompt: "celular",
            acceptedAnswers: ["telefone", "smartphone"]
        ))
        XCTAssertFalse(AnswerMatcher.matches(guess: "???", prompt: "celular"))
    }
}
