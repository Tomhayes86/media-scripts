import SwiftUI
import MapKit
import ActivityKit

struct FlightDetailView: View {
    let flightId: Int
    @EnvironmentObject var listVM: FlightListViewModel

    @State private var flight: Flight?
    @State private var events: [FlightEvent] = []
    @State private var positions: [FlightPosition] = []
    @State private var liveActivityRunning = false
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let flight {
                    BoardingPassCard(flight: flight)
                        .padding(.horizontal)

                    Toggle(isOn: Binding(
                        get: { flight.liveTracking },
                        set: { newVal in
                            Task {
                                if let updated = try? await API.shared.setLiveTracking(id: flight.id, on: newVal) {
                                    self.flight = updated
                                }
                            }
                        }
                    )) {
                        VStack(alignment: .leading) {
                            Text("Live position tracking")
                            Text("Polls every 2 minutes. Off to save battery.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal)

                    Toggle(isOn: Binding(
                        get: { liveActivityRunning },
                        set: { newVal in
                            Task {
                                if newVal { await startLiveActivity() }
                                else       { await LiveActivityManager.shared.end(for: flight.id); liveActivityRunning = false }
                            }
                        }
                    )) {
                        VStack(alignment: .leading) {
                            Text("Show on Lock Screen")
                            Text("Live Activity in the Dynamic Island.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal)

                    if !positions.isEmpty {
                        MapView(positions: positions)
                            .frame(height: 260)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                            .padding(.horizontal)
                    }

                    if !events.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Updates").font(.headline)
                            ForEach(events) { ev in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(ev.detail ?? ev.kind)
                                    if let d = ev.createdAt {
                                        Text(d.formatted()).font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                                .background(Color(.secondarySystemBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                        }.padding(.horizontal)
                    }
                } else {
                    ProgressView().padding()
                }
            }
            .padding(.vertical)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await refresh() }
                } label: { Image(systemName: "arrow.clockwise") }
                .disabled(busy)
            }
        }
        .task { await load() }
        .refreshable { await refresh() }
    }

    private func load() async {
        do {
            async let f = API.shared.getFlight(id: flightId)
            async let e = API.shared.events(flightId: flightId)
            async let p = API.shared.positions(flightId: flightId)
            self.flight = try await f
            self.events = try await e
            self.positions = try await p
            liveActivityRunning = LiveActivityManager.shared.isRunning(for: flightId)
            if let f = self.flight { SharedStore.saveNextFlight(f) }
        } catch {
            print("load error: \(error)")
        }
    }

    private func refresh() async {
        busy = true
        defer { busy = false }
        do {
            let f = try await API.shared.refreshFlight(id: flightId)
            self.flight = f
            SharedStore.saveNextFlight(f)
            self.events = (try? await API.shared.events(flightId: flightId)) ?? events
            self.positions = (try? await API.shared.positions(flightId: flightId)) ?? positions
            // Push the fresh state into any running Live Activity locally too.
            if liveActivityRunning {
                await LiveActivityManager.shared.update(for: f)
            }
        } catch {
            print("refresh error: \(error)")
        }
    }

    private func startLiveActivity() async {
        guard let flight else { return }
        do {
            try await LiveActivityManager.shared.start(for: flight)
            liveActivityRunning = true
        } catch {
            print("Live activity failed: \(error)")
        }
    }
}

struct MapView: UIViewRepresentable {
    let positions: [FlightPosition]

    func makeUIView(context: Context) -> MKMapView {
        let m = MKMapView()
        m.showsUserLocation = false
        return m
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        mapView.removeOverlays(mapView.overlays)
        mapView.removeAnnotations(mapView.annotations)
        let coords = positions.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon) }
        guard !coords.isEmpty else { return }
        let line = MKPolyline(coordinates: coords, count: coords.count)
        mapView.addOverlay(line)
        if let last = coords.last {
            let ann = MKPointAnnotation()
            ann.coordinate = last
            mapView.addAnnotation(ann)
        }
        var region = MKCoordinateRegion(line.boundingMapRect)
        region.span.latitudeDelta *= 1.3
        region.span.longitudeDelta *= 1.3
        mapView.setRegion(region, animated: false)
        mapView.delegate = context.coordinator
    }

    func makeCoordinator() -> Coordinator { Coordinator() }
    final class Coordinator: NSObject, MKMapViewDelegate {
        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let line = overlay as? MKPolyline {
                let r = MKPolylineRenderer(polyline: line)
                r.strokeColor = .systemBlue
                r.lineWidth = 3
                return r
            }
            return MKOverlayRenderer(overlay: overlay)
        }
    }
}
