import { describe, test, expect } from "bun:test";
import {
  filterAccountsByEmailAllowlist,
  getAllowedImageAccountEmails,
} from "../src/accounts";

describe("image account allowlist", () => {
  test("filters accounts by email (case-insensitive)", () => {
    const config = {
      version: 3,
      activeIndex: 0,
      accounts: [
        { email: "a@example.com", refreshToken: "t1", lastUsed: 2, rateLimitResetTimes: {} },
        { email: "B@Example.com", refreshToken: "t2", lastUsed: 1, rateLimitResetTimes: {} },
        { email: "c@example.com", refreshToken: "t3", lastUsed: 3, rateLimitResetTimes: {} },
      ],
    };

    const allowed = new Set(["b@example.com", "c@example.com"]);
    const filtered = filterAccountsByEmailAllowlist(config, allowed);

    expect(filtered.accounts.map((a) => a.refreshToken)).toEqual(["t2", "t3"]);
  });

  test("reads allowlist from OPENCODE_ANTIGRAVITY_IMAGE_ALLOWED_EMAILS", async () => {
    const prev = process.env.OPENCODE_ANTIGRAVITY_IMAGE_ALLOWED_EMAILS;
    process.env.OPENCODE_ANTIGRAVITY_IMAGE_ALLOWED_EMAILS = " a@example.com, B@Example.com  ,";

    try {
      const allowed = await getAllowedImageAccountEmails();
      expect(allowed).not.toBeNull();
      expect(allowed?.has("a@example.com")).toBe(true);
      expect(allowed?.has("b@example.com")).toBe(true);
    } finally {
      if (prev === undefined) {
        delete process.env.OPENCODE_ANTIGRAVITY_IMAGE_ALLOWED_EMAILS;
      } else {
        process.env.OPENCODE_ANTIGRAVITY_IMAGE_ALLOWED_EMAILS = prev;
      }
    }
  });
});
