import Foundation
import ActivityKit

// Shared between the app (which starts activities) and the Live Activity target (which renders them).
// Fields must stay in sync with `liveActivityState()` in backend/src/index.js.
public struct FlightActivityAttributes: ActivityAttributes {
    public typealias ContentState = FlightContentState

    public struct FlightContentState: Codable, Hashable {
        public var status: String
        public var scheduledDep: Date?
        public var scheduledArr: Date?
        public var estimatedDep: Date?
        public var estimatedArr: Date?
        public var gateDep: String?
        public var gateArr: String?
        public var terminalDep: String?
        public var terminalArr: String?
        public var originIata: String?
        public var destinationIata: String?

        public init(
            status: String,
            scheduledDep: Date? = nil,
            scheduledArr: Date? = nil,
            estimatedDep: Date? = nil,
            estimatedArr: Date? = nil,
            gateDep: String? = nil,
            gateArr: String? = nil,
            terminalDep: String? = nil,
            terminalArr: String? = nil,
            originIata: String? = nil,
            destinationIata: String? = nil
        ) {
            self.status = status
            self.scheduledDep = scheduledDep
            self.scheduledArr = scheduledArr
            self.estimatedDep = estimatedDep
            self.estimatedArr = estimatedArr
            self.gateDep = gateDep
            self.gateArr = gateArr
            self.terminalDep = terminalDep
            self.terminalArr = terminalArr
            self.originIata = originIata
            self.destinationIata = destinationIata
        }
    }

    // Static attributes set once when the activity is started.
    public var flightId: Int
    public var flightNumber: String
    public var airlineName: String?

    public init(flightId: Int, flightNumber: String, airlineName: String? = nil) {
        self.flightId = flightId
        self.flightNumber = flightNumber
        self.airlineName = airlineName
    }
}
