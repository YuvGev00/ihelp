import { describe, expect, it } from "vitest";
import { haversineKm, formatDistance } from "./geo";

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm(32.08, 34.78, 32.08, 34.78)).toBe(0);
  });

  it("Tel Aviv <-> Jerusalem is ~54km great-circle", () => {
    const km = haversineKm(32.0853, 34.7818, 31.7683, 35.2137);
    expect(km).toBeGreaterThan(52);
    expect(km).toBeLessThan(56);
  });

  it("Tel Aviv <-> Haifa is ~85km great-circle", () => {
    const km = haversineKm(32.0853, 34.7818, 32.794, 34.9896);
    expect(km).toBeGreaterThan(80);
    expect(km).toBeLessThan(90);
  });

  it("is symmetric", () => {
    const a = haversineKm(32.0853, 34.7818, 31.7683, 35.2137);
    const b = haversineKm(31.7683, 35.2137, 32.0853, 34.7818);
    expect(a).toBeCloseTo(b, 10);
  });
});

describe("formatDistance", () => {
  it("shows one decimal under 1km", () => {
    expect(formatDistance(0.44)).toBe('0.4 ק"מ');
  });

  it("rounds whole km at 1km and above", () => {
    expect(formatDistance(2.6)).toBe('3 ק"מ');
    expect(formatDistance(12.2)).toBe('12 ק"מ');
  });
});
