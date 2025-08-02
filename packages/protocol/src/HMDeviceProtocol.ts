/**
 * HMDeviceProtocol - A utility for encoding/decoding the HM battery device protocol
 *
 * This module is independent of the transport layer (BLE, MQTT, etc.) and can be
 * used in any environment that can send/receive binary data.
 */

// Type definitions
export interface DeviceInfo {
  type?: string;
  id?: string;
  mac?: string;
  [key: string]: string | undefined;
}

export interface CellInfo {
  soc: number;
  temperature1: number;
  temperature2: number;
  cellVoltages: number[];
}

export interface WifiMqttState {
  wifiConnected: boolean;
  mqttConnected: boolean;
}

export interface RuntimeInfo {
  // Header info
  head: number;
  dataLength: number;
  cntl: number;
  command: number;

  // Main data fields
  in1Active: {
    active: boolean;
    transparent: boolean;
  };
  in2Active: {
    active: boolean;
    transparent: boolean;
  };
  in1Power: number;
  in2Power: number;
  soc: number;
  devVersion: number;
  deviceSubVersion?: number;
  chargeMode: {
    loadFirst: boolean;
  };
  dischargeSetting: {
    out1Enable: boolean;
    out2Enable: boolean;
  };
  wifiMqttState: WifiMqttState;
  out1Active: number;
  out2Active: number;
  dod: number;
  dischargeThreshold: number;
  deviceScene: number;
  remainingCapacity: number;
  out1Power: number;
  out2Power: number;
  extern1Connected: number;
  extern2Connected: number;
  deviceRegion: number;
  time: {
    hour: number;
    minute: number;
  };
  temperatureLow: number;
  temperatureHigh: number;
  reserved1: number;

  // Extended fields
  dailyTotalBatteryCharge?: number;
  dailyTotalBatteryDischarge?: number;
  dailyTotalLoadCharge?: number;
  dailyTotalLoadDischarge?: number;
}

export interface MQTTConfig {
  ssl: boolean;
  host: string;
  port: string;
  username?: string;
  password?: string;
}

// Command types
export const COMMANDS = {
  RUNTIME_INFO: 0x03,
  DEVICE_INFO: 0x04,
  CELL_INFO: 0x0f,
  SET_WIFI: 0x05,
  SET_MQTT: 0x20,
  RESET_MQTT: 0x21,
} as const;

export const PARSE_ERROR = {
  INVALID_START_BYTE: "Invalid start byte",
  INVALID_LENGTH: "Invalid length",
  CHECKSUM_MISMATCH: "Checksum mismatch",
  UNKNOWN_COMMAND: "Unknown command",
};

export type ParsedMessage = {
  rawData: Uint8Array;
} & (
  | {
      type: typeof COMMANDS.CELL_INFO;
      data: CellInfo;
    }
  | {
      type: typeof COMMANDS.RUNTIME_INFO;
      data: RuntimeInfo;
    }
  | {
      type: typeof COMMANDS.DEVICE_INFO;
      data: DeviceInfo;
    }
  | {
      type: "unknown";
      error: (typeof PARSE_ERROR)[keyof typeof PARSE_ERROR];
    }
);

/**
 * HMDeviceProtocol class - Handles encoding/decoding of HM device communication protocol
 */
export class HMDeviceProtocol {
  // Protocol constants
  static readonly START_BYTE = 0x73;
  static readonly IDENTIFIER_BYTE = 0x23;

  // Optional logger function
  private logger?: (message: string, ...args: unknown[]) => void;

  /**
   * Constructor
   * @param options Configuration options
   */
  constructor(
    options: { logger?: (message: string, ...args: unknown[]) => void } = {},
  ) {
    this.logger = options.logger;
  }

