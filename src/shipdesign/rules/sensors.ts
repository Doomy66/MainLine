/**
 * Step 7, Install Sensors. High Guard Update 2022, PDF page 22. ShipSpec 4.8.
 */

export type SensorGrade = "basic" | "civilian" | "military" | "improved" | "advanced";

export interface SensorRule {
  readonly label: string;
  readonly tl: number;
  readonly suite: readonly string[];
  /** DM to Electronics (comms) and Electronics (sensors) checks. */
  readonly dm: number;
  readonly power: number;
  readonly tons: number;
  /** MCr. */
  readonly cost: number;
}

/** Sensors table, page 22. Every ship has Basic unless upgraded. */
export const SENSORS: Readonly<Record<SensorGrade, SensorRule>> = {
  basic: { label: "Basic", tl: 8, suite: ["Lidar", "Radar"], dm: -4, power: 0, tons: 0, cost: 0 },
  civilian: { label: "Civilian Grade", tl: 9, suite: ["Lidar", "Radar"], dm: -2, power: 1, tons: 1, cost: 3 },
  military: { label: "Military Grade", tl: 10, suite: ["Jammers", "Lidar", "Radar"], dm: 0, power: 2, tons: 2, cost: 4.1 },
  improved: { label: "Improved", tl: 12, suite: ["Densitometer", "Jammers", "Lidar", "Radar"], dm: 1, power: 4, tons: 3, cost: 4.3 },
  advanced: { label: "Advanced", tl: 15, suite: ["Densitometer", "Jammers", "Lidar", "Neural Activity Sensor", "Radar"], dm: 2, power: 6, tons: 5, cost: 5.3 },
};
