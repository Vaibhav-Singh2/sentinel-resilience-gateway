import { globalPressure } from "./globalPressure";
import { logger } from "../logger";

export enum ProtectionMode {
  NORMAL = "NORMAL",
  MODERATE = "MODERATE",
  AGGRESSIVE = "AGGRESSIVE",
  CRITICAL = "CRITICAL",
}

export class ProtectionPolicy {
  private currentMode: ProtectionMode = ProtectionMode.NORMAL;
  private lastModeChange: number = 0;
  private readonly HYSTERESIS_MS = 5000;

  public getMode(): ProtectionMode {
    this.updateMode();
    return this.currentMode;
  }

  private updateMode() {
    const pressure = globalPressure.getGlobalPressure();
    const now = Date.now();
    let newMode = this.currentMode;

    // Determine target mode based on thresholds
    if (pressure >= 0.9) {
      newMode = ProtectionMode.CRITICAL;
    } else if (pressure >= 0.75) {
      newMode = ProtectionMode.AGGRESSIVE;
    } else if (pressure >= 0.5) {
      newMode = ProtectionMode.MODERATE;
    } else {
      newMode = ProtectionMode.NORMAL;
    }

    // Hysteresis check
    // If upgrading mode (NORMAL -> MODERATE), do it immediately (safety first)
    // If downgrading mode (MODERATE -> NORMAL), wait for hysteresis
    if (this.isUpgrade(newMode)) {
      this.changeMode(newMode, pressure);
    } else if (this.currentMode !== newMode) {
      if (now - this.lastModeChange > this.HYSTERESIS_MS) {
        this.changeMode(newMode, pressure);
      }
    }
  }

  private isUpgrade(newMode: ProtectionMode): boolean {
    const weights = {
      [ProtectionMode.NORMAL]: 0,
      [ProtectionMode.MODERATE]: 1,
      [ProtectionMode.AGGRESSIVE]: 2,
      [ProtectionMode.CRITICAL]: 3,
    };
    return weights[newMode] > weights[this.currentMode];
  }

  private changeMode(newMode: ProtectionMode, pressure: number) {
    if (this.currentMode !== newMode) {
      logger.info(
        { event: "mode_change", from: this.currentMode, to: newMode, pressure },
        "Protection mode changed",
      );
      this.currentMode = newMode;
      this.lastModeChange = Date.now();
    }
  }

  public shouldBlockRequest(tenantId: string): boolean {
    const mode = this.getMode();

    if (mode === ProtectionMode.CRITICAL) {
      // Allow only PREMIUM
      // For now, assume a simple check. In real app, check tenant tier.
      // Let's assume tenants starting with "premium_" are premium for this demo
      return !tenantId.startsWith("premium_");
    }

    if (mode === ProtectionMode.AGGRESSIVE) {
      // Block FREE
      // Assume "free_" prefix or anonymous
      return tenantId === "anonymous" || tenantId.startsWith("free_");
    }

    return false;
  }
}

export const protectionPolicy = new ProtectionPolicy();
