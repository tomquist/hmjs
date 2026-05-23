type EventCallback<T extends unknown[] = unknown[]> = (...args: T) => void;
type NotificationHandler = (response: unknown) => void;
type NotificationHandlerMap = Record<number, NotificationHandler>;

interface BLEManagerOptions {
  autoReconnect?: boolean;
  reconnectDelay?: number;
  deviceNamePrefix?: string;
  logger?: (message: string, ...args: unknown[]) => void;
  /**
   * Web Bluetooth implementation to use. Defaults to `navigator.bluetooth`
   * in browsers. In Node.js, the optional `webbluetooth` peer dependency is
   * loaded automatically when installed; pass an instance here to override.
   */
  bluetooth?: Bluetooth;
}

export type {
  EventCallback,
  NotificationHandler,
  NotificationHandlerMap,
  BLEManagerOptions,
};
