import {
  HMDeviceProtocol,
  COMMANDS,
  MQTTConfig,
  TimerInfo,
  WIFI_ILLEGAL_CHARACTERS,
  CHARGE_MODE,
  OUTPUT_CHANNEL,
} from "./HMDeviceProtocol.js";
import "fast-text-encoding";

describe("HMDeviceProtocol", () => {
  let protocol: HMDeviceProtocol;
  const mockLogger = jest.fn();

  beforeEach(() => {
    protocol = new HMDeviceProtocol({ logger: mockLogger });
    mockLogger.mockClear();
  });

  const timerBytes = (
    enabled: boolean,
    startHour: number,
    startMinute: number,
    endHour: number,
    endMinute: number,
    outputPower: number,
  ): number[] => [
    enabled ? 1 : 0,
    startHour,
    startMinute,
    endHour,
    endMinute,
    outputPower & 0xff,
    (outputPower >> 8) & 0xff,
  ];

  const buildTimerMessage = (payload: number[]): Uint8Array => {
    const messageBytes = new Uint8Array(4 + payload.length + 1);
    messageBytes[0] = 0x73;
    messageBytes[1] = messageBytes.length;
    messageBytes[2] = 0x23;
    messageBytes[3] = COMMANDS.GET_TIMERS;
    messageBytes.set(payload, 4);
    messageBytes[messageBytes.length - 1] = protocol.calculateChecksum(
      messageBytes.slice(0, -1),
    );
    return messageBytes;
  };

  describe("constructor", () => {
    it("should instantiate without error", () => {
      expect(protocol).toBeInstanceOf(HMDeviceProtocol);
    });

    it("should accept optional logger", () => {
      const protocolWithLogger = new HMDeviceProtocol({ logger: mockLogger });
      expect(protocolWithLogger).toBeInstanceOf(HMDeviceProtocol);
    });
  });

  describe("createCommandMessage", () => {
    it("should create a valid command message with no payload", () => {
      const message = protocol.createCommandMessage(COMMANDS.RUNTIME_INFO);
      expect(message.length).toBe(5); // Header + checksum
      expect(message[0]).toBe(HMDeviceProtocol.START_BYTE);
      expect(message[1]).toBe(5); // Length
      expect(message[2]).toBe(HMDeviceProtocol.IDENTIFIER_BYTE);
      expect(message[3]).toBe(COMMANDS.RUNTIME_INFO);
      expect(protocol.isValidMessage(message)).toBe(true);
    });

    it("should create a valid command message with payload", () => {
      const payload = [0x01, 0x02, 0x03];
      const message = protocol.createCommandMessage(
        COMMANDS.RUNTIME_INFO,
        payload,
      );
      expect(message.length).toBe(8); // Header + payload + checksum
      expect(message[0]).toBe(HMDeviceProtocol.START_BYTE);
      expect(message[1]).toBe(8); // Length
      expect(message[2]).toBe(HMDeviceProtocol.IDENTIFIER_BYTE);
      expect(message[3]).toBe(COMMANDS.RUNTIME_INFO);
      expect(Array.from(message.slice(4, 7))).toEqual(payload);
      expect(protocol.isValidMessage(message)).toBe(true);
    });
  });

  describe("stringToBytes and bytesToString", () => {
    it("should convert string to bytes and back", () => {
      const testString = "Hello, World!";
      const bytes = protocol.stringToBytes(testString);
      const result = protocol.bytesToString(bytes);
      expect(result).toBe(testString);
    });

    it("should handle empty string", () => {
      const bytes = protocol.stringToBytes("");
      const result = protocol.bytesToString(bytes);
      expect(result).toBe("");
    });
  });

  describe("calculateChecksum", () => {
    it("should calculate correct checksum", () => {
      const data = new Uint8Array([0x73, 0x05, 0x23, 0x03]);
      const checksum = protocol.calculateChecksum(data);
      expect(checksum).toBe(0x56); // XOR of all bytes: 0x73 ^ 0x05 ^ 0x23 ^ 0x03 = 0x56
    });

    it("should handle empty array", () => {
      const checksum = protocol.calculateChecksum(new Uint8Array());
      expect(checksum).toBe(0);
    });
  });

  describe("isValidMessage", () => {
    it("should validate correct message", () => {
      const message = protocol.createCommandMessage(COMMANDS.RUNTIME_INFO);
      expect(protocol.isValidMessage(message)).toBe(true);
    });

    it("should reject message with wrong start byte", () => {
      const message = protocol.createCommandMessage(COMMANDS.RUNTIME_INFO);
      message[0] = 0x00;
      expect(protocol.isValidMessage(message)).toBe(false);
    });

    it("should reject message with wrong length", () => {
      const message = protocol.createCommandMessage(COMMANDS.RUNTIME_INFO);
      message[1] = 0x00;
      expect(protocol.isValidMessage(message)).toBe(false);
    });

    it("should reject message with wrong identifier", () => {
      const message = protocol.createCommandMessage(COMMANDS.RUNTIME_INFO);
      message[2] = 0x00;
      expect(protocol.isValidMessage(message)).toBe(false);
    });

    it("should reject message with wrong checksum", () => {
      const message = protocol.createCommandMessage(COMMANDS.RUNTIME_INFO);
      message[message.length - 1] = 0x00;
      expect(protocol.isValidMessage(message)).toBe(false);
    });

    it("should reject message that is too short", () => {
      const message = new Uint8Array([0x73, 0x04, 0x23, 0x03]);
      expect(protocol.isValidMessage(message)).toBe(false);
    });
  });

  describe("parseMessage", () => {
    it("should parse device info message", () => {
      // Simulate a device info string: "type=HM-1000,id=12345,mac=00:11:22:33:44:55"
      const infoStr = "type=HM-1000,id=12345,mac=00:11:22:33:44:55";
      const bytes = protocol.stringToBytes(infoStr);
      // Pad to 5 bytes (header + checksum)
      const messageBytes = new Uint8Array(4 + bytes.length + 1);
      messageBytes[0] = 0x73;
      messageBytes[1] = messageBytes.length;
      messageBytes[2] = 0x23;
      messageBytes[3] = COMMANDS.DEVICE_INFO;
      messageBytes.set(bytes, 4);
      messageBytes[messageBytes.length - 1] = protocol.calculateChecksum(
        messageBytes.slice(0, -1),
      );
      const dataView = new DataView(messageBytes.buffer);
      const result = protocol.parseMessage(dataView);
      if (result.type === COMMANDS.DEVICE_INFO) {
        expect(result.data.type).toBe("HM-1000");
        expect(result.data.id).toBe("12345");
        expect(result.data.mac).toBe("00:11:22:33:44:55");
      } else {
        throw new Error("Expected device info message");
      }
    });

    it("should parse cell info message", () => {
      // Simulate a cell info string with 16 underscores (17 values)
      const cellStr =
        "80_25_26_3200_3201_3202_3203_3204_3205_3206_3207_3208_3209_3210_3211_3212_3213";
      const bytes = protocol.stringToBytes(cellStr);
      const messageBytes = new Uint8Array(4 + bytes.length + 1);
      messageBytes[0] = 0x73;
      messageBytes[1] = messageBytes.length;
      messageBytes[2] = 0x23;
      messageBytes[3] = COMMANDS.CELL_INFO;
      messageBytes.set(bytes, 4);
      messageBytes[messageBytes.length - 1] = protocol.calculateChecksum(
        messageBytes.slice(0, -1),
      );
      const dataView = new DataView(messageBytes.buffer);
      const result = protocol.parseMessage(dataView);
      if (result.type === COMMANDS.CELL_INFO) {
        expect(result.data.soc).toBe(80);
        expect(result.data.temperature1).toBe(25);
        expect(result.data.temperature2).toBe(26);
        expect(result.data.cellVoltages).toEqual([
          3200, 3201, 3202, 3203, 3204, 3205, 3206, 3207, 3208, 3209, 3210,
          3211, 3212, 3213,
        ]);
      } else {
        throw new Error("Expected cell info message");
      }
    });

    it("should handle unknown command", () => {
      const messageBytes = new Uint8Array([0x73, 0x05, 0x23, 0xff, 0x00]);
      messageBytes[4] = protocol.calculateChecksum(messageBytes.slice(0, 4));
      const dataView = new DataView(messageBytes.buffer);
      const result = protocol.parseMessage(dataView);
      if (result.type === "unknown") {
        expect(result.error).toBeDefined();
      } else {
        throw new Error("Expected unknown message type");
      }
    });

    it("should parse all five timer slots of a firmware >= 218 response", () => {
      const messageBytes = new Uint8Array([
        0x73, 0x3b, 0x23, 0x13, 0x00, 0x01, 0x13, 0x00, 0x16, 0x1b, 0xbc, 0x02,
        0x01, 0x16, 0x1c, 0x17, 0x3b, 0xf4, 0x01, 0x01, 0x00, 0x00, 0x02, 0x00,
        0xbc, 0x02, 0x00, 0x28, 0x00, 0x00, 0x00, 0x78, 0x00, 0xff, 0x00, 0x5e,
        0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x08, 0x00, 0x0d, 0x3b,
        0xf4, 0x01, 0x00, 0x00, 0x00, 0x17, 0x3b, 0x50, 0x00, 0x07, 0xf7,
      ]);

      const dataView = new DataView(messageBytes.buffer);
      const result = protocol.parseMessage(dataView);

      if (result.type === COMMANDS.GET_TIMERS) {
        expect(result.data.adaptiveModeEnabled).toBe(false);
        expect(result.data.timers).toEqual([
          {
            enabled: true,
            start: { hour: 19, minute: 0 },
            end: { hour: 22, minute: 27 },
            outputPower: 700,
          },
          {
            enabled: true,
            start: { hour: 22, minute: 28 },
            end: { hour: 23, minute: 59 },
            outputPower: 500,
          },
          {
            enabled: true,
            start: { hour: 0, minute: 0 },
            end: { hour: 2, minute: 0 },
            outputPower: 700,
          },
          {
            enabled: true,
            start: { hour: 8, minute: 0 },
            end: { hour: 13, minute: 59 },
            outputPower: 500,
          },
          {
            enabled: false,
            start: { hour: 0, minute: 0 },
            end: { hour: 23, minute: 59 },
            outputPower: 80,
          },
        ]);
        expect(result.data.smartMeter).toEqual({
          connected: false,
          powerOut: 40,
          meterReading: 0,
          unknown: 120,
        });
      } else {
        throw new Error("Expected get timers message");
      }
    });

    it("should keep unused timer slots so slot positions stay stable", () => {
      const messageBytes = buildTimerMessage([
        0x01,
        ...timerBytes(true, 19, 0, 22, 27, 700),
        ...new Array(7).fill(0),
        ...timerBytes(true, 0, 0, 2, 0, 700),
        ...new Array(7).fill(0),
        ...new Array(10).fill(0),
        ...new Array(7).fill(0),
        ...timerBytes(false, 0, 0, 23, 59, 80),
      ]);

      const result = protocol.parseMessage(new DataView(messageBytes.buffer));

      if (result.type === COMMANDS.GET_TIMERS) {
        expect(result.data.adaptiveModeEnabled).toBe(true);
        expect(result.data.timers).toHaveLength(5);
        // Empty slots must not be dropped - the device addresses slots by
        // position and we write all of them back at once.
        expect(result.data.timers[1]).toEqual({
          enabled: false,
          start: { hour: 0, minute: 0 },
          end: { hour: 0, minute: 0 },
          outputPower: 0,
        });
        expect(result.data.timers[3]).toEqual({
          enabled: false,
          start: { hour: 0, minute: 0 },
          end: { hour: 0, minute: 0 },
          outputPower: 0,
        });
        expect(result.data.timers[4]).toEqual({
          enabled: false,
          start: { hour: 0, minute: 0 },
          end: { hour: 23, minute: 59 },
          outputPower: 80,
        });
      } else {
        throw new Error("Expected get timers message");
      }
    });

    it("should parse three timer slots on firmware < 218", () => {
      const messageBytes = buildTimerMessage([
        0x00,
        ...timerBytes(true, 6, 48, 7, 45, 200),
        ...timerBytes(false, 0, 0, 23, 59, 80),
        ...timerBytes(true, 18, 0, 24, 0, 800),
        0x01,
        0x2c,
        0x01,
        0xf6,
        0xff,
        0x00,
        0x00,
      ]);

      const result = protocol.parseMessage(new DataView(messageBytes.buffer));

      if (result.type === COMMANDS.GET_TIMERS) {
        expect(result.data.timers).toHaveLength(3);
        expect(result.data.timers[0]).toEqual({
          enabled: true,
          start: { hour: 6, minute: 48 },
          end: { hour: 7, minute: 45 },
          outputPower: 200,
        });
        expect(result.data.timers[2]).toEqual({
          enabled: true,
          start: { hour: 18, minute: 0 },
          end: { hour: 24, minute: 0 },
          outputPower: 800,
        });
        expect(result.data.smartMeter).toEqual({
          connected: true,
          powerOut: 300,
          meterReading: -10,
          unknown: 0,
        });
      } else {
        throw new Error("Expected get timers message");
      }
    });

    it("should return empty timers when the payload is too short", () => {
      const messageBytes = buildTimerMessage([
        0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa,
      ]);

      const result = protocol.parseMessage(new DataView(messageBytes.buffer));

      if (result.type === COMMANDS.GET_TIMERS) {
        expect(result.data.timers).toEqual([]);
        expect(result.data.smartMeter).toBeNull();
      } else {
        throw new Error("Expected get timers message");
      }
    });
  });

  describe("createWifiConfigPayload", () => {
    it("should create valid wifi config payload", () => {
      const ssid = "TestSSID";
      const password = "TestPassword";
      const payload = protocol.createWifiConfigPayload(ssid, password);
      const expectedStr = `${ssid}<.,.>${password}`;
      expect(protocol.bytesToString(payload)).toBe(expectedStr);
    });

    // The device stores these characters incorrectly and then fails to join
    // the network, so they have to be rejected before the command is sent.
    it.each(WIFI_ILLEGAL_CHARACTERS)(
      "should reject %s in the password",
      (char) => {
        expect(() =>
          protocol.createWifiConfigPayload("TestSSID", `pass${char}word`),
        ).toThrow("Password must not contain");
      },
    );

    it.each(WIFI_ILLEGAL_CHARACTERS)("should reject %s in the SSID", (char) => {
      expect(() =>
        protocol.createWifiConfigPayload(`Test${char}SSID`, "TestPassword"),
      ).toThrow("SSID must not contain");
    });

    it("should list every illegal character found", () => {
      expect(() =>
        protocol.createWifiConfigPayload("TestSSID", 'aaaa,bbbb"cccc'),
      ).toThrow('Password must not contain `,` or `"`');
    });

    it("should reject a password shorter than the WPA minimum", () => {
      expect(() =>
        protocol.createWifiConfigPayload("TestSSID", "short12"),
      ).toThrow("Password must be at least 8 characters.");
    });

    it("should accept a password of exactly the minimum length", () => {
      const password = "12345678";
      const payload = protocol.createWifiConfigPayload("TestSSID", password);
      expect(protocol.bytesToString(payload)).toBe(`TestSSID<.,.>${password}`);
    });

    it("should not impose a length limit on the SSID", () => {
      const payload = protocol.createWifiConfigPayload("A", "TestPassword");
      expect(protocol.bytesToString(payload)).toBe("A<.,.>TestPassword");
    });

    it("should accept other special characters", () => {
      // Reported in issue #13: only ',', '"' and '\\' are rejected, the rest
      // of the usual password punctuation goes through untouched.
      const password = "#!_*.&;$%@^()[]{}+-=~|/<>?:'";
      const payload = protocol.createWifiConfigPayload("TestSSID", password);
      expect(protocol.bytesToString(payload)).toBe(`TestSSID<.,.>${password}`);
    });
  });

  describe("createDodPayload", () => {
    it("should encode the percentage as a single byte", () => {
      expect(Array.from(protocol.createDodPayload(80))).toEqual([80]);
    });

    it.each([-1, 101, 1.5])("should reject %p", (value) => {
      expect(() => protocol.createDodPayload(value)).toThrow(
        "Depth of discharge must be an integer between 0 and 100",
      );
    });
  });

  describe("createDischargeThresholdPayload", () => {
    it("should encode watts little-endian", () => {
      // 1000W = 0x03e8
      expect(
        Array.from(protocol.createDischargeThresholdPayload(1000)),
      ).toEqual([0xe8, 0x03]);
    });

    it.each([-1, 0x10000])("should reject %p", (value) => {
      expect(() => protocol.createDischargeThresholdPayload(value)).toThrow(
        "Discharge threshold must be an integer between 0 and 65535",
      );
    });
  });

  describe("createChargeModePayload", () => {
    it("should encode the mode", () => {
      expect(
        Array.from(protocol.createChargeModePayload(CHARGE_MODE.FULL)),
      ).toEqual([1]);
      expect(
        Array.from(protocol.createChargeModePayload(CHARGE_MODE.HALF)),
      ).toEqual([0]);
    });

    it("should reject an unknown mode", () => {
      expect(() => protocol.createChargeModePayload(2)).toThrow("Charge mode");
    });
  });

  describe("createOutputChannelsPayload", () => {
    it("should encode a combined mask", () => {
      const mask = OUTPUT_CHANNEL.OUT1 | OUTPUT_CHANNEL.OUT2;
      expect(Array.from(protocol.createOutputChannelsPayload(mask))).toEqual([
        3,
      ]);
    });

    it("should reject a mask outside the two channels", () => {
      expect(() => protocol.createOutputChannelsPayload(4)).toThrow(
        "Output channel mask must be an integer between 0 and 3",
      );
    });
  });

  describe("createDateTimePayload", () => {
    // The device uses the struct tm convention: year - 1900, month 0-based.
    it("should encode the six date fields plus two trailing zeros", () => {
      const date = new Date(2024, 11, 15, 14, 30, 45); // 15 Dec 2024, local
      expect(Array.from(protocol.createDateTimePayload(date))).toEqual([
        124, 11, 15, 14, 30, 45, 0, 0,
      ]);
    });

    it("should produce the 8 payload bytes the device expects", () => {
      expect(protocol.createDateTimePayload(new Date()).length).toBe(8);
    });

    it("should reject a year the byte cannot hold", () => {
      expect(() =>
        protocol.createDateTimePayload(new Date(1899, 0, 1)),
      ).toThrow("Year must be between 1900 and 2155");
    });
  });

  // The official app sends these exact frames. Keeping them here means a
  // change to the framing or to a payload builder has to be deliberate.
  describe("device command frames", () => {
    const hex = (bytes: Uint8Array) =>
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");

    it.each([
      ["read wifi info", COMMANDS.GET_WIFI_INFO, [0x01], "73 06 23 08 01 5f"],
      ["charge full", COMMANDS.SET_CHARGE_MODE, [0x01], "73 06 23 0d 01 5a"],
      ["charge half", COMMANDS.SET_CHARGE_MODE, [0x00], "73 06 23 0d 00 5b"],
      [
        "both outputs on",
        COMMANDS.SET_OUTPUT_CHANNELS,
        [0x03],
        "73 06 23 0e 03 5b",
      ],
      ["adaptive on", COMMANDS.SET_ADAPTIVE_MODE, [0x01], "73 06 23 11 01 46"],
      ["restart", COMMANDS.RESTART_DEVICE, [0x01], "73 06 23 25 01 72"],
      ["diagnosis", COMMANDS.RUN_DIAGNOSIS, [0xff], "73 06 23 2a ff 83"],
      ["error info", COMMANDS.GET_ERROR_INFO, [0x01], "73 06 23 30 01 67"],
    ])("should match the app's %s frame", (_name, command, payload, want) => {
      expect(hex(protocol.createCommandMessage(command, payload))).toBe(want);
    });

    it("should match the app's date/time frame shape", () => {
      const payload = protocol.createDateTimePayload(
        new Date(2024, 11, 15, 14, 30, 45),
      );
      const frame = protocol.createCommandMessage(
        COMMANDS.SET_DATETIME,
        payload,
      );
      expect(hex(frame)).toBe("73 0d 23 14 7c 0b 0f 0e 1e 2d 00 00 0c");
    });
  });

  describe("createMqttConfigPayload", () => {
    it("should create valid mqtt config payload", () => {
      const config: MQTTConfig = {
        ssl: true,
        host: "mqtt.example.com",
        port: "8883",
        username: "user",
        password: "pass",
      };
      const payload = protocol.createMqttConfigPayload(config);
      const expectedStr = `1<.,.>${config.host}<.,.>${config.port}<.,.>${config.username}<.,.>${config.password}<.,.>`;
      expect(protocol.bytesToString(payload)).toBe(expectedStr);
    });

    it("should handle mqtt config without credentials", () => {
      const config: MQTTConfig = {
        ssl: false,
        host: "mqtt.example.com",
        port: "1883",
      };
      const payload = protocol.createMqttConfigPayload(config);
      const expectedStr = `0<.,.>${config.host}<.,.>${config.port}<.,.><.,.><.,.>`;
      expect(protocol.bytesToString(payload)).toBe(expectedStr);
    });
  });

  describe("createTimerConfigPayload", () => {
    const disabledTimer: TimerInfo = {
      enabled: false,
      start: { hour: 0, minute: 0 },
      end: { hour: 23, minute: 59 },
      outputPower: 80,
    };

    it("should encode timer entries as 7-byte records", () => {
      const timers: TimerInfo[] = [
        {
          enabled: true,
          start: { hour: 19, minute: 0 },
          end: { hour: 22, minute: 27 },
          outputPower: 700,
        },
        disabledTimer,
        disabledTimer,
      ];

      const payload = protocol.createTimerConfigPayload(timers);
      expect(Array.from(payload)).toEqual([
        0x01, 0x13, 0x00, 0x16, 0x1b, 0xbc, 0x02, 0x00, 0x00, 0x00, 0x17, 0x3b,
        0x50, 0x00, 0x00, 0x00, 0x00, 0x17, 0x3b, 0x50, 0x00,
      ]);
    });

    it("should encode five timer entries for newer firmware", () => {
      const payload = protocol.createTimerConfigPayload(
        new Array(5).fill(disabledTimer),
      );
      expect(payload).toHaveLength(35);
    });

    it("should reject an incomplete set of timer slots", () => {
      expect(() =>
        protocol.createTimerConfigPayload([disabledTimer, disabledTimer]),
      ).toThrow("Expected 3 or 5 timer entries, got 2");
    });

    it("should accept an end hour of 24 written by other tools", () => {
      const payload = protocol.createTimerConfigPayload([
        {
          enabled: true,
          start: { hour: 18, minute: 0 },
          end: { hour: 24, minute: 0 },
          outputPower: 800,
        },
        disabledTimer,
        disabledTimer,
      ]);
      expect(Array.from(payload.slice(0, 7))).toEqual([
        0x01, 0x12, 0x00, 0x18, 0x00, 0x20, 0x03,
      ]);
    });

    it("should reject out-of-range timer values", () => {
      const invalid: TimerInfo[] = [
        {
          enabled: true,
          start: { hour: 30, minute: 0 },
          end: { hour: 22, minute: 27 },
          outputPower: 700,
        },
        disabledTimer,
        disabledTimer,
      ];

      expect(() => protocol.createTimerConfigPayload(invalid)).toThrow(
        "start hour must be 0-23",
      );
    });
  });
});
