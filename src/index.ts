/**
 * otel-init: OpenTelemetry in one import. No, really.
 *
 *   import "otel-init"; // first import in your entrypoint
 *
 * Reads OTEL_* env vars, registers the SDK with a batch span processor,
 * prints a pretty trace waterfall in development, and ships OTLP in
 * production. Disable the side-effect auto-init with OTEL_INIT_DISABLED=true
 * and call initTelemetry() yourself instead.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter
} from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { resolveConfig } from "./config.js";
import type { OtelInitConfig } from "./config.js";
import { PrettyConsoleExporter } from "./pretty.js";
import { presetInstrumentations } from "./presets.js";

let sdk: NodeSDK | undefined;
let started = false;

export function initTelemetry(overrides: Partial<OtelInitConfig> = {}): void {
  if (started) return;
  started = true;

  const config = resolveConfig(process.env, overrides);
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName
  });

  const exporter =
    config.exporter === "otlp"
      ? new OTLPTraceExporter({ url: `${config.otlpEndpoint}/v1/traces` })
      : config.exporter === "console"
        ? config.pretty
          ? new PrettyConsoleExporter()
          : new ConsoleSpanExporter()
        : undefined;

  sdk = new NodeSDK({
    resource,
    ...(exporter ? { spanProcessor: new BatchSpanProcessor(exporter) } : {}),
    instrumentations: presetInstrumentations(config.preset)
  });
  sdk.start();

  const shutdown = (): void => {
    void shutdownTelemetry();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk === undefined) {
    started = false;
    return;
  }
  const current = sdk;
  sdk = undefined;
  started = false;
  await current.shutdown();
}

/** For tests: forget any initialized SDK so initTelemetry can run again. */
export function resetTelemetryForTests(): void {
  started = false;
  sdk = undefined;
}

export { resolveConfig } from "./config.js";
export type { OtelInitConfig, ExporterKind, PresetName } from "./config.js";
export { PrettyConsoleExporter, formatTrace, buildTraceTree } from "./pretty.js";
export { presetInstrumentations } from "./presets.js";

if (process.env["OTEL_INIT_DISABLED"] !== "true") {
  initTelemetry();
}
