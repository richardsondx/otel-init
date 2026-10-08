# otel-init

**OpenTelemetry in one import. No, really.**

```ts
// first import in your entrypoint
import "otel-init";
```

That is the whole setup. The SDK registers, the batch span processor starts, and your traces go somewhere useful: a pretty waterfall in your terminal during development, OTLP in production. Everything is driven by env vars. Nothing else to wire.

## Why this exists

Setting up OpenTelemetry means hand-wiring the SDK, resource detection, a batch processor, and exporters across half a dozen packages. Developers routinely spend days on it and give up; the local-dev story is the worst part, since the stock console exporter dumps raw JSON blobs. This package deletes that 50-line wiring file every service needs.

## What you get in dev

```
trace 9f3a1b2c · 3 spans · 182ms
└─ GET /api/users [182ms]
   ├─ db.query SELECT users [45ms]
   └─ HTTP GET auth.internal [120ms]
```

Spans are buffered per trace and printed as a waterfall when the trace completes. Slow spans turn red. Error spans get a ✗. Set `OTEL_INIT_PRETTY=false` for the raw JSON console exporter instead.

## Configuration

Everything is env-driven. The only decision is `NODE_ENV`:

| Env | Default | What it does |
|---|---|---|
| `NODE_ENV` | `development` | `development` → pretty console; `production` → OTLP; `test` → no exporter |
| `OTEL_SERVICE_NAME` | package name or `unknown-service` | `service.name` on every span |
| `OTEL_INIT_EXPORTER` | from `NODE_ENV` | Explicit override: `console`, `otlp`, or `none` |
| `OTEL_INIT_PRETTY` | `true` | `false` disables the waterfall |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP base URL (`/v1/traces` is appended) |
| `OTEL_INIT_PRESET` | `all` | `all`, `express`, `fastify`, `nestjs`, or `http` |
| `OTEL_INIT_DISABLED` | unset | `true` disables the side-effect auto-init |

The `test` default matters: your test suite does not start exporting spans unless you ask it to.

## Presets

`all` loads the full auto-instrumentation bundle. The named presets load only the HTTP layer plus your framework, which is less overhead and less surprise:

```bash
OTEL_INIT_PRESET=express node app.js
```

## Programmatic use

```ts
import { initTelemetry, shutdownTelemetry } from "otel-init";

initTelemetry({
  serviceName: "payments",
  exporter: "otlp",
  otlpEndpoint: "https://otel.example.com:4318",
  preset: "express"
});
```

`initTelemetry` is idempotent. Shutdown hooks for `SIGTERM`/`SIGINT` are registered automatically so buffered spans flush on exit.

## Requirements

Node 18+. In production, point `OTEL_EXPORTER_OTLP_ENDPOINT` at your collector (Grafana, Honeycomb, Datadog, Jaeger, or the OpenTelemetry Collector).

## License

MIT
