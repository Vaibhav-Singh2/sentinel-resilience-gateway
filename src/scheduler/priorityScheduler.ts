import { TenantPlan } from "./tenantPlan";
import { protectionPolicy, ProtectionMode } from "../pressure/protectionMode";
import { logger } from "../logger";

interface SchedulerStats {
  requests: number;
}

export class PriorityScheduler {
  // Simple in-memory tracker for recent requests per tenant
  // In a real system, this might be more complex or distributed
  // For now, we use it to make probabilistic decisions if needed,
  // currently primarily using Mode + Plan table.

  // We don't strictly *need* to track per-tenant requests for the logic described:
  // "If MODERATE: reduce FREE weight by 30%"
  // "If AGGRESSIVE: FREE tenants get 0 weight (block)"
  // This implies static rules based on Mode.

  // However, "allocate request slots proportionally to weight" implies we might need to check capacity.
  // Given the requirements "Scheduling must be O(1)" and "Throttle first",
  // we will implement deterministic rejection based on Mode and probabilistic throttling for "Reduced Weight".

  public shouldAllow(tenantId: string, plan: TenantPlan): boolean {
    const mode = protectionPolicy.getMode();

    switch (mode) {
      case ProtectionMode.NORMAL:
        return true;

      case ProtectionMode.MODERATE:
        // Reduce FREE weight by 30%
        // Means drop 30% of FREE requests
        if (plan === TenantPlan.FREE) {
          return Math.random() > 0.3;
        }
        return true;

      case ProtectionMode.AGGRESSIVE:
        // FREE gets 0 weight (Block)
        if (plan === TenantPlan.FREE) {
          logger.warn(
            { event: "priority_throttle", tenantId, plan, mode },
            "Throttled FREE tenant in AGGRESSIVE mode",
          );
          return false;
        }
        // STANDARD reduced by 30%
        if (plan === TenantPlan.STANDARD) {
          return Math.random() > 0.3;
        }
        return true;

      case ProtectionMode.CRITICAL:
        // Only PREMIUM allowed
        if (plan !== TenantPlan.PREMIUM) {
          logger.warn(
            { event: "priority_throttle", tenantId, plan, mode },
            "blocked non-PREMIUM in CRITICAL mode",
          );
          return false;
        }
        return true;

      default:
        return true;
    }
  }
}

export const priorityScheduler = new PriorityScheduler();
