export enum TenantPlan {
  FREE = "FREE",
  STANDARD = "STANDARD",
  PREMIUM = "PREMIUM",
}

export const PLAN_MULTIPLIERS: Record<TenantPlan, number> = {
  [TenantPlan.FREE]: 1,
  [TenantPlan.STANDARD]: 2,
  [TenantPlan.PREMIUM]: 3,
};

export function getTenantPlan(headers: Record<string, any>): TenantPlan {
  const planHeader = headers["x-tenant-plan"];
  if (typeof planHeader === "string") {
    const normalized = planHeader.toUpperCase();
    if (normalized in TenantPlan) {
      return normalized as TenantPlan;
    }
  }
  return TenantPlan.FREE;
}
