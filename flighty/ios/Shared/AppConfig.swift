import Foundation

// Change this once, then rebuild.
// Must match the API URL of your deployed Cloudflare Worker.
public enum AppConfig {
    public static let apiBaseURL = URL(string: "https://flighty.example.workers.dev")!

    // App Group used to share flight data between the app, widget, and Live Activity.
    // Must match the group listed in every target's entitlements plist.
    public static let appGroup = "group.com.example.flighty"

    public static var sharedDefaults: UserDefaults {
        UserDefaults(suiteName: appGroup) ?? .standard
    }
    public static var sharedContainer: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    }
}
