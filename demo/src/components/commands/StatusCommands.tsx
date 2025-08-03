import React from "react";
import CommandCategory, {
  SimpleCommand,
  PayloadCommand,
} from "../CommandCategory";
import {
  PayloadDetails,
  PayloadFormat,
  PayloadExampleCommand,
} from "../PayloadDetails";

const StatusCommands: React.FC = () => {
  return (
    <CommandCategory title="Status & Information" icon="📊">
      <SimpleCommand commandCode="3 or 0x03" description="Runtime Info" />
      <SimpleCommand commandCode="4 or 0x04" description="Device Info" />
      <SimpleCommand commandCode="15 or 0x0F" description="Cell Info" />
      <SimpleCommand commandCode="9 or 0x09" description="WiFi Info" />
      <SimpleCommand
        commandCode="35 or 0x23"
        description="FC41D Info (Firmware)"
      />

      <PayloadCommand commandCode="19 or 0x13" commandName="Get Timers">
        <PayloadDetails>
          <p>
            <strong>Payload:</strong> Single byte (always 0x00)
          </p>
          <PayloadFormat format="[0x00]" />
          <p>Uses encode_simple_command with 0x00 byte</p>
          <PayloadExampleCommand>
            <strong>Example:</strong> <code>73 05 23 13 00 XX</code> (Get
            timers)
          </PayloadExampleCommand>
        </PayloadDetails>
      </PayloadCommand>
    </CommandCategory>
  );
};

export default StatusCommands;
