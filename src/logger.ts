import pino from "pino";
import { config } from "./config";

export const logger = pino({
  level: config.logLevel,
  transport:
    process.env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
          },
        }
      : undefined,
  base: {
    service: "sentinel",
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      id: req.id,
      tenantId: req.headers[config.tenantHeader],
    }),
    res: (res) => ({
      statusCode: res.statusCode,
      duration: res.elapsedTime,
    }),
  },
});
