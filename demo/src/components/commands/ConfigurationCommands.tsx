import React from "react";
import CommandCategory, {
  SimpleCommand,
  PayloadCommand,
} from "../CommandCategory";
import {
  PayloadDetails,
  PayloadFormat,
  PayloadExampleCommand,
  StructureInfo,
} from "../PayloadDetails";

const ConfigurationCommands: React.FC = () => {
  return (
    <CommandCategory title="Configuration" icon="⚙️">
      <PayloadCommand commandCode="2 or 0x02" commandName="Set Region">
        <PayloadDetails>
          <p>
            <strong>Payload:</strong> Single byte region code
          </p>
          <PayloadFormat format="[REGION_CODE]" />
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
          </ul>
          <PayloadExampleCommand>
            <strong>Example:</strong> <code>73 05 23 02 00 56</code> (Set to EU
            region)
          </PayloadExampleCommand>
        </PayloadDetails>
      </PayloadCommand>

      <PayloadCommand commandCode="5 or 0x05" commandName="Set WiFi">
        <PayloadDetails>
          <p>
            <strong>Payload:</strong> WiFi credentials string
          </p>
          <PayloadFormat format="[SSID]&lt;.,.&gt;[PASSWORD]" />
          <p>WiFi SSID and password separated by &lt;.,.&gt;</p>
          <PayloadExampleCommand>
            <strong>Example:</strong>{" "}
            <code>MyWifi&lt;.,.&gt;MyPassword123</code>
          </PayloadExampleCommand>
        </PayloadDetails>
      </PayloadCommand>

      <PayloadCommand commandCode="32 or 0x20" commandName="Set MQTT">
        <PayloadDetails>
          <p>
            <strong>Payload:</strong> MQTT configuration string
          </p>
          <PayloadFormat format="[SSL]&lt;.,.&gt;[HOST]&lt;.,.&gt;[PORT]&lt;.,.&gt;[USERNAME]&lt;.,.&gt;[PASSWORD]&lt;.,.&gt;" />
          <ul>
            <li>
              <strong>SSL:</strong> 0 (false) or 1 (true)
            </li>
            <li>
              <strong>HOST:</strong> MQTT broker hostname/IP
            </li>
            <li>
              <strong>PORT:</strong> MQTT broker port number
            </li>
            <li>
              <strong>USERNAME:</strong> MQTT username (required)
            </li>
            <li>
              <strong>PASSWORD:</strong> MQTT password (required)
            </li>
          </ul>
          <p>Note: Ends with trailing &lt;.,.&gt; separator</p>
          <PayloadExampleCommand>
            <strong>Example:</strong>{" "}
            <code>
              0&lt;.,.&gt;mqtt.example.com&lt;.,.&gt;1883&lt;.,.&gt;user&lt;.,.&gt;pass&lt;.,.&gt;
            </code>
          </PayloadExampleCommand>
        </PayloadDetails>
      </PayloadCommand>

      <SimpleCommand commandCode="33 or 0x21" description="Reset MQTT" />

      <PayloadCommand
        commandCode="11 or 0x0B"
        commandName="Set DOD (Depth of Discharge)"
      >
        <PayloadDetails>
          <p>
            <strong>Payload:</strong> Single byte DOD percentage
          </p>
          <PayloadFormat format="[DOD_PERCENTAGE]" />
          <p>Value range: 0-100 (percentage)</p>
          <PayloadExampleCommand>
            <strong>Example:</strong> <code>73 05 23 0B 50 XX</code> (Set DOD to
            80%)
          </PayloadExampleCommand>
        </PayloadDetails>
      </PayloadCommand>

      <PayloadCommand
        commandCode="12 or 0x0C"
        commandName="Set Discharge Threshold"
      >
        <PayloadDetails>
          <p>
            <strong>Payload:</strong> Two bytes for threshold value
          </p>
          <PayloadFormat format="[LOW_BYTE] [HIGH_BYTE]" />
          <p>Threshold value in watts (little-endian)</p>
          <PayloadExampleCommand>
            <strong>Example:</strong> <code>73 06 23 0C E8 03 XX</code> (Set to
            1000W)
          </PayloadExampleCommand>
        </PayloadDetails>
      </PayloadCommand>

      <PayloadCommand commandCode="20 or 0x14" commandName="Set Date/Time">
        <PayloadDetails>
          <p>
            <strong>Payload:</strong> DateTimePacket structure (6 bytes)
          </p>
          <PayloadFormat format="[YEAR] [MONTH] [DAY] [HOUR] [MINUTE] [SECOND]" />

          <StructureInfo title="DateTimePacket Structure:">
            <ul>
              <li>
                <strong>Byte 0 (year):</strong> Years since 2000 (0-255)
              </li>
              <li>
                <strong>Byte 1 (month):</strong> Month (1-12)
              </li>
              <li>
                <strong>Byte 2 (day):</strong> Day of month (1-31)
              </li>
              <li>
                <strong>Byte 3 (hour):</strong> Hour (0-23)
              </li>
              <li>
                <strong>Byte 4 (minute):</strong> Minute (0-59)
              </li>
              <li>
                <strong>Byte 5 (second):</strong> Second (0-59)
              </li>
            </ul>
          </StructureInfo>

          <PayloadExampleCommand>
            <strong>Example:</strong> <code>18 0C 0F 0E 1E 00</code>
            <br />
            <small>Dec 15, 2024 (24 years since 2000), 14:30:00</small>
          </PayloadExampleCommand>
        </PayloadDetails>
      </PayloadCommand>

      <PayloadCommand commandCode="18 or 0x12" commandName="Set Timers">
        <PayloadDetails>
          <p>
            <strong>Payload:</strong> Array of TimerInfo structures
          </p>
          <PayloadFormat format="[TimerInfo] × count" />

          <StructureInfo title="TimerInfo Structure (6 bytes each):">
            <ul>
              <li>
                <strong>Byte 0:</strong> enabled (0x00 = disabled, 0x01 =
                enabled)
              </li>
              <li>
                <strong>Byte 1:</strong> start.hour (0-23)
              </li>
              <li>
                <strong>Byte 2:</strong> start.minute (0-59)
              </li>
              <li>
                <strong>Byte 3:</strong> end.hour (0-23)
              </li>
              <li>
                <strong>Byte 4:</strong> end.minute (0-59)
              </li>
              <li>
                <strong>Bytes 5-6:</strong> output_power (uint16_t,
                little-endian, watts)
              </li>
            </ul>
          </StructureInfo>

          <StructureInfo title="Timer Response Structures:" variant="response">
            <p>
              <strong>TimerInfoPacket3</strong> (older format, 16 bytes):
            </p>
            <ul>
              <li>Byte 0: adaptive_mode_enabled</li>
              <li>Bytes 1-18: timer[3] (3 × TimerInfo)</li>
              <li>Bytes 19-25: SmartMeterInfo</li>
            </ul>

            <p>
              <strong>TimerInfoPacket</strong> (newer format, 28 bytes):
            </p>
            <ul>
              <li>Bytes 0-15: TimerInfoPacket3 base</li>
              <li>Bytes 16-25: reserved</li>
              <li>Bytes 26-37: additional_timers[2] (2 × TimerInfo)</li>
            </ul>
          </StructureInfo>

          <PayloadExampleCommand>
            <strong>Example (1 timer):</strong>
            <br />
            <code>01 08 00 17 00 20 03</code>
            <br />
            <small>Enabled, 08:00-23:00, 800W (0x0320)</small>
          </PayloadExampleCommand>
        </PayloadDetails>
      </PayloadCommand>
    </CommandCategory>
  );
};

export default ConfigurationCommands;
