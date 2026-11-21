import {
  ALL_NAME_PREFIXES,
  assertCommandAllowed,
  decodeFamilyMessage,
  detectDeviceFamily,
  familySupports,
  framePayload,
  parseDeviceDateTime,
  parseJupiterRuntimeInfo,
  parseJupiterSystemInfo,
  parseKeyValuePayload,
  parseNetworkInfo,
  parseVenus3BatteryInfo,
  parseVenus3InverterInfo,
  parseVenus3RuntimeInfo,
  parseVenusBatteryInfo,
  parseVenusRuntimeInfo,
  parseVenusMiniBatteryInfo,
  parseVenusMiniRuntimeInfo,
  detectMeterVariant,
  frameIsValid,
} from "./families.js";

/**
 * Replies recorded from each family's control firmware running with a
 * simulated battery, inverter and PV. The expected values are what the
 * simulated hardware was doing at the time.
 */
const hex = (s: string): Uint8Array =>
  new Uint8Array(s.match(/../g)!.map((b) => parseInt(b, 16)));

const VENUS3 = {
  runtime: hex(
    "739023030000b501010101010344013f970000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000001c40920030301017300323032343039303930313539000300000003f26400007700307500000000003afe3afeb501b5010158000001000a00000800000000c60100000006",
  ),
  inverter: hex("7318230d01f401fc08b501fb00fb0000000e010e010000f1"),
  battery: hex(
    "7356231473004002e803e8033f00e8030014a514aaff1b0003004401000000000000000000000000fa00fa000e010e010e010e01e00ce10ce20ce20ce30ce40ce60ce60ce80ce90cea0ceb0cec0ced0ced0cee0c005e",
  ),
  dateTime: hex("730d230be3070b140419330380"),
  ssid: hex("730b2308456d754e657451"),
};

const VENUS_D = {
  runtime: hex(
    "73ac23030000b0010101010102f4005f970000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000001c40920030301017600323032343039303930313539000300000003f2640000740030758a0701cb08010d0a014f0b01010101680000000000000000000000000000000000df011402b001b0010158000001000a00000800000000b50100000036",
  ),
  battery: hex(
    "73562314760040026400f4015f000000000ad5145a001b005b00f400000000000000000000000000fa00fa000e010e010e010e01fd0cff0cff0c010d020d030d040d050d0d0d0e0d0f0d100d130d140d150d160d0028",
  ),
};

const VENUS_CE = {
  runtime: hex(
    "737223030000af0103010101033d013e9a00000000000100000000000000000000000000000000000000000000000000000000000000000100000000000000000030000000000000000000000000c409030101d800323032343039303930313539000300000003f2640030750000010000eb",
  ),
  battery: hex(
    "73552314d8003b02e803e8033e0064000014b31400000200c0003d010000000000001b007fe10100000019001b001b001b001b00e00ce00ce10ce20ce30ce40ce50ce60ce70ce80ce90cea0ceb0cec0ced0cee0c75",
  ),
};

const JUPITER = {
  runtime: hex(
    "734d2303fa00012c01015e0101900101b00101010101014701408e0000000000000000000000000000010010000000100000008e0065006500d100000030000001030101030003f2640058019c",
  ),
  system: hex(
    "73ab2314010000000000fc08bb00640088131602b001fb00100000000000000010000000010000002c01000090013e00c40990014b00b80b90015700ac0d90016400a00f000000000000000000000000000000001602ec00dc00a5003b02f401f401400064000014d100de1497000e010000000000000000c0000100cc0c030d040d050d060d070d080d090d0a0d0b0d0c0d0d0d0e0d0f0d100d110d120d0e010e010e010e010e010e0100",
  ),
};

const JUPITER_PLUS = {
  runtime: hex(
    "734f2303fa00012c01015e0101900101b00101010101018200338f0000000000000000000000000000010011000000110000008f006500650025000000300000010301010301010003f264005801dd",
  ),
  system: hex(
    "73ab2314010000000000fc08bb00640088131602b001fb00110000000000000011000000010000002c01000090013e00c40990014b00b80b90015700ac0d90016400a00f000000000000000000000000000000001602ec00dc00a5004802f401f40133000000000a2500dc1497000e010000000000000000c00001001905000f110d020d00000000000000000000000000000000000000000000000000001b001b001b001b00190019005c",
  ),
};

