import type {
  LivePowerData,
  EnergyTotals,
  BatteryDetail,
  SystemInfo,
  ScheduleState,
} from "@givself/contracts";
import {
  BatteryDetailSchema,
  SystemInfoSchema,
  ScheduleStateSchema,
  TimeSlotSchema,
} from "@givself/contracts";
import { create } from "@bufbuild/protobuf";
import type { EnergyAdapter } from "../adapter.interface.js";
import { ModbusClient } from "./modbus-client.js";
import * as commands from "./commands.js";
import { registersToLivePower, registersToEnergyToday } from "./data-mapper.js";

const DEFAULT_SERIAL = process.env.GIVENERGY_DONGLE_SERIAL || "CE1234G567";

export class GivEnergyAdapter implements EnergyAdapter {
  readonly name = "givenergy";
  private client: ModbusClient;
  private serial = DEFAULT_SERIAL;

  constructor(host: string, port: number) {
    this.client = new ModbusClient(host, port);
  }

  async connect(): Promise<void> {
    this.client.on("error", (err) => console.error("[givenergy] Modbus error:", err.message));
    this.client.on("close", () => {
      console.warn("[givenergy] Connection closed, will reconnect on next request");
    });
    this.client.on("heartbeat-timeout", () => console.warn("[givenergy] Heartbeat timeout"));

    await this.connectWithRetry();
  }

