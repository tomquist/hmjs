import React from "react";

const DeviceConstantsSection: React.FC = () => {
  return (
    <div className="device-enums">
      <h5>🏷️ Device Constants</h5>
      <div className="enum-group">
        <h6>Regions:</h6>
        <ul>
          <li>
            <code>0x00</code> - EU
          </li>
          <li>
            <code>0x01</code> - China
          </li>
          <li>
            <code>0x02</code> - Non-EU
          </li>
          <li>
            <code>0xFF</code> - Not Set
          </li>
        </ul>
      </div>
      <div className="enum-group">
        <h6>Scenes:</h6>
        <ul>
          <li>
            <code>0x00</code> - Day
          </li>
          <li>
            <code>0x01</code> - Night
          </li>
          <li>
            <code>0x02</code> - Dusk/Dawn
          </li>
        </ul>
      </div>
    </div>
  );
};

export default DeviceConstantsSection;
