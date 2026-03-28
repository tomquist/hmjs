import React, { useState } from "react";

interface DisclaimerModalProps {
  onAccept: () => void;
}

const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ onAccept }) => {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="disclaimer-overlay">
      <div className="disclaimer-modal">
        <div className="disclaimer-header">
          <span className="disclaimer-icon">&#9888;</span> Warning — Use at Your
          Own Risk
        </div>
        <div className="disclaimer-body">
          <p>
            This is an <strong>experimental tool</strong> that communicates
            directly with your Hame battery device over Bluetooth. By using this
            application, you acknowledge and accept the following:
          </p>
          <ul>
            <li>
              This software is{" "}
              <strong>not affiliated with, endorsed by, or supported by</strong>{" "}
              the device manufacturer.
            </li>
            <li>
              Sending commands to your device may result in{" "}
              <strong>unexpected behavior, misconfiguration, or damage</strong>{" "}
              to your device.
            </li>
            <li>
              This tool is provided{" "}
              <strong>&quot;as is&quot; without any warranty</strong>, express
              or implied. The authors assume <strong>no liability</strong> for
              any damage, data loss, or malfunction caused by its use.
            </li>
            <li>
              You are solely responsible for any actions performed through this
              interface.
            </li>
          </ul>
          <p className="disclaimer-warning">
            Do not use this tool unless you fully understand the risks involved.
          </p>
        </div>
        <div className="disclaimer-footer">
          <label className="disclaimer-checkbox">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            I have read and understand the risks, and I accept full
            responsibility for any consequences.
          </label>
          <button
            className="disclaimer-button"
            disabled={!accepted}
            onClick={onAccept}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default DisclaimerModal;
