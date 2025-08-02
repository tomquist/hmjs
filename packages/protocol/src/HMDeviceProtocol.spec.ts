import { HMDeviceProtocol, COMMANDS, MQTTConfig } from "./HMDeviceProtocol.js";
import "fast-text-encoding";

describe("HMDeviceProtocol", () => {
  let protocol: HMDeviceProtocol;
  const mockLogger = jest.fn();

  beforeEach(() => {
    protocol = new HMDeviceProtocol({ logger: mockLogger });
    mockLogger.mockClear();
  });

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
});
