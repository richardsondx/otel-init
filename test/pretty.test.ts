import { describe, expect, it, vi } from "vitest";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { HrTime } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  buildTraceTree,
  formatTrace,
  PrettyConsoleExporter
} from "../src/pretty.js";

const msToHr = (ms: number): HrTime => [
  Math.floor(ms / 1000),
  Math.floor((ms % 1000) * 1e6)
];

let spanSeq = 0;

function makeSpan(options: {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  startMs?: number;
  durationMs?: number;
  error?: boolean;
}): ReadableSpan {
  spanSeq += 1;
  const traceId = options.traceId ?? "9f3a1b2c4d5e6f708192a3b4c5d6e7f";
  const spanId = options.spanId ?? `span${spanSeq}`.padEnd(16, "0");
  const startMs = options.startMs ?? 0;
  const durationMs = options.durationMs ?? 10;
  return {
    name: options.name ?? "op",
    kind: SpanKind.INTERNAL,
    spanContext: () => ({ traceId, spanId, traceFlags: 1 }),
    parentSpanContext:
      options.parentSpanId === undefined
        ? undefined
        : { traceId, spanId: options.parentSpanId, traceFlags: 1 },
    startTime: msToHr(startMs),
    endTime: msToHr(startMs + durationMs),
    status: {
      code: options.error ? SpanStatusCode.ERROR : SpanStatusCode.UNSET
    },
    attributes: {},
    links: [],
    events: [],
    duration: msToHr(durationMs),
    ended: true,
    resource: resourceFromAttributes({}),
    instrumentationScope: { name: "test" },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0
  } as unknown as ReadableSpan;
}

describe("buildTraceTree", () => {
  it("nests children under parents and sorts by start time", () => {
    const root = makeSpan({ spanId: "root000000000000", name: "GET /x", durationMs: 100 });
    const slow = makeSpan({ spanId: "slow000000000000", parentSpanId: "root000000000000", name: "slow", startMs: 50, durationMs: 40 });
    const fast = makeSpan({ spanId: "fast000000000000", parentSpanId: "root000000000000", name: "fast", startMs: 5, durationMs: 10 });
    const trees = buildTraceTree([slow, root, fast]);
    expect(trees).toHaveLength(1);
    expect(trees[0]?.children.map((c) => c.span.name)).toEqual(["fast", "slow"]);
  });

  it("treats spans with missing parents as roots", () => {
    const orphan = makeSpan({ spanId: "orph000000000000", parentSpanId: "gone000000000000", name: "orphan" });
    expect(buildTraceTree([orphan])).toHaveLength(1);
  });
});

describe("formatTrace", () => {
  it("renders a header and an ASCII waterfall", () => {
    const root = makeSpan({ spanId: "root000000000000", name: "GET /api/users", durationMs: 182 });
    const child = makeSpan({ spanId: "chld000000000000", parentSpanId: "root000000000000", name: "db.query", startMs: 10, durationMs: 45 });
    const out = formatTrace([root, child], { colors: false });
    expect(out).toContain("trace 9f3a1b2c");
    expect(out).toContain("2 spans");
    expect(out).toContain("GET /api/users");
    expect(out).toContain("db.query");
    expect(out).toMatch(/\[182ms\]/);
  });

  it("marks error spans", () => {
    const root = makeSpan({ spanId: "root000000000000", name: "GET /x", error: true });
    expect(formatTrace([root], { colors: false })).toContain("✗");
  });

  it("returns empty string for no spans", () => {
    expect(formatTrace([])).toBe("");
  });
});

describe("PrettyConsoleExporter", () => {
  it("buffers until the root span arrives, then prints the whole trace", () => {
    const lines: string[] = [];
    const exporter = new PrettyConsoleExporter({
      write: (s) => lines.push(s),
      colors: false
    });
    const child = makeSpan({ spanId: "chld000000000000", parentSpanId: "root000000000000", name: "db.query" });
    const root = makeSpan({ spanId: "root000000000000", name: "GET /x" });
    const cb = vi.fn();
    exporter.export([child], cb);
    expect(lines).toHaveLength(0);
    exporter.export([root], cb);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("GET /x");
    expect(lines[0]).toContain("db.query");
    expect(cb).toHaveBeenCalled();
  });

  it("flushes orphaned traces on shutdown", async () => {
    const lines: string[] = [];
    const exporter = new PrettyConsoleExporter({
      write: (s) => lines.push(s),
      colors: false,
      maxBufferMs: 60_000
    });
    exporter.export(
      [makeSpan({ spanId: "chld000000000000", parentSpanId: "never0000000000", name: "orphan" })],
      vi.fn()
    );
    expect(lines).toHaveLength(0);
    await exporter.shutdown();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("orphan");
  });

  it("reports failure instead of throwing when write fails", () => {
    const exporter = new PrettyConsoleExporter({
      write: () => {
        throw new Error("stdout gone");
      }
    });
    const cb = vi.fn();
    exporter.export(
      [makeSpan({ spanId: "root000000000000", name: "GET /x" })],
      cb
    );
    expect(cb.mock.calls[0]?.[0].code).toBe(1); // ExportResultCode.FAILED
  });
});
