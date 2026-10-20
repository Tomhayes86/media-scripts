import SwiftUI
import UIKit
import UserNotifications

@main
struct FlightyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate

    init() {
        AppConfig.publishToSharedDefaults()
    }

    var body: some Scene {
        WindowGroup {
            FlightListView()
                .task {
                    await requestPushAuth()
                    AirportGeofencer.shared.requestAuthorization()
                }
        }
    }

    private func requestPushAuth() async {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound])
            if granted {
                await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
            }
        } catch {
            // user denied — fine
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ app: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ app: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { try? await API.shared.registerDevice(token: hex, name: UIDevice.current.name) }
    }

    func application(_ app: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("APNs register failed: \(error)")
    }
}

extension AppDelegate: UNUserNotificationCenterDelegate {
    // Show banners while the app is foreground too.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }
}
