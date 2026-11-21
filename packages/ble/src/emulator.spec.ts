import { createEmulatorBluetooth } from "./emulator.js";
import { BLEDeviceManager } from "./BLEDeviceManager.js";

/** A WebSocket stand-in for marsemu's BLE endpoint. */
class FakeSocket {
  static last: FakeSocket | null = null;
  readyState = 0;
  binaryType = "blob";
  sent: Uint8Array[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.last = this;
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
      this.message(
        JSON.stringify({
          type: "device",
          name: "MARS_VNSEM_0002",
          advertising: true,
          services: ["ff00"],
        }),
      );
    }, 0);
  }

  message(data: unknown) {
    this.onmessage?.({ data });
  }

  send(data: Uint8Array) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const WebSocket = FakeSocket as unknown as new (url: string) => WebSocket;

describe("createEmulatorBluetooth", () => {
  it("lists the emulated device when it matches the picker's filters", async () => {
    const bt = createEmulatorBluetooth("ws://localhost:7101/", { WebSocket });
    const device = await bt.requestDevice({
      filters: [{ namePrefix: "HM_" }, { namePrefix: "MARS_VNSEM_" }],
    });
    expect(device.name).toBe("MARS_VNSEM_0002");
    await expect(
      createEmulatorBluetooth("ws://x/", { WebSocket }).requestDevice({
        filters: [{ namePrefix: "HM_" }],
      }),
    ).rejects.toThrow(/does not match/);
  });

  it("carries the manager's writes and the device's notifications", async () => {
    const manager = new BLEDeviceManager({
      bluetooth: createEmulatorBluetooth("ws://localhost:7101/", {
        WebSocket,
      }),
      logger: () => {},
      autoReconnect: false,
    });
    await manager.connect();
    expect(manager.getFamily()).toBe("venusMini");

    const socket = FakeSocket.last!;
    const ssid = manager.getWifiSsid();
    await new Promise((r) => setTimeout(r, 0));
    expect(Array.from(socket.sent[0]).slice(0, 4)).toEqual([
      0x73, 0x05, 0x23, 0x08,
    ]);
    const reply = new Uint8Array([
      0x73, 0x0b, 0x23, 0x08, 0x45, 0x6d, 0x75, 0x4e, 0x65, 0x74, 0x51,
    ]);
    socket.message(reply.buffer);
    await expect(ssid).resolves.toBe("EmuNet");

    const disconnected = jest.fn();
    manager.on("disconnect", disconnected);
    socket.close();
    expect(disconnected).toHaveBeenCalled();
    expect(manager.isConnected()).toBe(false);
  });
});
