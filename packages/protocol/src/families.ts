/**
 * Device families and the parts of their Bluetooth protocol that differ.
 *
 * Every Marstek/Hame device speaks the same frame format over BLE
 * (`0x73 <len> 0x23 <cmd> <payload> <xor>`, service `0xFF00`, write `0xFF01`,
 * notify `0xFF02`), but each family gives the command numbers its own
 * meaning: `0x14` sets the clock on a B2500 and returns battery data on a
 * Venus. This module names the families, recognises them from their Bluetooth
 * name or device type, and decodes the replies whose layout has been mapped.
 *
 * What is decoded here was mapped by running each family's control firmware
 * with a simulated battery, inverter and PV, and comparing every reply byte
 * with the values the device reported over MQTT and with the simulated
 * hardware. Fields whose meaning could not be confirmed that way are left
 * out; the raw payload is always available.
 */

import {
  parseMeterPhaseReply,
  parseMeterStatus,
  parseMiniMeterPower,
  parseMiniSchedule,
  parseTimePeriods,
} from "./settings.js";
import type {
  MeterPhaseReadings,
  MeterPower,
  MeterStatus,
  TimePeriod,
} from "./settings.js";

/** Device families that share one command set. */
export type DeviceFamily =
  | "b2500"
  | "venus"
  | "venus3"
  | "venusMini"
  | "jupiter"
  | "meter";

export interface DeviceFamilyInfo {
  /** Family identifier */
  id: DeviceFamily;
  /** Human-readable product names */
  label: string;
  /** Bluetooth name prefixes the devices advertise with */
  namePrefixes: readonly string[];
  /** Device type prefixes reported by the device info command (`type=`) */
  typePrefixes: readonly string[];
}

export const DEVICE_FAMILIES: Readonly<Record<DeviceFamily, DeviceFamilyInfo>> =
  {
    b2500: {
      id: "b2500",
      label: "B2500 / Saturn",
      namePrefixes: ["HM_"],
      typePrefixes: ["HMA", "HMB", "HMF", "HMJ", "HMK"],
    },
    venus: {
      id: "venus",
      label: "Venus C / Venus E",
      namePrefixes: ["MST_ACCP_"],
      typePrefixes: ["HMG"],
    },
    venus3: {
      id: "venus3",
      label: "Venus E 3.0 / Venus A / Venus D",
      namePrefixes: ["MST_VNSE3_", "MST_VNSA_", "MST_VNSD_"],
      typePrefixes: ["VNSE3", "VNSA", "VNSD"],
    },
    venusMini: {
      id: "venusMini",
      label: "Venus E Mini",
      namePrefixes: ["MARS_VNSEM_"],
      typePrefixes: ["VNSEMINI"],
    },
    jupiter: {
      id: "jupiter",
      label: "Jupiter C / Jupiter E / Jupiter C Plus",
      namePrefixes: ["MST_AIOS_", "MST_JPLS_"],
      typePrefixes: ["HMM", "HMN", "JPLS"],
    },
    meter: {
      id: "meter",
      label: "CT002 / CT003 smart meter",
      namePrefixes: ["MST-SMR_", "MST-TPM_"],
      typePrefixes: ["HME", "SMR", "TPM"],
    },
  };

/** Every Bluetooth name prefix a Marstek device is known to advertise with. */
export const ALL_NAME_PREFIXES: readonly string[] = Object.values(
  DEVICE_FAMILIES,
).flatMap((f) => f.namePrefixes);

/**
 * Work out a device's family from its Bluetooth name or its device type.
 *
 * The device type (`type=` in the device info reply) is the reliable source;
 * the Bluetooth name is what is known before connecting.
 *
 * @returns The family, or `undefined` if neither matches a known family
 */
