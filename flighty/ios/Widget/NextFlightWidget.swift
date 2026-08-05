import WidgetKit
import SwiftUI

struct NextFlightWidget: Widget {
    let kind = "NextFlightWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NextFlightProvider()) { entry in
            NextFlightWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    LinearGradient(colors: [.blue, .indigo], startPoint: .topLeading, endPoint: .bottomTrailing)
                }
        }
        .configurationDisplayName("Next flight")
        .description("Shows your next upcoming flight.")
        .supportedFamilies([
            .systemSmall, .systemMedium,
            .accessoryRectangular, .accessoryInline,
        ])
    }
}

struct NextFlightEntry: TimelineEntry {
    let date: Date
    let flight: Flight?
}

struct NextFlightProvider: TimelineProvider {
    func placeholder(in context: Context) -> NextFlightEntry {
        NextFlightEntry(date: .now, flight: nil)
    }
    func getSnapshot(in context: Context, completion: @escaping (NextFlightEntry) -> Void) {
        completion(NextFlightEntry(date: .now, flight: SharedStore.loadNextFlight()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<NextFlightEntry>) -> Void) {
        let entry = NextFlightEntry(date: .now, flight: SharedStore.loadNextFlight())
        // Refresh every 30 min; the host app will also nudge us via WidgetCenter after any change.
        let next = Date().addingTimeInterval(30 * 60)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct NextFlightWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: NextFlightEntry

    var body: some View {
        switch family {
        case .accessoryInline:      inlineView
        case .accessoryRectangular: rectangularAccessory
        case .systemMedium:         medium
        default:                    small
        }
    }

    @ViewBuilder private var small: some View {
        if let f = entry.flight {
            VStack(alignment: .leading, spacing: 4) {
                Text(f.flightNumber).font(.headline).foregroundStyle(.white)
                HStack {
                    Text(f.originIata ?? "???").font(.title).bold().foregroundStyle(.white)
                    Image(systemName: "airplane.departure").foregroundStyle(.white.opacity(0.8))
                }
                Text(f.destinationIata ?? "???").font(.title).bold().foregroundStyle(.white)
                Text(TimeText.short(f.estimatedDep ?? f.scheduledDep))
                    .font(.footnote).foregroundStyle(.white.opacity(0.8))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        } else {
            emptyState
        }
    }

    @ViewBuilder private var medium: some View {
        if let f = entry.flight {
            VStack(spacing: 8) {
                HStack {
                    Text(f.flightNumber).font(.headline).foregroundStyle(.white)
                    Spacer()
                    Text((f.status ?? "scheduled").capitalized)
                        .font(.caption).bold()
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(.white.opacity(0.15)).foregroundStyle(.white)
                        .clipShape(Capsule())
                }
                HStack {
                    Text(f.originIata ?? "???").font(.system(size: 30, weight: .bold, design: .rounded)).foregroundStyle(.white)
                    Spacer()
                    Image(systemName: "airplane").foregroundStyle(.white.opacity(0.9))
                    Spacer()
                    Text(f.destinationIata ?? "???").font(.system(size: 30, weight: .bold, design: .rounded)).foregroundStyle(.white)
                }
                HStack {
                    labelled("Departs", TimeText.short(f.estimatedDep ?? f.scheduledDep))
                    Spacer()
                    labelled("Gate", f.gateDep ?? "—")
                    Spacer()
                    labelled("Arrives", TimeText.short(f.estimatedArr ?? f.scheduledArr))
                }
                .foregroundStyle(.white)
            }
        } else {
            emptyState
        }
    }

    private func labelled(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.caption2).foregroundStyle(.white.opacity(0.7))
            Text(value).font(.subheadline).bold()
        }
    }

    @ViewBuilder private var rectangularAccessory: some View {
        if let f = entry.flight {
            VStack(alignment: .leading) {
                Text("\(f.originIata ?? "???") → \(f.destinationIata ?? "???")").font(.headline)
                Text(f.flightNumber).font(.caption)
                Text(TimeText.short(f.estimatedDep ?? f.scheduledDep)).font(.caption2)
            }
        } else {
            Text("No flight").font(.caption)
        }
    }

    @ViewBuilder private var inlineView: some View {
        if let f = entry.flight {
            Text("\(f.flightNumber) \(f.originIata ?? "???")→\(f.destinationIata ?? "???")")
        } else {
            Text("No upcoming flight")
        }
    }

    private var emptyState: some View {
        VStack {
            Image(systemName: "airplane").font(.title).foregroundStyle(.white)
            Text("No flights").foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
