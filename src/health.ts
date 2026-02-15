import { FastifyInstance } from "fastify";

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get("/health", async () => {
    return { status: "ok" };
  });

  fastify.get("/ready", async () => {
    // In a real app, check DB connection or downstream availability here
    return { ready: true };
  });
}
