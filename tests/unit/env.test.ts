import { describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "@/config/env.schema";

describe("public environment", () => {
  it("defaults the app URL and treats empty values as unset", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_APP_URL: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "  ",
    });
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeUndefined();
  });

  it("rejects an invalid Supabase URL", () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});

describe("server environment", () => {
  it("accepts a configuration with no integration keys yet", () => {
    const env = parseServerEnv({ NODE_ENV: "test", GEMINI_API_KEY: "" });
    expect(env.NODE_ENV).toBe("test");
    expect(env.GEMINI_API_KEY).toBeUndefined();
  });

  it("never includes variable values in validation errors", () => {
    const secret = "super-secret-value";
    let message = "";
    try {
      parseServerEnv({ NODE_ENV: secret });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("NODE_ENV");
    expect(message).not.toContain(secret);
  });
});
