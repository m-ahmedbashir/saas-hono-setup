import { describe, it, expect } from "vitest";
import { slugCandidates, slugify } from "./slug";

describe("slugify", () => {
  it("turns a name into a lowercase, hyphenated slug", () => {
    expect(slugify("Acme Rockets, Inc.")).toBe("acme-rockets-inc");
  });

  it("drops accents rather than the letters carrying them", () => {
    expect(slugify("Café Société")).toBe("cafe-societe");
  });

  it("falls back to a generic slug when nothing usable is left", () => {
    expect(slugify("株式会社")).toBe("organization");
    expect(slugify("   ")).toBe("organization");
  });

  it("caps the length without leaving a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(47)} b`);
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("slugCandidates", () => {
  it("tries the plain slug first, then suffixed variants", () => {
    const [first, ...rest] = slugCandidates("acme");
    expect(first).toBe("acme");
    expect(rest.length).toBeGreaterThan(0);
    for (const candidate of rest) expect(candidate).toMatch(/^acme-[a-z0-9]{6}$/);
  });
});
