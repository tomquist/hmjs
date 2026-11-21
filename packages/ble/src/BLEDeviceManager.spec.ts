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
      const reply = manager.request(0x24);
      const text = "ip:10.0.0.2,gate:10.0.0.1,mask:255.0.0.0,dns:10.0.0.1";
      const frame = new Uint8Array(5 + text.length);
      frame.set([0x73, frame.length, 0x23, 0x24]);
      frame.set(new TextEncoder().encode(text), 4);
      await Promise.resolve();
      (
        manager as unknown as { _triggerEvent: (e: string, f: unknown) => void }
      )._triggerEvent("rawData", frame);
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
  });
});
