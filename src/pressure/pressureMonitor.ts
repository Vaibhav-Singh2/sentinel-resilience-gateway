import { logger } from "../logger";

export class PressureMonitor {
  private history: { timestamp: number; lag: number }[] = [];
  private errorCounts: { total: number; errors: number } = {
    total: 0,
    errors: 0,
  };
  private requestCounts: number = 0;

  // Weights from requirements
  private readonly WEIGHTS = {
    CPU: 0.35,
    MEMORY: 0.25,
    LAG: 0.15,
    RPS: 0.15,
    ERROR: 0.1,
  };

  private lastCheck = Date.now();
  private currentPressure: number = 0;

  constructor() {
    // Monitor Event Loop Lag
    setInterval(() => {
      const now = Date.now();
      const lag = now - this.lastCheck - 500; // Expected 500ms interval
      this.lastCheck = now;
      this.history.push({ timestamp: now, lag: Math.max(0, lag) });

      // Keep last 10 seconds
      if (this.history.length > 20) {
        this.history.shift();
      }
    }, 500);

    // Update pressure calculation every 1s
    setInterval(() => this.calculatePressure(), 1000);
  }

  public reportRequest() {
    this.requestCounts++;
  }

  public reportError() {
    this.errorCounts.errors++;
  }

  private calculatePressure() {
    // 1. CPU Usage (Mock)
    const cpuLoad = 0.2;

    // 2. Memory Usage
    const memUsage = process.memoryUsage();
    // Normalize memory: usage / heap_limit (approx 1GB for safety)
    const memLoad = Math.min(1, memUsage.heapUsed / (512 * 1024 * 1024));

    // 3. Event Loop Lag
    const avgLag =
      this.history.reduce((sum, h) => sum + h.lag, 0) /
      (this.history.length || 1);
    const lagScore = Math.min(1, avgLag / 100);

    // 4. RPS Load
    const rps = this.requestCounts;
    const rpsLoad = Math.min(1, rps / 1000);
    this.requestCounts = 0; // Reset

    // 5. Error Rate
    const errorRate = rps > 0 ? this.errorCounts.errors / rps : 0;
    this.errorCounts = { total: 0, errors: 0 }; // Reset

    // Calculate Weighted Pressure
    let pressure =
      this.WEIGHTS.CPU * cpuLoad +
      this.WEIGHTS.MEMORY * memLoad +
      this.WEIGHTS.LAG * lagScore +
      this.WEIGHTS.RPS * rpsLoad +
      this.WEIGHTS.ERROR * errorRate;

    this.currentPressure = Math.min(1, Math.max(0, pressure));
  }

  public getPressure(): number {
    return this.currentPressure;
  }
}

export const pressureMonitor = new PressureMonitor();
