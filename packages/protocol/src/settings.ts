/**
 * Settings and schedules of the Venus, Venus E Mini and Jupiter families.
 *
 * The families use different command numbers for the same setting (surplus
 * feed-in is 0x41 on a Venus and 0x22 on a Jupiter), so every builder here
 * takes the family and returns the command together with its payload. A
 * builder throws for a family the setting does not exist on.
 *
 * Every payload is complete: the Venus E Mini does not check the length of
 * what it receives and fills a short payload with whatever is left in its
 * receive buffer.
 */
import type { DeviceFamily } from "./families.js";

/** A command number with its payload, ready for `createCommandMessage`. */
export interface FamilyCommand {
  command: number;
  payload: Uint8Array;
}

/** Bytes the Venus and Jupiter expect after some command numbers. */
const MARKER = [0x0a, 0x0b, 0x0c];

const cmd = (command: number, ...bytes: number[]): FamilyCommand => ({
  command,
  payload: new Uint8Array(bytes),
});

const u16le = (v: number): number[] => [v & 0xff, (v >> 8) & 0xff];

function checkInt(value: number, min: number, max: number, label: string) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
}

function unsupported(setting: string, family: DeviceFamily | undefined): never {
  throw new Error(
    `${setting} is not supported on this device (${family ?? "unknown family"}).`,
  );
}

const isVenus = (f: DeviceFamily | undefined) =>
  f === "venus" || f === "venus3";

/**
 * Which setting exists on which family. Settings listed for a family were
 * confirmed on its firmware in the emulator, except where the setter's
 * documentation says otherwise.
 */
export const SETTING_SUPPORT = {
  workingMode: ["venus", "venus3", "jupiter", "venusMini"],
  timePeriods: ["venus", "venus3", "jupiter"],
  miniSchedule: ["venusMini"],
  depthOfDischarge: ["venus3", "jupiter", "venusMini"],
  statusLed: ["venus3", "venusMini"],
  bluetooth: ["venus3", "jupiter", "venusMini"],
  surplusFeedIn: ["venus", "venus3", "jupiter"],
  localApi: ["venus", "venus3", "venusMini"],
  maxChargePower: ["venus3"],
  maxDischargePower: ["venus3"],
  peakShaving: ["venus3"],
  backup: ["venus", "venus3"],
  meterIp: ["venus", "venus3", "jupiter", "venusMini"],
  phaseDetection: ["venus3", "jupiter", "venusMini"],
  clock: ["venus3", "jupiter", "venusMini"],
  cloudServer: ["venus3", "jupiter", "venusMini"],
  restart: ["venusMini", "meter"],
  powerLimits: ["venusMini"],
  upsChargePower: ["venusMini"],
  antiReverse: ["venusMini"],
} as const satisfies Record<string, readonly DeviceFamily[]>;

export type Setting = keyof typeof SETTING_SUPPORT;

/** Whether `family` has the setting `setting`. */
export function supportsSetting(
  family: DeviceFamily | undefined,
  setting: Setting,
): boolean {
  return (
    family !== undefined &&
    (SETTING_SUPPORT[setting] as readonly DeviceFamily[]).includes(family)
  );
}

function requireSetting(setting: Setting, family: DeviceFamily | undefined) {
  if (!supportsSetting(family, setting)) unsupported(setting, family);
}

// ------------------------------------------------------------ working mode

/**
 * Working modes. `auto` follows the meter (self-consumption), `manual` runs
 * the time periods, `ai` follows the cloud's plan, `ups` (Venus E Mini only)
 * charges from the grid at the UPS charge power.
 */
export type WorkingMode = "auto" | "manual" | "ai" | "ups";

export function createWorkingModeCommand(
  family: DeviceFamily | undefined,
  mode: WorkingMode,
): FamilyCommand {
  requireSetting("workingMode", family);
  if (family === "venusMini") {
    const code = { auto: 0, ups: 1, manual: 2, ai: 3 }[mode];
    return cmd(0x02, code);
  }
  if (mode === "ups") unsupported("UPS mode", family);
  if (family === "jupiter") {
    if (mode === "ai") unsupported("AI mode over Bluetooth", family);
    return cmd(0x09, mode === "auto" ? 0x01 : 0x02);
  }
  return mode === "ai"
    ? cmd(0x09, 0x05, 0x01)
    : cmd(0x09, mode === "auto" ? 0x00 : 0x01);
}

