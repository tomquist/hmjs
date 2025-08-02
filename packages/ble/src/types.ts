type EventCallback<T extends unknown[] = unknown[]> = (...args: T) => void;
type NotificationHandler = (response: unknown) => void;
type NotificationHandlerMap = Record<number, NotificationHandler>;

interface BLEManagerOptions {
  autoReconnect?: boolean;
  reconnectDelay?: number;
  deviceNamePrefix?: string;
  logger?: (message: string, ...args: unknown[]) => void;
}

export type {
  EventCallback,
  NotificationHandler,
  NotificationHandlerMap,
  BLEManagerOptions,
};
