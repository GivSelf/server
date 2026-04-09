/**
 * Transparent sub-frame builder for GivEnergy Modbus.
 *
 * Structure within a function-code-2 frame payload:
 *   [0-9]    Data adapter serial (10 bytes, '*'-padded)
 *   [10-17]  Padding (8 bytes, uint64 BE — default 0x08, zero stops inverter responding)
 *   [18]     Slave address (0x31=inverter, 0x32-0x36=batteries 1-5)
 *   [19]     Transparent function code (0x03=read HR, 0x04=read IR, 0x06=write HR)
 *   [20..]   Variable data + 2-byte CRC
 */

import { PayloadEncoder, crc16modbus } from "./codec.js";

const DEFAULT_PADDING = 0x08n;
const SLAVE_INVERTER = 0x31;

export const SlaveAddress = {
  INVERTER: 0x31,
  BATTERY_1: 0x32,
  BATTERY_2: 0x33,
  BATTERY_3: 0x34,
  BATTERY_4: 0x35,
  BATTERY_5: 0x36,
} as const;

export const TransparentFC = {
  READ_HOLDING: 0x03,
  READ_INPUT: 0x04,
  WRITE_HOLDING: 0x06,
} as const;

function computeCheckCode(slaveAddr: number, fc: number, reg: number, value: number): number {
  const enc = new PayloadEncoder();
  enc.addUint8(slaveAddr);
  enc.addUint8(fc);
  enc.addUint16(reg);
  enc.addUint16(value);
  const crc = enc.crc;
  // Endian-swap: the CRC is computed in little-endian Modbus style,
  // but written big-endian into the frame
  return ((crc & 0xff) << 8) | ((crc >> 8) & 0xff);
}

/** Build a complete GivEnergy frame for a transparent request. */
function buildFrame(serial: string, subPayload: Buffer): Buffer {
  const enc = new PayloadEncoder();
  // MBAP header
  enc.addUint16(0x5959); // transaction ID
  enc.addUint16(0x0001); // protocol ID
  enc.addUint16(subPayload.length + 2); // length (payload + uid + fid)
  enc.addUint8(0x01); // unit ID
  enc.addUint8(0x02); // function code: transparent

  return Buffer.concat([enc.toBuffer(), subPayload]);
}

function buildTransparentPayload(
  serial: string,
  slaveAddr: number,
  fc: number,
  baseRegister: number,
  countOrValue: number,
): Buffer {
  const enc = new PayloadEncoder();
  enc.addString(serial, 10);
  enc.addUint64(DEFAULT_PADDING);
  enc.addUint8(slaveAddr);
  enc.addUint8(fc);
  enc.addUint16(baseRegister);
  enc.addUint16(countOrValue);
  const check = computeCheckCode(slaveAddr, fc, baseRegister, countOrValue);
  enc.addUint16(check);
  return enc.toBuffer();
}

export function buildReadInputRegisters(
  serial: string,
  baseRegister: number,
  count: number,
  slaveAddr = SLAVE_INVERTER,
): Buffer {
  const sub = buildTransparentPayload(serial, slaveAddr, TransparentFC.READ_INPUT, baseRegister, count);
  return buildFrame(serial, sub);
}

export function buildReadHoldingRegisters(
  serial: string,
  baseRegister: number,
  count: number,
  slaveAddr = SLAVE_INVERTER,
): Buffer {
  const sub = buildTransparentPayload(serial, slaveAddr, TransparentFC.READ_HOLDING, baseRegister, count);
  return buildFrame(serial, sub);
}

export function buildWriteHoldingRegister(
  serial: string,
  register: number,
  value: number,
  slaveAddr = 0x11, // write uses 0x11 per GivTCP
): Buffer {
  const sub = buildTransparentPayload(serial, slaveAddr, TransparentFC.WRITE_HOLDING, register, value);
  return buildFrame(serial, sub);
}

/** Build a heartbeat response frame. */
export function buildHeartbeatResponse(requestPayload: Buffer): Buffer {
  const enc = new PayloadEncoder();
  enc.addUint16(0x5959);
  enc.addUint16(0x0001);
  enc.addUint16(requestPayload.length + 2);
  enc.addUint8(0x01);
  enc.addUint8(0x01); // heartbeat
  return Buffer.concat([enc.toBuffer(), requestPayload]);
}
