import React from "react";
import CollapsibleSection from "./sections/CollapsibleSection";
import ProtocolStructureSection from "./sections/ProtocolStructureSection";
import DeviceConstantsSection from "./sections/DeviceConstantsSection";
import StatusCommands from "./commands/StatusCommands";
import ConfigurationCommands from "./commands/ConfigurationCommands";
import ControlCommands from "./commands/ControlCommands";
import NetworkCommands from "./commands/NetworkCommands";

interface ProtocolInfoProps {
  className?: string;
}

const ProtocolInfo: React.FC<ProtocolInfoProps> = ({ className = "" }) => {
  return (
    <div className={`protocol-info-container ${className}`}>
      <CollapsibleSection
        title="B2500 Protocol Commands:"
        buttonText="Commands"
        defaultOpen={false}
      >
        <div className="command-categories">
          <StatusCommands />
          <ConfigurationCommands />
          <ControlCommands />
          <NetworkCommands />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="📋 Protocol Structure:"
        buttonText="Structure"
        defaultOpen={false}
      >
        <ProtocolStructureSection />
      </CollapsibleSection>

      <CollapsibleSection
        title="🏷️ Device Constants:"
        buttonText="Constants"
        defaultOpen={false}
      >
        <DeviceConstantsSection />
      </CollapsibleSection>
    </div>
  );
};

export default ProtocolInfo;
