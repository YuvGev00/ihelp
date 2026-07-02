/**
 * Canonical category list. The DB CHECK constraint on help_requests.category
 * mirrors these keys — adding a category means updating both (a deliberate,
 * data-shaped migration; design doc 03 §1.1).
 */
export const CATEGORIES = [
  { key: "repairs", label: "תיקונים ותחזוקה" },
  { key: "electricity", label: "חשמל" },
  { key: "plumbing", label: "אינסטלציה" },
  { key: "moving", label: "הובלות וסבלות" },
  { key: "tutoring", label: "שיעורים פרטיים" },
  { key: "tech_help", label: "מחשבים וטכנולוגיה" },
  { key: "errands", label: "סידורים וקניות" },
  { key: "gardening", label: "גינון" },
  { key: "pets", label: "בעלי חיים" },
  { key: "other", label: "אחר" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [
  CategoryKey,
  ...CategoryKey[]
];

export function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
