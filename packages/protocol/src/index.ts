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
  TIMER_ENTRY_SIZE,
  BASE_TIMER_SLOT_COUNT,
  EXTENDED_TIMER_SLOT_COUNT,
  WIFI_ILLEGAL_CHARACTERS,
} from "./HMDeviceProtocol.js";

// Export types
export type {
  DeviceInfo,
  RuntimeInfo,
  CellInfo,
  TimerInfo,
  TimerInfoResponse,
  SmartMeterInfo,
  WifiMqttState,
  MQTTConfig,
} from "./types.js";
