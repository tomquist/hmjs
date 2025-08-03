import React from "react";
import CommandCategory, { PayloadCommand } from "../CommandCategory";
import {
  PayloadDetails,
  PayloadFormat,
  PayloadExampleCommand,
  StructureInfo,
} from "../PayloadDetails";

const ControlCommands: React.FC = () => {
  return (
    <CommandCategory title="Control & Management" icon="🔧">
      <PayloadCommand commandCode="13 or 0x0D" commandName="Load First Enabled">
        <PayloadDetails>
          <p>
            <strong>Payload:</strong> ChargeMode union byte
          </p>
          <PayloadFormat format="[CHARGE_MODE_BYTE]" />

          <StructureInfo title="ChargeMode Structure (1 byte):">
            <ul>
              <li>
                <strong>Bit 0:</strong> load_first (0 = disabled, 1 = enabled)
              </li>
              <li>
                <strong>Bits 1-7:</strong> Reserved
              </li>
            </ul>
          </StructureInfo>

          <PayloadExampleCommand>
            <strong>Example:</strong> <code>73 05 23 0D 01 XX</code> (Enable
            load first)
          </PayloadExampleCommand>
        </PayloadDetails>
      </PayloadCommand>

      <PayloadCommand commandCode="14 or 0x0E" commandName="Power Out">
        <PayloadDetails>
          <p>
            <strong>Payload:</strong> DisChargeSetting union byte
          </p>
          <PayloadFormat format="[DISCHARGE_SETTING_BYTE]" />

          <StructureInfo title="DisChargeSetting Structure (1 byte):">
            <ul>
              <li>
                <strong>Bit 0:</strong> out1_enable (0 = disabled, 1 = enabled)
              </li>
              <li>
                <strong>Bit 1:</strong> out2_enable (0 = disabled, 1 = enabled)
              </li>
              <li>
                <strong>Bits 2-7:</strong> Reserved
              </li>
            </ul>
          </StructureInfo>

          <PayloadExampleCommand>
            <strong>Example:</strong> <code>73 05 23 0E 03 XX</code> (Enable
            both outputs: 0x03 = 0b00000011)
          </PayloadExampleCommand>
        </PayloadDetails>
      </PayloadCommand>

      <PayloadCommand
        commandCode="17 or 0x11"
        commandName="Enable Adaptive Mode"
      >
        <PayloadDetails>
          <p>
            <strong>Payload:</strong> Single byte (always 0x00)
          </p>
          <PayloadFormat format="[0x00]" />
          <p>Uses encode_simple_command with 0x00 byte</p>
          <PayloadExampleCommand>
            <strong>Example:</strong> <code>73 05 23 11 00 XX</code> (Enable
            adaptive mode)
          </PayloadExampleCommand>
        </PayloadDetails>
      </PayloadCommand>

      <PayloadCommand commandCode="37 or 0x25" commandName="Reboot Device">
        <PayloadDetails>
          <p>
            <strong>Payload:</strong> Single byte (always 0x01)
          </p>
          <PayloadFormat format="[0x01]" />
          <p>Uses encode_simple_command with 0x01 byte</p>
          <PayloadExampleCommand>
            <strong>Example:</strong> <code>73 05 23 25 01 XX</code> (Reboot
            device)
          </PayloadExampleCommand>
        </PayloadDetails>
      </PayloadCommand>

      <PayloadCommand commandCode="38 or 0x26" commandName="Factory Reset">
        <PayloadDetails>
          <p>
            <strong>Payload:</strong> Single byte (always 0x01)
          </p>
          <PayloadFormat format="[0x01]" />
          <p>Uses encode_simple_command with 0x01 byte</p>
          <PayloadExampleCommand>
            <strong>Example:</strong> <code>73 05 23 26 01 XX</code> (Factory
            reset)
          </PayloadExampleCommand>
        </PayloadDetails>
      </PayloadCommand>
    </CommandCategory>
  );
};

export default ControlCommands;
