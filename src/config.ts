/**
 * Env-driven configuration. Everything has a default; nothing is required.
 *
 * Env vars:
 *   OTEL_SERVICE_NAME            service.name (default: npm_package_name or "unknown-service")
 *   NODE_ENV                     development -> pretty console; production -> OTLP; test -> none
 *   OTEL_INIT_EXPORTER           explicit override: console | otlp | none
 *   OTEL_INIT_PRETTY             "false" disables the waterfall (raw JSON console instead)
 *   OTEL_EXPORTER_OTLP_ENDPOINT  OTLP base URL (default http://localhost:4318)
 *   OTEL_INIT_PRESET             all | express | fastify | nestjs | http (default all)
 *   OTEL_INIT_DISABLED           "true" disables the side-effect auto-init on import
 */

export type ExporterKind = "console" | "otlp" | "none";
export type PresetName = "all" | "express" | "fastify" | "nestjs" | "http";

export interface OtelInitConfig {
  serviceName: string;
  exporter: ExporterKind;
  pretty: boolean;
  otlpEndpoint: string;
  preset: PresetName;
}

export function resolveConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<OtelInitConfig> = {}
): OtelInitConfig {
  const nodeEnv = (env["NODE_ENV"] ?? "development").toLowerCase();

  let exporter: ExporterKind;
  const explicit = env["OTEL_INIT_EXPORTER"]?.toLowerCase();
  if (explicit === "console" || explicit === "otlp" || explicit === "none") {
    exporter = explicit;
  } else if (nodeEnv === "production") {
    exporter = "otlp";
  } else if (nodeEnv === "test") {
    exporter = "none";
  } else {
    exporter = "console";
  }

  const presetRaw = (env["OTEL_INIT_PRESET"] ?? "all").toLowerCase();
  const preset: PresetName =
    presetRaw === "express" ||
    presetRaw === "fastify" ||
    presetRaw === "nestjs" ||
    presetRaw === "http"
      ? presetRaw
      : "all";

  return {
    serviceName:
      overrides.serviceName ??
      env["OTEL_SERVICE_NAME"] ??
      env["npm_package_name"] ??
      "unknown-service",
    exporter: overrides.exporter ?? exporter,
    pretty:
      overrides.pretty ?? env["OTEL_INIT_PRETTY"]?.toLowerCase() !== "false",
    otlpEndpoint:
      overrides.otlpEndpoint ??
      env["OTEL_EXPORTER_OTLP_ENDPOINT"] ??
      "http://localhost:4318",
    preset: overrides.preset ?? preset
  };
}
