/**
 * A Web Bluetooth stand-in that talks to an emulated device in marsemu.
 *
 * marsemu (https://github.com/tomquist/marsemu) runs the real firmware of
 * Marstek devices and serves the emulated device's Bluetooth over WebSocket
 * (`marsemu … --ble-ws 7101`, or `api/ble` on its dashboard). Every binary
 * message the page sends is one write to the command characteristic (FF01);
 * every notification on FF02 arrives as one binary message; text messages
 * describe the device (`{"type":"device","name":…,"advertising":…}`).
 *
 * Pass the result as the `bluetooth` option of `BLEDeviceManager`; nothing
 * else changes:
 *
 * ```ts
 * const manager = new BLEDeviceManager({
 *   bluetooth: createEmulatorBluetooth("ws://localhost:7101/"),
 * });
 * await manager.connect();
 * ```
 *
 * Only the part of Web Bluetooth the manager uses is implemented: one
 * device, service 0xFF00, write and notify.
 */

type Listener = (event: { target: unknown; type: string }) => void;

/** WebSocket constructor; defaults to the global one (browsers, Node 22+). */
type WebSocketCtor = new (url: string) => WebSocket;

interface DeviceDescription {
  type: "device";
  name: string | null;
  advertising: boolean;
  mac?: string;
  services?: string[];
}

export interface EmulatorBluetoothOptions {
  /** WebSocket implementation (Node < 22: the `ws` package) */
  WebSocket?: WebSocketCtor;
  /** How long to wait for the emulated device to advertise, ms (default 30000) */
  advertiseTimeout?: number;
}

class Emitter {
  private listeners = new Map<string, Listener[]>();

  addEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  removeEventListener(type: string, fn: Listener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((f) => f !== fn),
    );
  }

  protected dispatch(type: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn({ target: this, type });
  }
}

/** Expand `ff00`, `0xff00` or a full UUID to the full 128-bit form. */
function fullUuid(uuid: string | number): string {
  const s = typeof uuid === "number" ? uuid.toString(16) : uuid.toLowerCase();
  const short = s.replace(/^0x/, "");
  return /^[0-9a-f]{4}$/.test(short)
    ? `0000${short}-0000-1000-8000-00805f9b34fb`
    : short;
}

const SERVICE = fullUuid("ff00");
const WRITE = fullUuid("ff01");
const NOTIFY = fullUuid("ff02");

class EmulatorCharacteristic extends Emitter {
  value: DataView | null = null;
  constructor(
    readonly uuid: string,
    private link: EmulatorLink,
  ) {
    super();
  }

  async writeValueWithoutResponse(value: BufferSource): Promise<void> {
    this.link.send(value);
  }

  async writeValue(value: BufferSource): Promise<void> {
    this.link.send(value);
  }

  async startNotifications(): Promise<this> {
    return this;
  }

  async stopNotifications(): Promise<this> {
    return this;
  }

  /** @internal */
  notify(data: Uint8Array): void {
    this.value = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.dispatch("characteristicvaluechanged");
  }
}

/** The WebSocket to marsemu, opened on demand and reopened on reconnect. */
class EmulatorLink {
  ws: WebSocket | null = null;
  info: DeviceDescription | null = null;
  readonly write: EmulatorCharacteristic;
  readonly status: EmulatorCharacteristic;
  onInfo: (info: DeviceDescription) => void = () => {};
  onClose: () => void = () => {};

  constructor(
    readonly url: string,
    private WS: WebSocketCtor,
  ) {
    this.write = new EmulatorCharacteristic(WRITE, this);
    this.status = new EmulatorCharacteristic(NOTIFY, this);
  }

  get open(): boolean {
    return this.ws !== null && this.ws.readyState === 1;
  }

  connect(): Promise<void> {
    if (this.open) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new this.WS(this.url);
      } catch (error) {
        reject(error);
        return;
      }
      ws.binaryType = "arraybuffer";
      // what the previous connection said about the device no longer holds
      this.info = null;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        this.ws = ws;
        resolve();
      };
      ws.onerror = () => {
        if (!opened) {
          reject(
            new Error(
              `Cannot reach the emulator at ${this.url} (is marsemu running with --ble-ws?)`,
            ),
          );
        }
      };
      ws.onclose = () => {
        if (this.ws === ws) {
          this.ws = null;
          this.info = null;
          this.onClose();
        }
      };
      ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "device") {
              this.info = msg;
              this.onInfo(msg);
            }
          } catch {
            // not ours
          }
          return;
        }
        this.status.notify(new Uint8Array(event.data as ArrayBuffer));
      };
    });
  }

  send(value: BufferSource): void {
    if (!this.ws || !this.open) {
      throw new Error("Not connected to the emulator");
    }
    const bytes =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    this.ws.send(bytes.slice());
  }

  close(): void {
    const ws = this.ws;
    this.ws = null;
    this.info = null;
    ws?.close();
  }
}

