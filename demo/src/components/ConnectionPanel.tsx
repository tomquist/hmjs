import React from "react";

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
  onScan: () => void;
  onDisconnect: () => void;
  onAutoReconnectChange: (checked: boolean) => void;
}

const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
  isConnected,
  isScanning,
  connectionStatus,
  autoReconnect,
  selectedDevice,
  onScan,
  onDisconnect,
  onAutoReconnectChange,
}) => {
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
    </div>
  );
};

export default ConnectionPanel;