// ------------------------------------------------------------ time periods

/** One time period (schedule slot) of a Venus or Jupiter. */
export interface TimePeriod {
  enabled: boolean;
  start: { hour: number; minute: number };
  end: { hour: number; minute: number };
  /** Weekday bitmask as the device stores it (0x7F = every day) */
  weekdays: number;
  /**
   * Power in W. Venus: positive discharges, negative charges, -1 follows
   * the meter. Jupiter: discharge power.
   */
  power: number;
}

export const VENUS_TIME_PERIODS = 10;
export const JUPITER_TIME_PERIODS = 5;

/** Command that reads the time periods (Venus and Jupiter, `0A 01`). */
export function createReadTimePeriodsCommand(
  family: DeviceFamily | undefined,
): FamilyCommand {
  requireSetting("timePeriods", family);
  return cmd(0x0a, 0x01);
}

/** Decode the reply to {@link createReadTimePeriodsCommand}: 8 bytes per slot. */
export function parseTimePeriods(
  family: DeviceFamily | undefined,
  payload: Uint8Array,
): TimePeriod[] {
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  const n = family === "jupiter" ? JUPITER_TIME_PERIODS : VENUS_TIME_PERIODS;
  const out: TimePeriod[] = [];
  for (let i = 0; i < n && 8 * i + 8 <= payload.length; i++) {
    const o = 8 * i;
    out.push({
      start: { hour: payload[o], minute: payload[o + 1] },
      end: { hour: payload[o + 2], minute: payload[o + 3] },
      weekdays: payload[o + 4],
      power: view.getInt16(o + 5, true),
      enabled: payload[o + 7] === 1,
    });
  }
  return out;
}

function checkTime(t: { hour: number; minute: number }, label: string) {
  checkInt(t.hour, 0, 23, `${label} hour`);
  checkInt(t.minute, 0, 59, `${label} minute`);
}

/**
 * Write one time period. The device stores slots one at a time; on a
 * Jupiter, writing a slot also switches the working mode to manual.
 *
 * @param index 0-based slot (Venus 0-9, Jupiter 0-4)
 */
export function createTimePeriodCommand(
  family: DeviceFamily | undefined,
  index: number,
  period: TimePeriod,
): FamilyCommand {
  requireSetting("timePeriods", family);
  const jupiter = family === "jupiter";
  checkInt(
    index,
    0,
    (jupiter ? JUPITER_TIME_PERIODS : VENUS_TIME_PERIODS) - 1,
    "Slot",
  );
  checkTime(period.start, "Start");
  checkTime(period.end, "End");
  checkInt(period.weekdays, 0, 0x7f, "Weekday mask");
  if (jupiter) checkInt(period.power, 0, 2500, "Power");
  else checkInt(period.power, -2500, 2500, "Power");
  if (
    period.start.hour === period.end.hour &&
    period.start.minute === period.end.minute
  ) {
    throw new Error("A time period must not start when it ends");
  }
  const p = period.power & 0xffff;
  return cmd(
    0x09,
    jupiter ? 0x02 : 0x01,
    index,
    period.start.hour,
    period.start.minute,
    period.end.hour,
    period.end.minute,
    period.weekdays,
    p & 0xff,
    p >> 8,
    period.enabled ? 1 : 0,
  );
}

// ------------------------------------------------- Venus E Mini schedule

export type MiniSlotAction = "idle" | "charge" | "discharge" | "followMeter";
const MINI_ACTIONS: MiniSlotAction[] = [
  "idle",
  "charge",
  "discharge",
  "followMeter",
];

/** One of the Venus E Mini's six schedule slots. */
export interface MiniScheduleSlot {
  enabled: boolean;
  /** Power in W (the device uses at most 1500 W) */
  power: number;
  action: MiniSlotAction;
  start: { hour: number; minute: number };
  /** End time; 23:59 runs to midnight */
  end: { hour: number; minute: number };
  /** Weekday bitmask, bit 0 = Monday ... bit 6 = Sunday */
  weekdays: number;
}

