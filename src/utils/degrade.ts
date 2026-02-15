export const HEAVY_ENDPOINTS = ["/analytics", "/reports", "/export"];

export function isHeavyEndpoint(url: string): boolean {
  return HEAVY_ENDPOINTS.some((endpoint) => url.includes(endpoint));
}

export function getDegradedResponse(url: string): any {
  return {
    degraded: true,
    message: "Service is under high load. This is a lightweight response.",
    data: [], // Empty data for heavy endpoints
    url: url,
  };
}