  private async connectWithRetry(maxRetries = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.client.connect();
        console.log(`[givenergy] Connected to ${this.client.isConnected ? "inverter" : "?"}`);
        return;
      } catch (err) {
        console.error(`[givenergy] Connect attempt ${attempt}/${maxRetries} failed:`, (err as Error).message);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
    }
    throw new Error(`[givenergy] Failed to connect after ${maxRetries} attempts`);
  }

  async disconnect(): Promise<void> {
    this.client.disconnect();
  }

  async getLivePower(): Promise<LivePowerData> {
    const cmd = commands.readInputRegisters(this.serial, 0, 60);
    const regs = await this.client.sendRequest(cmd);
    return registersToLivePower(regs);
  }

  async getEnergyToday(): Promise<EnergyTotals> {
    const cmd = commands.readInputRegisters(this.serial, 0, 60);
    const regs = await this.client.sendRequest(cmd);
    return registersToEnergyToday(regs);
  }

  async getBatteries(): Promise<BatteryDetail[]> {
    // Read battery 1 registers (cell voltages at IR 60-75 on slave 0x32)
    const cmd = commands.readBatteryInputRegisters(this.serial, 60, 16, 1);
    try {
      const cellRegs = await this.client.sendRequest(cmd);
      return [
        create(BatteryDetailSchema, {
          serialNumber: "unknown",
          soc: 0, // would need a separate read
          cellVoltages: cellRegs.map((v) => v / 1000),
        }),
      ];
    } catch {
      return [];
    }
  }

  async getSystemInfo(): Promise<SystemInfo> {
    // Read holding registers for system identification
    return create(SystemInfoSchema, {
      model: "GivEnergy",
      serialNumber: this.serial,
    });
  }

  async getSchedules(): Promise<ScheduleState> {
    const cmd = commands.readHoldingRegisters(this.serial, 0, 60);
    const regs = await this.client.sendRequest(cmd);

    // Also read HR 94-116 range
    const cmd2 = commands.readHoldingRegisters(this.serial, 60, 60);
    const regs2 = await this.client.sendRequest(cmd2);

    const hrToTime = (val: number): string => {
      const h = Math.floor(val / 100);
      const m = val % 100;
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    };

    return create(ScheduleStateSchema, {
      chargeEnabled: regs2[96 - 60] === 1,
      dischargeEnabled: regs[59] === 1,
      chargeSlots: [
        create(TimeSlotSchema, {
          start: hrToTime(regs2[94 - 60]),
          end: hrToTime(regs2[95 - 60]),
          targetSoc: regs2[116 - 60],
        }),
      ],
      dischargeSlots: [
        create(TimeSlotSchema, {
          start: hrToTime(regs[56]),
          end: hrToTime(regs[57]),
          targetSoc: 0,
        }),
      ],
      chargeTargetSoc: regs2[116 - 60],
      batteryReserveSoc: regs2[110 - 60],
      batteryMode: regs[27] === 0 ? 3 : 1, // HR27: 0=max power(timed export), 1=match demand(eco)
    });
  }

  // --- Control methods ---

  private async writeCommand(frame: Buffer): Promise<void> {
    await this.client.sendRequest(frame);
  }

  private async writeCommands(frames: Buffer[]): Promise<void> {
    for (const frame of frames) {
      await this.client.sendRequest(frame);
    }
  }

  async setChargeRate(percent: number): Promise<void> {
    await this.writeCommand(commands.setChargeRate(this.serial, percent));
  }

  async setDischargeRate(percent: number): Promise<void> {
    await this.writeCommand(commands.setDischargeRate(this.serial, percent));
  }

  async setBatteryReserve(soc: number): Promise<void> {
    await this.writeCommand(commands.setBatteryReserve(this.serial, soc));
  }

  async setChargeTarget(soc: number): Promise<void> {
    await this.writeCommand(commands.setChargeTarget(this.serial, soc));
  }

  async setChargeSlot(index: number, start: string, end: string, targetSoc: number): Promise<void> {
    const startHHMM = timeToHHMM(start);
    const endHHMM = timeToHHMM(end);
    if (index === 0) {
      await this.writeCommands(commands.setChargeSlot1(this.serial, startHHMM, endHHMM));
      await this.writeCommand(commands.setChargeTarget(this.serial, targetSoc));
    }
  }

  async setDischargeSlot(index: number, start: string, end: string, targetSoc: number): Promise<void> {
    const startHHMM = timeToHHMM(start);
    const endHHMM = timeToHHMM(end);
    if (index === 0) {
      await this.writeCommands(commands.setDischargeSlot1(this.serial, startHHMM, endHHMM));
    }
  }

  async enableChargeSchedule(enabled: boolean): Promise<void> {
    await this.writeCommand(commands.enableCharge(this.serial, enabled));
  }

  async enableDischargeSchedule(enabled: boolean): Promise<void> {
    await this.writeCommand(commands.enableDischarge(this.serial, enabled));
  }

  async setBatteryMode(mode: number): Promise<void> {
    // ECO (1):          HR27=1 (match demand) + HR59=0 (disable discharge)
    // Timed Demand (2): HR27=1 (match demand) + HR59=1 (enable discharge)
    // Timed Export (3): HR27=0 (max power)    + HR59=1 (enable discharge)
    if (mode === 1) {
      await this.writeCommand(commands.setBatteryMode(this.serial, 1));
      await this.writeCommand(commands.enableDischarge(this.serial, false));
    } else if (mode === 2) {
      await this.writeCommand(commands.setBatteryMode(this.serial, 1));
      await this.writeCommand(commands.enableDischarge(this.serial, true));
    } else if (mode === 3) {
      await this.writeCommand(commands.setBatteryMode(this.serial, 0));
      await this.writeCommand(commands.enableDischarge(this.serial, true));
    }
  }

  async forceCharge(durationMinutes: number): Promise<void> {
    // Enable charge, set slot to cover now + duration, set target 100%
    await this.writeCommand(commands.enableCharge(this.serial, true));
    const now = new Date();
    const end = new Date(now.getTime() + durationMinutes * 60_000);
    const startHHMM = now.getHours() * 100 + now.getMinutes();
    const endHHMM = end.getHours() * 100 + end.getMinutes();
    await this.writeCommands(commands.setChargeSlot1(this.serial, startHHMM, endHHMM));
    await this.writeCommand(commands.setChargeTarget(this.serial, 100));
  }

  async forceExport(durationMinutes: number): Promise<void> {
    // Enable discharge, set mode to max power, set slot to cover now + duration
    await this.writeCommand(commands.enableDischarge(this.serial, true));
    await this.writeCommand(commands.setBatteryMode(this.serial, 0)); // max power
    const now = new Date();
    const end = new Date(now.getTime() + durationMinutes * 60_000);
    const startHHMM = now.getHours() * 100 + now.getMinutes();
    const endHHMM = end.getHours() * 100 + end.getMinutes();
    await this.writeCommands(commands.setDischargeSlot1(this.serial, startHHMM, endHHMM));
  }

  async cancelForce(): Promise<void> {
    // Restore ECO mode
    await this.writeCommand(commands.setBatteryMode(this.serial, 1)); // match demand (ECO)
  }

  async reboot(): Promise<void> {
    await this.writeCommand(commands.reboot(this.serial));
  }

  async syncTime(): Promise<void> {
    await this.writeCommands(commands.syncTime(this.serial));
  }
}

function timeToHHMM(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 100 + m;
}
