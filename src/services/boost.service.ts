import type { EnergyAdapter } from "../adapters/adapter.interface.js";
import { broadcast } from "../ws/channels.js";

export class BoostService {
  private active = false;
  private kind: "charge" | "export" = "charge";
  private remainingSeconds = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly adapter: EnergyAdapter) {}

  get state() {
    return { active: this.active, kind: this.kind, remainingSeconds: this.remainingSeconds };
  }

  async startForceCharge(durationMinutes: number): Promise<void> {
    if (this.active) await this.cancel();
    this.active = true;
    this.kind = "charge";
    this.remainingSeconds = durationMinutes * 60;

    await this.adapter.forceCharge?.(durationMinutes);
    this.startCountdown();
    this.broadcastState();
  }

  async startForceExport(durationMinutes: number): Promise<void> {
    if (this.active) await this.cancel();
    this.active = true;
    this.kind = "export";
    this.remainingSeconds = durationMinutes * 60;

    await this.adapter.forceExport?.(durationMinutes);
    this.startCountdown();
    this.broadcastState();
  }

  async cancel(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.active = false;
    this.remainingSeconds = 0;

    await this.adapter.cancelForce?.();
    this.broadcastState();
  }

  private startCountdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.remainingSeconds--;
      if (this.remainingSeconds <= 0) {
        this.cancel();
        return;
      }
      // Broadcast every 10 seconds to avoid flooding
      if (this.remainingSeconds % 10 === 0) {
        this.broadcastState();
      }
    }, 1000);
  }

  private broadcastState(): void {
    broadcast({ boostState: this.state });
  }
}
