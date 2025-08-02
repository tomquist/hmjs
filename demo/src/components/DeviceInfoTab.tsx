import React from "react";
import { DeviceInfo } from "@tomquist/hmjs-protocol";

interface DeviceInfoTabProps {
  deviceInfo: DeviceInfo | null;
  infoStatus: string;
  lastUpdateTime: string;
  isConnected: boolean;
  onGetInfo: () => void;
}

const DeviceInfoTab: React.FC<DeviceInfoTabProps> = ({
  deviceInfo,
  infoStatus,
  lastUpdateTime,
  isConnected,
  onGetInfo,
}) => {
  return (
    <div id="device-info-tab" className="tab-pane active">
      <div id="device-info-container">
        <h2>Device Information</h2>
        <button onClick={onGetInfo} disabled={!isConnected}>
          Get Device Info
        </button>
        <div className="status-line">
          <span>Status: </span>
          <span
            className={
              infoStatus === "Success"
                ? "success"
                : infoStatus === "Failed"
                  ? "error"
                  : ""
            }
          >
            {infoStatus}
          </span>
          <span className="last-update">
            Last Updated: <span>{lastUpdateTime}</span>
          </span>
        </div>
        {deviceInfo && (
          <div className="device-info">
            <div className="info-row">
              <span className="info-label">Device Type:</span>
              <span className="info-value">{deviceInfo.type || "Unknown"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Device ID:</span>
              <span className="info-value">{deviceInfo.id || "Unknown"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">MAC Address:</span>
              <span className="info-value">{deviceInfo.mac || "Unknown"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceInfoTab;
