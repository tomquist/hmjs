import React, { useState, useEffect, useRef } from "react";
import { BLEDeviceManager } from "@tomquist/hmjs-ble";
import {
  DeviceInfo,
  RuntimeInfo,
  CellInfo,
  MQTTConfig,
  HMDeviceProtocol,
} from "@tomquist/hmjs-protocol";
import {
  ConnectionPanel,
  DeviceInfoTab,
  RuntimeTab,
  CellInfoTab,
  ConfigurationTab,
  AdvancedTab,
} from "./components";

// Tabs enum
enum TabType {
  DeviceInfo = "device-info-tab",
  Runtime = "runtime-tab",
  CellInfo = "cell-tab",
  Configuration = "config-tab",
  Advanced = "advanced-tab",
}

// Found device interface
interface FoundDevice {
  device: BluetoothDevice;
  name: string;
  id: string;
}

const App: React.FC = () => {
  // State variables
  const [activeTab, setActiveTab] = useState<TabType>(TabType.DeviceInfo);
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Disconnected");
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<FoundDevice | null>(
    null,
  );

  // Track previous active tab for refresh logic
  const prevActiveTabRef = useRef<TabType>(activeTab);

  // Device info states
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [infoStatus, setInfoStatus] = useState("-");
  const [lastUpdateTime, setLastUpdateTime] = useState("-");

  // Runtime info state
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);

  // Cell info state
  const [cellInfo, setCellInfo] = useState<CellInfo | null>(null);

  // Logs state
  const [logs, setLogs] = useState<string[]>([]);

  // Advanced mode state
  const [rawResponses, setRawResponses] = useState<string[]>([]);

  // Device manager ref to maintain instance between renders
  const deviceManagerRef = useRef<BLEDeviceManager | null>(null);

  // Format hex dump for display (similar to hexdump -C)
  const formatHexDump = (data: Uint8Array): string => {
    const lines: string[] = [];

    for (let i = 0; i < data.length; i += 16) {
      const chunk = data.slice(i, i + 16);

      // Offset (8 hex digits)
      const offset = i.toString(16).padStart(8, "0");

      // Hex bytes (16 bytes per line, grouped by 8)
      const hexPart1 = Array.from(chunk.slice(0, 8))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
      const hexPart2 = Array.from(chunk.slice(8, 16))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");

      // Pad hex parts to fixed width
      const paddedHex1 = hexPart1.padEnd(23, " "); // 8 bytes * 2 chars + 7 spaces = 23
      const paddedHex2 = hexPart2.padEnd(23, " ");

      // ASCII representation
      const ascii = Array.from(chunk)
        .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : "."))
        .join("");

      // Combine parts: offset + hex1 + hex2 + ascii
      lines.push(`${offset}  ${paddedHex1} ${paddedHex2} |${ascii}|`);
    }

    return lines.join("\n");
  };

  // Initialize device manager
  useEffect(() => {
    // Log function for device manager
    const logFunction = (message: string, ...args: unknown[]): void => {
      console.log(message, ...args);

      // Format the message if it has replacements
      let formattedMessage = message;
      if (args.length > 0) {
        try {
          // Try to format any objects
          formattedMessage = args.reduce<string>((msg, arg, index) => {
            if (typeof arg === "object") {
              return msg.replace(`{${index}}`, JSON.stringify(arg));
            }
            return msg.replace(`{${index}}`, String(arg));
          }, message);
        } catch {
          // Fallback to basic string concatenation if formatting fails
          formattedMessage = `${message} ${args.join(" ")}`;
        }
      }

      setLogs((prevLogs) => [
        ...prevLogs,
        `${new Date().toLocaleTimeString()} - ${formattedMessage}`,
      ]);
    };

    // Create a new device manager
    deviceManagerRef.current = new BLEDeviceManager({
      autoReconnect: true,
      reconnectDelay: 2000,
      deviceNamePrefix: "HM_",
      logger: logFunction,
    });

    const deviceManager = deviceManagerRef.current;

    // Set up event listeners
    deviceManager.on("connect", (device: BluetoothDevice) => {
      setIsConnected(true);
      setConnectionStatus(`Connected to ${device.name || "device"}`);

      // Update the selected device if needed
      const newDevice = {
        device,
        name: device.name || "Unknown Device",
        id: device.id || "unknown",
      };
      setSelectedDevice(newDevice);

      // Automatically get device info
      setTimeout(async () => {
        try {
          // Log connection state for debugging
          logFunction(
            `Connection state before getDeviceInfo: isConnected=${deviceManager.isConnected()}`,
          );

          await deviceManager.getDeviceInfo();

          // Ensure connection state remains true even if the internal flag gets reset
          setIsConnected(true);

          // Log connection state after successful device info retrieval
          logFunction(
            `Connection state after getDeviceInfo: isConnected=${deviceManager.isConnected()}`,
          );
        } catch (error) {
          logFunction(
            `Error getting initial device info: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }, 1000);
    });

    deviceManager.on("disconnect", () => {
      setIsConnected(false);
      setConnectionStatus("Disconnected");

      // Clear all device data when device disconnects
      setDeviceInfo(null);
      setRuntimeInfo(null);
      setCellInfo(null);
      setInfoStatus("-");
      setLastUpdateTime("-");
      setSelectedDevice(null);
      setRawResponses([]);
    });

    deviceManager.on("reconnect", (device: BluetoothDevice) => {
      setIsConnected(true);
      setConnectionStatus(`Reconnected to ${device.name || "device"}`);

      setSelectedDevice({
        device,
        name: device.name || "Unknown Device",
        id: device.id || "unknown",
      });
    });

    deviceManager.on("error", (error: Error) => {
      logFunction(`Error: ${error.message}`);
    });

    deviceManager.on("deviceInfo", (info: DeviceInfo) => {
      logFunction("Received device info: " + JSON.stringify(info));
      setDeviceInfo(info);
      setInfoStatus("Success");
      setLastUpdateTime(new Date().toLocaleTimeString());
    });

    deviceManager.on("runtimeInfo", (info: RuntimeInfo) => {
      logFunction("Received runtime info");
      setRuntimeInfo(info);
    });

    deviceManager.on("cellInfo", (info: CellInfo) => {
      logFunction(
        `Received cell info: SOC=${info.soc}%, Temp=${info.temperature1}°C, Cells=${info.cellVoltages.length}`,
      );
      setCellInfo(info);
    });

    deviceManager.on("rawData", (data: Uint8Array) => {
      const timestamp = new Date().toLocaleTimeString();
      const hexDump = formatHexDump(data);
      setRawResponses((prevResponses) => [
        ...prevResponses,
        `${timestamp} - ${hexDump}`,
      ]);
    });

    // Check if Web Bluetooth API is supported
    if (!navigator.bluetooth) {
      logFunction("Web Bluetooth API is not supported in this browser");
      alert(
        "Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Opera.",
      );
      setConnectionStatus("Bluetooth not supported in this browser");
    }

    // Clean up event listeners on unmount
    return () => {
      // No need to clean up event listeners since they'll be garbage collected
      // when the device manager instance is no longer referenced
    };
  }, []);

  // Update device manager when autoReconnect changes
  useEffect(() => {
    if (deviceManagerRef.current) {
      deviceManagerRef.current.setAutoReconnect(autoReconnect);
    }
  }, [autoReconnect]);

  // Refresh data when tab changes
  useEffect(() => {
    if (isConnected && prevActiveTabRef.current !== activeTab) {
      // Runtime tab
      if (activeTab === TabType.Runtime) {
        getRuntimeInfo();
      }
      // Cell Info tab
      else if (activeTab === TabType.CellInfo) {
        getCellInfo();
      }
    }

    // Update previous tab reference
    prevActiveTabRef.current = activeTab;
  }, [activeTab, isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scan for devices and connect automatically
  const scanForDevices = async () => {
    try {
      // If already connected, disconnect first
      if (isConnected && deviceManagerRef.current) {
        await deviceManagerRef.current.disconnect();
      }

      // Clear all device data when starting a new scan
      setDeviceInfo(null);
      setRuntimeInfo(null);
      setCellInfo(null);
      setInfoStatus("-");
      setLastUpdateTime("-");

      setConnectionStatus("Scanning for devices...");
      setIsScanning(true);

      try {
        if (deviceManagerRef.current) {
          // Use the BLE package's scanForDevices method
          const device = await deviceManagerRef.current.scanForDevices();

          // Only proceed if we have a valid device
          if (device.id && device.name) {
            const newDevice = {
              device,
              name: device.name,
              id: device.id,
            };

            // Store selected device
            setSelectedDevice(newDevice);

            // Connect to the device immediately
            setInfoStatus("Connecting...");
            setConnectionStatus(`Connecting to ${newDevice.name}...`);

            await deviceManagerRef.current.connect(device);
          } else {
            setConnectionStatus("No devices found");
          }
        }
      } catch (e) {
        addLog(`Scanning error: ${e instanceof Error ? e.message : String(e)}`);
        setConnectionStatus("Scan canceled or failed");
      }

      setIsScanning(false);
    } catch (error) {
      addLog(
        `Scan failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      setConnectionStatus("Scan Failed");
      setIsScanning(false);
    }
  };

  // Disconnect from device
  const disconnectFromDevice = () => {
    if (deviceManagerRef.current) {
      deviceManagerRef.current.disconnect();

      // Clear all device data when disconnecting
      setDeviceInfo(null);
      setRuntimeInfo(null);
      setCellInfo(null);
      setInfoStatus("-");
      setLastUpdateTime("-");
      setSelectedDevice(null);
      setConnectionStatus("Disconnected");
      setIsConnected(false);
      setRawResponses([]);
    }
  };

  // Get device info
  const getDeviceInfo = async () => {
    try {
      setInfoStatus("Fetching...");

      if (deviceManagerRef.current) {
        const deviceManager = deviceManagerRef.current;

        // Log connection state before request
        addLog(
          `Connection state before getDeviceInfo: isConnected=${deviceManager.isConnected()}`,
        );

        // If device is not connected according to device manager but our state says it is, try to reconnect
        if (
          !deviceManager.isConnected() &&
          isConnected &&
          (deviceManager as any)._selectedDevice
        ) {
          addLog("Connection state mismatch - attempting to reconnect...");
          const savedDevice = (deviceManager as any)._selectedDevice.device;
          try {
            await deviceManager.connect(savedDevice);
            addLog("Reconnection successful");
          } catch (reconnectError) {
            addLog(
              `Reconnection failed: ${reconnectError instanceof Error ? reconnectError.message : String(reconnectError)}`,
            );
            setIsConnected(false);
            setInfoStatus("Failed - Disconnected");
            throw new Error("Failed to reconnect to device");
          }
        }

        addLog(`Sending getDeviceInfo command...`);
        await deviceManager.getDeviceInfo();

        // Always ensure our connection state is synchronized
        setIsConnected(true);
      }
    } catch (error) {
      addLog(
        `Error getting device info: ${error instanceof Error ? error.message : String(error)}`,
      );
      setInfoStatus("Failed");
    }
  };

  // Get runtime info
  const getRuntimeInfo = async () => {
    try {
      if (deviceManagerRef.current) {
        const deviceManager = deviceManagerRef.current;

        // Log connection state before request
        addLog(
          `Connection state before getRuntimeInfo: isConnected=${deviceManager.isConnected()}`,
        );

        // If device is not connected according to device manager but our state says it is, try to reconnect
        if (
          !deviceManager.isConnected() &&
          isConnected &&
          (deviceManager as any)._selectedDevice
        ) {
          addLog("Connection state mismatch - attempting to reconnect...");
          const savedDevice = (deviceManager as any)._selectedDevice.device;
          try {
            await deviceManager.connect(savedDevice);
            addLog("Reconnection successful");
          } catch (reconnectError) {
            addLog(
              `Reconnection failed: ${reconnectError instanceof Error ? reconnectError.message : String(reconnectError)}`,
            );
            setIsConnected(false);
            throw new Error("Failed to reconnect to device");
          }
        }

        addLog(`Sending getRuntimeInfo command...`);
        await deviceManager.getRuntimeInfo();

        // Log success
        addLog(`Runtime info request successful`);

        // Always ensure our connection state is synchronized
        setIsConnected(true);
      }
    } catch (error) {
      addLog(
        `Error getting runtime info: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Get cell info
  const getCellInfo = async () => {
    try {
      if (deviceManagerRef.current) {
        const deviceManager = deviceManagerRef.current;

        // Log connection state before request
        addLog(
          `Connection state before getCellInfo: isConnected=${deviceManager.isConnected()}`,
        );

        // If device is not connected according to device manager but our state says it is, try to reconnect
        if (
          !deviceManager.isConnected() &&
          isConnected &&
          (deviceManager as any)._selectedDevice
        ) {
          addLog("Connection state mismatch - attempting to reconnect...");
          const savedDevice = (deviceManager as any)._selectedDevice.device;
          try {
            await deviceManager.connect(savedDevice);
            addLog("Reconnection successful");
          } catch (reconnectError) {
            addLog(
              `Reconnection failed: ${reconnectError instanceof Error ? reconnectError.message : String(reconnectError)}`,
            );
            setIsConnected(false);
            throw new Error("Failed to reconnect to device");
          }
        }

        addLog(`Sending getCellInfo command...`);
        await deviceManager.getCellInfo();

        // Log success
        addLog(`Cell info request successful`);

        // Always ensure our connection state is synchronized
        setIsConnected(true);
      }
    } catch (error) {
      addLog(
        `Error getting cell info: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Set WiFi config
  const setWifiConfig = async (ssid: string, password: string) => {
    if (!ssid) {
      alert("SSID is required");
      return;
    }

    if (!password) {
      alert("Password is required");
      return;
    }

    // Confirm before sending
    if (
      !confirm(
        `Are you sure you want to set WiFi to:\nSSID: ${ssid}\nPassword: [hidden]`,
      )
    ) {
      return;
    }

    try {
      if (deviceManagerRef.current) {
        const deviceManager = deviceManagerRef.current;

        // Log connection state before request
        addLog(
          `Connection state before setWifiConfig: isConnected=${deviceManager.isConnected()}`,
        );

        // If device is not connected according to device manager but our state says it is, try to reconnect
        if (
          !deviceManager.isConnected() &&
          isConnected &&
          (deviceManager as any)._selectedDevice
        ) {
          addLog("Connection state mismatch - attempting to reconnect...");
          const savedDevice = (deviceManager as any)._selectedDevice.device;
          try {
            await deviceManager.connect(savedDevice);
            addLog("Reconnection successful");
          } catch (reconnectError) {
            addLog(
              `Reconnection failed: ${reconnectError instanceof Error ? reconnectError.message : String(reconnectError)}`,
            );
            setIsConnected(false);
            throw new Error("Failed to reconnect to device");
          }
        }

        addLog(`Sending setWifiConfig command...`);
        await deviceManager.setWifiConfig(ssid, password);

        addLog("WiFi configuration sent successfully");
        alert("WiFi configuration set successfully");

        // Always ensure our connection state is synchronized
        setIsConnected(true);
      }
    } catch (error) {
      addLog(
        `Error setting WiFi config: ${error instanceof Error ? error.message : String(error)}`,
      );
      alert(
        `Failed to set WiFi configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Set MQTT config
  const setMqttConfig = async (config: MQTTConfig) => {
    if (!config.host) {
      alert("Host is required");
      return;
    }

    if (!config.port) {
      alert("Port is required");
      return;
    }

    // Confirm before sending
    if (
      !confirm(
        `Are you sure you want to set MQTT to:\nHost: ${config.host}\nPort: ${config.port}\nSSL: ${config.ssl ? "Yes" : "No"}\nUsername: ${config.username || "[none]"}\nPassword: ${config.password ? "[hidden]" : "[none]"}`,
      )
    ) {
      return;
    }

    try {
      if (deviceManagerRef.current) {
        const deviceManager = deviceManagerRef.current;

        // Log connection state before request
        addLog(
          `Connection state before setMqttConfig: isConnected=${deviceManager.isConnected()}`,
        );

        // If device is not connected according to device manager but our state says it is, try to reconnect
        if (
          !deviceManager.isConnected() &&
          isConnected &&
          (deviceManager as any)._selectedDevice
        ) {
          addLog("Connection state mismatch - attempting to reconnect...");
          const savedDevice = (deviceManager as any)._selectedDevice.device;
          try {
            await deviceManager.connect(savedDevice);
            addLog("Reconnection successful");
          } catch (reconnectError) {
            addLog(
              `Reconnection failed: ${reconnectError instanceof Error ? reconnectError.message : String(reconnectError)}`,
            );
            setIsConnected(false);
            throw new Error("Failed to reconnect to device");
          }
        }

        addLog(`Sending setMqttConfig command...`);
        await deviceManager.setMqttConfig(config);

        addLog("MQTT configuration sent successfully");
        alert("MQTT configuration set successfully");

        // Always ensure our connection state is synchronized
        setIsConnected(true);
      }
    } catch (error) {
      addLog(
        `Error setting MQTT config: ${error instanceof Error ? error.message : String(error)}`,
      );
      alert(
        `Failed to set MQTT configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Reset MQTT config
  const resetMqttConfig = async () => {
    // Confirm before sending
    if (!confirm("Are you sure you want to reset the MQTT configuration?")) {
      return;
    }

    try {
      if (deviceManagerRef.current) {
        const deviceManager = deviceManagerRef.current;

        // Log connection state before request
        addLog(
          `Connection state before resetMqttConfig: isConnected=${deviceManager.isConnected()}`,
        );

        // If device is not connected according to device manager but our state says it is, try to reconnect
        if (
          !deviceManager.isConnected() &&
          isConnected &&
          (deviceManager as any)._selectedDevice
        ) {
          addLog("Connection state mismatch - attempting to reconnect...");
          const savedDevice = (deviceManager as any)._selectedDevice.device;
          try {
            await deviceManager.connect(savedDevice);
            addLog("Reconnection successful");
          } catch (reconnectError) {
            addLog(
              `Reconnection failed: ${reconnectError instanceof Error ? reconnectError.message : String(reconnectError)}`,
            );
            setIsConnected(false);
            throw new Error("Failed to reconnect to device");
          }
        }

        addLog(`Sending resetMqttConfig command...`);
        await deviceManager.resetMqttConfig();

        addLog("MQTT configuration reset successfully");
        alert("MQTT configuration reset successfully");

        // Always ensure our connection state is synchronized
        setIsConnected(true);
      }
    } catch (error) {
      addLog(
        `Error resetting MQTT config: ${error instanceof Error ? error.message : String(error)}`,
      );
      alert(
        `Failed to reset MQTT configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Convert hex string to bytes
  const parseHexString = (hexString: string): Uint8Array => {
    // Clean up the hex string - remove spaces and 0x prefixes
    const cleanHex = hexString.replace(/\s+/g, "").replace(/0x/gi, "");

    // Validate hex string
    if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
      throw new Error(
        "Invalid hex string - must contain only hex characters (0-9, A-F)",
      );
    }

    if (cleanHex.length % 2 !== 0) {
      throw new Error(
        "Invalid hex string - must have even number of characters",
      );
    }

    // Convert to byte array
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }

    return bytes;
  };

  // Build command from command type and payload
  const buildCommand = (
    commandType: string,
    payload: string,
    payloadType: "hex" | "string" = "hex",
  ): string => {
    // Parse command type (hex or decimal)
    let cmdType: number;
    if (commandType.startsWith("0x") || commandType.startsWith("0X")) {
      cmdType = parseInt(commandType, 16);
    } else if (/^[0-9a-fA-F]+$/.test(commandType) && commandType.length <= 2) {
      cmdType = parseInt(commandType, 16);
    } else {
      cmdType = parseInt(commandType, 10);
    }

    if (isNaN(cmdType) || cmdType < 0 || cmdType > 255) {
      throw new Error(
        "Invalid command type - must be 0-255 (decimal) or 0x00-0xFF (hex)",
      );
    }

    // Parse payload if provided
    let payloadBytes: Uint8Array | null = null;
    if (payload.trim()) {
      if (payloadType === "string") {
        // Convert string to UTF-8 bytes
        const encoder = new TextEncoder();
        payloadBytes = encoder.encode(payload);
      } else {
        // Parse as hex string
        payloadBytes = parseHexString(payload.trim());
      }
    }

    // Create command using protocol
    const protocol = new HMDeviceProtocol();
    const commandBytes = protocol.createCommandMessage(cmdType, payloadBytes);

    // Convert to hex string for display
    return Array.from(commandBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
  };

  // Send raw hex command
  const sendRawCommand = async (hexString: string) => {
    if (!deviceManagerRef.current) {
      throw new Error("Device manager not initialized");
    }

    if (!isConnected) {
      throw new Error("Not connected to device");
    }

    // Parse hex string in the UI layer
    const bytes = parseHexString(hexString);

    addLog(`Sending raw command: ${hexString}`);
    await deviceManagerRef.current.sendRawBytes(bytes);
  };

  // Add log message
  const addLog = (message: string) => {
    setLogs((prevLogs) => [
      ...prevLogs,
      `${new Date().toLocaleTimeString()} - ${message}`,
    ]);
  };

  // Clear logs
  const clearLogs = () => {
    setLogs([]);
    addLog("Logs cleared");
  };

  return (
    <div className="container">
      <header>
        <h1>B2500 BLE Tool</h1>
        <p>Connect to your B2500 device and manage its settings.</p>
      </header>

      <ConnectionPanel
        isConnected={isConnected}
        isScanning={isScanning}
        connectionStatus={connectionStatus}
        autoReconnect={autoReconnect}
        selectedDevice={selectedDevice}
        onScan={scanForDevices}
        onDisconnect={disconnectFromDevice}
        onAutoReconnectChange={setAutoReconnect}
      />

      <div className="tabs">
        <button
          className={`tab-button ${activeTab === TabType.DeviceInfo ? "active" : ""}`}
          onClick={() => setActiveTab(TabType.DeviceInfo)}
        >
          Device Info
        </button>
        <button
          className={`tab-button ${activeTab === TabType.Runtime ? "active" : ""}`}
          onClick={() => setActiveTab(TabType.Runtime)}
        >
          Runtime
        </button>
        <button
          className={`tab-button ${activeTab === TabType.CellInfo ? "active" : ""}`}
          onClick={() => setActiveTab(TabType.CellInfo)}
        >
          Cell Info
        </button>
        <button
          className={`tab-button ${activeTab === TabType.Configuration ? "active" : ""}`}
          onClick={() => setActiveTab(TabType.Configuration)}
        >
          Configuration
        </button>
        <button
          className={`tab-button ${activeTab === TabType.Advanced ? "active" : ""}`}
          onClick={() => setActiveTab(TabType.Advanced)}
        >
          🔧 Advanced
        </button>
      </div>

      <div className="tab-content">
        {activeTab === TabType.DeviceInfo && (
          <DeviceInfoTab
            deviceInfo={deviceInfo}
            infoStatus={infoStatus}
            lastUpdateTime={lastUpdateTime}
            isConnected={isConnected}
            onGetInfo={getDeviceInfo}
          />
        )}

        {activeTab === TabType.Runtime && (
          <RuntimeTab
            runtimeInfo={runtimeInfo}
            isConnected={isConnected}
            onGetRuntimeInfo={getRuntimeInfo}
          />
        )}

        {activeTab === TabType.CellInfo && (
          <CellInfoTab
            cellInfo={cellInfo}
            isConnected={isConnected}
            onGetCellInfo={getCellInfo}
          />
        )}

        {activeTab === TabType.Configuration && (
          <ConfigurationTab
            isConnected={isConnected}
            onSetWifiConfig={setWifiConfig}
            onSetMqttConfig={setMqttConfig}
            onResetMqttConfig={resetMqttConfig}
          />
        )}

        {activeTab === TabType.Advanced && (
          <AdvancedTab
            isConnected={isConnected}
            onSendRawCommand={sendRawCommand}
            onBuildCommand={buildCommand}
            rawResponses={rawResponses}
          />
        )}
      </div>

      {/* Logs Panel - Always visible */}
      <div className="logs-panel">
        <div className="logs-header">
          <h2>Debug Logs</h2>
          <button onClick={clearLogs} className="clear-logs-button">
            Clear Logs
          </button>
        </div>
        <div
          className="logs"
          ref={(el) => {
            // Auto-scroll to bottom when logs update
            if (el) {
              el.scrollTop = el.scrollHeight;
            }
          }}
        >
          {logs.map((log, index) => (
            <div key={index}>{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;