export const MINI_SCHEDULE_SLOTS = 6;

/** Command that reads the Mini's working mode and schedule (`0A 01`). */
export function createReadMiniScheduleCommand(): FamilyCommand {
  return cmd(0x0a, 0x01);
}

/** Decode the Mini's `0x0A` reply: working mode, then six 9-byte slots. */
export function parseMiniSchedule(payload: Uint8Array): {
  workingMode?: WorkingMode;
  slots: MiniScheduleSlot[];
} {
  const modes: WorkingMode[] = ["auto", "ups", "manual", "ai"];
  const slots: MiniScheduleSlot[] = [];
  for (
    let i = 0;
    i < MINI_SCHEDULE_SLOTS && 1 + 9 * i + 9 <= payload.length;
    i++
  ) {
    const o = 1 + 9 * i;
    // the read layout puts the action before the power
    slots.push({
      enabled: payload[o] === 1,
      action: MINI_ACTIONS[payload[o + 1]] ?? "idle",
      power: payload[o + 2] | (payload[o + 3] << 8),
      start: { hour: payload[o + 4], minute: payload[o + 5] },
      end: { hour: payload[o + 6], minute: payload[o + 7] },
      weekdays: payload[o + 8],
    });
  }
  return { workingMode: modes[payload[0]], slots };
}

/**
 * Write one of the Mini's schedule slots (`0xA0` + index, 9 bytes).
 * @param index 0-based slot, 0-5
 */
export function createMiniScheduleSlotCommand(
  index: number,
  slot: MiniScheduleSlot,
): FamilyCommand {
  checkInt(index, 0, MINI_SCHEDULE_SLOTS - 1, "Slot");
  checkInt(slot.power, 0, 1500, "Power");
  checkTime(slot.start, "Start");
  checkTime(slot.end, "End");
  checkInt(slot.weekdays, 0, 0x7f, "Weekday mask");
  const action = MINI_ACTIONS.indexOf(slot.action);
  if (action < 0) throw new Error(`Unknown slot action ${slot.action}`);
  return cmd(
    0xa0 + index,
    slot.enabled ? 1 : 0,
    ...u16le(slot.power),
    action,
    slot.start.hour,
    slot.start.minute,
    slot.end.hour,
    slot.end.minute,
    slot.weekdays,
  );
}

// ------------------------------------------------------- simple settings

/** Depth of discharge in percent. */
export function createDepthOfDischargeCommand(
  family: DeviceFamily | undefined,
  percent: number,
): FamilyCommand {
  requireSetting("depthOfDischarge", family);
  const max = family === "venus3" ? 88 : 90;
  checkInt(percent, 30, max, "Depth of discharge");
  return cmd(family === "venusMini" ? 0x44 : 0x54, percent);
}

/** Status LED on or off. */
export function createStatusLedCommand(
  family: DeviceFamily | undefined,
  on: boolean,
): FamilyCommand {
  requireSetting("statusLed", family);
  // the Mini's LED byte is inverted: 0 = on
  return family === "venusMini" ? cmd(0x27, on ? 0 : 1) : cmd(0x59, on ? 1 : 0);
}

/**
 * Bluetooth advertising. Turning it off is the app's "Bluetooth lock": the
 * device stops advertising (the Venus E Mini about ten minutes later), which
 * also ends this connection.
 */
export function createBluetoothCommand(
  family: DeviceFamily | undefined,
  on: boolean,
): FamilyCommand {
  requireSetting("bluetooth", family);
  if (family === "venusMini") return cmd(0x26, on ? 2 : 1);
  return cmd(family === "jupiter" ? 0x55 : 0x53, 0x0a, on ? 1 : 0);
}

/**
 * Surplus feed-in: feed PV power the house does not use into the grid once
 * the battery is full. On the Venus models the setting is not reported back.
 */
export function createSurplusFeedInCommand(
  family: DeviceFamily | undefined,
  on: boolean,
): FamilyCommand {
  requireSetting("surplusFeedIn", family);
  return cmd(family === "jupiter" ? 0x22 : 0x41, on ? 1 : 0);
}

/**
 * The local API (Marstek Open API): enabled and its UDP port. The Venus E
 * Mini also takes the remote port.
 */
