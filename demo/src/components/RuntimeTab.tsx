import React from "react";
import { RuntimeInfo } from "@tomquist/hmjs-protocol";

interface RuntimeTabProps {
  runtimeInfo: RuntimeInfo | null;
  isConnected: boolean;
  onGetRuntimeInfo: () => void;
}

const RuntimeTab: React.FC<RuntimeTabProps> = ({
  runtimeInfo,
  isConnected,
  onGetRuntimeInfo,
}) => {
  return (
    <div id="runtime-tab" className="tab-pane">
      <div id="runtime-info-container">
        <h2>Runtime Information</h2>
        <button onClick={onGetRuntimeInfo} disabled={!isConnected}>
          Get Runtime Info
        </button>

        {runtimeInfo && (
          <div className="device-info">
            <table className="info-table">
              <tbody>
                {/* Battery info */}
                <tr>
                  <td>
                    <strong>Battery Level</strong>
                  </td>
                  <td>{runtimeInfo.soc / 10}%</td>
                </tr>
                <tr>
                  <td>
                    <strong>Remaining Capacity</strong>
                  </td>
                  <td>{runtimeInfo.remainingCapacity}Wh</td>
                </tr>

                {/* Input power */}
                <tr>
                  <td>
                    <strong>Input 1 Status</strong>
                  </td>
                  <td>
                    {runtimeInfo.in1Active.active ? "Active" : "Inactive"}
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Input 1 Power</strong>
                  </td>
                  <td>{runtimeInfo.in1Power}W</td>
                </tr>
                <tr>
                  <td>
                    <strong>Input 2 Status</strong>
                  </td>
                  <td>
                    {runtimeInfo.in2Active.active ? "Active" : "Inactive"}
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Input 2 Power</strong>
                  </td>
                  <td>{runtimeInfo.in2Power}W</td>
                </tr>

                {/* Output power */}
                <tr>
                  <td>
                    <strong>Output 1 Status</strong>
                  </td>
                  <td>{runtimeInfo.out1Active ? "Active" : "Inactive"}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Output 1 Power</strong>
                  </td>
                  <td>{runtimeInfo.out1Power}W</td>
                </tr>
                <tr>
                  <td>
                    <strong>Output 2 Status</strong>
                  </td>
                  <td>{runtimeInfo.out2Active ? "Active" : "Inactive"}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Output 2 Power</strong>
                  </td>
                  <td>{runtimeInfo.out2Power}W</td>
                </tr>

                {/* Temperature */}
                <tr>
                  <td>
                    <strong>Temperature Low</strong>
                  </td>
                  <td>{runtimeInfo.temperatureLow}°C</td>
                </tr>
                <tr>
                  <td>
                    <strong>Temperature High</strong>
                  </td>
                  <td>{runtimeInfo.temperatureHigh}°C</td>
                </tr>

                {/* Device info */}
                <tr>
                  <td>
                    <strong>Device Version</strong>
                  </td>
                  <td>
                    {runtimeInfo.devVersion}
                    {runtimeInfo.deviceSubVersion
                      ? `.${runtimeInfo.deviceSubVersion}`
                      : ""}
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Device Time</strong>
                  </td>
                  <td>
                    {runtimeInfo.time.hour}:
                    {runtimeInfo.time.minute.toString().padStart(2, "0")}
                  </td>
                </tr>

                {/* Connectivity */}
                <tr>
                  <td>
                    <strong>WiFi Connected</strong>
                  </td>
                  <td>
                    {runtimeInfo.wifiMqttState.wifiConnected ? "Yes" : "No"}
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>MQTT Connected</strong>
                  </td>
                  <td>
                    {runtimeInfo.wifiMqttState.mqttConnected ? "Yes" : "No"}
                  </td>
                </tr>

                {/* Daily energy if available */}
                {runtimeInfo.dailyTotalBatteryCharge !== undefined && (
                  <tr>
                    <td>
                      <strong>Battery Charge Today</strong>
                    </td>
                    <td>{runtimeInfo.dailyTotalBatteryCharge / 10}Wh</td>
                  </tr>
                )}
                {runtimeInfo.dailyTotalBatteryDischarge !== undefined && (
                  <tr>
                    <td>
                      <strong>Battery Discharge Today</strong>
                    </td>
                    <td>{runtimeInfo.dailyTotalBatteryDischarge / 10}Wh</td>
                  </tr>
                )}
                {runtimeInfo.dailyTotalLoadCharge !== undefined && (
                  <tr>
                    <td>
                      <strong>Load Charge Today</strong>
                    </td>
                    <td>{runtimeInfo.dailyTotalLoadCharge / 10}Wh</td>
                  </tr>
                )}
                {runtimeInfo.dailyTotalLoadDischarge !== undefined && (
                  <tr>
                    <td>
                      <strong>Load Discharge Today</strong>
                    </td>
                    <td>{runtimeInfo.dailyTotalLoadDischarge / 10}Wh</td>
                  </tr>
                )}

                <tr>
                  <td>
                    <strong>Last Updated</strong>
                  </td>
                  <td>{new Date().toLocaleTimeString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default RuntimeTab;
