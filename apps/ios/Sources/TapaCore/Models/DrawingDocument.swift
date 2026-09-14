import Foundation

public struct DrawingPoint: Codable, Equatable, Sendable {
    public let x: Double
    public let y: Double
    public init(x: Double, y: Double) {
        self.x = min(max(x, 0), 1)
        self.y = min(max(y, 0), 1)
    }
}

public struct DrawingStroke: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public let tool: Tool
    public let width: Double
    public let color: Int
    public var points: [DrawingPoint]

    public enum Tool: String, Codable, Sendable {
        case brush
        case eraser
    }

    public init(
        id: UUID = UUID(),
        tool: Tool,
        width: Double,
        color: Int,
        points: [DrawingPoint]
    ) {
        self.id = id
        self.tool = tool
        self.width = min(max(width, 0), 1)
        self.color = max(0, color)
        self.points = points
    }
}

public enum DrawingCodec {
    private static let grid = 2048.0

    /// Same compact v2 JSONB format used by the web client.
    public static func encode(_ strokes: [DrawingStroke]) -> JSONValue {
        .object([
            "v": .number(2),
            "g": .number(grid),
            "s": .array(strokes.map { stroke in
                var values: [JSONValue] = [
                    .number(stroke.tool == .eraser ? 1 : 0),
                    .number((stroke.width * grid).rounded()),
                    .number(Double(stroke.color)),
                ]
                for point in stroke.points {
                    values.append(.number((point.x * grid).rounded()))
                    values.append(.number((point.y * grid).rounded()))
                }
                return .array(values)
            }),
        ])
    }

    /// Accepts both the old v1 header and the current v2 header.
    public static func decode(_ value: JSONValue?) -> [DrawingStroke]? {
        guard case let .object(object) = value,
              case let .number(versionValue)? = object["v"],
              [1, 2].contains(Int(versionValue)),
              case let .array(rawStrokes) = object["s"]
        else { return nil }
        let version = Int(versionValue)
        let scale: Double
        if case let .number(rawScale)? = object["g"], rawScale > 0 { scale = rawScale }
        else { scale = grid }
        let header = version == 1 ? 2 : 3
        var result: [DrawingStroke] = []
        for raw in rawStrokes {
            guard case let .array(values) = raw, values.count >= header,
                  case let .number(toolValue) = values[0],
                  case let .number(widthValue) = values[1],
                  (values.count - header).isMultiple(of: 2)
            else { return nil }
            let color: Int
            if header == 3, case let .number(rawColor) = values[2] {
                color = max(0, Int(rawColor))
            } else {
                color = 0
            }
            var points: [DrawingPoint] = []
            for index in stride(from: header, to: values.count, by: 2) {
                guard case let .number(x) = values[index],
                      case let .number(y) = values[index + 1] else { return nil }
                points.append(DrawingPoint(x: x / scale, y: y / scale))
            }
            result.append(DrawingStroke(
                tool: toolValue == 1 ? .eraser : .brush,
                width: widthValue / scale,
                color: color,
                points: points
            ))
        }
        return result
    }

    public static func simplified(_ points: [DrawingPoint], tolerance: Double = 0.003) -> [DrawingPoint] {
        guard points.count > 2 else { return points }
        var result = [points[0]]
        for point in points.dropFirst().dropLast() {
            guard let previous = result.last else { continue }
            if hypot(point.x - previous.x, point.y - previous.y) >= tolerance {
                result.append(point)
            }
        }
        result.append(points[points.count - 1])
        return result
    }
}
