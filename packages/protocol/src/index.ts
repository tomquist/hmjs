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
  WIFI_PASSWORD_MIN_LENGTH,
  CHARGE_MODE,
  OUTPUT_CHANNEL,
  DIAGNOSIS_VARIANT,
  DATETIME_YEAR_EPOCH,
} from "./HMDeviceProtocol.js";

// Device families other than the B2500
export {
  DEVICE_FAMILIES,
  ALL_NAME_PREFIXES,
  MARSTEK_COMMANDS,
  DANGEROUS_COMMANDS,
  FAMILY_SUPPORT,
  detectDeviceFamily,
  familySupports,
  assertCommandAllowed,
  framePayload,
  decodeFamilyMessage,
  parseKeyValuePayload,
  parseTextPayload,
  parseNetworkInfo,
  parseDeviceDateTime,
  parseVenus3RuntimeInfo,
  parseVenus3InverterInfo,
  parseVenus3BatteryInfo,
  parseVenusRuntimeInfo,
  parseVenusBatteryInfo,
  parseVenusMiniRuntimeInfo,
  parseVenusMiniBatteryInfo,
  parseJupiterRuntimeInfo,
  parseJupiterSystemInfo,
} from "./families.js";
export type {
  DeviceFamily,
  DeviceFamilyInfo,
  FamilyMessage,
  NetworkInfo,
  DeviceDateTime,
  Venus3RuntimeInfo,
  VenusRuntimeInfo,
  Venus3InverterInfo,
  VenusMiniRuntimeInfo,
  BatteryInfo,
  PvInput,
  JupiterRuntimeInfo,
  JupiterSystemInfo,
} from "./families.js";

// Settings and schedules of the Venus, Venus E Mini and Jupiter
export {
  SETTING_SUPPORT,
  supportsSetting,
  createWorkingModeCommand,
  createReadTimePeriodsCommand,
  parseTimePeriods,
  createTimePeriodCommand,
  createReadMiniScheduleCommand,
  parseMiniSchedule,
  createMiniScheduleSlotCommand,
  createDepthOfDischargeCommand,
  createStatusLedCommand,
  createBluetoothCommand,
  createSurplusFeedInCommand,
  createLocalApiCommand,
  createMaxChargePowerCommand,
  createMaxDischargePowerCommand,
  createPeakShavingCommand,
  createBackupCommand,
  createMeterIpCommand,
  createPhaseDetectionCommand,
  createClockCommand,
  createCloudServerCommand,
  createRestartCommand,
  createPowerLimitsCommand,
  createUpsChargePowerCommand,
  createAntiReverseCommand,
  createNetworkInfoCommand,
  createMeterPowerCommand,
  parseMiniMeterPower,
  VENUS_TIME_PERIODS,
  JUPITER_TIME_PERIODS,
  MINI_SCHEDULE_SLOTS,
} from "./settings.js";
export type {
  FamilyCommand,
  Setting,
  WorkingMode,
  TimePeriod,
  MiniScheduleSlot,
  MiniSlotAction,
  MeterPower,
} from "./settings.js";

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
