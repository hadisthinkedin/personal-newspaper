import { describe, expect, it } from "vitest";
import {
  contextualUnavailableDefinition,
  selectWikipediaPage,
  summarizeWikipediaExtract,
} from "@/lib/entity-definition";

describe("dynamic entity definitions", () => {
  it("rejects an unrelated result even when one surname overlaps", () => {
    expect(selectWikipediaPage("Leila Haddad", [
      { title: "Wadie Haddad", description: "Palestinian militant" },
    ])).toBeUndefined();
  });

  it("rejects disambiguation pages that do not identify a specific entity", () => {
    expect(selectWikipediaPage("Block", [
      { title: "Block", description: "Topics referred to by the same term" },
    ])).toBeUndefined();
  });

  it("selects an exact reliable identity from several search results", () => {
    expect(selectWikipediaPage("Dario Amodei", [
      { title: "Daniela Amodei", description: "American entrepreneur" },
      { title: "Dario Amodei", description: "American AI entrepreneur" },
    ])?.title).toBe("Dario Amodei");
  });

  it("uses article context to reject an exact but unrelated person with the same name", () => {
    expect(selectWikipediaPage("John Walsh", [
      { title: "John Walsh", description: "American television personality and victims' rights advocate" },
    ], "Cybersecurity expert John Walsh discussed a connected-device cyberattack.")).toBeUndefined();
  });

  it("uses article context to select the relevant same-named person", () => {
    expect(selectWikipediaPage("John Walsh", [
      { title: "John Walsh", description: "American television personality and victims' rights advocate" },
      { title: "John Walsh (cybersecurity expert)", description: "American cybersecurity expert and technology executive" },
    ], "Cybersecurity expert John Walsh discussed a connected-device cyberattack.")?.title)
      .toBe("John Walsh (cybersecurity expert)");
  });

  it("builds an honest context definition when no independent biography is reliable", () => {
    const definition = contextualUnavailableDefinition(
      "John Walsh",
      "French fridge cyber attack reveals U.S. vulnerabilities, expert John Walsh says hackers are targeting connected devices.",
    );
    expect(definition).toMatch(/expert quoted in this report/i);
    expect(definition).toMatch(/cybersecurity|connected devices/i);
    expect(definition).toMatch(/not available|does not assume/i);
    expect(definition).not.toMatch(/television|America's Most Wanted/i);
  });

  it("uses two substantive summary sentences so the reader learns identity and significance", () => {
    const definition = summarizeWikipediaExtract(
      "Dario Amodei is an American artificial intelligence researcher and entrepreneur. In 2021, he co-founded Anthropic, the company behind Claude. A later valuation is not necessary here.",
    );
    expect(definition).toContain("researcher and entrepreneur");
    expect(definition).toContain("co-founded Anthropic");
    expect(definition).not.toContain("later valuation");
  });
});
