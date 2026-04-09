import {
  LivePowerDataSchema,
  EnergyTotalsSchema,
  BatteryDetailSchema,
  SystemInfoSchema,
  ScheduleStateSchema,
  PowerFlowsSchema,
  TimeSlotSchema,
} from "@givself/contracts";
import { create } from "@bufbuild/protobuf";
import type { LivePowerData, EnergyTotals, BatteryDetail, SystemInfo, ScheduleState } from "@givself/contracts";
import type { EnergyAdapter } from "../adapter.interface.js";

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randf(min: number, max: number, decimals = 1): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

// Simulate a solar curve peaking at noon
function solarMultiplier(): number {
  const hour = new Date().getHours() + new Date().getMinutes() / 60;
  if (hour < 6 || hour > 20) return 0;
  return Math.max(0, Math.sin(((hour - 6) / 14) * Math.PI));
}

export class MockAdapter implements EnergyAdapter {
  readonly name = "mock";

  private soc = 50;
  private energyAccum = { pv: 0, gridIn: 0, gridOut: 0, batCharge: 0, batDischarge: 0 };
  private scheduleState = {
    chargeEnabled: true,
    dischargeEnabled: true,
    chargeSlots: [
      { start: "00:30", end: "04:30", targetSoc: 100 },
      ...Array.from({ length: 9 }, () => ({ start: "00:00", end: "00:00", targetSoc: 100 })),
    ],
    dischargeSlots: [
      { start: "16:00", end: "07:00", targetSoc: 10 },
      ...Array.from({ length: 9 }, () => ({ start: "00:00", end: "00:00", targetSoc: 10 })),
    ],
    chargeTargetSoc: 100,
    batteryReserveSoc: 4,
    batteryMode: 1,
  };

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async getLivePower(): Promise<LivePowerData> {
    const solar = solarMultiplier();
    const pvPower = Math.round(solar * rand(2800, 3500));
    const pv1Power = Math.round(pvPower * 0.55);
    const pv2Power = pvPower - pv1Power;
    const loadPower = rand(300, 1200);

    // Simple energy flow logic
    let batteryPower = 0;
    let gridPower = 0;
    const surplus = pvPower - loadPower;

    if (surplus > 0) {
      if (this.soc < 95) {
        batteryPower = Math.min(surplus, 3000); // charging (positive)
        this.soc = Math.min(100, this.soc + 0.1);
      }
      gridPower = -(surplus - batteryPower); // exporting (negative)
    } else {
      if (this.soc > 10) {
        batteryPower = Math.max(surplus, -3000); // discharging (negative)
        this.soc = Math.max(4, this.soc - 0.1);
      }
      gridPower = -(surplus - batteryPower); // importing (positive)
    }

    const solarToHouse = Math.min(pvPower, loadPower);
    const solarToBattery = batteryPower > 0 ? Math.min(pvPower - solarToHouse, batteryPower) : 0;
    const solarToGrid = gridPower < 0 ? Math.min(pvPower - solarToHouse - solarToBattery, -gridPower) : 0;
    const batteryToHouse = batteryPower < 0 ? Math.min(-batteryPower, loadPower - solarToHouse) : 0;
    const gridToHouse = gridPower > 0 ? Math.min(gridPower, loadPower - solarToHouse - batteryToHouse) : 0;
    const gridToBattery = 0;

    return create(LivePowerDataSchema, {
      pvPowerW: pvPower,
      pv1PowerW: pv1Power,
      pv2PowerW: pv2Power,
      pv1VoltageV: randf(280, 350),
      pv2VoltageV: randf(280, 350),
      batterySoc: Math.round(this.soc),
      batterySocKwh: parseFloat((this.soc / 100 * 9.5).toFixed(1)),
      batteryPowerW: batteryPower,
      batteryVoltageV: randf(48, 53, 2),
      batteryTemperatureC: randf(18, 28),
      gridPowerW: gridPower,
      gridVoltageV: randf(238, 245),
      gridCurrentA: randf(0, 20),
      gridFrequencyHz: randf(49.9, 50.1, 2),
      loadPowerW: loadPower,
      flows: create(PowerFlowsSchema, {
        solarToHouseW: solarToHouse,
        solarToBatteryW: solarToBattery,
        solarToGridW: solarToGrid,
        batteryToHouseW: batteryToHouse,
        batteryToGridW: 0,
        gridToHouseW: gridToHouse,
        gridToBatteryW: gridToBattery,
      }),
    });
  }

  async getEnergyToday(): Promise<EnergyTotals> {
    return create(EnergyTotalsSchema, {
      pvGenerationKwh: randf(8, 25),
      gridImportKwh: randf(2, 8),
      gridExportKwh: randf(3, 12),
      batteryChargeKwh: randf(4, 10),
      batteryDischargeKwh: randf(3, 9),
      consumptionKwh: randf(6, 15),
      selfConsumptionKwh: randf(5, 12),
    });
  }

