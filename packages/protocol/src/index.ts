/**
 * HM Device Protocol - Main entry point
 *
 * This package provides the core protocol implementation for communication
 * with HM battery devices, independent of the transport layer.
 */

// Export the protocol class
export { default as HMDeviceProtocol } from "./HMDeviceProtocol.js";

// Export constants
export {
  COMMAND_TYPES,
  START_BYTE,
  IDENTIFIER_BYTE,
} from "./HMDeviceProtocol.js";

// Export types
export type {
  DeviceInfo,
  RuntimeInfo,
  CellInfo,
  WifiMqttState,
  MQTTConfig,
} from "./types.js";
