import type { FastifyRequest, FastifyReply } from "fastify";

export interface AppConfig {
  port: number;
  downstreamUrl: string;
  requestTimeoutMs: number;
  logLevel: string;
  tenantHeader: string;
  burstCapacity: number;
  refillRate: number;
  redisUrl: string;
  windowMs: number;
  baseRateLimit: number;
}

export interface ProxyRequestHeaders {
  [key: string]: string | string[] | undefined;
}

// Add any other shared types here
