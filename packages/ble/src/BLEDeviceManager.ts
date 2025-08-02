/**
 * BLEDeviceManager - A utility class for managing BLE connections and communication
 * with HM battery devices.
 */
import {
  COMMAND_TYPES,
  DeviceInfo,
  RuntimeInfo,
  CellInfo,
  MQTTConfig,
  HMDeviceProtocol,
} from "@tomquist/hmjs-protocol";
import {
  BLEManagerOptions,
  EventCallback,
  NotificationHandlerMap,
} from "./types.js";

type EventCallbackArgs = {
  connect: [BluetoothDevice];
  error: [Error];
  disconnect: [];
  reconnect: [BluetoothDevice];
  deviceInfo: [DeviceInfo];
  runtimeInfo: [RuntimeInfo];
  cellInfo: [CellInfo];
  rawData: [Uint8Array];
};

type EventType = keyof EventCallbackArgs;

type EventMap = {
  [K in EventType]: Array<EventCallback<EventCallbackArgs[K]>>;
};

interface CommandOptions {
  sendTwice?: boolean;
}

class BLEDeviceManager {
  // Connection properties
  private device: BluetoothDevice | null = null;
  private commandCharacteristic: BluetoothRemoteGATTCharacteristic | null =
    null;
  private statusCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private connected: boolean = false;
  private connecting: boolean = false;

  // Options with defaults
  private options: Required<BLEManagerOptions>;

  // Protocol handler
  private protocol: HMDeviceProtocol;

  // Service and characteristic UUIDs
  static readonly SERVICE_UUID = "0000ff00-0000-1000-8000-00805f9b34fb";
  static readonly COMMAND_CHARACTERISTIC_UUID =
    "0000ff01-0000-1000-8000-00805f9b34fb";
  static readonly STATUS_CHARACTERISTIC_UUID =
    "0000ff02-0000-1000-8000-00805f9b34fb";

  // Event listeners
  private eventListeners: EventMap = {
    connect: [],
    disconnect: [],
    reconnect: [],
    deviceInfo: [],
    runtimeInfo: [],
    cellInfo: [],
    error: [],
    rawData: [],
  };

  // Notification handlers
  private notificationHandlers: NotificationHandlerMap = {};
  private explicitDisconnect: boolean;

  /**
   * Constructor
   * @param options Configuration options
   */
  constructor(options: BLEManagerOptions = {}) {
    // Set default options
    this.options = {
      autoReconnect:
        options.autoReconnect !== undefined ? options.autoReconnect : true,
      reconnectDelay: options.reconnectDelay || 2000,
      deviceNamePrefix: options.deviceNamePrefix || "HM_",
      logger: options.logger || console.log,
    };
    this.explicitDisconnect = true;

    // Initialize protocol handler
    this.protocol = new HMDeviceProtocol({ logger: this.options.logger });

    // Bind methods to preserve 'this' context
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.onDisconnected = this.onDisconnected.bind(this);
    this.sendCommand = this.sendCommand.bind(this);
  }

