import React, { useState } from "react";
import { MQTTConfig } from "@tomquist/hmjs-protocol";

interface ConfigurationTabProps {
  isConnected: boolean;
  onSetWifiConfig: (ssid: string, password: string) => void;
  onSetMqttConfig: (config: MQTTConfig) => void;
  onResetMqttConfig: () => void;
}

const ConfigurationTab: React.FC<ConfigurationTabProps> = ({
  isConnected,
  onSetWifiConfig,
  onSetMqttConfig,
  onResetMqttConfig,
}) => {
  // WiFi config state
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");

  // MQTT config state
  const [mqttSsl, setMqttSsl] = useState(false);
  const [mqttHost, setMqttHost] = useState("");
  const [mqttPort, setMqttPort] = useState("1883");
  const [mqttUsername, setMqttUsername] = useState("");
  const [mqttPassword, setMqttPassword] = useState("");

  // Handle setting WiFi config
  const handleSetWifiConfig = () => {
    onSetWifiConfig(wifiSsid, wifiPassword);
  };

  // Handle setting MQTT config
  const handleSetMqttConfig = () => {
    const config: MQTTConfig = {
      ssl: mqttSsl,
      host: mqttHost,
      port: mqttPort,
      username: mqttUsername || undefined,
      password: mqttPassword || undefined,
    };

    onSetMqttConfig(config);
  };

  return (
    <div id="config-tab" className="tab-pane">
      {/* WiFi Configuration */}
      <div id="wifi-container" className="config-section">
        <h2>WiFi Configuration</h2>
        <form id="wifi-form">
          <div className="form-group">
            <label htmlFor="wifi-ssid">SSID:</label>
            <input
              type="text"
              id="wifi-ssid"
              placeholder="WiFi SSID"
              value={wifiSsid}
              onChange={(e) => setWifiSsid(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="wifi-password">Password:</label>
            <input
              type="password"
              id="wifi-password"
              placeholder="WiFi Password"
              value={wifiPassword}
              onChange={(e) => setWifiPassword(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={handleSetWifiConfig}
            disabled={!isConnected}
          >
            Set WiFi Config
          </button>
        </form>
      </div>

      {/* MQTT Configuration */}
      <div id="mqtt-container" className="config-section">
        <h2>MQTT Configuration</h2>
        <form id="mqtt-form">
          <div className="form-group">
            <label htmlFor="ssl">SSL:</label>
            <input
              type="checkbox"
              id="ssl"
              checked={mqttSsl}
              onChange={(e) => setMqttSsl(e.target.checked)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="host">Host:</label>
            <input
              type="text"
              id="host"
              placeholder="MQTT Broker Host"
              value={mqttHost}
              onChange={(e) => setMqttHost(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="port">Port:</label>
            <input
              type="text"
              id="port"
              placeholder="1883"
              value={mqttPort}
              onChange={(e) => setMqttPort(e.target.value)}
              // Restrict to numbers only
              onInput={(e) => {
                e.currentTarget.value = e.currentTarget.value.replace(
                  /[^0-9]/g,
                  "",
                );
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="username">Username:</label>
            <input
              type="text"
              id="username"
              placeholder="MQTT Username"
              value={mqttUsername}
              onChange={(e) => setMqttUsername(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password:</label>
            <input
              type="password"
              id="password"
              placeholder="MQTT Password"
              value={mqttPassword}
              onChange={(e) => setMqttPassword(e.target.value)}
            />
          </div>
          <div className="button-group">
            <button
              type="button"
              onClick={handleSetMqttConfig}
              disabled={!isConnected}
            >
              Set MQTT Config
            </button>
            <button
              type="button"
              onClick={onResetMqttConfig}
              disabled={!isConnected}
            >
              Reset MQTT Config
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConfigurationTab;
