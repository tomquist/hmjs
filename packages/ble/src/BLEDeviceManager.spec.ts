import { BLEDeviceManager } from "./BLEDeviceManager.js";

describe("BLEDeviceManager", () => {
  it("should instantiate without error", () => {
    const manager = new BLEDeviceManager();
    expect(manager).toBeInstanceOf(BLEDeviceManager);
  });

  describe("writing to the command characteristic", () => {
    const bytes = new Uint8Array([0x01, 0x02]);

    function connectWith(characteristic: unknown): BLEDeviceManager {
      const manager = new BLEDeviceManager();
      const internal = manager as unknown as {
        connected: boolean;
        commandCharacteristic: unknown;
      };
      internal.connected = true;
      internal.commandCharacteristic = characteristic;
      return manager;
    }

    it("uses writeValueWithoutResponse when available", async () => {
      const writeValueWithoutResponse = jest.fn().mockResolvedValue(undefined);
      const writeValue = jest.fn().mockResolvedValue(undefined);
      const manager = connectWith({ writeValueWithoutResponse, writeValue });

      await manager.sendRawBytes(bytes);

      expect(writeValueWithoutResponse).toHaveBeenCalledWith(bytes);
      expect(writeValue).not.toHaveBeenCalled();
    });

    it("falls back to writeValue when writeValueWithoutResponse is missing", async () => {
      const writeValue = jest.fn().mockResolvedValue(undefined);
      const manager = connectWith({ writeValue });

      await manager.sendRawBytes(bytes);

      expect(writeValue).toHaveBeenCalledWith(bytes);
    });

    it("throws when no write method is supported", async () => {
      const manager = connectWith({});

      await expect(manager.sendRawBytes(bytes)).rejects.toThrow(
        /does not support writing/i,
      );
    });
  });
});