  /**
   * Register an event listener
   * @param event Event name
   * @param callback Callback function
   * @returns This instance for chaining
   */
  public on<T extends EventType>(
    event: T,
    callback: EventCallback<EventCallbackArgs[T]>,
  ): BLEDeviceManager {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(callback);
    } else {
      this.log(`Warning: Unknown event type "${event}"`);
    }
    return this;
  }

  /**
   * Remove an event listener
   * @param event Event name
   * @param callback Callback function to remove
   * @returns This instance for chaining
   */
  public off(event: string, callback: EventCallback): BLEDeviceManager {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(
        (cb) => cb !== callback,
      );
    }
    return this;
  }

  /**
   * Trigger an event
   * @param event Event name
   * @param args Arguments to pass to the callback
   * @private
   */
  private _triggerEvent(event: string, ...args: unknown[]): void {
    if (this.eventListeners[event]) {
      for (const callback of this.eventListeners[event]) {
        try {
          callback(...args);
        } catch (error) {
          this.log(`Error in ${event} event handler:`, error);
        }
      }
    }
  }

  /**
   * Log a message using the configured logger
   * @param args Arguments to log
   * @private
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.options.logger) {
      this.options.logger(message, ...args);
    }
  }

  /**
   * Scan for available devices with the specified device name prefix
   * @param options Optional scan options to override defaults
   * @returns The selected device
   */
  public async scanForDevices(
    options: Partial<BLEManagerOptions> = {},
  ): Promise<BluetoothDevice> {
    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth API is not supported in this browser");
    }

    // Merge scan options with defaults
    const scanOptions = {
      ...this.options,
      ...options,
    };

    this.log("Requesting Bluetooth device...");
    this.log(`Using device name prefix: "${scanOptions.deviceNamePrefix}"`);

    try {
      // Request device with appropriate filters
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: scanOptions.deviceNamePrefix }],
        optionalServices: [BLEDeviceManager.SERVICE_UUID],
      });

      this.log(
        `Selected device: ${device.name || "unnamed device"} (${device.id})`,
      );
      return device;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log(`Scanning error: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Connect to a BLE device
   * @param device Optional device to connect to. If not provided, one will be scanned for
   * @param options Optional connection options to override defaults
   * @returns Connected device
   */
  public async connect(
    device?: BluetoothDevice,
    options: Partial<BLEManagerOptions> = {},
  ): Promise<BluetoothDevice | null> {
    if (this.connecting) {
      this.log("Connection already in progress");
      return this.device;
    }

    if (this.connected) {
      this.log("Already connected to a device");
      return this.device;
    }

    this.connecting = true;
    this.explicitDisconnect = false;

    try {
      // Merge connection options with defaults
      const connectionOptions = {
        ...this.options,
        ...options,
      };

      // If no device provided, scan for one
      if (!device) {
        this.log("No device provided, scanning...");
        device = await this.scanForDevices(connectionOptions);
      }

      this.device = device;

      // Set up disconnect listener
      this.device.addEventListener(
        "gattserverdisconnected",
        this.onDisconnected,
      );

      // Connect to GATT server
      this.log("Connecting to GATT server...");
      const server = await this.device.gatt!.connect();

      // Get primary service
      this.log(`Getting primary service (${BLEDeviceManager.SERVICE_UUID})...`);
      const service = await server.getPrimaryService(
        BLEDeviceManager.SERVICE_UUID,
      );

      // Get characteristics
      this.log("Getting command characteristic...");
      this.commandCharacteristic = await service.getCharacteristic(
        BLEDeviceManager.COMMAND_CHARACTERISTIC_UUID,
      );

      this.log("Getting status characteristic...");
      this.statusCharacteristic = await service.getCharacteristic(
        BLEDeviceManager.STATUS_CHARACTERISTIC_UUID,
      );

      // Setup notification handler for status characteristic
      await this.statusCharacteristic.startNotifications();
      this.statusCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this._handleStatusNotification.bind(this),
      );

      this.connected = true;
      this.connecting = false;

      this._triggerEvent("connect", this.device);
      this.log("Connected successfully");

      return this.device;
    } catch (error) {
      this.connecting = false;
      this.connected = false;
      this._triggerEvent("error", error);
      this.log(
        `Connection error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Disconnect from the BLE device
   */
  public disconnect(): void {
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.log("Disconnecting from device...");
      this.explicitDisconnect = true;
      this.device.gatt.disconnect();
    } else {
      this.onDisconnected();
    }
  }

  /**
   * Handle disconnection event
   * @private
   */
  private onDisconnected(): void {
    if (!this.connected) return; // Already handled

    this.log("Device disconnected");
    this.connected = false;

    // Clean up characteristics
    this.commandCharacteristic = null;
    this.statusCharacteristic = null;

    // Trigger disconnect event
    this._triggerEvent("disconnect");

    // Save device for potential reconnection
    const lastDevice = this.device;

    // Check for auto-reconnect
    if (!this.explicitDisconnect && this.options.autoReconnect && lastDevice) {
      this.log(
        `Auto-reconnect is enabled. Attempting to reconnect in ${this.options.reconnectDelay}ms...`,
      );

      setTimeout(async () => {
        try {
          this.log("Reconnecting...");
          this.connecting = true;

          // Connect to GATT server
          const server = await lastDevice.gatt!.connect();

          // Get primary service
          const service = await server.getPrimaryService(
            BLEDeviceManager.SERVICE_UUID,
          );

          // Get characteristics
          this.commandCharacteristic = await service.getCharacteristic(
            BLEDeviceManager.COMMAND_CHARACTERISTIC_UUID,
          );

          this.statusCharacteristic = await service.getCharacteristic(
            BLEDeviceManager.STATUS_CHARACTERISTIC_UUID,
          );

          // Setup notification handler
          await this.statusCharacteristic.startNotifications();
          this.statusCharacteristic.addEventListener(
            "characteristicvaluechanged",
            this._handleStatusNotification.bind(this),
          );

          this.device = lastDevice;
          this.connected = true;
          this.connecting = false;

          this._triggerEvent("reconnect", this.device);
          this.log("Reconnected successfully");
        } catch (error) {
          this.connecting = false;
          this.device = null;
          this._triggerEvent("error", error);
          this.log(
            `Reconnection failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }, this.options.reconnectDelay);
    } else {
      this.device = null;
    }
  }

  /**
   * Handle status characteristic notifications
   * @param event Notification event
   * @private
   */
  private _handleStatusNotification(_event: Event): void {
    const value = this.statusCharacteristic.value;

    if (!value) {
      this.log("Received empty notification value");
      return;
    }

    // Always emit raw data event for advanced mode
    this._triggerEvent("rawData", new Uint8Array(value.buffer));

    // Attempt to determine what type of response this is
    try {
      // Use protocol to get command type
      const msg = this.protocol.parseMessage(value);
      switch (msg.type) {
        case COMMAND_TYPES.RUNTIME_INFO:
          this._triggerEvent("runtimeInfo", msg.data);
          break;
        case COMMAND_TYPES.DEVICE_INFO:
          this._triggerEvent("deviceInfo", msg.data);
          break;
        case COMMAND_TYPES.CELL_INFO:
          this._triggerEvent("cellInfo", msg.data);
          break;
        default:
          // Handle unknown command type
          this.log(
            `Unknown command type: ${msg.type}`,
            msg.error,
            Array.from(msg.rawData)
              .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
              .join(" "),
          );
          break;
      }
    } catch (error) {
      this.log(
        `Error processing notification: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Send a command to the device and optionally wait for a response
   * @param commandType Command type
   * @param payload Optional payload data
   * @param options Command options
   * @returns Command response or void
   */
  private async sendCommand(
    commandType: number,
    payload: Uint8Array | number[] | null = null,
    options: CommandOptions = {},
  ): Promise<void> {
    if (!this.connected || !this.commandCharacteristic) {
      throw new Error("Not connected to device");
    }

    const defaultOptions: Required<CommandOptions> = {
      sendTwice: true, // Send command twice for reliability
    };

    const cmdOptions = { ...defaultOptions, ...options };

    try {
      // Create the command message using the protocol
      const command = this.protocol.createCommandMessage(commandType, payload);
      await this.commandCharacteristic.writeValueWithoutResponse(command);

      // Send twice for reliability if enabled
      if (cmdOptions.sendTwice) {
        await this.commandCharacteristic.writeValueWithoutResponse(command);
      }

      this.log(`Command sent: 0x${commandType.toString(16)}`);
    } catch (error) {
      this._triggerEvent("error", error);
      throw error;
    }
  }

  // ====== Convenience API Methods ======

  /**
   * Get device information
   * @returns Device information
   */
  public async getDeviceInfo(options?: {
    timeout?: number;
  }): Promise<DeviceInfo> {
    const { timeout = 5000 } = options ?? {};
    return new Promise((resolve, reject) => {
      const eventHandler = (data: DeviceInfo) => {
        this.off("deviceInfo", eventHandler);
        clearTimeout(timeoutId);
        resolve(data);
      };
      const timeoutId = setTimeout(() => {
        this.off("deviceInfo", eventHandler);
        reject(new Error("Command timed out"));
      }, timeout);
      this.on("deviceInfo", eventHandler);
      this.sendCommand(COMMAND_TYPES.DEVICE_INFO, null).catch((error) => {
        this.off("deviceInfo", eventHandler);
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * Get runtime information
   * @returns Runtime information
   */
  public async getRuntimeInfo(options?: {
    timeout?: number;
  }): Promise<RuntimeInfo | null> {
    const { timeout = 5000 } = options ?? {};
    return new Promise((resolve, reject) => {
      const eventHandler = (data: RuntimeInfo) => {
        this.off("runtimeInfo", eventHandler);
        clearTimeout(timeoutId);
        resolve(data);
      };
      const timeoutId = setTimeout(() => {
        this.off("runtimeInfo", eventHandler);
        reject(new Error("Command timed out"));
      }, timeout);
      this.on("runtimeInfo", eventHandler);
      this.sendCommand(COMMAND_TYPES.RUNTIME_INFO, null).catch((error) => {
        this.off("runtimeInfo", eventHandler);
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * Get battery cell information
   * @returns Cell information
   */
  public async getCellInfo(options?: {
    timeout?: number;
  }): Promise<CellInfo | null> {
    const { timeout = 5000 } = options ?? {};
    return new Promise((resolve, reject) => {
      const eventHandler = (data: CellInfo) => {
        this.off("cellInfo", eventHandler);
        clearTimeout(timeoutId);
        resolve(data);
      };
      const timeoutId = setTimeout(() => {
        this.off("cellInfo", eventHandler);
        reject(new Error("Command timed out"));
      }, timeout);
      this.on("cellInfo", eventHandler);
      this.sendCommand(COMMAND_TYPES.CELL_INFO, null).catch((error) => {
        this.off("cellInfo", eventHandler);
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * Set WiFi configuration
   * @param ssid WiFi SSID
   * @param password WiFi password
   * @returns Command response
   */
  public async setWifiConfig(ssid: string, password: string): Promise<void> {
    if (!ssid || !password) {
      throw new Error("SSID and password are required");
    }

    // Create payload using protocol
    const configBytes = this.protocol.createWifiConfigPayload(ssid, password);

    await this.sendCommand(COMMAND_TYPES.SET_WIFI, configBytes);
  }

  /**
   * Set MQTT configuration
   * @param config MQTT configuration
   * @returns Command response
   */
  public async setMqttConfig(config: MQTTConfig): Promise<void> {
    if (!config.host || !config.port) {
      throw new Error("Host and port are required");
    }

    // Create payload using protocol
    const configBytes = this.protocol.createMqttConfigPayload(config);

    await this.sendCommand(COMMAND_TYPES.SET_MQTT, configBytes);
  }

  /**
   * Reset MQTT configuration
   * @returns Command response
   */
  public async resetMqttConfig(): Promise<void> {
    await this.sendCommand(COMMAND_TYPES.RESET_MQTT, null);
  }

  /**
   * Check if device is connected
   * @returns Connection status
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the connected device
   * @returns Connected device or null
   */
  public getDevice(): BluetoothDevice | null {
    return this.device;
  }

  /**
   * Set auto-reconnect option
   * @param enable Whether to enable auto-reconnect
   */
  public setAutoReconnect(enable: boolean): void {
    this.options.autoReconnect = enable;
  }

  /**
   * Send raw bytes to the device
   * @param bytes Raw bytes to send as Uint8Array
   * @returns Promise that resolves when command is sent
   */
  public async sendRawBytes(bytes: Uint8Array): Promise<void> {
    if (!this.connected || !this.commandCharacteristic) {
      throw new Error("Not connected to device");
    }

    try {
      this.log(
        `Sending raw command: ${Array.from(bytes)
          .map((b) => "0x" + b.toString(16).padStart(2, "0"))
          .join(" ")}`,
      );

      // Send the raw command
      await this.commandCharacteristic.writeValueWithoutResponse(bytes);

      this.log(`Raw command sent successfully`);
    } catch (error) {
      this._triggerEvent("error", error);
      throw error;
    }
  }
}

export { BLEDeviceManager };
