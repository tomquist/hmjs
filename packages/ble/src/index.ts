/**
 * HM Device BLE Manager - Main entry point
 *
 * This package provides a BLE implementation for communicating with
 * HM battery devices using Web Bluetooth API.
 */

// Export the BLE manager
export { BLEDeviceManager } from "./BLEDeviceManager.js";

// Export BLE-specific types
export type { BLEManagerOptions, EventCallback } from "./types.js";