const MINI = {
  runtime: hex(
    "737d23038813fc080000120112010f010f01f104000075020000000000010000000000000005b0010000000100015a0000000069fe0200000000300000000000000000000000000000000000000000000000000000000000000000000000000e0135010c0103020000000100ea07010100031700200300307530750065",
  ),
  battery: hex(
    "733123140000000000000000000000007502e803d9079b19000073f1feff0f014000f104000000000f010f01cb0cd00c96",
  ),
  network: hex(
    "7349232469703a3139322e3136382e312e35302c676174653a3139322e3136382e312e312c6d61736b3a3235352e3235352e3235352e302c646e733a3139322e3136382e312e310d4c",
  ),
};

describe("detectDeviceFamily", () => {
  it.each([
    ["HMA-1", "b2500"],
    ["HMJ-2", "b2500"],
    ["HMG-1", "venus"],
    ["VNSE3-0", "venus3"],
    ["VNSD-0", "venus3"],
    ["VNSA-0", "venus3"],
    ["VNSEMINI-0", "venusMini"],
    ["HMN-1", "jupiter"],
    ["JPLS-8H", "jupiter"],
    ["HME-3", "meter"],
    ["HME-4", "meter"],
  ])("recognises device type %s", (type, family) => {
    expect(detectDeviceFamily({ type })).toBe(family);
  });

  it.each([
    ["HM_B2500_1a2b", "b2500"],
    ["MST_ACCP_1a2b", "venus"],
    ["MST_VNSE3_1a2b", "venus3"],
    ["MARS_VNSEM_1a2b", "venusMini"],
    ["MST_AIOS_1a2b", "jupiter"],
    ["MST_JPLS_1a2b", "jupiter"],
    ["MST-SMR_1a2b", "meter"],
    ["MST-TPM_1a2b", "meter"],
  ])("recognises Bluetooth name %s", (name, family) => {
    expect(detectDeviceFamily({ name })).toBe(family);
  });

  it("prefers the device type over the name", () => {
    expect(detectDeviceFamily({ name: "HM_B2500_1a2b", type: "VNSE3-0" })).toBe(
      "venus3",
    );
  });

  it("returns undefined for unknown devices", () => {
    expect(
      detectDeviceFamily({ name: "Speaker", type: "XYZ" }),
    ).toBeUndefined();
  });

  it("lists every name prefix for scanning", () => {
    expect(ALL_NAME_PREFIXES).toEqual(
      expect.arrayContaining(["HM_", "MST_VNSE3_", "MARS_VNSEM_", "MST-SMR_"]),
    );
  });
});

describe("Venus E 3.0 / A / D", () => {
  it("decodes the status block", () => {
    const info = parseVenus3RuntimeInfo(framePayload(VENUS3.runtime));
    expect(info).toMatchObject({
      acPower: 437,
      batteryPower: -454,
      soc: 63,
      remainingEnergy: 3240,
      depthOfDischarge: 88,
      maxChargePower: 2500,
      wifiSignal: -48,
      firmwareVersion: 151,
      bmsVersion: 115,
      inverterVersion: 119,
      wifiModuleVersion: "202409090159",
      localApiPort: 30000,
    });
  });

  it("reads the Venus D status block, whose tail is shifted by PV data", () => {
    expect(parseVenus3RuntimeInfo(framePayload(VENUS_D.runtime))).toMatchObject(
      {
        acPower: 432,
        soc: 95,
        remainingEnergy: 2440,
        firmwareVersion: 151,
        bmsVersion: 118,
        inverterVersion: 116,
        mpptVersion: 104,
        localApiPort: 30000,
        batteryPower: 479,
        depthOfDischarge: 88,
      },
    );
    expect(parseVenus3BatteryInfo(framePayload(VENUS_D.battery))).toMatchObject(
      { soc: 95, ratedCapacity: 2560, voltage: 53.33, current: 9 },
    );
  });

  it("decodes grid and inverter measurements", () => {
    expect(
      parseVenus3InverterInfo(framePayload(VENUS3.inverter)),
    ).toMatchObject({ gridFrequency: 50, gridVoltage: 230, acPower: 437 });
  });

  it("decodes the battery block with all 16 cells", () => {
    const info = parseVenus3BatteryInfo(framePayload(VENUS3.battery));
    expect(info).toMatchObject({
      bmsVersion: 115,
      soc: 63,
      ratedCapacity: 5120,
      voltage: 52.85,
      current: -8.6,
      remainingEnergy: 3240,
      temperatures: [27, 27, 27, 27],
    });
    expect(info.cellVoltages).toEqual([
      3296, 3297, 3298, 3298, 3299, 3300, 3302, 3302, 3304, 3305, 3306, 3307,
      3308, 3309, 3309, 3310,
    ]);
  });

  it("decodes the clock", () => {
    expect(parseDeviceDateTime(framePayload(VENUS3.dateTime))).toEqual({
      year: 2019,
      month: 11,
      day: 20,
      hour: 4,
      minute: 25,
      second: 51,
      weekday: 3,
    });
  });

  it("routes replies through decodeFamilyMessage", () => {
    expect(decodeFamilyMessage("venus3", VENUS3.battery)?.kind).toBe(
      "batteryInfo",
    );
    expect(decodeFamilyMessage("venus3", VENUS3.ssid)).toEqual({
      kind: "wifiSsid",
      command: 0x08,
      data: "EmuNet",
    });
  });
});

