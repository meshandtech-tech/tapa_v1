// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "TapaKit",
    defaultLocalization: "pt-BR",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "TapaCore", targets: ["TapaCore"]),
        .library(name: "TapaUI", targets: ["TapaUI"]),
    ],
    dependencies: [
        .package(
            url: "https://github.com/supabase/supabase-swift.git",
            .upToNextMajor(from: "2.54.1")
        ),
    ],
    targets: [
        .target(
            name: "TapaCore",
            dependencies: [
                .product(name: "Supabase", package: "supabase-swift"),
            ]
        ),
        .target(
            name: "TapaUI",
            dependencies: ["TapaCore"]
        ),
        .testTarget(
            name: "TapaCoreTests",
            dependencies: ["TapaCore"],
            resources: [.process("Fixtures")]
        ),
    ]
)