export function detectDeviceFamily(device: {
  name?: string | null;
  type?: string | null;
}): DeviceFamily | undefined {
  const type = device.type?.toUpperCase();
  if (type) {
    // Longest prefix first, so VNSEMINI is not taken for another Venus.
    const byType = Object.values(DEVICE_FAMILIES)
      .flatMap((f) => f.typePrefixes.map((p) => ({ p, id: f.id })))
      .sort((a, b) => b.p.length - a.p.length)
      .find(({ p }) => type.startsWith(p));
    if (byType) return byType.id;
  }
  const name = device.name;
  if (name) {
    const byName = Object.values(DEVICE_FAMILIES).find((f) =>
      f.namePrefixes.some((p) => name.startsWith(p)),
    );
    if (byName) return byName.id;
  }
  return undefined;
}

/**
 * Commands shared by the Venus, Venus E Mini, Jupiter and meter families.
 *
 * Their command table is not the B2500's: only the device info and Wi-Fi
 * commands mean the same on both.
 */
export const MARSTEK_COMMANDS = {
  /** Status block; layout per family (send with payload `0x01`) */
  RUNTIME_INFO: 0x03,
  /** `type=…,id=…,mac=…` plus versions; send with payload `0x01` */
  DEVICE_INFO: 0x04,
  /** `ssid<.,.>password`, as on the B2500 */
  SET_WIFI: 0x05,
  /** Name of the Wi-Fi network the device is configured for */
  GET_WIFI_SSID: 0x08,
  /** Device clock (Venus E 3.0/A/D, Jupiter) */
  GET_DATETIME: 0x0b,
  /** Grid and inverter measurements (Venus E 3.0/A/D) */
  INVERTER_INFO: 0x0d,
  /** Battery data with cell voltages (all Venus models, Jupiter) */
  BATTERY_INFO: 0x14,
  /**
   * `ip:…,gate:…,mask:…,dns:…` (`24 00`); the Jupiter answers the same text
   * to `29 00` (see `createNetworkInfoCommand`)
   */
  GET_NETWORK_INFO: 0x24,
  /** Time periods (Venus, Jupiter) or the Mini's schedule, with payload `0x01` */
  GET_SCHEDULE: 0x0a,
} as const;

/** The Jupiter's network info command (`29 00`; 0x24 on the others). */
const JUPITER_NETWORK_INFO = 0x29;
/** The Venus E Mini's meter power query. */
const MINI_METER_POWER = 0x1a;

/**
 * Commands that make the Wi-Fi module download and flash new firmware.
 *
 * `0x17` on the Venus E Mini flashes from a fixed address on the local
 * network; `0x29` on the CT002/CT003 and `0x24` on the B2500 flash from a
 * URL taken from the payload. A wrong image can leave the device without Wi-Fi or Bluetooth, so
 * {@link assertCommandAllowed} refuses them.
 */
export const DANGEROUS_COMMANDS: Readonly<
  Partial<Record<DeviceFamily, readonly number[]>>
> = {
  venusMini: [0x17],
  meter: [0x29],
  b2500: [0x24],
};

/** Throw if `command` would start a firmware update on `family`. */
export function assertCommandAllowed(
  family: DeviceFamily | undefined,
  command: number,
): void {
  if (family && DANGEROUS_COMMANDS[family]?.includes(command)) {
    throw new Error(
      `Command 0x${command.toString(16).padStart(2, "0")} starts a Wi-Fi module firmware update on this device and is not sent.`,
    );
  }
}

/** Which families support which shared command. */
export const FAMILY_SUPPORT: Readonly<
  Record<keyof typeof MARSTEK_COMMANDS, readonly DeviceFamily[]>
> = {
  RUNTIME_INFO: ["venus3", "venusMini", "jupiter", "venus", "meter"],
  DEVICE_INFO: ["b2500", "venus", "venus3", "venusMini", "jupiter", "meter"],
  SET_WIFI: ["b2500", "venus", "venus3", "venusMini", "jupiter", "meter"],
  GET_WIFI_SSID: ["venus", "venus3", "venusMini", "meter"],
  GET_DATETIME: ["venus3", "jupiter"],
  INVERTER_INFO: ["venus3"],
  BATTERY_INFO: ["venus3", "jupiter", "venusMini", "venus"],
  GET_NETWORK_INFO: ["venus", "venus3", "venusMini", "jupiter"],
  GET_SCHEDULE: ["venus", "venus3", "jupiter", "venusMini"],
};