describe("Venus C/E", () => {
  it("decodes the status block", () => {
    expect(parseVenusRuntimeInfo(framePayload(VENUS_CE.runtime))).toMatchObject(
      {
        acPower: 431,
        soc: 62,
        remainingEnergy: 3170,
        firmwareVersion: 154,
        wifiSignal: -48,
        bmsVersion: 216,
        wifiModuleVersion: "202409090159",
        localApiPort: 30000,
      },
    );
  });

  it("decodes the battery block, with whole-degree temperatures", () => {
    const info = parseVenusBatteryInfo(framePayload(VENUS_CE.battery));
    expect(info).toMatchObject({
      bmsVersion: 216,
      soc: 62,
      ratedCapacity: 5120,
      voltage: 52.99,
      remainingEnergy: 3170,
      temperatures: [27, 27, 27, 27],
    });
    expect(info.cellVoltages).toHaveLength(16);
    expect(info.cellVoltages[0]).toBe(3296);
  });

  it("routes Venus C/E replies through decodeFamilyMessage", () => {
    expect(decodeFamilyMessage("venus", VENUS_CE.battery)?.kind).toBe(
      "batteryInfo",
    );
    expect(decodeFamilyMessage("venus", VENUS_CE.runtime)?.kind).toBe(
      "runtimeInfo",
    );
  });
});

describe("Jupiter", () => {
  it("decodes the status block", () => {
    const info = parseJupiterRuntimeInfo(framePayload(JUPITER.runtime));
    expect(info.pv).toEqual([
      { power: 250, active: true },
      { power: 300, active: true },
      { power: 350, active: true },
      { power: 400, active: true },
    ]);
    expect(info).toMatchObject({
      acPower: 432,
      soc: 64,
      remainingEnergy: 3270,
      dailyOutputEnergy: 160,
      monthlyOutputEnergy: 160,
      firmwareVersion: 142,
      inverterVersion: 101,
      mpptVersion: 101,
      bmsVersion: 209,
      wifiSignal: -48,
      depthOfDischarge: 88,
    });
  });

  it("decodes the system block with PV, grid and 16 cells", () => {
    const info = parseJupiterSystemInfo(framePayload(JUPITER.system));
    expect(info).toMatchObject({
      gridVoltage: 230,
      acCurrent: 1.87,
      gridFrequency: 50,
      acPower: 432,
    });
    expect(info.pv[0]).toEqual({ voltage: 40, current: 6.2, power: 250 });
    expect(info.pv[3]).toEqual({ voltage: 40, current: 10, power: 400 });
    expect(info.battery).toMatchObject({
      soc: 64,
      ratedCapacity: 5120,
      bmsVersion: 209,
      voltage: 53.42,
      current: 15.1,
    });
    expect(info.battery.cellVoltages).toHaveLength(16);
    expect(info.battery.cellVoltages[0]).toBe(3331);
    expect(info.battery.temperatures).toEqual([27, 27, 27, 27, 27, 27]);
  });

  it("handles the Jupiter C Plus layout", () => {
    expect(
      parseJupiterRuntimeInfo(framePayload(JUPITER_PLUS.runtime)),
    ).toMatchObject({ soc: 51, remainingEnergy: 1300, depthOfDischarge: 88 });
    const info = parseJupiterSystemInfo(framePayload(JUPITER_PLUS.system));
    expect(info.battery).toMatchObject({
      soc: 51,
      ratedCapacity: 2560,
      maxCellVoltage: 3345,
      minCellVoltage: 3330,
      cellVoltages: [],
      temperatures: [27, 27, 27, 27, 25, 25],
    });
  });
});

