/**
 * High-level command builders for GivEnergy inverter communication.
 */

import {
  buildReadInputRegisters,
  buildReadHoldingRegisters,
  buildWriteHoldingRegister,
  SlaveAddress,
} from "./pdu.js";

export function readInputRegisters(serial: string, base: number, count: number): Buffer {
  return buildReadInputRegisters(serial, base, count, SlaveAddress.INVERTER);
}

export function readHoldingRegisters(serial: string, base: number, count: number): Buffer {
  return buildReadHoldingRegisters(serial, base, count, SlaveAddress.INVERTER);
}

export function readBatteryInputRegisters(serial: string, base: number, count: number, batteryNum = 1): Buffer {
  const slave = SlaveAddress.BATTERY_1 + (batteryNum - 1);
  return buildReadInputRegisters(serial, base, count, slave);
}

// Write commands

export function setChargeSlot1(serial: string, startHHMM: number, endHHMM: number): Buffer[] {
  return [
    buildWriteHoldingRegister(serial, 94, startHHMM),
    buildWriteHoldingRegister(serial, 95, endHHMM),
  ];
}

export function setDischargeSlot1(serial: string, startHHMM: number, endHHMM: number): Buffer[] {
  return [
    buildWriteHoldingRegister(serial, 56, startHHMM),
    buildWriteHoldingRegister(serial, 57, endHHMM),
  ];
}

export function enableCharge(serial: string, enabled: boolean): Buffer {
  return buildWriteHoldingRegister(serial, 96, enabled ? 1 : 0);
}

export function enableDischarge(serial: string, enabled: boolean): Buffer {
  return buildWriteHoldingRegister(serial, 59, enabled ? 1 : 0);
}

export function setBatteryReserve(serial: string, soc: number): Buffer {
  return buildWriteHoldingRegister(serial, 110, Math.max(4, Math.min(100, soc)));
}

export function setChargeTarget(serial: string, soc: number): Buffer {
  return buildWriteHoldingRegister(serial, 116, Math.max(4, Math.min(100, soc)));
}

export function setChargeRate(serial: string, percent: number): Buffer {
  return buildWriteHoldingRegister(serial, 111, Math.max(0, Math.min(50, percent)));
}

export function setDischargeRate(serial: string, percent: number): Buffer {
  return buildWriteHoldingRegister(serial, 112, Math.max(0, Math.min(50, percent)));
}

/** HR 27: 0 = max power (discharge freely), 1 = match demand (ECO) */
export function setBatteryMode(serial: string, mode: number): Buffer {
  return buildWriteHoldingRegister(serial, 27, mode);
}

/** HR 163 = 100 triggers inverter reboot */
export function reboot(serial: string): Buffer {
  return buildWriteHoldingRegister(serial, 163, 100);
}

/** Write system time to HR 35-40 (year-2000, month, day, hour, min, sec) */
export function syncTime(serial: string, date: Date = new Date()): Buffer[] {
  return [
    buildWriteHoldingRegister(serial, 35, date.getFullYear() - 2000),
    buildWriteHoldingRegister(serial, 36, date.getMonth() + 1),
    buildWriteHoldingRegister(serial, 37, date.getDate()),
    buildWriteHoldingRegister(serial, 38, date.getHours()),
    buildWriteHoldingRegister(serial, 39, date.getMinutes()),
    buildWriteHoldingRegister(serial, 40, date.getSeconds()),
  ];
}
