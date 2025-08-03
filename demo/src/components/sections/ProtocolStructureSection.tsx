import React from "react";

const ProtocolStructureSection: React.FC = () => {
  return (
    <div className="protocol-info">
      <h5>📋 Protocol Structure</h5>
      <p>Commands follow the B2500 protocol format:</p>
      <div className="protocol-format">
        <code>0x73 [LENGTH] 0x23 [COMMAND] [PAYLOAD...] [CHECKSUM]</code>
      </div>
      <ul>
        <li>
          <strong>Header:</strong> Always starts with <code>0x73</code>
        </li>
        <li>
          <strong>Length:</strong> Total message length including checksum
        </li>
        <li>
          <strong>Control:</strong> Always <code>0x23</code>
        </li>
        <li>
          <strong>Command:</strong> One of the command codes above
        </li>
        <li>
          <strong>Payload:</strong> Optional command-specific data
        </li>
        <li>
          <strong>Checksum:</strong> XOR of all preceding bytes
        </li>
      </ul>
    </div>
  );
};

export default ProtocolStructureSection;