  /**
   * Log a message using the configured logger
   * @param message Message to log
   * @param args Additional arguments
   * @private
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.logger) {
      this.logger(message, ...args);
    }
  }

  /**
   * Create a command message with the proper structure and checksum
   * @param commandType The command type byte
   * @param payload Optional payload data
   * @returns The complete command message
   */
  public createCommandMessage(
    commandType: number,
    payload: Uint8Array | number[] | null = null,
  ): Uint8Array {
    // Initialize with command header
    const header = [
      HMDeviceProtocol.START_BYTE,
      0,
      HMDeviceProtocol.IDENTIFIER_BYTE,
      commandType,
    ];

    // Convert payload to array
    const payloadArray = payload
      ? payload instanceof Uint8Array
        ? Array.from(payload)
        : payload
      : [];

    // Calculate total message length (header + payload + checksum)
    const messageLength = header.length + payloadArray.length + 1; // +1 for checksum
    header[1] = messageLength; // Set the length byte

    // Create the complete message (header + payload)
    const message = [...header, ...payloadArray];

    // Calculate and append checksum
    const checksum = message.reduce((xor, byte) => xor ^ byte, 0);
    message.push(checksum);

    this.log?.(
      `Created command: ${message.map((b) => "0x" + b.toString(16).padStart(2, "0")).join(" ")}`,
    );

    return new Uint8Array(message);
  }