export function createLocalApiCommand(
  family: DeviceFamily | undefined,
  enabled: boolean,
  port: number,
  remotePort: number = port,
): FamilyCommand {
  requireSetting("localApi", family);
  checkInt(port, 1, 65535, "Port");
  if (family === "venusMini") {
    checkInt(remotePort, 1, 65535, "Remote port");
    return cmd(0x2d, enabled ? 1 : 0, ...u16le(port), ...u16le(remotePort));
  }
  return cmd(0x28, enabled ? 1 : 0, ...u16le(port));
}

/** Maximum charging power in W (Venus E 3.0/A/D). */
export function createMaxChargePowerCommand(
  family: DeviceFamily | undefined,
  watts: number,
): FamilyCommand {
  requireSetting("maxChargePower", family);
  checkInt(watts, 0, 2500, "Maximum charging power");
  return cmd(0x16, ...u16le(watts));
}

/**
 * Maximum discharging power in W (Venus E 3.0/A/D). A value above the unit's
 * rating is ignored by the device.
 */
export function createMaxDischargePowerCommand(
  family: DeviceFamily | undefined,
  watts: number,
): FamilyCommand {
  requireSetting("maxDischargePower", family);
  checkInt(watts, 0, 2500, "Maximum discharging power");
  return cmd(0x17, ...u16le(watts));
}

/** Peak shaving with its power in W, or off (Venus E 3.0/A/D). */
export function createPeakShavingCommand(
  family: DeviceFamily | undefined,
  watts: number | null,
): FamilyCommand {
  requireSetting("peakShaving", family);
  if (watts === null) return cmd(0x29, 0x00);
  checkInt(watts, 0, 65535, "Peak shaving power");
  return cmd(0x29, 0x01, ...u16le(watts));
}

/** Backup (EPS) output on or off (Venus). */
export function createBackupCommand(
  family: DeviceFamily | undefined,
  on: boolean,
): FamilyCommand {
  requireSetting("backup", family);
  return cmd(0x0f, on ? 1 : 0);
}

/**
 * IP address of a meter read over the network (P1 meter, EcoTracker).
 */
export function createMeterIpCommand(
  family: DeviceFamily | undefined,
  ip: string,
): FamilyCommand {
  requireSetting("meterIp", family);
  if (
    !/^(\d{1,3})(\.\d{1,3}){3}$/.test(ip) ||
    ip.split(".").some((p) => +p > 255)
  ) {
    throw new Error("Meter IP must be an IPv4 address");
  }
  const text = Array.from(ip, (c) => c.charCodeAt(0));
  return cmd(family === "jupiter" ? 0x25 : 0x21, 0x0a, ...text);
}

/** Start the meter phase detection. */
export function createPhaseDetectionCommand(
  family: DeviceFamily | undefined,
): FamilyCommand {
  requireSetting("phaseDetection", family);
  if (family === "venusMini") return cmd(0x20, 0x01);
  return cmd(family === "jupiter" ? 0x20 : 0x1d, ...MARKER);
}

/** Set the device clock (local time). */
export function createClockCommand(
  family: DeviceFamily | undefined,
  date: Date = new Date(),
): FamilyCommand {
  requireSetting("clock", family);
  if (Number.isNaN(date.getTime()))
    throw new Error("Date must be a valid Date");
  const y = date.getFullYear();
  const fields = [
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ];
  if (family === "venusMini") {
    checkInt(y, 2000, 2255, "Year");
    return cmd(0x46, y - 2000, ...fields);
  }
  return cmd(0x0b, ...u16le(y), ...fields);
}

/**
 * Cloud server region. Venus and Jupiter: 0 EU (default), 2 China/other,
 * 3 test, 4 pre-release. Venus E Mini: 0 EU, 1 US, 2 development, 3 staging.
 * A wrong value disconnects the device from the Marstek cloud.
 */
export function createCloudServerCommand(
  family: DeviceFamily | undefined,
  server: number,
): FamilyCommand {
  requireSetting("cloudServer", family);
  checkInt(server, 0, 4, "Server");
  return cmd(family === "venusMini" ? 0x2a : 0x02, server);
}

