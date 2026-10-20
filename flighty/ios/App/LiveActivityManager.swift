import Foundation
import ActivityKit

@MainActor
final class LiveActivityManager {
    static let shared = LiveActivityManager()

    // flight.id -> activity
    private var activities: [Int: Activity<FlightActivityAttributes>] = [:]

    private init() {
        // Reattach on relaunch: ActivityKit persists activities across app restarts.
        for a in Activity<FlightActivityAttributes>.activities {
            activities[a.attributes.flightId] = a
            observePushToken(a)
        }
    }

    func isRunning(for flightId: Int) -> Bool { activities[flightId] != nil }

    func start(for flight: Flight) async throws {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            throw NSError(domain: "LiveActivity", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Live Activities disabled in Settings."])
        }
        // If one is already running, just update it.
        if let existing = activities[flight.id] {
            await existing.update(ActivityContent(state: state(from: flight), staleDate: staleDate()))
            return
        }
        let attributes = FlightActivityAttributes(
            flightId: flight.id,
            flightNumber: flight.flightNumber,
            airlineName: flight.airlineName
        )
        let content = ActivityContent(state: state(from: flight), staleDate: staleDate())
        let activity = try Activity.request(
            attributes: attributes,
            content: content,
            pushType: .token
        )
        activities[flight.id] = activity
        observePushToken(activity)
    }

    func update(for flight: Flight) async {
        guard let a = activities[flight.id] else { return }
        await a.update(ActivityContent(state: state(from: flight), staleDate: staleDate()))
    }

    func end(for flightId: Int) async {
        guard let a = activities[flightId] else { return }
        await a.end(nil, dismissalPolicy: .immediate)
        activities.removeValue(forKey: flightId)
        // Server-side cleanup is best-effort; the token stops working once the
        // activity ends, and the backend also cleans up on 410 responses.
    }

    private func state(from f: Flight) -> FlightActivityAttributes.ContentState {
        .init(
            status: f.status ?? "scheduled",
            scheduledDep: f.scheduledDep,
            scheduledArr: f.scheduledArr,
            estimatedDep: f.estimatedDep,
            estimatedArr: f.estimatedArr,
            gateDep: f.gateDep,
            gateArr: f.gateArr,
            terminalDep: f.terminalDep,
            terminalArr: f.terminalArr,
            originIata: f.originIata,
            destinationIata: f.destinationIata
        )
    }

    private func staleDate() -> Date { .now.addingTimeInterval(15 * 60) }

    private func observePushToken(_ activity: Activity<FlightActivityAttributes>) {
        Task {
            for await tokenData in activity.pushTokenUpdates {
                let hex = tokenData.map { String(format: "%02x", $0) }.joined()
                let flightId = activity.attributes.flightId
                try? await API.shared.registerLiveActivity(flightId: flightId, pushToken: hex)
            }
        }
        Task {
            for await state in activity.activityStateUpdates {
                if state == .ended || state == .dismissed {
                    await MainActor.run {
                        self.activities.removeValue(forKey: activity.attributes.flightId)
                    }
                }
            }
        }
    }
}
