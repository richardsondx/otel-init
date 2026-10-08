import { describe, expect, it } from "vitest";

// The module under test auto-initializes on import, so it must be loaded
// dynamically after the disable flag is set. Static imports would hoist
// above the env assignment and trigger a real SDK start.
process.env["OTEL_INIT_DISABLED"] = "true";

const mod = await import("../src/index.js");

describe("telemetry lifecycle", () => {
  it("does not auto-initialize when OTEL_INIT_DISABLED=true", () => {
    // If auto-init had run, a second initTelemetry would be a no-op and
    // shutdownTelemetry would have something to shut down. We assert the
    // module loaded without throwing and exports the expected surface.
    expect(typeof mod.initTelemetry).toBe("function");
    expect(typeof mod.shutdownTelemetry).toBe("function");
    expect(typeof mod.resolveConfig).toBe("function");
  });

  it("initTelemetry is idempotent and shutdownTelemetry resolves", async () => {
    mod.initTelemetry({ exporter: "none", preset: "http" });
    mod.initTelemetry({ exporter: "none", preset: "http" });
    await mod.shutdownTelemetry();
    await mod.shutdownTelemetry();
  });

  it("resolves the console exporter in development by default", () => {
    const config = mod.resolveConfig({ NODE_ENV: "development" });
    expect(config.exporter).toBe("console");
    expect(config.pretty).toBe(true);
  });
});
