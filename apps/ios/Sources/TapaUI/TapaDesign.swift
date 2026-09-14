import SwiftUI
import TapaCore

enum TapaPalette {
    static let pink = Color(red: 0.90, green: 0, blue: 0.31)
    static let lime = Color(red: 0.80, green: 1, blue: 0.30)
}
struct TapaBackground: View {
    var body: some View {
        TapaPalette.pink.overlay {
            Canvas { context, size in
                for x in stride(from: 12.0, to: size.width, by: 28) {
                    for y in stride(from: 12.0, to: size.height, by: 28) {
                        context.fill(Path(ellipseIn: CGRect(x: x, y: y, width: 2, height: 2)), with: .color(.black.opacity(0.1)))
                    }
                }
            }.accessibilityHidden(true)
        }.ignoresSafeArea()
    }
}
struct TapaLogo: View {
    var body: some View {
        Text("TAPA").font(.system(size: 44, weight: .black, design: .rounded))
            .tracking(-3).foregroundStyle(.white).shadow(color: .black, radius: 0, x: 4, y: 5)
            .rotationEffect(.degrees(-5)).accessibilityLabel("Tapa")
    }
}
extension View {
    func paper(fill: Color = .white) -> some View {
        background {
            ZStack {
                Rectangle().fill(.black).offset(x: 5, y: 6)
                Rectangle().fill(fill)
            }
        }
        .overlay(Rectangle().strokeBorder(.black, lineWidth: 3))
    }
}
struct TapaButtonStyle: ButtonStyle {
    var dark = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(.headline, design: .rounded, weight: .black))
            .frame(maxWidth: .infinity, minHeight: 28).padding(16)
            .foregroundStyle(dark ? .white : .black)
            .background {
                ZStack {
                    Rectangle().fill(.black)
                    .offset(x: configuration.isPressed ? 1 : 4,
                            y: configuration.isPressed ? 1 : 5)
                    Rectangle().fill(dark ? Color.black : Color.white)
                }
            }
            .overlay(Rectangle().strokeBorder(.black, lineWidth: 3))
            .offset(y: configuration.isPressed ? 3 : 0).opacity(enabled ? 1 : 0.5)
    }
}
struct TapaMessage: View {
    let icon: String
    let title: String
    let detail: String
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: icon).font(.system(size: 54, weight: .black))
            Text(title).font(.largeTitle.weight(.black)).multilineTextAlignment(.center)
            Text(detail).font(.body.weight(.medium)).multilineTextAlignment(.center)
        }.frame(maxWidth: .infinity).padding(28).paper()
    }
}
struct PlayerRow: View {
    let player: SnapshotPlayer
    let suffix: String
    var body: some View {
        HStack(spacing: 12) {
            Text(String(player.nickname.prefix(1)).uppercased()).font(.title3.weight(.black))
                .frame(width: 42, height: 42).background(Color(tapaHex: player.color))
                .overlay(Rectangle().stroke(.black, lineWidth: 2)).accessibilityHidden(true)
            Text(player.nickname).font(.body.weight(.bold))
            Spacer(minLength: 4)
            Text(suffix).font(.system(.caption, design: .monospaced, weight: .black))
        }.accessibilityElement(children: .combine)
    }
}
private extension Color {
    init(tapaHex: String) {
        let value = UInt64(tapaHex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted), radix: 16) ?? 0xff5c8a
        self.init(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
}
