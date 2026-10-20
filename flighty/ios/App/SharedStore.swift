import Foundation
import WidgetKit

// Persists the "next flight" (soonest scheduled_dep in the future) into the
// App Group container so the widget can render it without hitting the network.
enum SharedStore {
    private static let filename = "next-flight.json"

    static func saveNextFlight(_ f: Flight) {
        guard let dir = AppConfig.sharedContainer else { return }
        let url = dir.appendingPathComponent(filename)
        let enc = JSONEncoder()
        do {
            let data = try enc.encode(f)
            try data.write(to: url, options: .atomic)
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            print("SharedStore save failed: \(error)")
        }
    }

    static func loadNextFlight() -> Flight? {
        guard let dir = AppConfig.sharedContainer else { return nil }
        let url = dir.appendingPathComponent(filename)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Flight.self, from: data)
    }
}