/** Whether `family` is known to support the shared command `command`. */
export function familySupports(
  family: DeviceFamily | undefined,
  command: keyof typeof MARSTEK_COMMANDS,
): boolean {
  return family !== undefined && FAMILY_SUPPORT[command].includes(family);
}

// ---------------------------------------------------------------- decoding

/** Payload of a frame: everything between the 4-byte header and the checksum. */
export function framePayload(frame: Uint8Array): Uint8Array {
  return frame.subarray(4, Math.max(4, frame.length - 1));
}

class Reader {
  private view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  has(offset: number, size: number): boolean {
    return offset >= 0 && offset + size <= this.bytes.length;
  }
  u8(o: number): number | undefined {
    return this.has(o, 1) ? this.view.getUint8(o) : undefined;
  }
  u16(o: number): number | undefined {
    return this.has(o, 2) ? this.view.getUint16(o, true) : undefined;
  }
  i16(o: number): number | undefined {
    return this.has(o, 2) ? this.view.getInt16(o, true) : undefined;
  }
  u32(o: number): number | undefined {
    return this.has(o, 4) ? this.view.getUint32(o, true) : undefined;
  }
  i32(o: number): number | undefined {
    return this.has(o, 4) ? this.view.getInt32(o, true) : undefined;
  }
  scaled(v: number | undefined, factor: number): number | undefined {
    return v === undefined ? undefined : Math.round(v * factor * 1000) / 1000;
  }
  ascii(o: number, n: number): string | undefined {
    if (!this.has(o, n)) return undefined;
    let s = "";
    for (let i = o; i < o + n; i++) {
      const c = this.bytes[i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
  u16s(o: number, n: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = this.u16(o + 2 * i);
      if (v === undefined) break;
      out.push(v);
    }
    return out;
  }
}

/** Decode a text reply (`0x08`, `0x24`). */
export function parseTextPayload(payload: Uint8Array): string {
  let end = payload.length;
  while (end > 0 && (payload[end - 1] === 0 || payload[end - 1] < 0x20)) end--;
  let s = "";
  for (let i = 0; i < end; i++) s += String.fromCharCode(payload[i]);
  return s;
}

export interface NetworkInfo {
  ip?: string;
  gateway?: string;
  netmask?: string;
  dns?: string;
}

/** Decode `ip:…,gate:…,mask:…,dns:…` (`0x24`). */
export function parseNetworkInfo(payload: Uint8Array): NetworkInfo {
  const out: NetworkInfo = {};
  const keys: Record<string, keyof NetworkInfo> = {
    ip: "ip",
    gate: "gateway",
    mask: "netmask",
    dns: "dns",
  };
  for (const part of parseTextPayload(payload).split(",")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const key = keys[part.slice(0, i).trim()];
    if (key) out[key] = part.slice(i + 1).trim();
  }
  return out;
}

export interface DeviceDateTime {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday */
  weekday: number;
}

/** Decode the device clock (`0x0B` on Venus E 3.0/A/D and Jupiter). */
export function parseDeviceDateTime(
  payload: Uint8Array,
): DeviceDateTime | null {
  const r = new Reader(payload);
  if (!r.has(0, 8)) return null;
  return {
    year: r.u16(0)!,
    month: r.u8(2)!,
    day: r.u8(3)!,
    hour: r.u8(4)!,
    minute: r.u8(5)!,
    second: r.u8(6)!,
    weekday: r.u8(7)!,
  };
}

/** Status block of a Venus E 3.0, Venus A or Venus D (`0x03`). */
export interface Venus3RuntimeInfo {
  /** AC power in W; positive while the battery feeds the house */
  acPower?: number;
  /** Battery power in W; negative while discharging */
  batteryPower?: number;
  /** State of charge in percent */
  soc?: number;
  /** Energy left in the battery in Wh */
  remainingEnergy?: number;
  /** Depth of discharge in percent */
  depthOfDischarge?: number;
  /** Configured maximum charging power in W */
  maxChargePower?: number;
  /** Wi-Fi signal in dBm */
  wifiSignal?: number;
  /** Control firmware version */
  firmwareVersion?: number;
  /** BMS firmware version */
  bmsVersion?: number;
  /** Inverter firmware version */
  inverterVersion?: number;
  /** MPPT firmware version (Venus A and D) */
  mpptVersion?: number;
  /** Wi-Fi module firmware version */
  wifiModuleVersion?: string;
  /** Port of the local API */
  localApiPort?: number;
  rawPayload: Uint8Array;
}

/** Length of the Venus E 3.0 status block; the Venus A/D insert PV data. */
const VENUS3_RUNTIME_LENGTH = 139;

export function parseVenus3RuntimeInfo(payload: Uint8Array): Venus3RuntimeInfo {
  const r = new Reader(payload);
  const signal = r.u8(61);
  // The Venus A and D insert 28 bytes of PV data after the local API port,
  // which moves every later field; those are read relative to the end.
  const end = payload.length;
  const tail = (offsetInE3: number) =>
    end >= VENUS3_RUNTIME_LENGTH
      ? end - VENUS3_RUNTIME_LENGTH + offsetInE3
      : -1;
  return {
    acPower: r.i16(2),
    remainingEnergy: r.scaled(r.u16(9), 10),
    soc: r.u8(11),
    firmwareVersion: r.u16(12),
    wifiSignal: signal === undefined ? undefined : -signal,
    maxChargePower: r.u16(72),
    bmsVersion: r.u16(79),
    wifiModuleVersion: r.ascii(81, 12),
    inverterVersion: r.u16(103),
    localApiPort: r.u16(105),
    mpptVersion: end >= VENUS3_RUNTIME_LENGTH + 28 ? r.u16(122) : undefined,
    batteryPower: r.i16(tail(112)),
    depthOfDischarge: r.u8(tail(121)),
    rawPayload: payload.slice(),
  };
}

/** Status block of a Venus C/E (`0x03`): the Venus E 3.0 header. */
export interface VenusRuntimeInfo {
  /** AC power in W, as the device reports it */
  acPower?: number;
  /** State of charge in percent */
  soc?: number;
  /** Energy left in the battery in Wh */
  remainingEnergy?: number;
  /** Wi-Fi signal in dBm */
  wifiSignal?: number;
  /** Control firmware version */
  firmwareVersion?: number;
  /** BMS firmware version */
  bmsVersion?: number;
  /** Wi-Fi module firmware version */
  wifiModuleVersion?: string;
  /** Port of the local API */
  localApiPort?: number;
  rawPayload: Uint8Array;
}

export function parseVenusRuntimeInfo(payload: Uint8Array): VenusRuntimeInfo {
  const r = new Reader(payload);
  const signal = r.u8(61);
  return {
    acPower: r.i16(2),
    remainingEnergy: r.scaled(r.u16(9), 10),
    soc: r.u8(11),
    firmwareVersion: r.u16(12),
    wifiSignal: signal === undefined ? undefined : -signal,
    bmsVersion: r.u16(79),
    wifiModuleVersion: r.ascii(81, 12),
    localApiPort: r.u16(102),
    rawPayload: payload.slice(),
  };
}

/** Grid and inverter measurements of a Venus E 3.0, A or D (`0x0D`). */
export interface Venus3InverterInfo {
  /** Grid frequency in Hz */
  gridFrequency?: number;
  /** Grid voltage in V */
  gridVoltage?: number;
  /** AC power in W; positive while the battery feeds the house */
  acPower?: number;
  rawPayload: Uint8Array;
}

export function parseVenus3InverterInfo(
  payload: Uint8Array,
): Venus3InverterInfo {
  const r = new Reader(payload);
  return {
    gridFrequency: r.scaled(r.u16(1), 0.1),
    gridVoltage: r.scaled(r.u16(3), 0.1),
    acPower: r.i16(5),
    rawPayload: payload.slice(),
  };
}

/** Battery data with cell voltages (`0x14`). */
export interface BatteryInfo {
  /** State of charge in percent */
  soc?: number;
  /** Rated capacity in Wh */
  ratedCapacity?: number;
  /** Energy left in the battery in Wh */
  remainingEnergy?: number;
  /** Pack voltage in V */
  voltage?: number;
  /** Pack current in A; negative while discharging */
  current?: number;
  /** Battery temperatures in °C */
  temperatures: number[];
  /** Cell voltages in mV */
  cellVoltages: number[];
  /** Highest cell voltage in mV, where the device reports only the extremes */
  maxCellVoltage?: number;
  /** Lowest cell voltage in mV, where the device reports only the extremes */
  minCellVoltage?: number;
  /** BMS firmware version */
  bmsVersion?: number;
  rawPayload: Uint8Array;
}

export function parseVenus3BatteryInfo(payload: Uint8Array): BatteryInfo {
  return parseVenusBatteryLayout(payload, 0.1);
}

/**
 * Battery data of a Venus C/E (`0x14`): the Venus E 3.0 layout, with the
 * temperatures in whole °C.
 */
export function parseVenusBatteryInfo(payload: Uint8Array): BatteryInfo {
  return parseVenusBatteryLayout(payload, 1);
}

function parseVenusBatteryLayout(
  payload: Uint8Array,
  temperatureScale: number,
): BatteryInfo {
  const r = new Reader(payload);
  return {
    bmsVersion: r.u16(0),
    soc: r.u16(8),
    ratedCapacity: r.u16(12),
    voltage: r.scaled(r.u16(14), 0.01),
    current: r.scaled(r.i16(16), 0.1),
    remainingEnergy: r.scaled(r.u16(22), 10),
    temperatures: r
      .u16s(40, 4)
      .map((t) => (t << 16) >> 16)
      .map((t) => r.scaled(t, temperatureScale)!),
    cellVoltages: r.u16s(48, 16),
    rawPayload: payload.slice(),
  };
}

/** Battery data of a Venus E Mini (`0x14`). */
export function parseVenusMiniBatteryInfo(payload: Uint8Array): BatteryInfo {
  const r = new Reader(payload);
  const soc = r.u16(12);
  const t1 = r.i16(36);
  const t2 = r.i16(38);
  return {
    soc: soc === undefined ? undefined : soc / 10,
    ratedCapacity: r.u16(16),
    voltage: r.scaled(r.u16(18), 0.001),
    current: r.scaled(r.i32(22), 0.001),
    remainingEnergy: r.u16(30),
    temperatures: [r.i16(26), t1, t2]
      .filter((t): t is number => t !== undefined)
      .map((t) => t / 10),
    cellVoltages: r.u16s(40, 2),
    rawPayload: payload.slice(),
  };
}

const bool = (v: number | undefined) => (v === undefined ? undefined : v === 1);
const neg = (v: number | undefined) => (v === undefined ? undefined : -v);

/** Status block of a Venus E Mini (`0x03`); only the confirmed fields. */
export interface VenusMiniRuntimeInfo {
  /** Grid frequency in Hz */
  gridFrequency?: number;
  /** Grid voltage in V */
  gridVoltage?: number;
  /** AC power in W; positive while the battery feeds the house */
  acPower?: number;
  /** State of charge in percent, as the device estimates it */
  soc?: number;
  /** Energy left in the battery in Wh */
  remainingEnergy?: number;
  /** Battery power in W; negative while discharging */
  batteryPower?: number;
  /** Working mode */
  workingMode?: "auto" | "ups" | "manual" | "ai";
  /** Whether the meter answers */
  meterConnected?: boolean;
  /** Depth of discharge in percent */
  depthOfDischarge?: number;
  /** Wi-Fi signal in dBm */
  wifiSignal?: number;
  /** Inverter, control and DC/DC firmware versions */
  inverterVersion?: number;
  firmwareVersion?: number;
  dcdcVersion?: number;
  /** Meter type code (as set with the meter type command) */
  meterType?: number;
  /** Detected meter phase */
  meterPhase?: number;
  /** Status LED on */
  ledOn?: boolean;
  /** Feed-in limit: the higher one (1250 W on inverter firmware 270) */
  highFeedInLimit?: boolean;
  /** Grid charging limited to 800 W instead of 1250 W */
  lowGridChargeLimit?: boolean;
  /** UPS charge power in W */
  upsChargePower?: number;
  /** Local API enabled, its port and remote port */
  localApiEnabled?: boolean;
  localApiPort?: number;
  localApiRemotePort?: number;
  /** Cloud server region */
  cloudServer?: number;
  rawPayload: Uint8Array;
}

const MINI_MODES = ["auto", "ups", "manual", "ai"] as const;

export function parseVenusMiniRuntimeInfo(
  payload: Uint8Array,
): VenusMiniRuntimeInfo {
  const r = new Reader(payload);
  return {
    gridFrequency: r.scaled(r.u16(0), 0.01),
    gridVoltage: r.scaled(r.u16(2), 0.1),
    remainingEnergy: r.u32(14),
    soc: r.scaled(r.u16(18), 0.1),
    workingMode: MINI_MODES[r.u8(24) ?? -1],
    meterConnected: bool(r.u8(25)),
    acPower: r.i32(34),
    depthOfDischarge: r.u8(42),
    batteryPower: r.i16(47),
    wifiSignal: neg(r.u8(54)),
    inverterVersion: r.u16(91),
    firmwareVersion: r.u16(93),
    dcdcVersion: r.u16(95),
    meterType: r.u8(97),
    ledOn: r.u8(100) === undefined ? undefined : r.u8(100) === 0,
    highFeedInLimit: bool(r.u8(101)),
    meterPhase: r.u8(102),
    cloudServer: r.u8(103),
    upsChargePower: r.u16(112),
    localApiEnabled: bool(r.u8(114)),
    localApiPort: r.u16(115),
    localApiRemotePort: r.u16(117),
    lowGridChargeLimit: bool(r.u8(119)),
    rawPayload: payload.slice(),
  };
}

export interface PvInput {
  /** Power in W */
  power: number;
  /** Whether the input is active */
  active?: boolean;
  /** Voltage in V (system info only) */
  voltage?: number;
  /** Current in A (system info only) */
  current?: number;
}

/** Status block of a Jupiter (`0x03`). */
export interface JupiterRuntimeInfo {
  /** The four PV inputs */
  pv: PvInput[];
  /** AC power in W */
  acPower?: number;
  /** State of charge in percent */
  soc?: number;
  /** Energy left in the battery in Wh */
  remainingEnergy?: number;
  /** Energy delivered today in Wh */
  dailyOutputEnergy?: number;
  /** Energy delivered this month in Wh */
  monthlyOutputEnergy?: number;
  /** Depth of discharge in percent */
  depthOfDischarge?: number;
  /** Wi-Fi signal in dBm */
  wifiSignal?: number;
  firmwareVersion?: number;
  inverterVersion?: number;
  mpptVersion?: number;
  bmsVersion?: number;
  rawPayload: Uint8Array;
}

export function parseJupiterRuntimeInfo(
  payload: Uint8Array,
): JupiterRuntimeInfo {
  const r = new Reader(payload);
  const pv: PvInput[] = [];
  for (let i = 0; i < 4; i++) {
    const power = r.u16(3 * i);
    const state = r.u8(3 * i + 2);
    if (power === undefined) break;
    pv.push({ power, active: state === undefined ? undefined : state === 1 });
  }
  const signal = r.u8(57);
  // The Jupiter C Plus inserts two bytes (pack count) before the tail, so the
  // depth of discharge is located from the end of the block.
  const dod = payload.length >= 70 ? r.u8(payload.length - 2) : undefined;
  return {
    pv,
    acPower: r.u16(12),
    remainingEnergy: r.scaled(r.u16(19), 10),
    soc: r.u8(21),
    dailyOutputEnergy: r.scaled(r.u32(39), 10),
    monthlyOutputEnergy: r.scaled(r.u32(43), 10),
    firmwareVersion: r.u16(47),
    inverterVersion: r.u16(49),
    mpptVersion: r.u16(51),
    bmsVersion: r.u16(53),
    wifiSignal: signal === undefined ? undefined : -signal,
    depthOfDischarge: dod,
    rawPayload: payload.slice(),
  };
}

/** Inverter, PV and battery measurements of a Jupiter (`0x14`). */
export interface JupiterSystemInfo {
  /** Grid voltage in V */
  gridVoltage?: number;
  /** AC current in A */
  acCurrent?: number;
  /** Grid frequency in Hz */
  gridFrequency?: number;
  /** AC power in W */
  acPower?: number;
  /** The four PV inputs with voltage, current and power */
  pv: PvInput[];
  battery: BatteryInfo;
}

export function parseJupiterSystemInfo(payload: Uint8Array): JupiterSystemInfo {
  const r = new Reader(payload);
  const pv: PvInput[] = [];
  for (let i = 0; i < 4; i++) {
    const o = 40 + 6 * i;
    if (!r.has(o, 6)) break;
    pv.push({
      voltage: r.scaled(r.u16(o), 0.1),
      current: r.scaled(r.u16(o + 2), 0.1),
      power: r.scaled(r.u16(o + 4), 0.1)!,
    });
  }
  // The Jupiter C/E BMS reports every cell and six temperatures in 0.1 °C;
  // the Jupiter C Plus BMS reports the highest and lowest cell and whole °C.
  const plus = r.u16(122) !== undefined && r.u16(128) === 0;
  const battery: BatteryInfo = {
    soc: r.u16(94),
    ratedCapacity: r.u16(98),
    bmsVersion: r.u16(100),
    voltage: r.scaled(r.u16(102), 0.01),
    current: r.scaled(r.i16(104), 0.1),
    temperatures: plus
      ? r.u16s(154, 6).map((t) => (t << 16) >> 16)
      : r.u16s(154, 6).map((t) => ((t << 16) >> 16) / 10),
    cellVoltages: plus ? [] : r.u16s(122, 16),
    maxCellVoltage: plus ? r.u16(124) : undefined,
    minCellVoltage: plus ? r.u16(126) : undefined,
    rawPayload: payload.slice(),
  };
  return {
    gridVoltage: r.scaled(r.u16(6), 0.1),
    acCurrent: r.scaled(r.u16(8), 0.01),
    gridFrequency: r.scaled(r.u16(12), 0.01),
    acPower: r.u16(16),
    pv,
    battery,
  };
}

/** A reply decoded with the family's own layout. */
export type FamilyMessage =
  | { kind: "deviceInfo"; command: number; data: Record<string, string> }
  | {
      kind: "runtimeInfo";
      command: number;
      data:
        | Venus3RuntimeInfo
        | VenusRuntimeInfo
        | VenusMiniRuntimeInfo
        | JupiterRuntimeInfo;
    }
  | { kind: "batteryInfo"; command: number; data: BatteryInfo }
  | { kind: "systemInfo"; command: number; data: JupiterSystemInfo }
  | { kind: "inverterInfo"; command: number; data: Venus3InverterInfo }
  | { kind: "timePeriods"; command: number; data: TimePeriod[] }
  | {
      kind: "miniSchedule";
      command: number;
      data: ReturnType<typeof parseMiniSchedule>;
    }
  | { kind: "meterPower"; command: number; data: MeterPower }
  | { kind: "meterStatus"; command: number; data: MeterStatus }
  | { kind: "meterPhases"; command: number; data: MeterPhaseReadings }
  | { kind: "dateTime"; command: number; data: DeviceDateTime }
  | { kind: "wifiSsid"; command: number; data: string }
  | { kind: "networkInfo"; command: number; data: NetworkInfo }
  | { kind: "raw"; command: number; data: Uint8Array };

/** Decode `key=value,…` text (device info). */
export function parseKeyValuePayload(
  payload: Uint8Array,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of parseTextPayload(payload).split(",")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

/**
 * Decode a notification from a non-B2500 device with its family's layout.
 *
 * @param family Family of the device that sent it
 * @param frame Complete frame including header and checksum
 * @returns The decoded reply, or `null` if it is not a valid frame
 */
export function decodeFamilyMessage(
  family: DeviceFamily,
  frame: Uint8Array,
): FamilyMessage | null {
  if (frame.length < 5 || frame[0] !== 0x73 || frame[2] !== 0x23) return null;
  const command = frame[3];
  const payload = framePayload(frame);
  const C = MARSTEK_COMMANDS;
  if (command === C.DEVICE_INFO) {
    return { kind: "deviceInfo", command, data: parseKeyValuePayload(payload) };
  }
  switch (family) {
    case "venus3":
      if (command === C.RUNTIME_INFO)
        return {
          kind: "runtimeInfo",
          command,
          data: parseVenus3RuntimeInfo(payload),
        };
      if (command === C.BATTERY_INFO)
        return {
          kind: "batteryInfo",
          command,
          data: parseVenus3BatteryInfo(payload),
        };
      if (command === C.INVERTER_INFO)
        return {
          kind: "inverterInfo",
          command,
          data: parseVenus3InverterInfo(payload),
        };
      break;
    case "venus":
      if (command === C.RUNTIME_INFO)
        return {
          kind: "runtimeInfo",
          command,
          data: parseVenusRuntimeInfo(payload),
        };
      if (command === C.BATTERY_INFO)
        return {
          kind: "batteryInfo",
          command,
          data: parseVenusBatteryInfo(payload),
        };
      break;
    case "venusMini":
      if (command === C.RUNTIME_INFO)
        return {
          kind: "runtimeInfo",
          command,
          data: parseVenusMiniRuntimeInfo(payload),
        };
      if (command === C.BATTERY_INFO)
        return {
          kind: "batteryInfo",
          command,
          data: parseVenusMiniBatteryInfo(payload),
        };
      break;
    case "jupiter":
      if (command === C.RUNTIME_INFO)
        return {
          kind: "runtimeInfo",
          command,
          data: parseJupiterRuntimeInfo(payload),
        };
      if (command === C.BATTERY_INFO)
        return {
          kind: "systemInfo",
          command,
          data: parseJupiterSystemInfo(payload),
        };
      break;
    case "meter":
      if (command === C.RUNTIME_INFO)
        return {
          kind: "meterStatus",
          command,
          data: parseMeterStatus(payload),
        };
      if (command === 0x13 || command === 0x15 || command === 0x16)
        return {
          kind: "meterPhases",
          command,
          data: parseMeterPhaseReply(command, payload),
        };
      break;
    default:
      break;
  }
  if (command === C.GET_SCHEDULE && family === "venusMini") {
    return { kind: "miniSchedule", command, data: parseMiniSchedule(payload) };
  }
  if (command === C.GET_SCHEDULE && familySupports(family, "GET_SCHEDULE")) {
    return {
      kind: "timePeriods",
      command,
      data: parseTimePeriods(family, payload),
    };
  }
  if (command === MINI_METER_POWER && family === "venusMini") {
    return { kind: "meterPower", command, data: parseMiniMeterPower(payload) };
  }
  if (command === JUPITER_NETWORK_INFO && family === "jupiter") {
    return { kind: "networkInfo", command, data: parseNetworkInfo(payload) };
  }
  if (command === C.GET_DATETIME && familySupports(family, "GET_DATETIME")) {
    const dt = parseDeviceDateTime(payload);
    if (dt) return { kind: "dateTime", command, data: dt };
  }
  if (command === C.GET_WIFI_SSID && familySupports(family, "GET_WIFI_SSID")) {
    return { kind: "wifiSsid", command, data: parseTextPayload(payload) };
  }
  if (
    command === C.GET_NETWORK_INFO &&
    familySupports(family, "GET_NETWORK_INFO") &&
    family !== "jupiter"
  ) {
    return { kind: "networkInfo", command, data: parseNetworkInfo(payload) };
  }
  return { kind: "raw", command, data: payload.slice() };
}
