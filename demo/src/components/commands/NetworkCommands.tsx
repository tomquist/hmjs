import React from "react";
import CommandCategory, { SimpleCommand } from "../CommandCategory";

const NetworkCommands: React.FC = () => {
  return (
    <CommandCategory title="Network Status" icon="📡">
      <SimpleCommand
        commandCode="8 or 0x08"
        description="Read WiFi Info (FW >133) - returns the SSID the device has stored"
      />
    </CommandCategory>
  );
};

export default NetworkCommands;
