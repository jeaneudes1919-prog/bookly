import {describe, expect, it} from "vitest";
import {addDays, dLabel, fcfa, hm} from "../lib.js";

describe("formatters", () => {
  it("formate les montants en FCFA", () => {
    expect(fcfa(8000)).toMatch(/8.*000.*FCFA/);
    expect(fcfa(0)).toContain("FCFA");
  });

  it("ajoute des jours sans décalage de fuseau", () => {
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("formate les heures et les dates en français", () => {
    expect(hm("2026-11-02T09:30")).toBe("09h30");
    expect(dLabel("2026-11-02", {weekday: "long", day: "numeric", month: "long"})).toContain("novembre");
  });
});
