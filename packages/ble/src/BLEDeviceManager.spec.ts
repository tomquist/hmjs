import { BLEDeviceManager } from "./BLEDeviceManager.js";

describe("BLEDeviceManager", () => {
  it("should instantiate without error", () => {
    const manager = new BLEDeviceManager();
    expect(manager).toBeInstanceOf(BLEDeviceManager);
  });

  describe("sendRawBytes", () => {
    const connectWithCharacteristic = (
      characteristic: Record<string, unknown>,
    ): BLEDeviceManager => {
      const manager = new BLEDeviceManager();
      // Inject connection state to exercise the write path directly.
      const internals = manager as unknown as {
        connected: boolean;
        commandCharacteristic: unknown;
      };
      internals.connected = true;
      internals.commandCharacteristic = characteristic;
      return manager;
    };

    it("prefers writeValueWithoutResponse when available", async () => {
      const writeValueWithoutResponse = jest.fn().mockResolvedValue(undefined);
      const writeValue = jest.fn().mockResolvedValue(undefined);
      const manager = connectWithCharacteristic({
        writeValueWithoutResponse,
        writeValue,
      });

      const bytes = new Uint8Array([0x01, 0x02]);
      await manager.sendRawBytes(bytes);

      expect(writeValueWithoutResponse).toHaveBeenCalledWith(bytes);
      expect(writeValue).not.toHaveBeenCalled();
    });

    it("falls back to writeValue when writeValueWithoutResponse is unavailable", async () => {
      // Simulates older Web Bluetooth implementations such as Bluefy on iOS.
      const writeValue = jest.fn().mockResolvedValue(undefined);
      const manager = connectWithCharacteristic({ writeValue });

      const bytes = new Uint8Array([0x01, 0x02]);
      await manager.sendRawBytes(bytes);

      expect(writeValue).toHaveBeenCalledWith(bytes);
    });

    it("throws when no write method is supported", async () => {
      const manager = connectWithCharacteristic({});

      await expect(
        manager.sendRawBytes(new Uint8Array([0x01])),
      ).rejects.toThrow(/does not support writing/);
    });
  });

  describe("restartDevice", () => {
    const connectedManager = (
      writeValueWithoutResponse: jest.Mock,
    ): BLEDeviceManager => {
      const manager = new BLEDeviceManager();
      const internals = manager as unknown as {
        connected: boolean;
        commandCharacteristic: unknown;
      };
      internals.connected = true;
      internals.commandCharacteristic = { writeValueWithoutResponse };
      return manager;
    };

    it("writes the restart frame once", async () => {
      // Commands are repeated for reliability by default, but the device can
      // drop the link after the first restart frame, which would turn a
      // successful restart into a rejected promise.
      const write = jest.fn().mockResolvedValue(undefined);
      await connectedManager(write).restartDevice();

      expect(write).toHaveBeenCalledTimes(1);
      expect(Array.from(write.mock.calls[0][0] as Uint8Array)).toEqual([
        0x73, 0x06, 0x23, 0x25, 0x01, 0x72,
      ]);
    });

    it("still repeats other commands", async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      await connectedManager(write).setAdaptiveMode(true);

      expect(write).toHaveBeenCalledTimes(2);
    });
  });

  describe("device families", () => {
    const connected = (
      family: string | undefined,
      write: jest.Mock = jest.fn().mockResolvedValue(undefined),
    ): BLEDeviceManager => {
      const manager = new BLEDeviceManager({ logger: () => {} });
      const internals = manager as unknown as {
        connected: boolean;
        commandCharacteristic: unknown;
        family: string | undefined;
      };
      internals.connected = true;
      internals.commandCharacteristic = { writeValueWithoutResponse: write };
      internals.family = family;
      return manager;
    };

    /** A frame with its length byte and checksum, as the device sends it. */
    const frameOf = (command: number, payload: number[]): Uint8Array => {
      const f = new Uint8Array(5 + payload.length);
      f.set([0x73, f.length, 0x23, command, ...payload]);
      f[f.length - 1] = f.subarray(0, -1).reduce((a, b) => a ^ b, 0);
      return f;
    };

    /** Deliver `frame` as a notification on the status characteristic. */
    const notify = (manager: BLEDeviceManager, frame: Uint8Array) => {
      const m = manager as unknown as {
        statusCharacteristic: unknown;
        _handleStatusNotification: (e: unknown) => void;
      };
      m.statusCharacteristic = { value: new DataView(frame.slice().buffer) };
      m._handleStatusNotification({});
    };

    it("offers every Marstek device in the picker by default", async () => {
      const requestDevice = jest
        .fn()
        .mockRejectedValue(new Error("cancelled by test"));
      const manager = new BLEDeviceManager({
        logger: () => {},
        bluetooth: { requestDevice } as unknown as Bluetooth,
      });
      await expect(manager.scanForDevices()).rejects.toThrow();
      const prefixes = requestDevice.mock.calls[0][0].filters.map(
        (f: { namePrefix: string }) => f.namePrefix,
      );
      expect(prefixes).toEqual(
        expect.arrayContaining([
          "HM_",
          "MST_ACCP_",
          "MST_VNSE3_",
          "MARS_VNSEM_",
          "MST_AIOS_",
          "MST-SMR_",
        ]),
      );
    });

    it("keeps an explicit name prefix", async () => {
      const requestDevice = jest
        .fn()
        .mockRejectedValue(new Error("cancelled by test"));
      const manager = new BLEDeviceManager({
        logger: () => {},
        deviceNamePrefix: "HM_",
        bluetooth: { requestDevice } as unknown as Bluetooth,
      });
      await expect(manager.scanForDevices()).rejects.toThrow();
      expect(requestDevice.mock.calls[0][0].filters).toEqual([
        { namePrefix: "HM_" },
      ]);
    });

    it("refuses B2500 commands on other families", async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      await expect(
        connected("venus", write).setChargeMode(0x01),
      ).rejects.toThrow(/B2500 command/);
      expect(write).not.toHaveBeenCalled();
    });

    it("restarts with each family's command, where there is one", async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      await connected("venusMini", write).restartDevice();
      expect(write).toHaveBeenCalledTimes(1);
      expect(Array.from(write.mock.calls[0][0] as Uint8Array)).toEqual([
        0x73,
        0x06,
        0x23,
        0x2b,
        0x01,
        0x73 ^ 0x06 ^ 0x23 ^ 0x2b ^ 0x01,
      ]);
      await expect(connected("venus3", write).restartDevice()).rejects.toThrow(
        /not supported/,
      );
    });

    it("still sends B2500 commands when the family is unknown", async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      await connected(undefined, write).setAdaptiveMode(true);
      expect(write).toHaveBeenCalled();
    });

    it("sets the depth of discharge with the family's command", async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      await connected("venus3", write).setDepthOfDischarge(80);
      expect(Array.from(write.mock.calls[0][0] as Uint8Array)).toEqual([
        0x73,
        0x06,
        0x23,
        0x54,
        80,
        0x73 ^ 0x06 ^ 0x23 ^ 0x54 ^ 80,
      ]);

      const b2500 = jest.fn().mockResolvedValue(undefined);
      await connected("b2500", b2500).setDepthOfDischarge(80);
      expect((b2500.mock.calls[0][0] as Uint8Array)[3]).toBe(0x0b);
    });

    it("refuses commands that start a Wi-Fi module firmware update", async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      await expect(
        connected("venusMini", write).sendRawBytes(
          new Uint8Array([0x73, 0x05, 0x23, 0x17, 0x42]),
        ),
      ).rejects.toThrow(/firmware update/);
      await expect(
        connected("meter", write).request(0x29, [0x01]),
      ).rejects.toThrow(/firmware update/);
      expect(write).not.toHaveBeenCalled();
    });

    it("resolves a request with the decoded reply", async () => {
      const manager = connected("venusMini");
      // what a rawData listener does with its frame cannot touch the reply
      manager.on("rawData", (f: Uint8Array) => f.fill(0));
      const reply = manager.request(0x24);
      const text = "ip:10.0.0.2,gate:10.0.0.1,mask:255.0.0.0,dns:10.0.0.1";
      await Promise.resolve();
      notify(manager, frameOf(0x24, [...new TextEncoder().encode(text)]));
      await expect(reply).resolves.toEqual({
        kind: "networkInfo",
        command: 0x24,
        data: {
          ip: "10.0.0.2",
          gateway: "10.0.0.1",
          netmask: "255.0.0.0",
          dns: "10.0.0.1",
        },
      });
    });

    it("rejects a read whose connection ends before the reply", async () => {
      const manager = connected("venusMini");
      const reply = manager.request(0x24);
      await Promise.resolve();
      (manager as unknown as { onDisconnected: () => void }).onDisconnected();
      await expect(reply).rejects.toThrow(/Disconnected/);
    });

    it("sends the meters' SSID query with its payload", async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      const manager = connected("meter", write);
      const ssid = manager.getWifiSsid();
      await Promise.resolve();
      expect(Array.from(write.mock.calls[0][0] as Uint8Array)).toEqual([
        0x73, 0x06, 0x23, 0x08, 0x01, 0x5f,
      ]);
      notify(manager, frameOf(0x08, [...new TextEncoder().encode("Home")]));
      await expect(ssid).resolves.toBe("Home");
    });

    it("sends CT002 and CT003 commands only to that meter", async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      const manager = connected("meter", write);
      const internals = manager as unknown as { meterVariant?: string };
      await expect(manager.calibrateMeterZero()).rejects.toThrow(/not known/);
      internals.meterVariant = "ct003";
      await expect(manager.setMeterDirection(1)).rejects.toThrow(/CT002/);
      await expect(manager.calibrateMeterZero()).rejects.toThrow(/CT002/);
      internals.meterVariant = "ct002";
      await expect(
        manager.setMeterReader({
          interface: 1,
          serialCode: 0,
          protocol: 1,
          meterNumber: 1,
        }),
      ).rejects.toThrow(/CT003/);
      expect(write).not.toHaveBeenCalled();
      await manager.calibrateMeterZero();
      expect(write).toHaveBeenCalled();
    });

    it("drops a pending reconnect when the caller disconnects", async () => {
      const gattConnect = jest.fn().mockRejectedValue(new Error("no"));
      const manager = new BLEDeviceManager({
        logger: () => {},
        reconnectDelay: 10,
      });
      const internals = manager as unknown as {
        connected: boolean;
        device: unknown;
        onDisconnected: () => void;
      };
      internals.connected = true;
      internals.device = { gatt: { connect: gattConnect, connected: false } };
      internals.onDisconnected(); // the device went away: reconnect scheduled
      manager.disconnect(); // the caller is done with it
      await new Promise((r) => setTimeout(r, 50));
      expect(gattConnect).not.toHaveBeenCalled();
    });

    it("scans for the Tronic name after setDeviceType", async () => {
      const requestDevice = jest
        .fn()
        .mockRejectedValue(new Error("cancelled by test"));
      const manager = new BLEDeviceManager({
        logger: () => {},
        bluetooth: { requestDevice } as unknown as Bluetooth,
      });
      manager.setDeviceType("tronic");
      await expect(manager.scanForDevices()).rejects.toThrow();
      expect(requestDevice.mock.calls[0][0].filters).toEqual([
        { namePrefix: "HM_" },
      ]);
    });

    it("refuses to switch adaptive mode off, which would switch it on", async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      await expect(
        connected("b2500", write).setAdaptiveMode(false),
      ).rejects.toThrow(/write the timers/);
      expect(write).not.toHaveBeenCalled();
    });

    it("sends the B2500 surplus feed-in inverted", async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      await connected("b2500", write).setSurplusFeedIn(true);
      expect(
        Array.from(write.mock.calls[0][0] as Uint8Array).slice(3, 5),
      ).toEqual([0x35, 0x00]);
    });

    it("never sends the B2500 Wi-Fi query to a meter, where 0x09 restarts it", async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      await expect(connected("meter", write).getWifiSignal()).rejects.toThrow(
        /B2500 command/,
      );
      expect(write).not.toHaveBeenCalled();
    });

    it("factory-resets each family with its own command", async () => {
      const meter = jest.fn().mockResolvedValue(undefined);
      await connected("meter", meter).factoryReset();
      expect((meter.mock.calls[0][0] as Uint8Array)[3]).toBe(0x06);
      const b2500 = jest.fn().mockResolvedValue(undefined);
      await connected("b2500", b2500).factoryReset();
      expect((b2500.mock.calls[0][0] as Uint8Array)[3]).toBe(0x26);
      expect(b2500).toHaveBeenCalledTimes(1);
      await expect(connected("venus3", b2500).factoryReset()).rejects.toThrow();
    });

    it("refuses the B2500's Wi-Fi module update command", async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      await expect(
        connected("b2500", write).sendRawBytes(
          new Uint8Array([0x73, 0x06, 0x23, 0x24, 0x01, 0x71]),
        ),
      ).rejects.toThrow(/firmware update/);
    });
  });
});
