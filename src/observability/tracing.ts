import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  SimpleSpanProcessor,
  BatchSpanProcessor,
  ConsoleSpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { trace, Tracer } from "@opentelemetry/api";
import { config } from "../config";
import { logger } from "../logger";

let tracerProvider: NodeTracerProvider | null = null;
let tracer: Tracer | null = null;

export function initTracing() {
  if (!config.enableTracing) {
    return;
  }

  const resource = resourceFromAttributes({
    "service.name": "sentinel-proxy",
    "service.version": "1.0.0",
    "pod.id": config.podId,
  });

  tracerProvider = new NodeTracerProvider({
    resource: resource,
  });

  if (config.otlpEndpoint) {
    const exporter = new OTLPTraceExporter({
      url: config.otlpEndpoint,
    });
    // Cast to any because addSpanProcessor might be missing in some type defs or protected
    (tracerProvider as any).addSpanProcessor(new BatchSpanProcessor(exporter));
    logger.info({ endpoint: config.otlpEndpoint }, "Initialized OTLP tracing");
  } else {
    // Default to console in dev/test if no endpoint
    (tracerProvider as any).addSpanProcessor(
      new SimpleSpanProcessor(new ConsoleSpanExporter()),
    );
    logger.info("Initialized Console tracing");
  }

  tracerProvider.register();
  tracer = trace.getTracer("sentinel-proxy");
}

export function getTracer(): Tracer | null {
  return tracer;
}

// Graceful shutdown
export async function shutdownTracing() {
  if (tracerProvider) {
    await tracerProvider.shutdown();
  }
}
