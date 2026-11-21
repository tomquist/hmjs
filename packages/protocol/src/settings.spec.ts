import {
  createAntiReverseCommand,
  createBluetoothCommand,
  createClockCommand,
  createCloudServerCommand,
  createDepthOfDischargeCommand,
  createLocalApiCommand,
  createMeterIpCommand,
  createMiniScheduleSlotCommand,
  createNetworkInfoCommand,
  createPeakShavingCommand,
  createPhaseDetectionCommand,
  createPowerLimitsCommand,
  createStatusLedCommand,
  createSurplusFeedInCommand,
  createTimePeriodCommand,
  createUpsChargePowerCommand,
  createWorkingModeCommand,
  FamilyCommand,
  parseMiniMeterPower,
  parseMiniSchedule,
  parseTimePeriods,
  supportsSetting,
} from "./settings.js";
import { decodeFamilyMessage } from "./families.js";

/**
 * The frames below are the ones the emulated firmware accepted (and, for
 * the replies, sent): each setter changed the setting it is named after in
 * the device's own status.
 */
const bytes = (c: FamilyCommand) => [c.command, ...Array.from(c.payload)];
const hex = (s: string) => s.match(/../g)!.map((b) => parseInt(b, 16));
const frame = (cmd: number, payload: number[]) => {
  const f = [0x73, 5 + payload.length, 0x23, cmd, ...payload];
  f.push(f.reduce((x, b) => x ^ b, 0));
  return new Uint8Array(f);
};

describe("working mode", () => {
  it("uses each family's mode codes", () => {
    expect(bytes(createWorkingModeCommand("venus3", "auto"))).toEqual([9, 0]);
    expect(bytes(createWorkingModeCommand("venus3", "manual"))).toEqual([9, 1]);
    expect(bytes(createWorkingModeCommand("venus", "ai"))).toEqual([9, 5, 1]);
    expect(bytes(createWorkingModeCommand("jupiter", "auto"))).toEqual([9, 1]);
    expect(bytes(createWorkingModeCommand("jupiter", "manual"))).toEqual([
      9, 2,
    ]);
    expect(bytes(createWorkingModeCommand("venusMini", "ups"))).toEqual([2, 1]);
    expect(bytes(createWorkingModeCommand("venusMini", "ai"))).toEqual([2, 3]);
  });

  it("refuses modes a family lacks", () => {
    expect(() => createWorkingModeCommand("venus3", "ups")).toThrow();
    expect(() => createWorkingModeCommand("jupiter", "ai")).toThrow();
    expect(() => createWorkingModeCommand("meter", "auto")).toThrow();
  });
});

describe("Venus and Jupiter time periods", () => {
  it("decodes a Venus slot table", () => {
    const reply = [
      ...hex("08000a1e7f0cfe01"),
      ...hex("0c000e001f2c0101"),
      ...hex("0f0010007fffff01"),
      ...new Array(56).fill(0),
    ];
    const slots = parseTimePeriods("venus3", new Uint8Array(reply));
    expect(slots).toHaveLength(10);
    expect(slots[0]).toEqual({
      start: { hour: 8, minute: 0 },
      end: { hour: 10, minute: 30 },
      weekdays: 0x7f,
      power: -500,
      enabled: true,
    });
    expect(slots[1].power).toBe(300);
    expect(slots[2].power).toBe(-1);
    expect(slots[3].enabled).toBe(false);
  });

  it("decodes the Jupiter's five slots", () => {
    const reply = [
      ...hex("080010007f900101"),
      ...hex("121e173b60960001"),
      ...new Array(64).fill(0),
    ];
    const slots = parseTimePeriods("jupiter", new Uint8Array(reply));
    expect(slots).toHaveLength(5);
    expect(slots[0]).toMatchObject({ power: 400, weekdays: 127 });
    expect(slots[1]).toMatchObject({
      start: { hour: 18, minute: 30 },
      end: { hour: 23, minute: 59 },
      weekdays: 96,
      power: 150,
    });
  });

  it("writes one slot with the family's sub-command", () => {
    const period = {
      enabled: true,
      start: { hour: 8, minute: 0 },
      end: { hour: 10, minute: 30 },
      weekdays: 0x7f,
      power: -500,
    };
    expect(bytes(createTimePeriodCommand("venus3", 0, period))).toEqual(
      hex("0901000800" + "0a1e7f0cfe01"),
    );
    expect(
      bytes(createTimePeriodCommand("jupiter", 1, { ...period, power: 150 })),
    ).toEqual(hex("090201" + "0800" + "0a1e7f960001"));
    expect(() =>
      createTimePeriodCommand("jupiter", 5, { ...period, power: 150 }),
    ).toThrow();
    expect(() =>
      createTimePeriodCommand("venus3", 0, { ...period, end: period.start }),
    ).toThrow(/start when it ends/);
  });

  it("routes the slot table through decodeFamilyMessage", () => {
    const msg = decodeFamilyMessage(
      "jupiter",
      frame(0x0a, new Array(80).fill(0)),
    );
    expect(msg?.kind).toBe("timePeriods");
  });
});

