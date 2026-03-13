import { describe, expect, it } from "vitest";
import { accessImportSampleCsv, parseAccessImportCsv } from "@/lib/access-import";

describe("parseAccessImportCsv", () => {
  it("parses the sample csv into session roles", () => {
    expect(parseAccessImportCsv(accessImportSampleCsv)).toEqual([
      {
        name: "Jane Doe",
        email: "jane@example.com",
        role: "admin"
      }
    ]);
  });

  it("rejects duplicate emails", () => {
    expect(() =>
      parseAccessImportCsv(
        ["name,email,role", "Jane Doe,jane@example.com,operator", "Jane Again,jane@example.com,viewer"].join("\n")
      )
    ).toThrow("duplicate email");
  });

  it("requires the exact headers", () => {
    expect(() =>
      parseAccessImportCsv(["email,name,role", "jane@example.com,Jane Doe,operator"].join("\n"))
    ).toThrow("headers must be exactly");
  });
});
