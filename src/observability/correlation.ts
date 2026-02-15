import { FastifyRequest } from "fastify";
import { config } from "../config";
import { logger } from "../logger";

export function getOrCreateCorrelationId(req: FastifyRequest): string {
  let correlationId = req.headers["x-request-id"] as string;

  if (!correlationId) {
    correlationId = crypto.randomUUID();
    req.headers["x-request-id"] = correlationId;
  }

  return correlationId;
}