describe("Venus E Mini schedule", () => {
  it("reads the mode and slots (action before power)", () => {
    const reply = [
      2,
      ...hex("0101410108" + "0f112d55"),
      ...new Array(45).fill(0),
    ];
    const { workingMode, slots } = parseMiniSchedule(new Uint8Array(reply));
    expect(workingMode).toBe("manual");
    expect(slots).toHaveLength(6);
    expect(slots[0]).toEqual({
      enabled: true,
      action: "charge",
      power: 321,
      start: { hour: 8, minute: 15 },
      end: { hour: 17, minute: 45 },
      weekdays: 0x55,
    });
  });

  it("writes a slot with power before the action", () => {
    expect(
      bytes(
        createMiniScheduleSlotCommand(0, {
          enabled: true,
          action: "charge",
          power: 321,
          start: { hour: 8, minute: 15 },
          end: { hour: 17, minute: 45 },
          weekdays: 0x55,
        }),
      ),
    ).toEqual(hex("a0" + "01410101080f112d55"));
  });

  it("decodes the meter power", () => {
    const reply = [
      ...hex("0400" + "0000" + "0000" + "0400" + "0000"),
      1,
      3,
      1,
      ...hex("112233445566"),
    ];
    expect(parseMiniMeterPower(new Uint8Array(reply))).toMatchObject({
      phases: [4, 0, 0],
      total: 4,
      phase: 1,
      meterType: 3,
      meterOnline: true,
    });
  });
});

describe("setting commands", () => {
  it("uses each family's command numbers", () => {
    expect(bytes(createDepthOfDischargeCommand("venus3", 80))).toEqual([
      0x54, 80,
    ]);
    expect(bytes(createDepthOfDischargeCommand("venusMini", 70))).toEqual([
      0x44, 70,
    ]);
    expect(bytes(createStatusLedCommand("venus3", true))).toEqual([0x59, 1]);
    // the Mini's LED byte is inverted
    expect(bytes(createStatusLedCommand("venusMini", true))).toEqual([0x27, 0]);
    expect(bytes(createBluetoothCommand("venus3", false))).toEqual([
      0x53, 0x0a, 0,
    ]);
    expect(bytes(createBluetoothCommand("jupiter", true))).toEqual([
      0x55, 0x0a, 1,
    ]);
    expect(bytes(createBluetoothCommand("venusMini", false))).toEqual([
      0x26, 1,
    ]);
    expect(bytes(createSurplusFeedInCommand("venus3", true))).toEqual([
      0x41, 1,
    ]);
    expect(bytes(createSurplusFeedInCommand("jupiter", false))).toEqual([
      0x22, 0,
    ]);
    expect(bytes(createPhaseDetectionCommand("venus3"))).toEqual(
      hex("1d0a0b0c"),
    );
    expect(bytes(createPhaseDetectionCommand("jupiter"))).toEqual(
      hex("200a0b0c"),
    );
    expect(bytes(createPhaseDetectionCommand("venusMini"))).toEqual([0x20, 1]);
    expect(bytes(createCloudServerCommand("venus3", 2))).toEqual([0x02, 2]);
    expect(bytes(createCloudServerCommand("venusMini", 1))).toEqual([0x2a, 1]);
    expect(bytes(createNetworkInfoCommand("jupiter"))).toEqual([0x29, 0]);
    expect(bytes(createNetworkInfoCommand("venus3"))).toEqual([0x24, 0]);
  });

  it("encodes the local API with its ports", () => {
    expect(bytes(createLocalApiCommand("venus3", true, 9090))).toEqual(
      hex("28018223"),
    );
    expect(
      bytes(createLocalApiCommand("venusMini", true, 30001, 30002)),
    ).toEqual(hex("2d0131753275"));
  });

  it("encodes peak shaving, power limits, UPS power and anti-reverse", () => {
    expect(bytes(createPeakShavingCommand("venus3", 300))).toEqual(
      hex("29012c01"),
    );
    expect(bytes(createPeakShavingCommand("venus3", null))).toEqual([0x29, 0]);
    expect(bytes(createPowerLimitsCommand("venusMini", true, false))).toEqual([
      0x28, 1, 0,
    ]);
    expect(bytes(createUpsChargePowerCommand("venusMini", 700))).toEqual(
      hex("2cbc02"),
    );
    expect(bytes(createAntiReverseCommand("venusMini", true, 100))).toEqual(
      hex("3501026400"),
    );
  });

  it("encodes the meter IP as text", () => {
    const ip = Array.from("192.168.1.77", (c) => c.charCodeAt(0));
    expect(bytes(createMeterIpCommand("venus3", "192.168.1.77"))).toEqual([
      0x21,
      0x0a,
      ...ip,
    ]);
    expect(bytes(createMeterIpCommand("jupiter", "192.168.1.77"))[0]).toBe(
      0x25,
    );
    expect(() => createMeterIpCommand("venus3", "192.168.1.300")).toThrow();
  });

  it("encodes the clock per family", () => {
    const d = new Date(2024, 2, 5, 6, 7, 8);
    expect(bytes(createClockCommand("jupiter", d))).toEqual(
      hex("0be8070305060708"),
    );
    expect(bytes(createClockCommand("venusMini", d))).toEqual(
      hex("46180305060708"),
    );
  });

  it("refuses settings a family lacks", () => {
    expect(supportsSetting("venus", "statusLed")).toBe(false);
    expect(() => createStatusLedCommand("jupiter", true)).toThrow(
      /not supported/,
    );
    expect(() => createDepthOfDischargeCommand("venus3", 89)).toThrow();
    expect(() => createUpsChargePowerCommand("venus3", 500)).toThrow();
  });
});
