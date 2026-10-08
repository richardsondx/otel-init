/**
 * PrettyConsoleExporter: the local-dev story OpenTelemetry never had.
 *
 * The stock ConsoleSpanExporter dumps raw JSON blobs. This exporter buffers
 * spans per trace and prints an ASCII waterfall when the trace completes,
 * so `import "otel-init"` in development shows you what actually happened:
 *
 *   trace 9f3a1b2c · 3 spans · 182ms
 *   └─ GET /api/users [182ms]
 *      ├─ db.query SELECT users [45ms]
 *      └─ HTTP GET auth.internal [120ms]
 */
import {
  ExportResultCode,
  hrTimeToMilliseconds
} from "@opentelemetry/core";
import type { ExportResult } from "@opentelemetry/core";
import { SpanStatusCode } from "@opentelemetry/api";
import type { HrTime } from "@opentelemetry/api";
import type {
  ReadableSpan,
  SpanExporter
} from "@opentelemetry/sdk-trace-node";

export interface PrettyExporterOptions {
  /** How long to wait for a trace's root span before printing orphans. Default 5000. */
  maxBufferMs?: number;
  /** Where lines go. Default process.stdout. */
  write?: (line: string) => void;
  /** ANSI colors. Default: on when stdout is a TTY and NO_COLOR is unset. */
  colors?: boolean;
}

interface SpanNode {
  span: ReadableSpan;
  children: SpanNode[];
}

const ms = (t: HrTime): number => hrTimeToMilliseconds(t);

function shortId(traceId: string): string {
  return traceId.length > 8 ? traceId.slice(0, 8) : traceId;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 10) return `${durationMs.toFixed(1)}ms`;
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function truncate(name: string, max = 80): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/** Build parent-child trees from a flat span list. Exported for testing. */
export function buildTraceTree(spans: ReadableSpan[]): SpanNode[] {
  const byId = new Map<string, SpanNode>();
  for (const span of spans) {
    byId.set(span.spanContext().spanId, { span, children: [] });
  }
  const roots: SpanNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.span.parentSpanContext?.spanId;
    const parent = parentId !== undefined ? byId.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const byStart = (a: SpanNode, b: SpanNode) =>
    ms(a.span.startTime) - ms(b.span.startTime);
  const sortDeep = (node: SpanNode): void => {
    node.children.sort(byStart);
    node.children.forEach(sortDeep);
  };
  roots.sort(byStart);
  roots.forEach(sortDeep);
  return roots;
}

function colorFor(
  durationMs: number,
  colors: boolean
): { open: string; close: string } {
  if (!colors) return { open: "", close: "" };
  const open =
    durationMs < 100 ? "\u001b[32m" : durationMs < 500 ? "\u001b[33m" : "\u001b[31m";
  return { open, close: "\u001b[0m" };
}

function renderNode(
  node: SpanNode,
  prefix: string,
  isLast: boolean,
  lines: string[],
  colors: boolean
): void {
  const durationMs = ms(node.span.duration);
  const { open, close } = colorFor(durationMs, colors);
  const errorMark =
    node.span.status.code === SpanStatusCode.ERROR ? " ✗" : "";
  const connector = isLast ? "└─ " : "├─ ";
  lines.push(
    `${prefix}${connector}${truncate(node.span.name)} [${open}${formatDuration(durationMs)}${close}]${errorMark}`
  );
  const childPrefix = `${prefix}${isLast ? "   " : "│  "}`;
  node.children.forEach((child, i) =>
    renderNode(child, childPrefix, i === node.children.length - 1, lines, colors)
  );
}

/** Render one trace as a waterfall. Exported for testing. */
export function formatTrace(
  spans: ReadableSpan[],
  options: { colors?: boolean } = {}
): string {
  if (spans.length === 0) return "";
  const colors = options.colors ?? false;
  const roots = buildTraceTree(spans);
  const traceId = spans[0]?.spanContext().traceId ?? "?";
  const starts = spans.map((s) => ms(s.startTime));
  const ends = spans.map((s) => ms(s.endTime));
  const totalMs = Math.max(...ends) - Math.min(...starts);
  const lines = [
    `trace ${shortId(traceId)} · ${spans.length} span${spans.length === 1 ? "" : "s"} · ${formatDuration(totalMs)}`
  ];
  for (const root of roots) {
    // Root prints without a connector on its own line for readability.
    const durationMs = ms(root.span.duration);
    const { open, close } = colorFor(durationMs, colors);
    const errorMark =
      root.span.status.code === SpanStatusCode.ERROR ? " ✗" : "";
    lines.push(
      `└─ ${truncate(root.span.name)} [${open}${formatDuration(durationMs)}${close}]${errorMark}`
    );
    root.children.forEach((child, i) =>
      renderNode(child, "   ", i === root.children.length - 1, lines, colors)
    );
  }
  return lines.join("\n");
}

export class PrettyConsoleExporter implements SpanExporter {
  private pending = new Map<string, { spans: ReadableSpan[]; firstSeen: number }>();
  private sweepTimer: NodeJS.Timeout | undefined;
  private readonly maxBufferMs: number;
  private readonly write: (line: string) => void;
  private readonly colors: boolean;

  constructor(options: PrettyExporterOptions = {}) {
    this.maxBufferMs = options.maxBufferMs ?? 5000;
    this.write = options.write ?? ((line: string) => process.stdout.write(line));
    this.colors =
      options.colors ??
      (process.stdout.isTTY === true && process.env["NO_COLOR"] === undefined);
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    try {
      const now = Date.now();
      for (const span of spans) {
        const traceId = span.spanContext().traceId;
        let entry = this.pending.get(traceId);
        if (!entry) {
          entry = { spans: [], firstSeen: now };
          this.pending.set(traceId, entry);
        }
        entry.spans.push(span);
      }
      // A trace is printable once its root span has arrived.
      for (const [traceId, entry] of this.pending) {
        if (entry.spans.some((s) => s.parentSpanContext === undefined)) {
          this.pending.delete(traceId);
          this.write(formatTrace(entry.spans, { colors: this.colors }) + "\n");
        }
      }
      this.scheduleSweep();
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  /** Print whatever is still buffered (orphaned traces). */
  async forceFlush(): Promise<void> {
    for (const entry of this.pending.values()) {
      this.write(formatTrace(entry.spans, { colors: this.colors }) + "\n");
    }
    this.pending.clear();
  }

  async shutdown(): Promise<void> {
    if (this.sweepTimer !== undefined) {
      clearTimeout(this.sweepTimer);
      this.sweepTimer = undefined;
    }
    await this.forceFlush();
  }

  private scheduleSweep(): void {
    if (this.sweepTimer !== undefined || this.pending.size === 0) return;
    this.sweepTimer = setTimeout(() => {
      this.sweepTimer = undefined;
      const now = Date.now();
      for (const [traceId, entry] of this.pending) {
        if (now - entry.firstSeen >= this.maxBufferMs) {
          this.pending.delete(traceId);
          this.write(formatTrace(entry.spans, { colors: this.colors }) + "\n");
        }
      }
      this.scheduleSweep();
    }, Math.min(this.maxBufferMs, 1000));
    this.sweepTimer.unref();
  }
}
