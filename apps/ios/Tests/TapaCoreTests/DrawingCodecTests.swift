import XCTest
@testable import TapaCore

final class DrawingCodecTests: XCTestCase {
    func testEncodesWebCompatibleV2PayloadAndRoundTrips() throws {
        let strokes = [
            DrawingStroke(
                tool: .brush,
                width: 0.014,
                color: 2,
                points: [DrawingPoint(x: 0.25, y: 0.5), DrawingPoint(x: 1, y: 0)]
            ),
        ]
        let encoded = DrawingCodec.encode(strokes)
        guard case let .object(object) = encoded,
              case let .number(version)? = object["v"],
              case let .array(items)? = object["s"],
              case let .array(values) = items.first else {
            return XCTFail("Formato compacto inválido")
        }
        XCTAssertEqual(version, 2)
        XCTAssertEqual(values, [.number(0), .number(29), .number(2), .number(512), .number(1024), .number(2048), .number(0)])
        let decoded = try XCTUnwrap(DrawingCodec.decode(encoded))
        XCTAssertEqual(decoded.count, 1)
        XCTAssertEqual(decoded[0].tool, .brush)
        XCTAssertEqual(decoded[0].color, 2)
        XCTAssertEqual(decoded[0].points[0].x, 0.25, accuracy: 0.001)
    }

    func testDecodesLegacyV1AndRejectsCorruption() throws {
        let legacy: JSONValue = .object([
            "v": .number(1), "g": .number(100),
            "s": .array([.array([.number(1), .number(10), .number(25), .number(75)])]),
        ])
        let decoded = try XCTUnwrap(DrawingCodec.decode(legacy))
        XCTAssertEqual(decoded[0].tool, .eraser)
        XCTAssertEqual(decoded[0].color, 0)
        XCTAssertEqual(decoded[0].points[0], DrawingPoint(x: 0.25, y: 0.75))

        XCTAssertNil(DrawingCodec.decode(.object([
            "v": .number(2), "s": .array([.array([.number(0), .number(10), .number(0), .number(4)])]),
        ])))
    }

    func testSimplificationKeepsEndpoints() {
        let points = [
            DrawingPoint(x: 0, y: 0),
            DrawingPoint(x: 0.001, y: 0.001),
            DrawingPoint(x: 0.5, y: 0.5),
            DrawingPoint(x: 1, y: 1),
        ]
        let result = DrawingCodec.simplified(points, tolerance: 0.01)
        XCTAssertEqual(result, [points[0], points[2], points[3]])
    }

    func testBlankTimedOutDrawingStillHasAValidWireDocument() throws {
        let encoded = DrawingCodec.encode([])
        let decoded = try XCTUnwrap(DrawingCodec.decode(encoded))

        XCTAssertTrue(decoded.isEmpty)
    }
}
