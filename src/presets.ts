/**
 * Framework presets: curated instrumentation bundles.
 *
 * "all" uses the full auto-instrumentation bundle (~30 instrumentations).
 * The named presets load only the HTTP layer plus the framework, which is
 * less overhead and less surprise for services that know their stack.
 */
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { FastifyInstrumentation } from "@opentelemetry/instrumentation-fastify";
import { NestInstrumentation } from "@opentelemetry/instrumentation-nestjs-core";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import type { PresetName } from "./config.js";

export function presetInstrumentations(preset: PresetName): Instrumentation[] {
  switch (preset) {
    case "express":
      return [new HttpInstrumentation(), new ExpressInstrumentation()];
    case "fastify":
      return [new HttpInstrumentation(), new FastifyInstrumentation()];
    case "nestjs":
      return [new HttpInstrumentation(), new NestInstrumentation()];
    case "http":
      return [new HttpInstrumentation()];
    case "all":
    default:
      return getNodeAutoInstrumentations();
  }
}
