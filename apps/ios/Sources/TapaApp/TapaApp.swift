import SwiftUI
import TapaCore
import TapaUI

@main
struct TapaApp: App {
    private let content: AnyView

    init() {
        do {
            let configuration = try TapaConfiguration()
            let service = SupabaseRoomService(configuration: configuration)
            content = AnyView(TapaRootView(service: service))
        } catch {
            content = AnyView(ConfigurationErrorView(message: error.localizedDescription))
        }
    }

    var body: some Scene {
        WindowGroup { content }
    }
}

private struct ConfigurationErrorView: View {
    let message: String

    var body: some View {
        ContentUnavailableView(
            "Configuração incompleta",
            systemImage: "wrench.and.screwdriver",
            description: Text(message)
        )
    }
}
