type EventCallback<T extends unknown[] = unknown[]> = (...args: T) => void;
type NotificationHandler = (response: unknown) => void;
type NotificationHandlerMap = Record<number, NotificationHandler>;

/**
 * "b2500"  – Marstek B2500 / 200-series firmware (default)
 *   Command: FF01, Status/Notify: FF02
 * "tronic" – Lidl Tronic / 100-series firmware (experimental)
 *   Command: FF03, Status/Notify: FF01
 */
type DeviceType = "b2500" | "tronic";

interface BLEManagerOptions {
  autoReconnect?: boolean;
  reconnectDelay?: number;
  deviceNamePrefix?: string;
  acceptAllDevices?: boolean;
  logger?: (message: string, ...args: unknown[]) => void;
  /**
   * Web Bluetooth implementation to use. Defaults to `navigator.bluetooth`
   * in browsers. In Node.js, the optional `webbluetooth` peer dependency is
   * loaded automatically when installed; pass an instance here to override.
   */
  bluetooth?: Bluetooth;
  /**
   * Target device type. Controls which BLE characteristic UUIDs are used.
   * Defaults to "b2500". Set to "tronic" for Lidl Tronic devices (experimental).
   */
  deviceType?: DeviceType;
}

export type {
  DeviceType,
  EventCallback,
  NotificationHandler,
  NotificationHandlerMap,
  BLEManagerOptions,
};