/** Restart the device (Venus E Mini, CT002/CT003). The connection drops. */
export function createRestartCommand(
  family: DeviceFamily | undefined,
): FamilyCommand {
  requireSetting("restart", family);
  // the meters restart with 0x09, the B2500's Wi-Fi info query
  return family === "meter" ? cmd(0x09, 0x01) : cmd(0x2b, 0x01);
}

/**
 * The Venus E Mini's power limits: feed-in 800 W (`false`) or the higher
 * limit (`true`; 1250 W on inverter firmware 270, "1500 W" in the app), and
 * grid charging at 1250 W (`false`) or 800 W (`true`).
 */
export function createPowerLimitsCommand(
  family: DeviceFamily | undefined,
  highFeedIn: boolean,
  lowGridCharge: boolean,
): FamilyCommand {
  requireSetting("powerLimits", family);
  return cmd(0x28, highFeedIn ? 1 : 0, lowGridCharge ? 1 : 0);
}

/** The Venus E Mini's UPS charge power in W (used between 100 and 1500 W). */
export function createUpsChargePowerCommand(
  family: DeviceFamily | undefined,
  watts: number,
): FamilyCommand {
  requireSetting("upsChargePower", family);
  checkInt(watts, 100, 1500, "UPS charge power");
  return cmd(0x2c, ...u16le(watts));
}

/** The Venus E Mini's anti-reverse (zero feed-in) setting. */
export function createAntiReverseCommand(
  family: DeviceFamily | undefined,
  enabled: boolean,
  watts: number,
): FamilyCommand {
  requireSetting("antiReverse", family);
  checkInt(watts, 0, 65535, "Anti-reverse power");
  // the second byte is a mode the app always sends as 2
  return cmd(0x35, enabled ? 1 : 0, 0x02, ...u16le(watts));
}

// --------------------------------------------------------------- queries

/** Command that reads the network info (IP, gateway, netmask, DNS). */
export function createNetworkInfoCommand(
  family: DeviceFamily | undefined,
): FamilyCommand {
  if (family === "jupiter") return cmd(0x29, 0x00);
  if (isVenus(family) || family === "venusMini") return cmd(0x24, 0x00);
  unsupported("networkInfo", family);
}

/** Meter power per phase as the battery sees it. */
export interface MeterPower {
  /** Phase A, B and C power in W */
  phases: [number, number, number];
  /** Total power in W */
  total: number;
  /** Venus E Mini: detected phase, meter type code, meter answering */
  phase?: number;
  meterType?: number;
  meterOnline?: boolean;
  rawPayload: Uint8Array;
}

/** Command that reads the meter power: Venus E Mini (`0x1A`). */
export function createMeterPowerCommand(
  family: DeviceFamily | undefined,
): FamilyCommand {
  if (family === "venusMini") return cmd(0x1a);
  unsupported("meterPower", family);
}

/** Decode the Venus E Mini's meter power (`0x1A`, 19 bytes). */
export function parseMiniMeterPower(payload: Uint8Array): MeterPower {
  const v = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  const i16 = (o: number) =>
    o + 2 <= payload.length ? v.getInt16(o, true) : 0;
  return {
    phases: [i16(0), i16(2), i16(4)],
    total: i16(6),
    phase: payload[10],
    meterType: payload[11],
    meterOnline: payload.length > 12 ? payload[12] === 1 : undefined,
    rawPayload: payload.slice(),
  };
}

// ------------------------------------------------------- CT002 / CT003

/** Status of a CT002 or CT003 meter (`0x03`). */
export interface MeterStatus {
  /** Meter firmware version */
  firmwareVersion?: number;
  /** Phase A, B and C power in W */
  phases: [number, number, number];
  /** Total power in W */
  total?: number;
  /** Batteries reading this meter */
  batteries?: number;
  /** Wi-Fi signal in dBm */
  wifiSignal?: number;
  /** CT002: measurement direction mask, bit 0-2 = phase A-C */
  directionMask?: number;
  /** CT003: total energy in kWh (on a DSMR meter: import minus export) */
  totalEnergy?: number;
  /** CT003: reader settings (see `createMeterReaderCommand`) */
  reader?: {
    interface: number;
    serialCode: number;
    protocol: number;
    meterNumber: number;
  };
  rawPayload: Uint8Array;
}

