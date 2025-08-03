import React from "react";
import CommandCategory, { SimpleCommand } from "../CommandCategory";

const NetworkCommands: React.FC = () => {
  return (
    <CommandCategory title="Network Status" icon="📡">
      <SimpleCommand
        commandCode="8 or 0x08"
        description="WiFi State (FW >133)"
      />
    </CommandCategory>
  );
};

export default NetworkCommands;
