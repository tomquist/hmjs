/**
 * BLEDeviceManager - A utility class for managing BLE connections and communication
 * with HM battery devices.
 */
import {
  COMMAND_TYPES,
  DeviceInfo,
  RuntimeInfo,
  CellInfo,
  TimerInfo,
  TimerInfoResponse,
  MQTTConfig,
  HMDeviceProtocol,
  DIAGNOSIS_VARIANT,
  ALL_NAME_PREFIXES,
  MARSTEK_COMMANDS,
  assertCommandAllowed,
  createDepthOfDischargePayload,
  decodeFamilyMessage,
  detectDeviceFamily,
  familySupports,
  parseKeyValuePayload,
} from "@tomquist/hmjs-protocol";
import type {
  BatteryInfo,
  DeviceDateTime,
  DeviceFamily,
  FamilyMessage,
  JupiterRuntimeInfo,
  JupiterSystemInfo,
  NetworkInfo,
  Venus3InverterInfo,
  Venus3RuntimeInfo,
  VenusRuntimeInfo,
  VenusMiniRuntimeInfo,
} from "@tomquist/hmjs-protocol";
import {
  BLEManagerOptions,
  DeviceType,
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
  timerInfo: [TimerInfoResponse];
  rawData: [Uint8Array];
  familyMessage: [FamilyMessage];
  familyDetected: [DeviceFamily];
};

type EventType = keyof EventCallbackArgs;