/**
 * Decode a meter's status block. The CT002 sends 19 bytes with 16-bit
 * powers; the CT003 a longer block with 32-bit powers and the energy
 * counter, which tells the two apart.
 */
export function parseMeterStatus(payload: Uint8Array): MeterStatus {
  const v = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  const has = (o: number, n: number) => o + n <= payload.length;
  if (payload.length < 30) {
    // CT002: offsets are frame offsets − 4
    const i16 = (o: number) => (has(o, 2) ? v.getInt16(o, true) : 0);
    return {
      firmwareVersion: payload[0],
      phases: [i16(7), i16(9), i16(11)],
      total: has(13, 2) ? v.getInt16(13, true) : undefined,
      batteries: payload[16],
      wifiSignal: has(17, 1) ? v.getInt8(17) : undefined,
      directionMask: payload[18],
      rawPayload: payload.slice(),
    };
  }
  const i32 = (o: number) => (has(o, 4) ? v.getInt32(o, true) : 0);
  const energy = has(5, 8) ? Number(v.getBigInt64(5, true)) : undefined;
  return {
    firmwareVersion: payload[0],
    total: has(1, 4) ? v.getInt32(1, true) : undefined,
    totalEnergy: energy === undefined ? undefined : Math.round(energy) / 10000,
    batteries: payload[14],
    wifiSignal: has(15, 1) ? v.getInt8(15) : undefined,
    reader: has(16, 4)
      ? {
          interface: payload[16],
          serialCode: payload[17],
          protocol: payload[18],
          meterNumber: payload[19],
        }
      : undefined,
    phases: [i32(24), i32(28), i32(32)],
    rawPayload: payload.slice(),
  };
}

/**
 * CT002 measurement direction (`0x17`): bit 0-2 = phase A-C. On the
 * emulated HME-4 (firmware 124) a set bit keeps the phase's measured sign
 * and a cleared bit inverts it; a factory reset restores 7. hm2mqtt
 * describes the MQTT field the other way round, so check the result on
 * your meter.
 */
export function createMeterDirectionCommand(mask: number): FamilyCommand {
  checkInt(mask, 0, 7, "Direction mask");
  return cmd(0x17, mask);
}

/**
 * CT003 reader settings (`0x11`): interface (0 infrared head, 1 P1 port),
 * serial settings code, protocol (0 SML, 1 DSMR) and meter number, as the
 * app takes them from its meter list. The meter restarts after accepting;
 * defaults are 1, 0, 1, 100.
 */
export function createMeterReaderCommand(reader: {
  interface: number;
  serialCode: number;
  protocol: number;
  meterNumber: number;
}): FamilyCommand {
  checkInt(reader.interface, 0, 1, "Interface");
  checkInt(reader.serialCode, 0, 255, "Serial settings code");
  checkInt(reader.protocol, 0, 1, "Protocol");
  checkInt(reader.meterNumber, 0, 255, "Meter number");
  return cmd(
    0x11,
    reader.interface,
    reader.serialCode,
    reader.protocol,
    reader.meterNumber,
  );
}

/** CT002 zero-point calibration (`0x10`). */
export function createMeterZeroCalibrationCommand(): FamilyCommand {
  return cmd(0x10, 0x01);
}

/** CT002 phase measurements (`0x13` voltages, `0x15` angles, `0x16` power). */
export interface MeterPhaseReadings {
  /** Phase voltages in V (whole volts) */
  voltages?: [number, number, number];
  /** Voltage phase angles AB, CA, BC in degrees */
  angles?: [number, number, number];
  /** Active power per phase in W */
  powers?: [number, number, number];
}

export function parseMeterPhaseReply(
  command: number,
  payload: Uint8Array,
): MeterPhaseReadings {
  const v = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  if (payload.length < 6) return {};
  const three = (signed: boolean): [number, number, number] =>
    [0, 2, 4].map((o) =>
      signed ? v.getInt16(o, true) : v.getUint16(o, true),
    ) as [number, number, number];
  if (command === 0x13) return { voltages: three(false) };
  if (command === 0x15) return { angles: three(false) };
  if (command === 0x16) return { powers: three(true) };
  return {};
}
