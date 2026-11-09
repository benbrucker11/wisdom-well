import { describe, expect, it } from "vitest";
import { isReminderDue } from "./reminders";
import { WELL_LEVEL_SIZE, bucketCoverage, wellState } from "./well";

describe("wellState", () => {
  it("is empty at zero", () => {
    expect(wellState(0)).toEqual({ total: 0, level: 1, fill: 0, toNextLevel: WELL_LEVEL_SIZE });
  });

  it("counts everything and fills in levels of 10", () => {
    expect(wellState(3)).toMatchObject({ level: 1, fill: 0.3, toNextLevel: 7 });
    expect(wellState(10)).toMatchObject({ level: 2, toNextLevel: 10 });
    expect(wellState(27)).toMatchObject({ level: 3, fill: 0.7 });
  });

  it("never looks empty once something has been shared", () => {
    expect(wellState(10).fill).toBeGreaterThan(0);
    expect(wellState(1).fill).toBeGreaterThan(0);
  });
});

describe("bucketCoverage", () => {
  it("lists the 14 core buckets with counts, ignoring unknown and optional", () => {
    const cov = bucketCoverage([
      "relationships",
      "relationships",
      "faith-and-beliefs",
      "politics-and-current-events",
      null,
      "not-a-bucket",
    ]);
    expect(cov).toHaveLength(14);
    expect(cov.find((c) => c.slug === "relationships")?.count).toBe(2);
    expect(cov.find((c) => c.slug === "faith-and-beliefs")?.count).toBe(1);
    expect(cov.find((c) => c.slug === "politics-and-current-events")).toBeUndefined();
  });
});

describe("isReminderDue", () => {
  const created = new Date("2026-10-01T09:00:00Z");
  const at = (iso: string) => new Date(iso);

  it("never sends when off", () => {
    expect(
      isReminderDue({ frequency: "OFF", lastRemindedAt: null, createdAt: created, now: at("2027-01-01T00:00:00Z") }),
    ).toBe(false);
  });

  it("waits a full interval after joining", () => {
    expect(isReminderDue({ frequency: "BIWEEKLY", lastRemindedAt: null, createdAt: created, now: at("2026-10-10T09:00:00Z") })).toBe(false);
    expect(isReminderDue({ frequency: "BIWEEKLY", lastRemindedAt: null, createdAt: created, now: at("2026-10-15T09:00:00Z") })).toBe(true);
  });

  it("respects each cadence from the last reminder, with half a day of slack", () => {
    const last = at("2026-11-01T12:00:00Z");
    const due = (frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY", now: string) =>
      isReminderDue({ frequency, lastRemindedAt: last, createdAt: created, now: at(now) });
    expect(due("WEEKLY", "2026-11-07T23:00:00Z")).toBe(false);
    expect(due("WEEKLY", "2026-11-08T06:00:00Z")).toBe(true); // job ran a few hours "early"
    expect(due("BIWEEKLY", "2026-11-08T12:00:00Z")).toBe(false);
    expect(due("BIWEEKLY", "2026-11-15T12:00:00Z")).toBe(true);
    expect(due("MONTHLY", "2026-11-20T12:00:00Z")).toBe(false);
    expect(due("MONTHLY", "2026-12-01T12:00:00Z")).toBe(true);
  });
});
