import fastify from "fastify";
import { config } from "./config";
import { logger } from "./logger";
import healthRoutes from "./health";
import metricsRoutes from "./metrics";
import proxyRoutes from "./proxy";
import { requestTotal } from "./metrics";
import { randomUUID } from "crypto";

const server = fastify({
  logger: false, // We use our own pino instance
  genReqId: () => randomUUID(), // Standard UUID for request ID
  disableRequestLogging: true, // We will log manually
});

// Global Error Handler
server.setErrorHandler((error, request, reply) => {
  logger.error({ err: error, requestId: request.id }, "Unhandled error");
  reply.status(500).send({ error: "internal_server_error" });
});

// Middleware for metrics counting and logging
server.addHook("onResponse", async (req, reply) => {
  const responseTime = reply.elapsedTime;
  const statusCode = reply.statusCode;

  // Increment total requests
  requestTotal.inc({
    method: req.method,
    route: req.routeOptions.url || req.url, // Try to get matched route path if available, or fallback to url
    status_code: statusCode,
  });

  // Log request completion
  logger.info({
    req: {
      method: req.method,
      url: req.url,
      id: req.id,
      tenantId: req.headers[config.tenantHeader],
    },
    res: { statusCode, duration: responseTime },
    msg: "request completed",
  });
});

// Register Plugins
// Order matters! Specific routes first.
server.register(healthRoutes);
server.register(metricsRoutes);

// Register Proxy last (wildcard)
server.register(proxyRoutes);

const start = async () => {
  try {
    await server.listen({ port: config.port, host: "0.0.0.0" });
    logger.info({ port: config.port }, "Server started");

    // Graceful Shutdown
    const signals = ["SIGINT", "SIGTERM"];
    for (const signal of signals) {
      process.on(signal, () => {
        logger.info({ signal }, "Shutting down...");
        server.close().then(() => {
          logger.info("Server closed");
          process.exit(0);
        });
      });
    }
  } catch (err) {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  }
};

start();
