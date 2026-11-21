import React, { useState } from "react";
import type { BLEDeviceManager } from "@tomquist/hmjs-ble";
import {
  DEVICE_FAMILIES,
  DeviceFamily,
  familySupports,
} from "@tomquist/hmjs-protocol";

interface FamilyStatusTabProps {
  family: DeviceFamily;
  isConnected: boolean;
  manager: BLEDeviceManager | null;
  log: (message: string) => void;
}

type Row = [string, string];

/** Readable label and unit per decoded field */
const LABELS: Record<string, [string, string?]> = {
  acPower: ["AC power", "W"],
  batteryPower: ["Battery power", "W"],
  soc: ["State of charge", "%"],
  remainingEnergy: ["Remaining energy", "Wh"],
  ratedCapacity: ["Rated capacity", "Wh"],
  depthOfDischarge: ["Depth of discharge", "%"],
  maxChargePower: ["Max charge power", "W"],
  wifiSignal: ["Wi-Fi signal", "dBm"],
  firmwareVersion: ["Firmware version"],
  bmsVersion: ["BMS version"],
  inverterVersion: ["Inverter version"],
  mpptVersion: ["MPPT version"],
  wifiModuleVersion: ["Wi-Fi module version"],
  localApiPort: ["Local API port"],
  voltage: ["Voltage", "V"],
  current: ["Current", "A"],
  power: ["Power", "W"],
  active: ["Active"],
  temperatures: ["Temperatures", "°C"],
  cellVoltages: ["Cell voltages", "mV"],
  maxCellVoltage: ["Highest cell", "mV"],
  minCellVoltage: ["Lowest cell", "mV"],
  gridFrequency: ["Grid frequency", "Hz"],
  gridVoltage: ["Grid voltage", "V"],
  acCurrent: ["AC current", "A"],
  dailyOutputEnergy: ["Energy out today", "Wh"],
  monthlyOutputEnergy: ["Energy out this month", "Wh"],
  battery: ["Battery"],
  pv: ["PV"],
  ssid: ["Network name"],
  ip: ["IP address"],
  gateway: ["Gateway"],
  netmask: ["Netmask"],
  dns: ["DNS"],
};

const label = (key: string): string => LABELS[key]?.[0] ?? key;
const unit = (key: string): string =>
  LABELS[key]?.[1] ? ` ${LABELS[key][1]}` : "";

const formatDateTime = (d: Record<string, number>): string =>
  `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")} ` +
  `${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}:${String(d.second).padStart(2, "0")}`;

/** Flatten a decoded reply into label/value rows, skipping the raw bytes. */
export const toRows = (value: unknown, prefix = "", key = ""): Row[] => {
  if (value === null || value === undefined) return [];
  if (value instanceof Uint8Array) return [];
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== "object")) {
      return value.length ? [[prefix, value.join(", ") + unit(key)]] : [];
    }
    return value.flatMap((v, i) => toRows(v, `${prefix} ${i + 1}`.trim()));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("year" in obj && "weekday" in obj) {
      return [
        [
          prefix || "Device time",
          formatDateTime(obj as Record<string, number>),
        ],
      ];
    }
    return Object.entries(obj)
      .filter(([k]) => k !== "rawPayload")
      .flatMap(([k, v]) =>
        toRows(v, prefix ? `${prefix} ${label(k).toLowerCase()}` : label(k), k),
      );
  }
  return [[prefix || "value", String(value) + unit(key)]];
};

interface Reading {
  title: string;
  command: Parameters<typeof familySupports>[1];
  read: (m: BLEDeviceManager) => Promise<unknown>;
  families?: DeviceFamily[];
}

const READINGS: Reading[] = [
  {
    title: "Status",
    command: "RUNTIME_INFO",
    read: (m) => m.getStatus(),
    families: ["venus", "venus3", "venusMini", "jupiter"],
  },
  {
    title: "Battery and cells",
    command: "BATTERY_INFO",
    read: (m) => m.getBatteryInfo(),
  },
  {
    title: "Grid, PV and battery",
    command: "BATTERY_INFO",
    read: (m) => m.getSystemInfo(),
    families: ["jupiter"],
  },
  {
    title: "Inverter",
    command: "INVERTER_INFO",
    read: (m) => m.getInverterInfo(),
  },
  {
    title: "Device clock",
    command: "GET_DATETIME",
    read: (m) => m.getDeviceTime(),
  },
  {
    title: "Wi-Fi network",
    command: "GET_WIFI_SSID",
    read: async (m) => ({ ssid: await m.getWifiSsid() }),
  },
  {
    title: "Network",
    command: "GET_NETWORK_INFO",
    read: (m) => m.getNetworkInfo(),
  },
];

const FamilyStatusTab: React.FC<FamilyStatusTabProps> = ({
  family,
  isConnected,
  manager,
  log,
}) => {
  const [results, setResults] = useState<Record<string, Row[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dod, setDod] = useState(family === "jupiter" ? 90 : 88);

  const readings = READINGS.filter(
    (r) =>
      familySupports(family, r.command) &&
      (!r.families || r.families.includes(family)),
  );

  const run = async (reading: Reading) => {
    if (!manager) return;
    try {
      const data = await reading.read(manager);
      setResults((prev) => ({ ...prev, [reading.title]: toRows(data) }));
      setErrors((prev) => ({ ...prev, [reading.title]: "" }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`${reading.title}: ${message}`);
      setErrors((prev) => ({ ...prev, [reading.title]: message }));
    }
  };

  const act = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
      log(`${label}: sent`);
    } catch (error) {
      log(
        `${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  return (
    <div id="family-status-tab" className="tab-pane active">
      <h2>{DEVICE_FAMILIES[family].label}</h2>
      {readings.length === 0 && (
        <p>
          Only the device info and Wi-Fi setup are known for this device. Its
          other replies can be inspected in the Advanced tab.
        </p>
      )}
      {readings.map((reading) => (
        <div key={reading.title} className="config-section">
          <h3>{reading.title}</h3>
          <button
            onClick={() => run(reading)}
            disabled={!isConnected || !manager}
          >
            Read {reading.title.toLowerCase()}
          </button>
          {errors[reading.title] && (
            <div className="error">{errors[reading.title]}</div>
          )}
          {results[reading.title] && (
            <div className="device-info">
              {results[reading.title].map(([label, value]) => (
                <div className="info-row" key={label}>
                  <span className="info-label">{label}:</span>
                  <span className="info-value">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {(familySupports(family, "SET_DOD") ||
        familySupports(family, "SET_LED")) && (
        <div className="config-section">
          <h3>Settings</h3>
          {familySupports(family, "SET_DOD") && (
            <div className="form-group">
              <label htmlFor="family-dod">Depth of discharge (%)</label>
              <input
                id="family-dod"
                type="number"
                min={30}
                max={family === "jupiter" ? 90 : 88}
                value={dod}
                onChange={(e) => setDod(Number(e.target.value))}
              />
              <button
                disabled={!isConnected || !manager}
                onClick={() =>
                  act("Depth of discharge", () =>
                    manager!.setDepthOfDischarge(dod),
                  )
                }
              >
                Set
              </button>
            </div>
          )}
          {familySupports(family, "SET_LED") && (
            <div className="form-group">
              <span>Status LED</span>
              <button
                disabled={!isConnected || !manager}
                onClick={() => act("LED on", () => manager!.setStatusLed(true))}
              >
                On
              </button>
              <button
                disabled={!isConnected || !manager}
                onClick={() =>
                  act("LED off", () => manager!.setStatusLed(false))
                }
              >
                Off
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FamilyStatusTab;
