import { describe, expect, it } from "vitest";
import { entityParts, knownEntityDefinition } from "@/lib/entities";

describe("entityParts", () => {
  it("marks known people, places, and organizations without changing the surrounding headline", () => {
    const headline = "Dario Amodei discusses Anthropic expansion in Detroit";
    const parts = entityParts(headline);

    expect(parts.map((part) => part.text).join("")).toBe(headline);
    expect(parts.filter((part) => part.entity).map((part) => part.text)).toEqual([
      "Dario Amodei",
      "Anthropic",
      "Detroit",
    ]);
  });

  it("marks previously unseen multiword proper names for a live definition lookup", () => {
    const parts = entityParts("Leila Haddad visits Grand Rapids after the announcement");

    expect(parts.filter((part) => part.entity).map((part) => part.text)).toEqual([
      "Leila Haddad",
      "Grand Rapids",
    ]);
  });

  it("extracts a person name without swallowing headline grammar or possessives", () => {
    const headline = "French fridge cyber attack exposes U.S. vulnerabilities, expert John Walsh says";
    const johnWalsh = entityParts(headline).find((part) => part.entity && part.text === "John Walsh");
    expect(johnWalsh?.definition).toMatch(/expert quoted in this report/i);
    expect(johnWalsh?.definition).toMatch(/cybersecurity|connected devices/i);

    expect(entityParts("After Trump's funding cuts, researchers headed abroad")
      .filter((part) => part.entity)
      .map((part) => part.text)).not.toContain("After Trump's");
  });

  it("recognizes Houthi and Houthis as the same unfamiliar movement with ready context", () => {
    for (const sentence of [
      "Houthi rebels attacked government forces in Yemen.",
      "The Houthis control much of northern Yemen.",
    ]) {
      const entity = entityParts(sentence).find((part) => part.entity && /Houthi/i.test(part.text));
      expect(entity?.definition).toMatch(/Ansar Allah/i);
      expect(entity?.definition).toMatch(/Yemen|Yemeni/i);
      expect(entity?.definition).toMatch(/Red Sea|civil war/i);
    }
  });

  it("provides impact-oriented context instead of dictionary-style labels", () => {
    expect(knownEntityDefinition("Dario Amodei")).toMatch(/co-found|founded/i);
    expect(knownEntityDefinition("Dario Amodei")).toMatch(/Anthropic/);
    expect(knownEntityDefinition("Block")).toMatch(/Square/);
    expect(knownEntityDefinition("Block")).toMatch(/Cash App/);
    expect(knownEntityDefinition("Lenfest Institute")).toMatch(/Philadelphia Inquirer/);
    expect(knownEntityDefinition("Lenfest Institute")).toMatch(/local journalism/i);
    expect(knownEntityDefinition("Houthi")).toMatch(/Ansar Allah/i);
    expect(knownEntityDefinition("houthis")).toMatch(/Red Sea shipping/i);
    expect(knownEntityDefinition("block")).toBeUndefined();
  });

  it("recognizes important single-word companies and journalism institutions", () => {
    const headline = "Block receives support from the Lenfest Institute";
    expect(entityParts(headline).filter((part) => part.entity).map((part) => part.text)).toEqual([
      "Block",
      "Lenfest Institute",
    ]);
  });

  it("does not mistake the ordinary word block for the company Block", () => {
    expect(entityParts("The policy could block the transaction.").some((part) => part.entity)).toBe(false);
    expect(entityParts("Block reported quarterly results.").filter((part) => part.entity).map((part) => part.text)).toEqual(["Block"]);
  });

  it("provides concise built-in definitions for high-frequency entities", () => {
    expect(knownEntityDefinition("Anthropic")).toMatch(/AI/);
    expect(knownEntityDefinition("Detroit")).toMatch(/Michigan/);
    expect(knownEntityDefinition("Dario Amodei")).toMatch(/Anthropic/);
  });
});