describe("Venus E Mini", () => {
  it("decodes the status block", () => {
    expect(parseVenusMiniRuntimeInfo(framePayload(MINI.runtime))).toMatchObject(
      {
        gridFrequency: 50,
        gridVoltage: 230,
        acPower: 432,
        soc: 62.9,
        remainingEnergy: 1265,
      },
    );
  });

  it("decodes both cell voltages from the battery block", () => {
    expect(parseVenusMiniBatteryInfo(framePayload(MINI.battery))).toMatchObject(
      {
        soc: 62.9,
        ratedCapacity: 2009,
        voltage: 6.555,
        current: -69.261,
        remainingEnergy: 1265,
        temperatures: [27.1, 27.1, 27.1],
        cellVoltages: [3275, 3280],
      },
    );
  });

  it("decodes the network info", () => {
    expect(parseNetworkInfo(framePayload(MINI.network))).toEqual({
      ip: "192.168.1.50",
      gateway: "192.168.1.1",
      netmask: "255.255.255.0",
      dns: "192.168.1.1",
    });
  });
});

describe("shared helpers", () => {
  it("parses device info key/value text", () => {
    const text = "type=VNSE3-0,id=abc,mac=c8478c000002,dev_ver=151";
    expect(parseKeyValuePayload(new TextEncoder().encode(text))).toEqual({
      type: "VNSE3-0",
      id: "abc",
      mac: "c8478c000002",
      dev_ver: "151",
    });
  });

  it("knows which family supports which command", () => {
    expect(familySupports("jupiter", "GET_NETWORK_INFO")).toBe(true);
    expect(familySupports("meter", "BATTERY_INFO")).toBe(false);
    expect(familySupports(undefined, "DEVICE_INFO")).toBe(false);
  });

  it("refuses commands that start a firmware update", () => {
    expect(() => assertCommandAllowed("venusMini", 0x17)).toThrow(
      /firmware update/,
    );
    expect(() => assertCommandAllowed("meter", 0x29)).toThrow();
    expect(() => assertCommandAllowed("venus3", 0x17)).not.toThrow();
  });

  it("refuses every update command while the family is unknown", () => {
    for (const c of [0x17, 0x24, 0x29]) {
      expect(() => assertCommandAllowed(undefined, c)).toThrow(/not known/);
    }
    expect(() => assertCommandAllowed(undefined, 0x03)).not.toThrow();
  });

  it("refuses command numbers that are not a byte", () => {
    // 0x124 would be sent as 0x24
    for (const c of [0x124, -1, 1.5, NaN]) {
      expect(() => assertCommandAllowed("b2500", c)).toThrow(RangeError);
    }
  });

  it("tells the CT002 from the CT003", () => {
    expect(detectMeterVariant({ name: "MST-TPM_0002" })).toBe("ct002");
    expect(detectMeterVariant({ name: "MST-SMR_0002" })).toBe("ct003");
    expect(detectMeterVariant({ type: "HME-4" })).toBe("ct002");
    expect(detectMeterVariant({ type: "HME-3" })).toBe("ct003");
    expect(detectMeterVariant({ name: "MST_VNSE3_0002" })).toBeUndefined();
  });

  it("decodes only whole frames", () => {
    const ssid = Uint8Array.from([
      0x73, 0x0b, 0x23, 0x08, 0x45, 0x6d, 0x75, 0x4e, 0x65, 0x74, 0x51,
    ]);
    expect(frameIsValid(ssid)).toBe(true);
    expect(decodeFamilyMessage("venus3", ssid)?.kind).toBe("wifiSsid");
    const badSum = ssid.slice();
    badSum[10] = 0x50;
    expect(decodeFamilyMessage("venus3", badSum)).toBeNull();
    const badLength = ssid.slice();
    badLength[1] = 0x0c;
    badLength[10] ^= 0x0b ^ 0x0c;
    expect(decodeFamilyMessage("venus3", badLength)).toBeNull();
  });
});
