import React, { useState } from "react";
import { DeviceType } from "@tomquist/hmjs-ble";

interface FoundDevice {
  device: BluetoothDevice;
  name: string;
  id: string;
}

interface ConnectionPanelProps {
  isConnected: boolean;
  isScanning: boolean;
  connectionStatus: string;
  autoReconnect: boolean;
  selectedDevice: FoundDevice | null;
  allowAnyDevice: boolean;
  deviceType: DeviceType;
  onScan: () => void;
  onDisconnect: () => void;
  onAutoReconnectChange: (checked: boolean) => void;
  onAllowAnyDeviceChange: (checked: boolean) => void;
  onDeviceTypeChange: (type: DeviceType) => void;
}

const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
  isConnected,
  isScanning,
  connectionStatus,
  autoReconnect,
  selectedDevice,
  allowAnyDevice,
  deviceType,
  onScan,
  onDisconnect,
  onAutoReconnectChange,
  onAllowAnyDeviceChange,
  onDeviceTypeChange,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="connection-panel">
      <h2>Device Connection</h2>
      <div className="connection-status">
        <span className={isConnected ? "success" : ""}>{connectionStatus}</span>
      </div>
      <div className="connection-actions">
        <button onClick={onScan} disabled={isScanning}>
          {isConnected ? "Scan for New Device" : "Scan for Device"}
        </button>
        <button onClick={onDisconnect} disabled={!isConnected}>
          Disconnect
        </button>
      </div>
      <div className="current-device">
        {isConnected && selectedDevice ? (
          <span>
            Connected to: <strong>{selectedDevice.name}</strong>
          </span>
        ) : (
          <span>No device connected</span>
        )}
      </div>
      <div className="connection-options">
        <label>
          <input
            type="checkbox"
            checked={autoReconnect}
            onChange={(e) => onAutoReconnectChange(e.target.checked)}
          />
          Auto-reconnect on disconnect
        </label>
      </div>
      <div className="advanced-options">
        <button
          type="button"
          className="advanced-options-toggle"
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced((value) => !value)}
        >
          {showAdvanced ? "▾" : "▸"} Advanced options
        </button>
        {showAdvanced && (
          <div className="advanced-options-content">
            <label>
              <input
                type="checkbox"
                checked={allowAnyDevice}
                onChange={(e) => onAllowAnyDeviceChange(e.target.checked)}
              />
              Connect to any Bluetooth device
            </label>
            <div className="device-type-selector">
              <label htmlFor="device-type-select">Device type:</label>
              <select
                id="device-type-select"
                value={deviceType}
                disabled={isConnected}
                onChange={(e) =>
                  onDeviceTypeChange(e.target.value as DeviceType)
                }
              >
                <option value="b2500">B2500 (default)</option>
                <option value="tronic">Tronic / Lidl (experimental)</option>
              </select>
              {deviceType === "tronic" && (
                <p className="device-type-warning">
                  ⚠️ Experimental: Tronic support is untested and may not work
                  correctly.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectionPanel;
