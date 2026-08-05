import ActivityKit
import WidgetKit
import SwiftUI

struct FlightLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FlightActivityAttributes.self) { context in
            LockScreenView(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(.black.opacity(0.75))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    AirportBlock(iata: context.state.originIata, label: "From")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    AirportBlock(iata: context.state.destinationIata, label: "To")
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 4) {
                        Text(context.attributes.flightNumber).font(.headline)
                        Image(systemName: "airplane").font(.title2).rotationEffect(.degrees(-30))
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        infoLine("Gate", context.state.gateDep ?? "—")
                        Spacer()
                        infoLine("Status", context.state.status.capitalized)
                        Spacer()
                        infoLine("Arrives", TimeText.short(context.state.estimatedArr ?? context.state.scheduledArr))
                    }
                    .font(.caption)
                }
            } compactLeading: {
                Image(systemName: "airplane").foregroundStyle(.blue)
            } compactTrailing: {
                Text(TimeText.short(context.state.estimatedArr ?? context.state.scheduledArr))
                    .monospacedDigit()
            } minimal: {
                Image(systemName: "airplane").foregroundStyle(.blue)
            }
        }
    }

    private func infoLine(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            Text(value).bold()
        }
    }
}

struct LockScreenView: View {
    let attributes: FlightActivityAttributes
    let state: FlightActivityAttributes.ContentState

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Text(attributes.flightNumber).font(.headline).foregroundStyle(.white)
                Spacer()
                Text(state.status.capitalized)
                    .font(.caption).bold()
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(.white.opacity(0.15))
                    .foregroundStyle(.white)
                    .clipShape(Capsule())
            }
            HStack(alignment: .center) {
                AirportBlock(iata: state.originIata, label: "From")
                Spacer()
                Image(systemName: "airplane").foregroundStyle(.white.opacity(0.9))
                Spacer()
                AirportBlock(iata: state.destinationIata, label: "To")
            }
            HStack {
                infoBlock("Departs", TimeText.short(state.estimatedDep ?? state.scheduledDep))
                Spacer()
                infoBlock("Gate", state.gateDep ?? "—")
                Spacer()
                infoBlock("Arrives", TimeText.short(state.estimatedArr ?? state.scheduledArr))
            }
            .foregroundStyle(.white)
        }
        .padding()
    }

    private func infoBlock(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption2).foregroundStyle(.white.opacity(0.7))
            Text(value).font(.headline)
        }
    }
}

struct AirportBlock: View {
    let iata: String?
    let label: String
    var body: some View {
        VStack(alignment: .center, spacing: 2) {
            Text(iata ?? "???").font(.system(size: 26, weight: .bold, design: .rounded))
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }
}

enum TimeText {
    static func short(_ d: Date?) -> String {
        guard let d else { return "—" }
        let f = DateFormatter()
        f.timeStyle = .short
        return f.string(from: d)
    }
}
