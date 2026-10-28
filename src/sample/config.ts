/** Shared sample-data settings (FR-2, FR-3, FR-4d, FR-43). All values are [Proposed] defaults. */
export interface SampleConfig {
  /** The single duration variable for citation and patrol samples, in months (FR-2, FR-43). */
  durationMonths: number;
  /** Last day of the sample, ISO date; also the default as-of date. Fixed so a seeded run is reproducible. */
  endDate: string;
  /** Makes a run reproducible; a random seed is chosen when absent. */
  seed?: string | number;
  /** Average citations per day, with day-to-day variation as a fraction of the mean (FR-4d). */
  citationsPerDay: number;
  dailyVariation: number;
  /** Outcome shares for settled citations; they should sum to 1. */
  outcomeShares: { paid: number; reversed: number; unpaid: number };
  /** Month-to-month swing in each share, in fraction points (0.05 = 5 percentage points). */
  monthlyVariation: number;
  /** Share of citations still inside the payment window that are Pending. */
  pendingShare: number;
  /** Share of Paid citations paid at the escalated amount. */
  escalatedPaidShare: number;
  /** Number of distinct sample officer numbers. */
  officerCount: number;
}

export const DEFAULT_SAMPLE_CONFIG: SampleConfig = {
  durationMonths: 1,
  endDate: '2026-09-30',
  citationsPerDay: 200,
  dailyVariation: 0.15,
  outcomeShares: { paid: 0.7, reversed: 0.2, unpaid: 0.1 },
  monthlyVariation: 0.05,
  pendingShare: 0.03,
  escalatedPaidShare: 0.25,
  officerCount: 12,
};

export function sampleConfig(overrides: Partial<SampleConfig> = {}): SampleConfig {
  return { ...DEFAULT_SAMPLE_CONFIG, ...overrides };
}
