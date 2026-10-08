import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config.js";

describe("resolveConfig", () => {
  it.each([
    ["dev defaults to pretty console", { NODE_ENV: "development" }, "console", true],
    ["production defaults to OTLP", { NODE_ENV: "production" }, "otlp", true],
    ["test defaults to no exporter", { NODE_ENV: "test" }, "none", true],
    ["unset NODE_ENV behaves like development", {}, "console", true],
    ["explicit override wins over NODE_ENV", { NODE_ENV: "production", OTEL_INIT_EXPORTER: "console" }, "console", true],
    ["OTEL_INIT_PRETTY=false disables waterfall", { OTEL_INIT_PRETTY: "false" }, "console", false]
  ])("%s", (_desc, env, exporter, pretty) => {
    const config = resolveConfig(env as NodeJS.ProcessEnv);
    expect(config.exporter).toBe(exporter);
    expect(config.pretty).toBe(pretty);
  });

  it("defaults the OTLP endpoint to localhost:4318", () => {
    expect(resolveConfig({}).otlpEndpoint).toBe("http://localhost:4318");
  });

  it("respects OTEL_EXPORTER_OTLP_ENDPOINT", () => {
    const config = resolveConfig({
      OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example.com:4318"
    });
    expect(config.otlpEndpoint).toBe("https://otel.example.com:4318");
  });

  it("resolves service name from OTEL_SERVICE_NAME first", () => {
    const config = resolveConfig({
      OTEL_SERVICE_NAME: "payments",
      npm_package_name: "payments-app"
    });
    expect(config.serviceName).toBe("payments");
  });

  it("falls back to npm_package_name then unknown-service", () => {
    expect(resolveConfig({ npm_package_name: "shop" }).serviceName).toBe("shop");
    expect(resolveConfig({}).serviceName).toBe("unknown-service");
  });

  it.each([
    ["express", "express"],
    ["fastify", "fastify"],
    ["nestjs", "nestjs"],
    ["http", "http"],
    ["all", "all"],
    ["bogus falls back to all", "all"]
  ])("preset %s resolves", (input, expected) => {
    expect(resolveConfig({ OTEL_INIT_PRESET: input }).preset).toBe(expected);
  });

  it("overrides beat env vars", () => {
    const config = resolveConfig(
      { NODE_ENV: "production", OTEL_SERVICE_NAME: "a" },
      { exporter: "none", serviceName: "b", pretty: false }
    );
    expect(config.exporter).toBe("none");
    expect(config.serviceName).toBe("b");
    expect(config.pretty).toBe(false);
  });
});
