/**
 * GivEnergy register definitions.
 * Ported from GivTCP baseinverter.py REGISTER_LUT.
 *
 * IR = Input Register (read-only, FC 0x04)
 * HR = Holding Register (read-write, FC 0x03/0x06)
 */

export interface RegisterDef {
  name: string;
  scaling?: number; // divide raw value by this
  signed?: boolean;
  /** If true, this is the low word of a uint32 (combine with previous register) */
  lowWord?: boolean;
}

// Input Registers — read with FC 0x04
export const INPUT_REGISTERS: Record<number, RegisterDef> = {
  0: { name: "status" },
  1: { name: "v_pv1", scaling: 10 },
  2: { name: "v_pv2", scaling: 10 },
  3: { name: "v_p_bus", scaling: 10 },
  4: { name: "v_n_bus", scaling: 10 },
  5: { name: "v_ac1", scaling: 10 },
  6: { name: "e_battery_throughput_total_h" }, // high word
  7: { name: "e_battery_throughput_total_l", scaling: 10, lowWord: true },
  8: { name: "i_pv1", scaling: 10 },
  9: { name: "i_pv2", scaling: 10 },
  10: { name: "i_ac1", scaling: 10 },
  11: { name: "e_pv_total_h" },
  12: { name: "e_pv_total_l", scaling: 10, lowWord: true },
  13: { name: "f_ac1", scaling: 100 },
  15: { name: "v_highbrigh_bus", scaling: 10 },
  17: { name: "e_pv1_day", scaling: 10 },
  18: { name: "p_pv1" },
  19: { name: "e_pv2_day", scaling: 10 },
  20: { name: "p_pv2" },
  21: { name: "e_grid_out_total_h" },
  22: { name: "e_grid_out_total_l", scaling: 10, lowWord: true },
  24: { name: "p_inverter_out", signed: true },
  25: { name: "e_grid_out_day", scaling: 10 },
  26: { name: "e_grid_in_day", scaling: 10 },
  27: { name: "e_inverter_in_total_h" },
  28: { name: "e_inverter_in_total_l", scaling: 10, lowWord: true },
  30: { name: "p_grid_out", signed: true },
  31: { name: "p_eps_backup" },
  32: { name: "e_grid_in_total_h" },
  33: { name: "e_grid_in_total_l", scaling: 10, lowWord: true },
  35: { name: "e_inverter_in_day", scaling: 10 },
  36: { name: "e_battery_charge_today", scaling: 10 },
  37: { name: "e_battery_discharge_today", scaling: 10 },
  41: { name: "temp_inverter_heatsink", scaling: 10 },
  42: { name: "p_load_demand" },
  43: { name: "p_grid_apparent" },
  44: { name: "e_inverter_out_day", scaling: 10 },
  45: { name: "e_inverter_out_total_h" },
  46: { name: "e_inverter_out_total_l", scaling: 10, lowWord: true },
  49: { name: "system_mode" },
  50: { name: "v_battery", scaling: 100 },
  51: { name: "i_battery", signed: true, scaling: 100 },
  52: { name: "p_battery", signed: true },
  53: { name: "v_eps_backup", scaling: 10 },
  54: { name: "f_eps_backup", scaling: 100 },
  55: { name: "temp_charger", scaling: 10 },
  56: { name: "temp_battery", scaling: 10 },
  58: { name: "i_grid_port", scaling: 100 },
  59: { name: "battery_percent" },
};

// Holding Registers — read with FC 0x03, write with FC 0x06
export const HOLDING_REGISTERS: Record<number, RegisterDef & { writable?: boolean; min?: number; max?: number }> = {
  0: { name: "charge_slot_1_start" },
  56: { name: "discharge_slot_1_start", writable: true, min: 0, max: 2359 },
  57: { name: "discharge_slot_1_end", writable: true, min: 0, max: 2359 },
  59: { name: "enable_discharge", writable: true, min: 0, max: 1 },
  94: { name: "charge_slot_1_start", writable: true, min: 0, max: 2359 },
  95: { name: "charge_slot_1_end", writable: true, min: 0, max: 2359 },
  96: { name: "enable_charge", writable: true, min: 0, max: 1 },
  110: { name: "battery_soc_reserve", writable: true, min: 4, max: 100 },
  116: { name: "charge_target_soc", writable: true, min: 4, max: 100 },
};

/**
 * Registers needed for a full LivePowerData read.
 * We read IR 0-59 in one batch (60 registers, the max).
 */
export const LIVE_READ_RANGES = {
  inputRegisters: [
    { base: 0, count: 60 }, // IR 0-59: all core data
  ],
};
