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
});