/** Decoded data per family reply kind */
type FamilyData = {
  [M in FamilyMessage as M["kind"]]: M["data"];
};

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

  // Family of the connected device; B2500 when unknown, as before
  private family: DeviceFamily | undefined = undefined;

  // Options with defaults
  private options: Required<Omit<BLEManagerOptions, "bluetooth">> & {
    bluetooth?: Bluetooth;
  };

  private getDeviceUUIDs(deviceType: DeviceType = this.options.deviceType): {
    service: string;
    command: string;
    status: string;
  } {
    if (deviceType === "tronic") {
      return {
        service: BLEDeviceManager.TRONIC_SERVICE_UUID,
        command: BLEDeviceManager.TRONIC_COMMAND_UUID,
        status: BLEDeviceManager.TRONIC_STATUS_UUID,
      };
    }
    return {
      service: BLEDeviceManager.SERVICE_UUID,
      command: BLEDeviceManager.B2500_COMMAND_UUID,
      status: BLEDeviceManager.B2500_STATUS_UUID,
    };
  }

  // Cached Web Bluetooth implementation auto-loaded in Node.js
  private resolvedBluetooth: Bluetooth | null = null;

  // Protocol handler
  private protocol: HMDeviceProtocol;

  // Service and characteristic UUIDs
  static readonly SERVICE_UUID = "0000ff00-0000-1000-8000-00805f9b34fb";

  // B2500 (200-series, default)
  static readonly B2500_COMMAND_UUID = "0000ff01-0000-1000-8000-00805f9b34fb";
  static readonly B2500_STATUS_UUID = "0000ff02-0000-1000-8000-00805f9b34fb";

  // Tronic / 100-series (experimental)
  // Service UUID is 0x00FF (000000ff-...), different from B2500's 0xFF00 (0000ff00-...)
  static readonly TRONIC_SERVICE_UUID = "000000ff-0000-1000-8000-00805f9b34fb";
  static readonly TRONIC_COMMAND_UUID = "0000ff03-0000-1000-8000-00805f9b34fb";
  static readonly TRONIC_STATUS_UUID = "0000ff01-0000-1000-8000-00805f9b34fb";

  // Keep legacy aliases pointing at B2500 defaults for backwards compatibility
  static readonly COMMAND_CHARACTERISTIC_UUID =
    BLEDeviceManager.B2500_COMMAND_UUID;
  static readonly STATUS_CHARACTERISTIC_UUID =
    BLEDeviceManager.B2500_STATUS_UUID;

  // Event listeners
  private eventListeners: EventMap = {
    connect: [],
    disconnect: [],
    reconnect: [],
    deviceInfo: [],
    runtimeInfo: [],
    cellInfo: [],
    timerInfo: [],
    error: [],
    rawData: [],
    familyMessage: [],
    familyDetected: [],
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
      // Without an explicit prefix, offer every Marstek device. The Tronic
      // firmware keeps the old default.
      deviceNamePrefix:
        options.deviceNamePrefix ??
        (options.deviceType === "tronic" ? "HM_" : [...ALL_NAME_PREFIXES]),
      acceptAllDevices: options.acceptAllDevices ?? false,
      logger: options.logger || console.log,
      bluetooth: options.bluetooth,
      deviceType: options.deviceType ?? "b2500",
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
   * Resolve a Web Bluetooth implementation. Prefers an explicit override,
   * then `options.bluetooth`, then `navigator.bluetooth`, then auto-loads
   * the optional `webbluetooth` peer dependency in Node.js.
   */
  private async resolveBluetooth(override?: Bluetooth): Promise<Bluetooth> {
    if (override) return override;
    if (this.options.bluetooth) return this.options.bluetooth;
    if (typeof navigator !== "undefined" && navigator.bluetooth) {
      return navigator.bluetooth;
    }
    if (this.resolvedBluetooth) return this.resolvedBluetooth;
    const isNode =
      typeof process !== "undefined" && process.versions?.node != null;
    if (isNode) {
      try {
        const moduleName = "webbluetooth";
        const mod = (await import(
          /* webpackIgnore: true */ /* @vite-ignore */ moduleName
        )) as { Bluetooth: new () => Bluetooth };
        this.resolvedBluetooth = new mod.Bluetooth();
        return this.resolvedBluetooth;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code =
          err instanceof Error && "code" in err
            ? (err as { code?: string }).code
            : undefined;
        const isModuleNotFound =
          code === "ERR_MODULE_NOT_FOUND" ||
          code === "MODULE_NOT_FOUND" ||
          /Cannot find (module|package)/i.test(message);
        if (isModuleNotFound) {
          throw new Error(
            "The `webbluetooth` package is not installed. Run `npm install webbluetooth`, or pass a `Bluetooth` instance via the `bluetooth` option.",
            { cause: err },
          );
        }
        throw new Error(
          `Failed to initialize the \`webbluetooth\` Bluetooth implementation: ${message}`,
          { cause: err },
        );
      }
    }
    throw new Error(
      "Web Bluetooth API is not supported in this browser. Pass a `Bluetooth` instance via the `bluetooth` option.",
    );
  }

  /**
   * Scan for available devices with the specified device name prefix
   * @param options Optional scan options to override defaults
   * @returns The selected device
   */
  public async scanForDevices(
    options: Partial<BLEManagerOptions> = {},
  ): Promise<BluetoothDevice> {
    // Merge scan options with defaults
    const scanOptions = {
      ...this.options,
      ...options,
    };

    const bluetooth = await this.resolveBluetooth(scanOptions.bluetooth);

    this.log("Requesting Bluetooth device...");
    if (scanOptions.acceptAllDevices) {
      this.log("Accepting all Bluetooth devices");
    } else {
      this.log(
        `Using device name prefix: ${JSON.stringify(scanOptions.deviceNamePrefix)}`,
      );
    }

    try {
      // Request device with appropriate filters. The Web Bluetooth API allows
      // either `filters` or `acceptAllDevices`, but not both at once.
      const serviceUUID = this.getDeviceUUIDs(scanOptions.deviceType).service;
      const requestOptions = scanOptions.acceptAllDevices
        ? {
            acceptAllDevices: true,
            optionalServices: [serviceUUID],
          }
        : {
            filters: (Array.isArray(scanOptions.deviceNamePrefix)
              ? scanOptions.deviceNamePrefix
              : [scanOptions.deviceNamePrefix]
            ).map((namePrefix) => ({ namePrefix })),
            optionalServices: [serviceUUID],
          };
      const device = await bluetooth.requestDevice(requestOptions);

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
      // A new device: forget the previous one's family.
      this.family = undefined;
      this.setFamily(detectDeviceFamily({ name: device.name }));

      // Set up disconnect listener
      this.device.addEventListener(
        "gattserverdisconnected",
        this.onDisconnected,
      );

      // Connect to GATT server
      this.log("Connecting to GATT server...");
      const server = await this.device.gatt!.connect();

      // Get primary service (UUID depends on device type)
      const uuids = this.getDeviceUUIDs(connectionOptions.deviceType);
      this.log(
        `Getting primary service (${uuids.service}, deviceType=${connectionOptions.deviceType ?? this.options.deviceType})...`,
      );
      const service = await server.getPrimaryService(uuids.service);

      // Get characteristics
      this.log(`Getting command characteristic (${uuids.command})...`);
      this.commandCharacteristic = await service.getCharacteristic(
        uuids.command,
      );

      this.log(`Getting status characteristic (${uuids.status})...`);
      this.statusCharacteristic = await service.getCharacteristic(uuids.status);

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

          // Get primary service (UUID depends on device type)
          const uuids = this.getDeviceUUIDs(this.options.deviceType);
          const service = await server.getPrimaryService(uuids.service);

          this.commandCharacteristic = await service.getCharacteristic(
            uuids.command,
          );

          this.statusCharacteristic = await service.getCharacteristic(
            uuids.status,
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

    const frame = new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    ).slice();

    // Always emit raw data event for advanced mode
    this._triggerEvent("rawData", frame);

    // Devices other than the B2500 give the command numbers other meanings,
    // so their replies are decoded with the family's own layout.
    if (this.family && this.family !== "b2500") {
      const msg = decodeFamilyMessage(this.family, frame);
      if (msg) {
        if (msg.kind === "deviceInfo") {
          this.setFamily(detectDeviceFamily({ type: msg.data.type }));
          this._triggerEvent("deviceInfo", msg.data);
        }
        this._triggerEvent("familyMessage", msg);
      }
      return;
    }

    // Attempt to determine what type of response this is
    try {
      // Use protocol to get command type
      const msg = this.protocol.parseMessage(value);
      switch (msg.type) {
        case COMMAND_TYPES.RUNTIME_INFO:
          this._triggerEvent("runtimeInfo", msg.data);
          break;
        case COMMAND_TYPES.DEVICE_INFO:
          this.setFamily(detectDeviceFamily({ type: msg.data.type }));
          this._triggerEvent("deviceInfo", msg.data);
          if (this.family && this.family !== "b2500") {
            this._triggerEvent("familyMessage", {
              kind: "deviceInfo",
              command: COMMAND_TYPES.DEVICE_INFO,
              data: parseKeyValuePayload(frame.subarray(4, frame.length - 1)),
            });
          }
          break;
        case COMMAND_TYPES.CELL_INFO:
          this._triggerEvent("cellInfo", msg.data);
          break;
        case COMMAND_TYPES.GET_TIMERS:
          this._triggerEvent("timerInfo", msg.data);
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
   * Write a value to the command characteristic.
   *
   * Prefers `writeValueWithoutResponse()`, but falls back to the older
   * `writeValue()` method for Web Bluetooth implementations that don't
   * expose it (e.g. Bluefy on iOS), which would otherwise throw
   * "writeValueWithoutResponse is not a function".
   *
   * @param value Bytes to write
   */
  private async writeCommandValue(value: BufferSource): Promise<void> {
    const characteristic = this.commandCharacteristic;
    if (!characteristic) {
      throw new Error("Not connected to device");
    }

    if (typeof characteristic.writeValueWithoutResponse === "function") {
      await characteristic.writeValueWithoutResponse(value);
    } else if (typeof characteristic.writeValue === "function") {
      // Deprecated, but widely supported on older implementations.
      await characteristic.writeValue(value);
    } else {
      throw new Error("Command characteristic does not support writing values");
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

    assertCommandAllowed(this.family, commandType);

    try {
      // Create the command message using the protocol
      const command = this.protocol.createCommandMessage(commandType, payload);
      await this.writeCommandValue(command);

      // Send twice for reliability if enabled
      if (cmdOptions.sendTwice) {
        await this.writeCommandValue(command);
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
      // The Venus E 3.0/A/D only answer with the 0x01 argument the app sends;
      // the B2500 answers either way.
      this.sendCommand(COMMAND_TYPES.DEVICE_INFO, [0x01]).catch((error) => {
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
    this.requireB2500("getRuntimeInfo");
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
    this.requireB2500("getCellInfo");
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
   * Get timer schedule information
   * @returns Parsed timer schedule response
   */
  public async getTimers(options?: {
    timeout?: number;
  }): Promise<TimerInfoResponse> {
    this.requireB2500("getTimers");
    const { timeout = 5000 } = options ?? {};
    return new Promise((resolve, reject) => {
      const eventHandler = (data: TimerInfoResponse) => {
        this.off("timerInfo", eventHandler);
        clearTimeout(timeoutId);
        resolve(data);
      };
      const timeoutId = setTimeout(() => {
        this.off("timerInfo", eventHandler);
        reject(new Error("Command timed out"));
      }, timeout);
      this.on("timerInfo", eventHandler);
      this.sendCommand(COMMAND_TYPES.GET_TIMERS, [0x00]).catch((error) => {
        this.off("timerInfo", eventHandler);
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * Set timer schedule entries
   *
   * The device rewrites all of its timer slots at once, so the complete set
   * has to be sent: 3 entries for firmware < 218, 5 entries otherwise. Read
   * the current schedule with {@link getTimers} first and modify the entries
   * you want to change.
   *
   * Note that every write is persisted to the device's flash, which only
   * tolerates a limited number of write cycles - do not call this on a timer
   * or in a control loop.
   *
   * @param timers Timer entries to write (one per device slot)
   */
  public async setTimers(timers: TimerInfo[]): Promise<void> {
    this.requireB2500("setTimers");
    const payload = this.protocol.createTimerConfigPayload(timers);
    await this.sendCommand(COMMAND_TYPES.SET_TIMERS, payload);
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
   * Request the WiFi information the device currently has stored
   *
   * Useful after {@link setWifiConfig} to confirm what the device actually
   * kept. The response is delivered through the `rawData` event - this
   * library does not yet parse it.
   */
  public async getWifiInfo(): Promise<void> {
    this.requireB2500("getWifiInfo");
    await this.sendCommand(COMMAND_TYPES.GET_WIFI_INFO, [0x01]);
  }

  /**
   * Request the device's stored error/fault information
   *
   * The response is delivered through the `rawData` event - this library
   * does not yet parse it.
   */
  public async getErrorInfo(): Promise<void> {
    this.requireB2500("getErrorInfo");
    await this.sendCommand(COMMAND_TYPES.GET_ERROR_INFO, [0x01]);
  }

  /**
   * Set the depth of discharge
   *
   * This is persisted to the device's flash, so do not call it on a timer or
   * in a control loop.
   *
   * @param percent Depth of discharge, 0-100
   */
  public async setDod(percent: number): Promise<void> {
    this.requireB2500("setDod");
    const payload = this.protocol.createDodPayload(percent);
    await this.sendCommand(COMMAND_TYPES.SET_DOD, payload);
  }

  /**
   * Set the discharge threshold
   *
   * This is persisted to the device's flash, so do not call it on a timer or
   * in a control loop.
   *
   * @param watts Threshold in watts (0-65535)
   */
  public async setDischargeThreshold(watts: number): Promise<void> {
    this.requireB2500("setDischargeThreshold");
    const payload = this.protocol.createDischargeThresholdPayload(watts);
    await this.sendCommand(COMMAND_TYPES.SET_DISCHARGE_THRESHOLD, payload);
  }

  /**
   * Set the charge mode
   * @param mode Value from `CHARGE_MODE`
   */
  public async setChargeMode(mode: number): Promise<void> {
    this.requireB2500("setChargeMode");
    const payload = this.protocol.createChargeModePayload(mode);
    await this.sendCommand(COMMAND_TYPES.SET_CHARGE_MODE, payload);
  }

  /**
   * Enable or disable the two output channels
   * @param mask Bitmask of `OUTPUT_CHANNEL` values (0-3)
   */
  public async setOutputChannels(mask: number): Promise<void> {
    this.requireB2500("setOutputChannels");
    const payload = this.protocol.createOutputChannelsPayload(mask);
    await this.sendCommand(COMMAND_TYPES.SET_OUTPUT_CHANNELS, payload);
  }

  /**
   * Enable or disable adaptive mode
   * @param enabled Whether adaptive mode should be on
   */
  public async setAdaptiveMode(enabled: boolean): Promise<void> {
    this.requireB2500("setAdaptiveMode");
    await this.sendCommand(COMMAND_TYPES.SET_ADAPTIVE_MODE, [
      enabled ? 0x01 : 0x00,
    ]);
  }

  /**
   * Write the device's clock
   *
   * This is persisted to the device's flash, so do not call it on a timer or
   * in a control loop.
   *
   * @param date Date to write; defaults to now
   */
  public async setDateTime(date?: Date): Promise<void> {
    this.requireB2500("setDateTime");
    const payload = this.protocol.createDateTimePayload(date);
    await this.sendCommand(COMMAND_TYPES.SET_DATETIME, payload);
  }

  /**
   * Restart the device
   *
   * The device drops the BLE connection while it reboots.
   */
  public async restartDevice(): Promise<void> {
    this.requireB2500("restartDevice");
    // sendCommand repeats every frame by default. The device can drop the BLE
    // link as soon as it acts on the first restart frame, which would make the
    // second write fail and report a successful restart as an error.
    await this.sendCommand(COMMAND_TYPES.RESTART_DEVICE, [0x01], {
      sendTwice: false,
    });
  }

  /**
   * Ask the device to re-run its CT diagnosis
   * @param variant Value from `DIAGNOSIS_VARIANT`; newer firmware uses
   *   `CURRENT`, older firmware `LEGACY`
   */
  public async runDiagnosis(
    variant: number = DIAGNOSIS_VARIANT.CURRENT,
  ): Promise<void> {
    this.requireB2500("runDiagnosis");
    if (
      variant !== DIAGNOSIS_VARIANT.LEGACY &&
      variant !== DIAGNOSIS_VARIANT.CURRENT
    ) {
      throw new Error(
        "Diagnosis variant must be DIAGNOSIS_VARIANT.LEGACY or DIAGNOSIS_VARIANT.CURRENT",
      );
    }
    await this.sendCommand(COMMAND_TYPES.RUN_DIAGNOSIS, [variant]);
  }

  /**
   * Set MQTT configuration
   * @param config MQTT configuration
   * @returns Command response
   */
  public async setMqttConfig(config: MQTTConfig): Promise<void> {
    this.requireB2500("setMqttConfig");
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
    this.requireB2500("resetMqttConfig");
    await this.sendCommand(COMMAND_TYPES.RESET_MQTT, null);
  }

  // ====== Device families ======

  /**
   * Remember the device's family; ignores `undefined` so a name that gives
   * nothing away does not erase what the device info established.
   */
  private setFamily(family: DeviceFamily | undefined): void {
    if (family && family !== this.family) {
      this.family = family;
      this.log(`Device family: ${family}`);
      this._triggerEvent("familyDetected", family);
    }
  }

  /**
   * Family of the connected device, from its Bluetooth name or, once known,
   * its device type. `undefined` for unknown devices, which are treated as a
   * B2500.
   */
  public getFamily(): DeviceFamily | undefined {
    return this.family;
  }

  /**
   * Ask the device for its type and return its family.
   *
   * The Bluetooth name usually tells already; this confirms it from the
   * device type, which is the reliable source.
   */
  public async detectFamily(options?: {
    timeout?: number;
  }): Promise<DeviceFamily | undefined> {
    const info = await this.getDeviceInfo(options);
    this.setFamily(detectDeviceFamily({ type: info.type }));
    return this.family;
  }

  /**
   * Refuse a B2500 command on another family.
   *
   * The other families give the B2500's command numbers different meanings
   * (on a Venus C/E, `0x25` sets the Shelly port rather than restarting), so
   * sending them blind would change unrelated settings.
   */
  private requireB2500(method: string): void {
    if (this.family && this.family !== "b2500") {
      throw new Error(
        `${method}() is a B2500 command and is not supported on this device (${this.family}).`,
      );
    }
  }

  private requireFamily(
    command: keyof typeof MARSTEK_COMMANDS,
    method: string,
  ): DeviceFamily {
    if (!familySupports(this.family, command)) {
      throw new Error(
        `${method}() is not supported on this device (${this.family ?? "unknown family"}).`,
      );
    }
    return this.family!;
  }

  /**
   * Send a command and wait for the reply with the same command number,
   * decoded with the device family's layout.
   *
   * @param command Command number
   * @param payload Payload bytes
   * @param options `timeout` in ms (default 5000)
   */
  public async request(
    command: number,
    payload: Uint8Array | number[] | null = null,
    options?: { timeout?: number },
  ): Promise<FamilyMessage> {
    const { timeout = 5000 } = options ?? {};
    const family = this.family;
    if (!family || family === "b2500") {
      throw new Error("request() is for devices other than the B2500");
    }
    return new Promise((resolve, reject) => {
      const handler = (frame: Uint8Array) => {
        if (frame.length < 5 || frame[0] !== 0x73 || frame[3] !== command) {
          return;
        }
        const msg = decodeFamilyMessage(family, frame);
        if (!msg) return;
        this.off("rawData", handler as EventCallback);
        clearTimeout(timeoutId);
        resolve(msg);
      };
      const timeoutId = setTimeout(() => {
        this.off("rawData", handler as EventCallback);
        reject(new Error("Command timed out"));
      }, timeout);
      this.on("rawData", handler);
      this.sendCommand(command, payload).catch((error) => {
        this.off("rawData", handler as EventCallback);
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  private async requestKind<K extends keyof FamilyData>(
    command: number,
    kind: K,
    payload: number[] | null = null,
  ): Promise<FamilyData[K]> {
    const msg = await this.request(command, payload);
    if (msg.kind !== kind) {
      throw new Error(
        `Unexpected reply to 0x${command.toString(16)}: ${msg.kind}`,
      );
    }
    return msg.data as unknown as FamilyData[K];
  }

  /**
   * Status of a Venus, Venus E Mini or Jupiter (`0x03`).
   *
   * For a B2500 use {@link getRuntimeInfo}.
   */
  public async getStatus(): Promise<
    | Venus3RuntimeInfo
    | VenusRuntimeInfo
    | VenusMiniRuntimeInfo
    | JupiterRuntimeInfo
  > {
    this.requireFamily("RUNTIME_INFO", "getStatus");
    if (this.family === "meter") {
      throw new Error(
        "getStatus() does not decode this family yet; use request(0x03) for the raw reply.",
      );
    }
    return this.requestKind(MARSTEK_COMMANDS.RUNTIME_INFO, "runtimeInfo");
  }

  /**
   * Battery data with cell voltages (`0x14`): every Venus model and the
   * Jupiter.
   */
  public async getBatteryInfo(): Promise<BatteryInfo> {
    const family = this.requireFamily("BATTERY_INFO", "getBatteryInfo");
    if (family === "jupiter") {
      return (await this.getSystemInfo()).battery;
    }
    return this.requestKind(MARSTEK_COMMANDS.BATTERY_INFO, "batteryInfo");
  }

  /** Grid, PV and battery measurements of a Jupiter (`0x14`). */
  public async getSystemInfo(): Promise<JupiterSystemInfo> {
    if (this.family !== "jupiter") {
      throw new Error("getSystemInfo() is only supported on the Jupiter");
    }
    return this.requestKind(MARSTEK_COMMANDS.BATTERY_INFO, "systemInfo");
  }

  /** Grid frequency, voltage and AC power of a Venus E 3.0/A/D (`0x0D`). */
  public async getInverterInfo(): Promise<Venus3InverterInfo> {
    this.requireFamily("INVERTER_INFO", "getInverterInfo");
    return this.requestKind(MARSTEK_COMMANDS.INVERTER_INFO, "inverterInfo");
  }

  /** The device clock: Venus E 3.0/A/D and Jupiter (`0x0B`). */
  public async getDeviceTime(): Promise<DeviceDateTime> {
    this.requireFamily("GET_DATETIME", "getDeviceTime");
    return this.requestKind(MARSTEK_COMMANDS.GET_DATETIME, "dateTime");
  }

  /** The Wi-Fi network the device is configured for: Venus (`0x08`). */
  public async getWifiSsid(): Promise<string> {
    this.requireFamily("GET_WIFI_SSID", "getWifiSsid");
    return this.requestKind(MARSTEK_COMMANDS.GET_WIFI_SSID, "wifiSsid");
  }

  /** IP address, gateway, netmask and DNS: Venus C/E and Venus E Mini (`0x24`). */
  public async getNetworkInfo(): Promise<NetworkInfo> {
    this.requireFamily("GET_NETWORK_INFO", "getNetworkInfo");
    return this.requestKind(MARSTEK_COMMANDS.GET_NETWORK_INFO, "networkInfo");
  }

  /**
   * Set the depth of discharge on any family that supports it: the B2500
   * (0-100 %), the Venus E 3.0/A/D (30-88 %) and the Jupiter (30-90 %).
   *
   * This is persisted to the device's flash, so do not call it on a timer or
   * in a control loop.
   */
  public async setDepthOfDischarge(percent: number): Promise<void> {
    if (!this.family || this.family === "b2500") {
      return this.setDod(percent);
    }
    const family = this.requireFamily("SET_DOD", "setDepthOfDischarge");
    await this.sendCommand(
      MARSTEK_COMMANDS.SET_DOD,
      createDepthOfDischargePayload(family, percent),
    );
  }

  /** Turn the status LED of a Venus E 3.0/A/D on or off (`0x59`). */
  public async setStatusLed(on: boolean): Promise<void> {
    this.requireFamily("SET_LED", "setStatusLed");
    await this.sendCommand(MARSTEK_COMMANDS.SET_LED, [on ? 0x01 : 0x00]);
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
   * Set the device type. Takes effect on the next connect().
   * Cannot be changed while connected.
   */
  public setDeviceType(type: DeviceType): void {
    this.options.deviceType = type;
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

    if (bytes.length > 3) {
      assertCommandAllowed(this.family, bytes[3]);
    }

    try {
      this.log(
        `Sending raw command: ${Array.from(bytes)
          .map((b) => "0x" + b.toString(16).padStart(2, "0"))
          .join(" ")}`,
      );

      // Send the raw command
      await this.writeCommandValue(bytes);

      this.log(`Raw command sent successfully`);
    } catch (error) {
      this._triggerEvent("error", error);
      throw error;
    }
  }
}

export { BLEDeviceManager };