  /**
   * Helper to convert string to byte array
   * @param str String to convert
   * @returns Byte array
   */
  public stringToBytes(str: string): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(str);
  }

  /**
   * Helper to convert byte array to string
   * @param bytes Byte array to convert
   * @returns Decoded string
   */
  public bytesToString(bytes: DataView<ArrayBufferLike> | Uint8Array): string {
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(bytes);
  }

  /**
   * Calculate checksum for a message (XOR of all bytes)
   * @param bytes Array of bytes
   * @returns Checksum byte
   */
  public calculateChecksum(bytes: Uint8Array | number[]): number {
    return Array.from(bytes).reduce((xor, byte) => xor ^ byte, 0);
  }

  /**
   * Verify if a received message has valid format and checksum
   * @param message The received message
   * @returns Whether the message is valid
   */
  public isValidMessage(message: Uint8Array): boolean {
    // Check minimum length
    if (message.length < 5) {
      // Header + checksum
      return false;
    }

    // Check start byte
    if (message[0] !== HMDeviceProtocol.START_BYTE) {
      return false;
    }

    // Check length byte
    if (message[1] !== message.length) {
      return false;
    }

    // Check identifier byte
    if (message[2] !== HMDeviceProtocol.IDENTIFIER_BYTE) {
      return false;
    }

    // Check checksum (last byte)
    const messageWithoutChecksum = message.slice(0, -1);
    const calculatedChecksum = this.calculateChecksum(messageWithoutChecksum);
    const receivedChecksum = message[message.length - 1];

    return calculatedChecksum === receivedChecksum;
  }

  /**
   * Check if the message is a valid cell info message
   * @param message The message
   * @returns Whether the message is valid cell info
   */
  public isValidCellInfoMessage(message: DataView<ArrayBufferLike>): boolean {
    // Check minimum length
    if (message.byteLength < 10) {
      return false;
    }
    // Convert DataView to string
    const dataStr = this.bytesToString(
      new Uint8Array(message.buffer, message.byteOffset, message.byteLength),
    );
    // Check for underscores
    const underscoreCount = (dataStr.match(/_/g) || []).length;
    return underscoreCount === 16 || underscoreCount === 3;
  }

  /**
   * Extract command type from a message
   * @param message The message
   * @returns Command type or -1 if invalid format
   */
  public parseMessage(message: DataView<ArrayBufferLike>): ParsedMessage {
    let rawData = new Uint8Array(
      message.buffer,
      message.byteOffset,
      message.byteLength,
    );
    if (this.isValidCellInfoMessage(message)) {
      return {
        type: COMMANDS.CELL_INFO,
        rawData,
        data: this.parseCellInfo(message),
      };
    }

    const header = message.getUint8(0);
    if (header !== HMDeviceProtocol.START_BYTE) {
      return {
        type: "unknown",
        rawData: rawData,
        error: PARSE_ERROR.INVALID_START_BYTE,
      };
    }

    const length = message.getUint8(1); // TODO: Use for validation
    const identifier = message.getUint8(2);
    const command = message.getUint8(3);
    const _checksum = message.getUint8(length - 1); // TODO: Add checksum validation

    // Validate the message structure
    // if (length !== message.byteLength) return { type: "unknown", rawData: rawData, error: PARSE_ERROR.INVALID_LENGTH };
    if (identifier !== HMDeviceProtocol.IDENTIFIER_BYTE)
      return {
        type: "unknown",
        rawData: rawData,
        error: PARSE_ERROR.UNKNOWN_COMMAND,
      };
    // if (checksum !== this.calculateChecksum(new Uint8Array(message.buffer, message.byteOffset, length - 1))) return { type: "unknown", rawData: rawData, error: PARSE_ERROR.CHECKSUM_MISMATCH };

    // Check if the command is valid
    if (command < 0 || command > 255)
      return {
        type: "unknown",
        rawData: rawData,
        error: PARSE_ERROR.UNKNOWN_COMMAND,
      };

    switch (command) {
      case COMMANDS.RUNTIME_INFO:
        return {
          type: COMMANDS.RUNTIME_INFO,
          rawData,
          data: this.parseRuntimeInfo(message),
        };
      case COMMANDS.DEVICE_INFO:
        return {
          type: COMMANDS.DEVICE_INFO,
          rawData,
          data: this.parseDeviceInfo(message),
        };
      default:
        return {
          type: "unknown",
          rawData: rawData,
          error: PARSE_ERROR.UNKNOWN_COMMAND,
        };
    }
  }

  /**
   * Parse device information from response string
   * @returns Parsed device info
   * @param dataView
   */
  private parseDeviceInfo(dataView: DataView<ArrayBufferLike>): DeviceInfo {
    try {
      // Convert DataView to string
      // Clean the response (remove s<# prefix and control characters)
      // Format is typically: s<length>#<command>key=value,key2=value2<checksum>
      const responseBytes = new Uint8Array(
        dataView.buffer,
        dataView.byteOffset + 4,
        dataView.byteLength - 5,
      );
      const responseStr = this.bytesToString(responseBytes);

      // Parse into key-value pairs
      const parts = responseStr.split(",");
      const parsedInfo: DeviceInfo = {};

      for (const part of parts) {
        const keyValue = part.trim().split("=");
        if (keyValue.length === 2) {
          const key = keyValue[0].trim();
          const value = keyValue[1].trim();
          if (key && value) {
            parsedInfo[key] = value;
          }
        }
      }

      return parsedInfo;
    } catch (error) {
      this.log?.(
        `Error parsing device info: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {};
    }
  }

  /**
   * Parse runtime info binary data
   * @param data Binary data (DataView or Uint8Array)
   * @returns Parsed runtime info
   */
  public parseRuntimeInfo(
    dataView: DataView<ArrayBufferLike>,
  ): RuntimeInfo | null {
    try {
      // Extract information based on the struct definition
      const runtimeData: RuntimeInfo = {
        // Header info
        head: dataView.getUint8(0),
        dataLength: dataView.getUint8(1),
        cntl: dataView.getUint8(2),
        command: dataView.getUint8(3),

        // Main data fields
        in1Active: {
          active: !!(dataView.getUint8(4) & 0x01),
          transparent: !!(dataView.getUint8(4) & 0x02),
        },
        in2Active: {
          active: !!(dataView.getUint8(5) & 0x01),
          transparent: !!(dataView.getUint8(5) & 0x02),
        },
        in1Power: dataView.getUint16(6, true), // true for little-endian
        in2Power: dataView.getUint16(8, true),
        soc: dataView.getUint16(10, true),
        devVersion: dataView.getUint8(12),
        chargeMode: {
          loadFirst: !!(dataView.getUint8(13) & 0x01),
        },
        dischargeSetting: {
          out1Enable: !!(dataView.getUint8(14) & 0x01),
          out2Enable: !!(dataView.getUint8(14) & 0x02),
        },
        wifiMqttState: {
          wifiConnected: !!(dataView.getUint8(15) & 0x01),
          mqttConnected: !!(dataView.getUint8(15) & 0x02),
        },
        out1Active: dataView.getUint8(16),
        out2Active: dataView.getUint8(17),
        dod: dataView.getUint8(18),
        dischargeThreshold: dataView.getUint16(19, true),
        deviceScene: dataView.getUint8(21),
        remainingCapacity: dataView.getUint16(22, true),
        out1Power: dataView.getUint16(24, true),
        out2Power: dataView.getUint16(26, true),
        extern1Connected: dataView.getUint8(28),
        extern2Connected: dataView.getUint8(29),
        deviceRegion: dataView.getUint8(30),
        time: {
          hour: dataView.getUint8(31),
          minute: dataView.getUint8(32),
        },
        temperatureLow: dataView.getInt16(33, true),
        temperatureHigh: dataView.getInt16(35, true),
        reserved1: dataView.getUint16(37, true),
      };

      // Check for extended data fields
      if (dataView.byteLength > 39) {
        runtimeData.deviceSubVersion = dataView.getUint8(39);

        if (dataView.byteLength >= 40 + 4) {
          runtimeData.dailyTotalBatteryCharge = dataView.getUint32(40, true);
        }

        if (dataView.byteLength >= 44 + 4) {
          runtimeData.dailyTotalBatteryDischarge = dataView.getUint32(44, true);
        }

        if (dataView.byteLength >= 48 + 4) {
          runtimeData.dailyTotalLoadCharge = dataView.getUint32(48, true);
        }

        if (dataView.byteLength >= 52 + 4) {
          runtimeData.dailyTotalLoadDischarge = dataView.getUint32(52, true);
        }
      }

      return runtimeData;
    } catch (error) {
      this.log?.(
        `Error parsing runtime info: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Parse cell info data from the response string
   * @param responseStr Response string
   * @returns Parsed cell info
   */
  public parseCellInfo(message: DataView<ArrayBufferLike>): CellInfo | null {
    const responseStr = this.bytesToString(message);
    try {
      // Clean the response data (remove any headers)
      // Format is typically: s<length>#<command>10_24_25_3162_3161_3156_...<checksum>
      const dataMatch = responseStr.match(/[0-9_]+/);
      if (!dataMatch) {
        this.log?.("Could not find cell info data pattern in response");
        return null;
      }

      const cellInfoStr = dataMatch[0];

      // Split the string by underscore
      const parts = cellInfoStr.split("_");
      if (parts.length < 3) {
        this.log?.("Cell info data has too few parts");
        return null;
      }

      // Parse according to the format
      const cellInfo: CellInfo = {
        soc: parseInt(parts[0], 10),
        temperature1: parseInt(parts[1], 10),
        temperature2: parseInt(parts[2], 10),
        cellVoltages: [],
      };

      // Parse cell voltages (starting from index 3)
      for (let i = 3; i < parts.length; i++) {
        const voltage = parseInt(parts[i], 10);
        if (!isNaN(voltage)) {
          cellInfo.cellVoltages.push(voltage);
        }
      }

      return cellInfo;
    } catch (error) {
      this.log?.(
        `Error parsing cell info: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Create a wifi configuration command payload
   * @param ssid WiFi SSID
   * @param password WiFi password
   * @returns Payload bytes
   */
  public createWifiConfigPayload(ssid: string, password: string): Uint8Array {
    if (!ssid || !password) {
      throw new Error("SSID and password are required");
    }

    // Create WiFi config string with <.,.> separator
    const configStr = `${ssid}<.,.>${password}`;
    return this.stringToBytes(configStr);
  }

  /**
   * Create an MQTT configuration command payload
   * @param config MQTT configuration
   * @returns Payload bytes
   */
  public createMqttConfigPayload(config: MQTTConfig): Uint8Array {
    if (!config.host || !config.port) {
      throw new Error("Host and port are required");
    }

    // Create MQTT config string
    const sslEnabled = config.ssl ? "1" : "0";
    const configStr = `${sslEnabled}<.,.>${config.host}<.,.>${config.port}<.,.>${config.username || ""}<.,.>${config.password || ""}<.,.>`;
    return this.stringToBytes(configStr);
  }
}

// Export constants and types
export const COMMAND_TYPES = COMMANDS;
export const START_BYTE = HMDeviceProtocol.START_BYTE;
export const IDENTIFIER_BYTE = HMDeviceProtocol.IDENTIFIER_BYTE;

// Export default instance
export default HMDeviceProtocol;
