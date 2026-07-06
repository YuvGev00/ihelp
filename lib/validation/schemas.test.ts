import { describe, expect, it } from "vitest";
import { requestSchema, requestEditSchema } from "./request";
import { offerSchema } from "./offer";
import { ratingSchema } from "./rating";
import { profileSchema } from "./profile";
import {
  identityApplicationSchema,
  professionalApplicationSchema,
} from "./verification";

const validRequest = {
  title: "עזרה בהרכבת ארון",
  description: "ארון איקאה שהגיע בקרטונים, שעתיים עבודה.",
  category: "repairs",
  lat: "32.08",
  lng: "34.78",
  photoPaths: ["user-1/photo.png"],
};

describe("requestSchema — invalid inputs (assignment §3.4)", () => {
  it("accepts a valid paid request", () => {
    expect(requestSchema.safeParse(validRequest).success).toBe(true);
  });

  it("rejects a too-short title and description", () => {
    expect(requestSchema.safeParse({ ...validRequest, title: "אב" }).success).toBe(false);
    expect(
      requestSchema.safeParse({ ...validRequest, description: "קצר" }).success
    ).toBe(false);
  });

  it("rejects an unknown category", () => {
    expect(
      requestSchema.safeParse({ ...validRequest, category: "hacking" }).success
    ).toBe(false);
  });

  it("REGRESSION: absent location must fail, not become (0,0) Null Island", () => {
    // formData.get() returns null for absent hidden inputs
    const r = requestSchema.safeParse({ ...validRequest, lat: null, lng: null });
    expect(r.success).toBe(false);
    const r2 = requestSchema.safeParse({ ...validRequest, lat: "", lng: "" });
    expect(r2.success).toBe(false);
  });

  it("rejects photo counts of 0 and 6", () => {
    expect(requestSchema.safeParse({ ...validRequest, photoPaths: [] }).success).toBe(false);
    expect(
      requestSchema.safeParse({
        ...validRequest,
        photoPaths: Array.from({ length: 6 }, (_, i) => `u/p${i}.png`),
      }).success
    ).toBe(false);
  });

  it("requestEditSchema keeps the same content bounds", () => {
    expect(
      requestEditSchema.safeParse({
        title: "כותרת תקינה",
        description: "תיאור ארוך מספיק לבדיקה",
        category: "moving",
      }).success
    ).toBe(true);
  });
});

describe("offerSchema — the three pricing stances", () => {
  it("fixed requires a price; volunteer and after_job forbid one", () => {
    expect(
      offerSchema.safeParse({ message: "אשמח לעזור", pricingMode: "fixed", price: "150" }).success
    ).toBe(true);
    expect(
      offerSchema.safeParse({ message: "אשמח לעזור", pricingMode: "volunteer", price: undefined }).success
    ).toBe(true);
    expect(
      offerSchema.safeParse({ message: "אתמחר בסוף", pricingMode: "after_job", price: undefined }).success
    ).toBe(true);
  });

  it("rejects the mismatches: fixed-without-price and non-fixed-with-price", () => {
    expect(
      offerSchema.safeParse({ message: "אשמח לעזור", pricingMode: "fixed", price: undefined }).success
    ).toBe(false);
    expect(
      offerSchema.safeParse({ message: "אשמח לעזור", pricingMode: "volunteer", price: "50" }).success
    ).toBe(false);
    expect(
      offerSchema.safeParse({ message: "אשמח לעזור", pricingMode: "after_job", price: "50" }).success
    ).toBe(false);
  });

  it("rejects fixed prices out of bounds", () => {
    const base = { message: "אשמח לעזור", pricingMode: "fixed" as const };
    expect(offerSchema.safeParse({ ...base, price: "0" }).success).toBe(false);
    expect(offerSchema.safeParse({ ...base, price: "-5" }).success).toBe(false);
    expect(offerSchema.safeParse({ ...base, price: "100000" }).success).toBe(false);
  });

  it("rejects too-short and too-long messages", () => {
    expect(offerSchema.safeParse({ message: "היי", pricingMode: "volunteer" }).success).toBe(false);
    expect(
      offerSchema.safeParse({ message: "א".repeat(1001), pricingMode: "volunteer" }).success
    ).toBe(false);
  });
});

describe("ratingSchema", () => {
  it("accepts 1..5 and rejects 0, 6, and fractions", () => {
    expect(ratingSchema.safeParse({ stars: "5", note: "" }).success).toBe(true);
    expect(ratingSchema.safeParse({ stars: "0", note: "" }).success).toBe(false);
    expect(ratingSchema.safeParse({ stars: "6", note: "" }).success).toBe(false);
    expect(ratingSchema.safeParse({ stars: "3.5", note: "" }).success).toBe(false);
  });

  it("REGRESSION: empty stars (nothing selected) fails", () => {
    expect(ratingSchema.safeParse({ stars: "", note: "" }).success).toBe(false);
  });
});

describe("profile + verification schemas — phone format", () => {
  it("accepts Israeli formats, rejects garbage", () => {
    for (const good of ["0501234567", "031234567"]) {
      expect(profileSchema.safeParse({ displayName: "דנה", phone: good }).success).toBe(true);
    }
    for (const bad of ["+972501234567", "12345", "05O1234567", "0"]) {
      expect(profileSchema.safeParse({ displayName: "דנה", phone: bad }).success).toBe(false);
    }
  });

  it("identity application requires a phone; professional requires a document", () => {
    expect(
      identityApplicationSchema.safeParse({
        fullName: "דנה לוי",
        selfDescription: "",
        phone: "",
        docPath: "",
      }).success
    ).toBe(false);
    expect(
      professionalApplicationSchema.safeParse({
        fullName: "יוסי כהן",
        selfDescription: "",
        docPath: "",
      }).success
    ).toBe(false);
  });

  it("REGRESSION: identity application without the optional ID photo passes", () => {
    expect(
      identityApplicationSchema.safeParse({
        fullName: "דנה לוי",
        selfDescription: "שכנה שעוזרת",
        phone: "0501234567",
        docPath: "", // absent upload normalized by the action
      }).success
    ).toBe(true);
  });
});
