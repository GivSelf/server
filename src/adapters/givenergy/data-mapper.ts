/**
 * Maps raw register values to proto-generated LivePowerData.
 */

import {
  LivePowerDataSchema,
  EnergyTotalsSchema,
  PowerFlowsSchema,
} from "@givself/contracts";
import { create } from "@bufbuild/protobuf";
import type { LivePowerData, EnergyTotals } from "@givself/contracts";
import { INPUT_REGISTERS, type RegisterDef } from "./register-map.js";

/** Apply scaling to a raw register value. */
function scale(raw: number, def: RegisterDef | undefined): number {
  if (!def) return raw;
  let val = def.signed ? toSigned16(raw) : raw;
  if (def.scaling) val = val / def.scaling;
  return val;
}

function toSigned16(val: number): number {
  return val > 0x7fff ? val - 0x10000 : val;
}

/** Combine high + low uint16 into uint32. */
function combine32(high: number, low: number): number {
  return (high << 16) | low;
}

/**
 * Convert a register array (IR 0-59) to LivePowerData.
 * `regs[i]` = raw uint16 value of input register `i`.
 */
export function registersToLivePower(regs: number[]): LivePowerData {
  const pvPower = regs[18] + regs[20];
  const batteryPower = toSigned16(regs[52]); // positive = discharge, negative = charge
  const gridPower = toSigned16(regs[30]); // positive = export, negative = import
  const loadPower = regs[42];

  // Compute power flows
  // Invert signs to match our convention: battery positive = charging, grid positive = importing
  const battCharging = batteryPower < 0 ? -batteryPower : 0;
  const battDischarging = batteryPower > 0 ? batteryPower : 0;
  const gridImporting = gridPower < 0 ? -gridPower : 0;
  const gridExporting = gridPower > 0 ? gridPower : 0;

  const solarToHouse = Math.min(pvPower, loadPower);
  const solarToBattery = Math.min(Math.max(pvPower - solarToHouse, 0), battCharging);
  const solarToGrid = Math.min(Math.max(pvPower - solarToHouse - solarToBattery, 0), gridExporting);
  const batteryToHouse = Math.min(battDischarging, Math.max(loadPower - solarToHouse, 0));
  const gridToHouse = Math.min(gridImporting, Math.max(loadPower - solarToHouse - batteryToHouse, 0));
  const gridToBattery = Math.min(Math.max(gridImporting - gridToHouse, 0), Math.max(battCharging - solarToBattery, 0));

  return create(LivePowerDataSchema, {
    pvPowerW: pvPower,
    pv1PowerW: regs[18],
    pv2PowerW: regs[20],
    pv1VoltageV: regs[1] / 10,
    pv2VoltageV: regs[2] / 10,
    batterySoc: regs[59],
    batterySocKwh: 0, // needs battery capacity context
    batteryPowerW: -batteryPower, // our convention: positive = charging
    batteryVoltageV: regs[50] / 100,
    batteryTemperatureC: regs[56] / 10,
    gridPowerW: -gridPower, // our convention: positive = importing
    gridVoltageV: regs[5] / 10,
    gridCurrentA: regs[10] / 10,
    gridFrequencyHz: regs[13] / 100,
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

/** Convert register reads to EnergyTotals for today. */
export function registersToEnergyToday(regs: number[]): EnergyTotals {
  return create(EnergyTotalsSchema, {
    pvGenerationKwh: (regs[17] + regs[19]) / 10, // e_pv1_day + e_pv2_day
    gridImportKwh: regs[26] / 10,
    gridExportKwh: regs[25] / 10,
    batteryChargeKwh: regs[36] / 10,
    batteryDischargeKwh: regs[37] / 10,
    consumptionKwh: 0, // calculated from others
    selfConsumptionKwh: 0,
  });
}
