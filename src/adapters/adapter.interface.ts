import type {
  LivePowerData,
  EnergyTotals,
  BatteryDetail,
  SystemInfo,
  ScheduleState,
} from "@givself/contracts";

export interface EnergyAdapter {
  readonly name: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // Read
  getLivePower(): Promise<LivePowerData>;
  getEnergyToday(): Promise<EnergyTotals>;
  getBatteries(): Promise<BatteryDetail[]>;
  getSystemInfo(): Promise<SystemInfo>;
  getSchedules(): Promise<ScheduleState>;

  // Control (Phase 2)
  setChargeRate?(percent: number): Promise<void>;
  setDischargeRate?(percent: number): Promise<void>;
  setBatteryReserve?(soc: number): Promise<void>;
  setChargeTarget?(soc: number): Promise<void>;
  setChargeSlot?(index: number, start: string, end: string, targetSoc: number): Promise<void>;
  setDischargeSlot?(index: number, start: string, end: string, targetSoc: number): Promise<void>;
  enableChargeSchedule?(enabled: boolean): Promise<void>;
  enableDischargeSchedule?(enabled: boolean): Promise<void>;
  /** Set battery mode: 1=ECO, 2=Timed Demand, 3=Timed Export */
  setBatteryMode?(mode: number): Promise<void>;
  forceCharge?(durationMinutes: number): Promise<void>;
  forceExport?(durationMinutes: number): Promise<void>;
  cancelForce?(): Promise<void>;
  reboot?(): Promise<void>;
  syncTime?(): Promise<void>;
}
