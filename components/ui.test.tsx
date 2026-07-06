// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, Stars, StatusChip } from "./ui";

describe("Stars", () => {
  it("shows the empty state when there are no ratings", () => {
    render(<Stars value={null} count={0} />);
    expect(screen.getByText("עדיין אין דירוגים")).toBeDefined();
  });

  it("renders the average with one decimal and the count", () => {
    render(<Stars value={4.5} count={12} />);
    expect(screen.getByText("4.5")).toBeDefined();
    expect(screen.getByText("(12)")).toBeDefined();
  });
});

describe("StatusChip", () => {
  it.each([
    ["open", "פתוחה"],
    ["has_offers", "יש הצעות"],
    ["assigned", "שובצה"],
    ["completed", "הושלמה"],
    ["rated", "דורגה"],
    ["cancelled", "בוטלה"],
  ])("renders the Hebrew label for %s", (status, label) => {
    render(<StatusChip status={status} />);
    expect(screen.getByText(label)).toBeDefined();
  });
});

describe("Badge", () => {
  it("renders nothing for unverified users", () => {
    const { container } = render(<Badge verified={false} />);
    expect(container.textContent).toBe("");
  });

  it("shows identity badge alone, and professional on top", () => {
    render(<Badge verified professional={false} />);
    expect(screen.getByText(/זהות מאומתת/)).toBeDefined();

    render(<Badge verified professional />);
    expect(screen.getByText("בעל מקצוע")).toBeDefined();
  });
});