class EmulatorDevice extends Emitter {
  readonly id: string;
  readonly gatt: {
    connected: boolean;
    device: EmulatorDevice;
    connect: () => Promise<unknown>;
    disconnect: () => void;
    getPrimaryService: (uuid: string | number) => Promise<unknown>;
  };

  constructor(
    public name: string,
    link: EmulatorLink,
  ) {
    super();
    this.id = `marsemu:${link.url}`;
    const service = {
      uuid: SERVICE,
      getCharacteristic: async (uuid: string | number) => {
        const u = fullUuid(uuid);
        if (u === WRITE) return link.write;
        if (u === NOTIFY) return link.status;
        throw Object.assign(new Error(`No characteristic ${uuid}`), {
          name: "NotFoundError",
        });
      },
    };
    const gatt = {
      connected: false,
      device: this,
      connect: async () => {
        await link.connect();
        gatt.connected = true;
        return gatt;
      },
      disconnect: () => {
        link.close();
        if (gatt.connected) {
          gatt.connected = false;
          this.dispatch("gattserverdisconnected");
        }
      },
      getPrimaryService: async (uuid: string | number) => {
        if (fullUuid(uuid) !== SERVICE) {
          throw Object.assign(new Error(`No service ${uuid}`), {
            name: "NotFoundError",
          });
        }
        return service;
      },
    };
    this.gatt = gatt;
    link.onClose = () => {
      if (gatt.connected) {
        gatt.connected = false;
        this.dispatch("gattserverdisconnected");
      }
    };
    link.onInfo = (info) => {
      if (info.name) this.name = info.name;
    };
  }
}

interface RequestOptions {
  acceptAllDevices?: boolean;
  filters?: Array<{ namePrefix?: string; name?: string }>;
}

/**
 * Create a Web Bluetooth stand-in for the emulated device at `url`
 * (e.g. `ws://localhost:7101/`). `requestDevice` connects, waits until the
 * firmware advertises and returns the device if it matches the filters, as
 * the browser's device picker would.
 */
export function createEmulatorBluetooth(
  url: string,
  options: EmulatorBluetoothOptions = {},
): Bluetooth {
  const WS =
    options.WebSocket ??
    (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
  if (!WS) {
    throw new Error(
      "No WebSocket implementation: pass one as the WebSocket option",
    );
  }
  const advertiseTimeout = options.advertiseTimeout ?? 30000;
  const link = new EmulatorLink(url, WS);
  let device: EmulatorDevice | null = null;

  const waitForAdvertising = () =>
    new Promise<DeviceDescription>((resolve, reject) => {
      const done = (info: DeviceDescription) => {
        clearTimeout(timer);
        resolve(info);
      };
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              "The emulated device is not advertising yet (is the firmware still booting?)",
            ),
          ),
        advertiseTimeout,
      );
      if (link.info?.advertising && link.info.name) return done(link.info);
      const previous = link.onInfo;
      link.onInfo = (info) => {
        previous(info);
        if (info.advertising && info.name) {
          link.onInfo = previous;
          done(info);
        }
      };
    });

  const bluetooth = {
    async requestDevice(opts: RequestOptions = {}) {
      // a device that is connected keeps its connection if this fails
      const keep = () => device?.gatt.connected ?? false;
      try {
        await link.connect();
        const info = await waitForAdvertising();
        const name = info.name ?? "";
        const filters = opts.filters ?? [];
        const matches =
          opts.acceptAllDevices ||
          filters.length === 0 ||
          filters.some(
            (f) =>
              (f.namePrefix === undefined || name.startsWith(f.namePrefix)) &&
              (f.name === undefined || name === f.name),
          );
        if (!matches) {
          throw Object.assign(
            new Error(`The emulated device ${name} does not match the filters`),
            { name: "NotFoundError" },
          );
        }
        device ??= new EmulatorDevice(name, link);
        device.name = name;
        return device;
      } catch (error) {
        if (!keep()) link.close();
        throw error;
      }
    },
    async getAvailability() {
      return true;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return bluetooth as unknown as Bluetooth;
}
