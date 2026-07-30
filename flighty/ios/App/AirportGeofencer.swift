import Foundation
import CoreLocation

// Registers a 4 km circular geofence around the origin airport of every
// upcoming flight. When iOS reports we entered one, we flip that flight's
// live-tracking on so position + status polling starts before we push back.
//
// iOS caps active regions at 20 per app; we prioritise the soonest flights.
@MainActor
final class AirportGeofencer: NSObject, ObservableObject {
    static let shared = AirportGeofencer()

    private let manager = CLLocationManager()
    private var monitored: [CLCircularRegion: Int] = [:]  // region → flight id

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.allowsBackgroundLocationUpdates = false
        manager.pausesLocationUpdatesAutomatically = true
    }

    func requestAuthorization() {
        // "Always" is required for region monitoring to fire in background.
        manager.requestAlwaysAuthorization()
    }

    /// Re-syncs geofences to the current flight list. Call after list changes.
    func sync(with flights: [Flight]) {
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return }

        // Clear existing monitoring — cheaper than diffing, and iOS caps at 20 anyway.
        for r in manager.monitoredRegions { manager.stopMonitoring(for: r) }
        monitored.removeAll()

        // Take the 20 soonest flights that haven't departed and have coordinates.
        let now = Date()
        let candidates = flights
            .filter { f in
                guard let lat = f.originLat, let lon = f.originLon else { return false }
                _ = (lat, lon)   // silence unused warnings when we later add fences
                let dep = f.estimatedDep ?? f.scheduledDep ?? .distantPast
                let status = (f.status ?? "").lowercased()
                return dep > now && !["landed", "arrived", "cancelled", "en_route", "enroute"].contains(status)
            }
            .sorted { (a, b) in
                (a.estimatedDep ?? a.scheduledDep ?? .distantFuture) <
                (b.estimatedDep ?? b.scheduledDep ?? .distantFuture)
            }
            .prefix(20)

        for f in candidates {
            guard let lat = f.originLat, let lon = f.originLon else { continue }
            let coord = CLLocationCoordinate2D(latitude: lat, longitude: lon)
            let region = CLCircularRegion(
                center: coord,
                radius: 4000,           // 4 km — covers most airport footprints
                identifier: "flight-\(f.id)"
            )
            region.notifyOnEntry = true
            region.notifyOnExit = false
            manager.startMonitoring(for: region)
            monitored[region] = f.id
        }
    }
}

extension AirportGeofencer: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager,
                                     didEnterRegion region: CLRegion) {
        guard let circular = region as? CLCircularRegion else { return }
        Task { @MainActor in
            guard let flightId = self.monitored[circular] else { return }
            _ = try? await API.shared.setLiveTracking(id: flightId, on: true)
            // Local notification so we can see the trigger fired.
            let content = UNMutableNotificationContent()
            content.title = "At the airport"
            content.body = "Live tracking is on."
            content.sound = .default
            let req = UNNotificationRequest(identifier: "geofence-\(flightId)",
                                            content: content,
                                            trigger: nil)
            try? await UNUserNotificationCenter.current().add(req)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager,
                                     didFailWithError error: Error) {
        print("Location manager error: \(error)")
    }
}
