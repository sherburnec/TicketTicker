/**
 * Patrol defaults. All values are [Proposed] (FR-36, FR-38, FR-44) and kept here, unchanged, until told otherwise.
 * The depot radius is a placeholder: PRD §8.3 gives the depot as a point, and plan OQ11 (exclusion zones) is open.
 */
export const PATROL_DEFAULTS = {
  /** Aggregation grid cell size in metres (FR-38). */
  gridMeters: 25,
  /** Format A gaps longer than this get no dwell weight (FR-36). */
  gapMinutes: 5,
  /** Points within this distance of the city depot are excluded (FR-32). */
  depotRadiusMeters: 100,
};

/** Sample patrol generator defaults (FR-44). */
export const PATROL_SAMPLE_DEFAULTS = {
  vehicles: 4,
  weekday: { startHour: 7, endHour: 18 },
  weekendVehicles: 2,
  weekend: { startHour: 9, endHour: 17 },
  pingSeconds: 30,
  speedMph: { min: 5, max: 25 },
  /** Chance per ping interval that the vehicle begins a stop, and the stop length range. */
  stopChance: 0.01,
  stopMinutes: { min: 1, max: 10 },
  breakMinutes: 30,
  jitterMeters: 5,
  /** A street segment within this distance of a hot zone gets that zone's weight added to its base weight of 1. */
  hotZoneRadiusMeters: 300,
  /** Pings idling at the depot at the start and end of each shift. */
  depotPings: 3,
  dropRate: 0.01,
  /** Chance per ping interval that a multi-minute gap begins, and its length range. */
  gapChance: 0.001,
  gapMinutes: { min: 6, max: 20 },
};
