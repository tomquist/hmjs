/**
 * Type definitions for HM Device Protocol
 */

/**
 * Device information structure
 */
export interface DeviceInfo {
  /** Device type/model */
  type?: string;
  /** Device unique identifier */
  id?: string;
  /** Device MAC address */
  mac?: string;
  /** Any other key-value pairs from the device */
  [key: string]: string | undefined;
}

/**
 * Battery cell information
 */
export interface CellInfo {
  /** State of charge (percentage) */
  soc: number;
  /** First temperature sensor reading (°C) */
  temperature1: number;
  /** Second temperature sensor reading (°C) */
  temperature2: number;
  /** List of all cell voltages in millivolts */
  cellVoltages: number[];
}

/**
 * WiFi and MQTT connection status
 */
export interface WifiMqttState {
  /** Whether WiFi is connected */
  wifiConnected: boolean;
  /** Whether MQTT is connected */
  mqttConnected: boolean;
}

/**
 * Complete runtime information from device
 */
export interface RuntimeInfo {
  // Header info
  /** Start byte header */
  head: number;
  /** Data length */
  dataLength: number;
  /** Control byte */
  cntl: number;
  /** Command type */
  command: number;

  // Main data fields
  /** Input 1 status */
  in1Active: {
    /** Whether input 1 is active */
    active: boolean;
    /** Whether input 1 is transparent */
    transparent: boolean;
  };
  /** Input 2 status */
  in2Active: {
    /** Whether input 2 is active */
    active: boolean;
    /** Whether input 2 is transparent */
    transparent: boolean;
  };
  /** Input 1 power (W) */
  in1Power: number;
  /** Input 2 power (W) */
  in2Power: number;
  /** State of charge (0-1000, representing 0-100.0%) */
  soc: number;
  /** Device version number */
  devVersion: number;
  /** Device sub-version number (optional) */
  deviceSubVersion?: number;
  /** Charge mode settings */
  chargeMode: {
    /** Whether load first mode is enabled */
    loadFirst: boolean;
  };
  /** Discharge settings */
  dischargeSetting: {
    /** Whether output 1 is enabled */
    out1Enable: boolean;
    /** Whether output 2 is enabled */
    out2Enable: boolean;
  };
  /** WiFi and MQTT state */
  wifiMqttState: WifiMqttState;
  /** Output 1 active state */
  out1Active: number;
  /** Output 2 active state */
  out2Active: number;
  /** Depth of discharge */
  dod: number;
  /** Discharge threshold */
  dischargeThreshold: number;
  /** Device scene/mode */
  deviceScene: number;
  /** Remaining capacity (Wh) */
  remainingCapacity: number;
  /** Output 1 power (W) */
  out1Power: number;
  /** Output 2 power (W) */
  out2Power: number;
  /** External 1 connected state */
  extern1Connected: number;
  /** External 2 connected state */
  extern2Connected: number;
  /** Device region code */
  deviceRegion: number;
  /** Time info */
  time: {
    /** Hour (0-23) */
    hour: number;
    /** Minute (0-59) */
    minute: number;
  };
  /** Low temperature (°C * 10) */
  temperatureLow: number;
  /** High temperature (°C * 10) */
  temperatureHigh: number;
  /** Reserved data field */
  reserved1: number;

  // Extended fields (optional)
  /** Daily total battery charge (Wh * 10) */
  dailyTotalBatteryCharge?: number;
  /** Daily total battery discharge (Wh * 10) */
  dailyTotalBatteryDischarge?: number;
  /** Daily total load charge (Wh * 10) */
  dailyTotalLoadCharge?: number;
  /** Daily total load discharge (Wh * 10) */
  dailyTotalLoadDischarge?: number;
}

/**
 * MQTT configuration parameters
 */
export interface MQTTConfig {
  /** Whether to use SSL/TLS */
  ssl: boolean;
  /** MQTT broker hostname */
  host: string;
  /** MQTT broker port */
  port: string;
  /** MQTT username (optional) */
  username?: string;
  /** MQTT password (optional) */
  password?: string;
}
