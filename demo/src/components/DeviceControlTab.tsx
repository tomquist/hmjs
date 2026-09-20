import React, { useState } from "react";
import { CHARGE_MODE, OUTPUT_CHANNEL } from "@tomquist/hmjs-protocol";

interface DeviceControlTabProps {
  isConnected: boolean;
  onSetDod: (percent: number) => void;
  onSetDischargeThreshold: (watts: number) => void;
  onSetChargeMode: (mode: number) => void;
  onSetOutputChannels: (mask: number) => void;
  onSetAdaptiveMode: (enabled: boolean) => void;
  onSetDateTime: () => void;
  onRestartDevice: () => void;
  onRunDiagnosis: () => void;
  onGetWifiInfo: () => void;
  onGetErrorInfo: () => void;
  rawResponses: string[];
}

const DeviceControlTab: React.FC<DeviceControlTabProps> = ({
  isConnected,
  onSetDod,
  onSetDischargeThreshold,
  onSetChargeMode,
  onSetOutputChannels,
  onSetAdaptiveMode,
  onSetDateTime,
  onRestartDevice,
  onRunDiagnosis,
  onGetWifiInfo,
  onGetErrorInfo,
  rawResponses,
}) => {
  const [dod, setDod] = useState("80");
  const [threshold, setThreshold] = useState("150");
  const [chargeMode, setChargeMode] = useState<number>(CHARGE_MODE.FULL);
  const [out1, setOut1] = useState(true);
  const [out2, setOut2] = useState(true);
  const [adaptive, setAdaptive] = useState(true);

  const channelMask =
    (out1 ? OUTPUT_CHANNEL.OUT1 : 0) | (out2 ? OUTPUT_CHANNEL.OUT2 : 0);

  // The last few frames the device sent back. The read commands below return
  // data this library does not parse yet, so the raw bytes are all we can
  // show for them.
  const recentResponses = rawResponses.slice(-5).reverse();

  return (
    <div id="device-control-tab" className="tab-pane">
      <div className="config-section">
        <h2>Battery Settings</h2>
        <p className="config-hint">
          These are written to the device&apos;s flash, which tolerates a
          limited number of write cycles. Change them when you need to, not on a
          schedule.
        </p>

        <div className="form-group">
          <label htmlFor="dod-input">Depth of discharge (%):</label>
          <input
            type="number"
            id="dod-input"
            min={0}
            max={100}
            value={dod}
            onChange={(e) => setDod(e.target.value)}
          />
          <button
            type="button"
            onClick={() => dod !== "" && onSetDod(Number(dod))}
            disabled={!isConnected || dod === ""}
          >
            Set DOD
          </button>
        </div>

        <div className="form-group">
          <label htmlFor="threshold-input">Discharge threshold (W):</label>
          <input
            type="number"
            id="threshold-input"
            min={0}
            max={65535}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
          <button
            type="button"
            onClick={() =>
              threshold !== "" && onSetDischargeThreshold(Number(threshold))
            }
            disabled={!isConnected || threshold === ""}
          >
            Set Threshold
          </button>
        </div>

        <div className="form-group">
          <label htmlFor="charge-mode-select">Charge mode:</label>
          <select
            id="charge-mode-select"
            value={chargeMode}
            onChange={(e) => setChargeMode(Number(e.target.value))}
          >
            <option value={CHARGE_MODE.FULL}>Full</option>
            <option value={CHARGE_MODE.HALF}>Half</option>
          </select>
          <button
            type="button"
            onClick={() => onSetChargeMode(chargeMode)}
            disabled={!isConnected}
          >
            Set Charge Mode
          </button>
        </div>

        <div className="form-group">
          <label>Output channels:</label>
          <label htmlFor="out1-checkbox" className="checkbox-label">
            <input
              type="checkbox"
              id="out1-checkbox"
              checked={out1}
              onChange={(e) => setOut1(e.target.checked)}
            />
            Output 1
          </label>
          <label htmlFor="out2-checkbox" className="checkbox-label">
            <input
              type="checkbox"
              id="out2-checkbox"
              checked={out2}
              onChange={(e) => setOut2(e.target.checked)}
            />
            Output 2
          </label>
          <button
            type="button"
            onClick={() => onSetOutputChannels(channelMask)}
            disabled={!isConnected}
          >
            Set Outputs
          </button>
        </div>

        <div className="form-group">
          <label htmlFor="adaptive-checkbox" className="checkbox-label">
            <input
              type="checkbox"
              id="adaptive-checkbox"
              checked={adaptive}
              onChange={(e) => setAdaptive(e.target.checked)}
            />
            Adaptive mode
          </label>
          <button
            type="button"
            onClick={() => onSetAdaptiveMode(adaptive)}
            disabled={!isConnected}
          >
            Set Adaptive Mode
          </button>
        </div>
      </div>

      <div className="config-section">
        <h2>Device Actions</h2>
        <div className="button-group">
          <button type="button" onClick={onSetDateTime} disabled={!isConnected}>
            Set Clock to Now
          </button>
          <button
            type="button"
            onClick={onRunDiagnosis}
            disabled={!isConnected}
          >
            Run Diagnosis
          </button>
          <button
            type="button"
            onClick={onRestartDevice}
            disabled={!isConnected}
          >
            Restart Device
          </button>
        </div>
        <p className="config-hint">
          Restarting drops the Bluetooth connection until the device comes back
          up.
        </p>
      </div>

      <div className="config-section">
        <h2>Diagnostics</h2>
        <div className="button-group">
          <button type="button" onClick={onGetWifiInfo} disabled={!isConnected}>
            Read WiFi Info
          </button>
          <button
            type="button"
            onClick={onGetErrorInfo}
            disabled={!isConnected}
          >
            Read Error Info
          </button>
        </div>
        <p className="config-hint">
          These responses are not decoded yet, so the raw reply is shown below.
        </p>
        {recentResponses.length > 0 && (
          <pre className="raw-response-list">{recentResponses.join("\n")}</pre>
        )}
      </div>
    </div>
  );
};

export default DeviceControlTab;