  async getBatteries(): Promise<BatteryDetail[]> {
    return [
      create(BatteryDetailSchema, {
        serialNumber: "CE1234G567",
        soc: Math.round(this.soc),
        voltageV: randf(48, 53, 2),
        temperatureC: randf(18, 28),
        capacityKwh: 9.5,
        designCapacityKwh: 9.5,
        remainingCapacityKwh: parseFloat((this.soc / 100 * 9.5).toFixed(1)),
        cycles: 142,
        cellVoltages: Array.from({ length: 16 }, () => randf(3.28, 3.35, 3)),
        cellTemperatures: Array.from({ length: 4 }, () => randf(18, 28)),
        firmwareVersion: 3005,
      }),
    ];
  }

  async getSystemInfo(): Promise<SystemInfo> {
    return create(SystemInfoSchema, {
      model: "GIV-AC-3.0",
      serialNumber: "AB1234G567",
      firmwareVersion: "D0.449-A0.449",
      inverterMaxPowerW: 3000,
      batteryMaxPowerW: 3000,
      batteryCapacityKwh: 9.5,
      batteryType: "JBAOA",
      numBatteries: 1,
      numMppt: 2,
      numPhases: 1,
    });
  }

  async getSchedules(): Promise<ScheduleState> {
    return create(ScheduleStateSchema, {
      chargeEnabled: this.scheduleState.chargeEnabled,
      dischargeEnabled: this.scheduleState.dischargeEnabled,
      chargeSlots: this.scheduleState.chargeSlots.map((s) => create(TimeSlotSchema, { ...s })),
      dischargeSlots: this.scheduleState.dischargeSlots.map((s) => create(TimeSlotSchema, { ...s })),
      chargeTargetSoc: this.scheduleState.chargeTargetSoc,
      batteryReserveSoc: this.scheduleState.batteryReserveSoc,
      batteryMode: this.scheduleState.batteryMode,
    });
  }

  // --- Control methods ---

  async setChargeRate(percent: number): Promise<void> {
    console.log(`[mock] setChargeRate(${percent})`);
  }

  async setDischargeRate(percent: number): Promise<void> {
    console.log(`[mock] setDischargeRate(${percent})`);
  }

  async setBatteryReserve(soc: number): Promise<void> {
    this.scheduleState.batteryReserveSoc = soc;
    console.log(`[mock] setBatteryReserve(${soc})`);
  }

  async setChargeTarget(soc: number): Promise<void> {
    this.scheduleState.chargeTargetSoc = soc;
    console.log(`[mock] setChargeTarget(${soc})`);
  }

  async setChargeSlot(index: number, start: string, end: string, targetSoc: number): Promise<void> {
    if (index >= 0 && index < this.scheduleState.chargeSlots.length) {
      this.scheduleState.chargeSlots[index] = { start, end, targetSoc };
    }
    console.log(`[mock] setChargeSlot(${index}, ${start}-${end}, soc=${targetSoc})`);
  }

  async setDischargeSlot(index: number, start: string, end: string, targetSoc: number): Promise<void> {
    if (index >= 0 && index < this.scheduleState.dischargeSlots.length) {
      this.scheduleState.dischargeSlots[index] = { start, end, targetSoc };
    }
    console.log(`[mock] setDischargeSlot(${index}, ${start}-${end}, soc=${targetSoc})`);
  }

  async enableChargeSchedule(enabled: boolean): Promise<void> {
    this.scheduleState.chargeEnabled = enabled;
    console.log(`[mock] enableChargeSchedule(${enabled})`);
  }

  async enableDischargeSchedule(enabled: boolean): Promise<void> {
    this.scheduleState.dischargeEnabled = enabled;
    console.log(`[mock] enableDischargeSchedule(${enabled})`);
  }

  async setBatteryMode(mode: number): Promise<void> {
    this.scheduleState.batteryMode = mode;
    if (mode === 1) this.scheduleState.dischargeEnabled = false;
    else this.scheduleState.dischargeEnabled = true;
    console.log(`[mock] setBatteryMode(${mode})`);
  }

  async forceCharge(durationMinutes: number): Promise<void> {
    console.log(`[mock] forceCharge(${durationMinutes}min)`);
  }

  async forceExport(durationMinutes: number): Promise<void> {
    console.log(`[mock] forceExport(${durationMinutes}min)`);
  }

  async cancelForce(): Promise<void> {
    console.log("[mock] cancelForce()");
  }

  async reboot(): Promise<void> {
    console.log("[mock] reboot()");
  }

  async syncTime(): Promise<void> {
    console.log("[mock] syncTime()");
  }
}
