import {
  HMDeviceProtocol,
  COMMANDS,
  MQTTConfig,
  TimerInfo,
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

    it("should accept 24:00 as end of day", () => {
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
