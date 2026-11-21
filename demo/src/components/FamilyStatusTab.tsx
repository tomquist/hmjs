import React, { useState } from "react";
import type { BLEDeviceManager } from "@tomquist/hmjs-ble";
import {
  DEVICE_FAMILIES,
  DeviceFamily,
  MiniSlotAction,
  Setting,
  WorkingMode,
  familySupports,
  supportsSetting,
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
  workingMode: ["Working mode"],
  meterConnected: ["Meter connected"],
  dcdcVersion: ["DC/DC version"],
  meterType: ["Meter type"],
  meterPhase: ["Meter phase"],
  ledOn: ["LED on"],
  highFeedInLimit: ["High feed-in limit"],
  lowGridChargeLimit: ["Grid charge limited to 800 W"],
  upsChargePower: ["UPS charge power", "W"],
  localApiEnabled: ["Local API"],
  localApiRemotePort: ["Local API remote port"],
  cloudServer: ["Cloud server"],
  enabled: ["Enabled"],
  start: ["Start"],
  end: ["End"],
  weekdays: ["Weekday mask"],
  action: ["Action"],
  slots: ["Slot"],
  phases: ["Phases", "W"],
  total: ["Total", "W"],
  phase: ["Phase"],
  meterOnline: ["Meter answering"],
  hour: ["hour"],
  minute: ["minute"],
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
  supported: (family: DeviceFamily) => boolean;
  read: (m: BLEDeviceManager) => Promise<unknown>;
}

const only =
  (...families: DeviceFamily[]) =>
  (family: DeviceFamily) =>
    families.includes(family);

const READINGS: Reading[] = [
  {
    title: "Status",
    supported: only("venus", "venus3", "venusMini", "jupiter", "meter"),
    read: (m) => m.getStatus(),
  },
  {
    title: "Battery and cells",
    supported: (f) => familySupports(f, "BATTERY_INFO"),
    read: (m) => m.getBatteryInfo(),
  },
  {
    title: "Grid, PV and battery",
    supported: only("jupiter"),
    read: (m) => m.getSystemInfo(),
  },
  {
    title: "Inverter",
    supported: (f) => familySupports(f, "INVERTER_INFO"),
    read: (m) => m.getInverterInfo(),
  },
  {
    title: "Time periods",
    supported: (f) => supportsSetting(f, "timePeriods"),
    read: (m) => m.getTimePeriods(),
  },
  {
    title: "Schedule",
    supported: only("venusMini"),
    read: (m) => m.getMiniSchedule(),
  },
  {
    title: "Meter power",
    supported: only("venusMini"),
    read: (m) => m.getMeterPower(),
  },
  {
    title: "Meter phases",
    supported: only("meter"),
    read: (m) => m.getMeterPhaseReadings(),
  },
  {
    title: "Wi-Fi signal",
    supported: only("b2500"),
    read: (m) => m.getWifiSignal(),
  },
  {
    title: "Wi-Fi module",
    supported: only("b2500"),
    read: async (m) => ({ version: await m.getWifiModuleVersion() }),
  },
  {
    title: "Battery packs",
    supported: only("b2500"),
    read: (m) => m.getBatteryPacks(),
  },
  {
    title: "CT status",
    supported: only("b2500"),
    read: (m) => m.getCtStatus(),
  },
  {
    title: "Rated power",
    supported: only("b2500"),
    read: (m) => m.getRatedPower(),
  },
  {
    title: "Device clock",
    supported: (f) => familySupports(f, "GET_DATETIME"),
    read: (m) => m.getDeviceTime(),
  },
  {
    title: "Wi-Fi network",
    supported: (f) => familySupports(f, "GET_WIFI_SSID"),
    read: async (m) => ({ ssid: await m.getWifiSsid() }),
  },
  {
    title: "Network",
    supported: (f) => f === "b2500" || familySupports(f, "GET_NETWORK_INFO"),
    read: (m) => m.getNetworkInfo(),
  },
];

const MODES: Record<string, WorkingMode[]> = {
  venusMini: ["auto", "ups", "manual", "ai"],
  jupiter: ["auto", "manual"],
  default: ["auto", "manual", "ai"],
};

const parseTime = (s: string) => {
  const [hour, minute] = s.split(":").map(Number);
  return { hour, minute };
};

const FamilyStatusTab: React.FC<FamilyStatusTabProps> = ({
  family,
  isConnected,
  manager,
  log,
}) => {
  const [results, setResults] = useState<Record<string, Row[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({
    dod: family === "venus3" ? "88" : "90",
    mode: "auto",
    apiPort: "30000",
    apiRemotePort: "30000",
    apiEnabled: "1",
    maxCharge: "2500",
    maxDischarge: "800",
    peak: "300",
    meterIp: "",
    ups: "800",
    antiReverse: "0",
    slot: "0",
    slotStart: "08:00",
    slotEnd: "16:00",
    slotDays: "127",
    slotPower: "400",
    slotEnabled: "1",
    slotAction: "discharge",
    feedIn: "0",
    direction: "7",
    gridCharge: "0",
  });
  const v = (k: string) => values[k] ?? "";
  const set = (k: string) => (e: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [k]: e.target.value }));
  const can = (s: Setting) => supportsSetting(family, s);
  const disabled = !isConnected || !manager;

  const readings = READINGS.filter((r) => r.supported(family));

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

  const act = async (
    label: string,
    fn: (m: BLEDeviceManager) => Promise<void>,
  ) => {
    if (!manager) return;
    try {
      await fn(manager);
      log(`${label}: sent`);
    } catch (error) {
      log(
        `${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const toggle = (
    setting: Setting,
    title: string,
    fn: (m: BLEDeviceManager, on: boolean) => Promise<void>,
    note?: string,
  ) =>
    can(setting) && (
      <div className="form-group" key={setting}>
        <span>{title}</span>
        <button
          disabled={disabled}
          onClick={() => act(`${title} on`, (m) => fn(m, true))}
        >
          On
        </button>
        <button
          disabled={disabled}
          onClick={() => act(`${title} off`, (m) => fn(m, false))}
        >
          Off
        </button>
        {note && <small> {note}</small>}
      </div>
    );

  const numberSetting = (
    setting: Setting,
    title: string,
    key: string,
    fn: (m: BLEDeviceManager, n: number) => Promise<void>,
  ) =>
    can(setting) && (
      <div className="form-group" key={setting}>
        <label htmlFor={`family-${key}`}>{title}</label>
        <input
          id={`family-${key}`}
          type="number"
          value={v(key)}
          onChange={set(key)}
        />
        <button
          disabled={disabled}
          onClick={() => act(title, (m) => fn(m, Number(v(key))))}
        >
          Set
        </button>
      </div>
    );

  const modes = MODES[family] ?? MODES.default;

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
          <button onClick={() => run(reading)} disabled={disabled}>
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

      {(can("timePeriods") || can("miniSchedule")) && (
        <div className="config-section">
          <h3>
            {can("timePeriods")
              ? "Write a time period"
              : "Write a schedule slot"}
          </h3>
          <div className="form-group">
            <label htmlFor="family-slot">Slot (from 0)</label>
            <input
              id="family-slot"
              type="number"
              value={v("slot")}
              onChange={set("slot")}
            />
            <label htmlFor="family-slot-start">Start</label>
            <input
              id="family-slot-start"
              type="time"
              value={v("slotStart")}
              onChange={set("slotStart")}
            />
            <label htmlFor="family-slot-end">End</label>
            <input
              id="family-slot-end"
              type="time"
              value={v("slotEnd")}
              onChange={set("slotEnd")}
            />
            <label htmlFor="family-slot-days">
              Weekday mask (127 = every day)
            </label>
            <input
              id="family-slot-days"
              type="number"
              value={v("slotDays")}
              onChange={set("slotDays")}
            />
            <label htmlFor="family-slot-power">
              Power (W
              {can("timePeriods") && family !== "jupiter"
                ? "; negative charges, -1 follows the meter"
                : ""}
              )
            </label>
            <input
              id="family-slot-power"
              type="number"
              value={v("slotPower")}
              onChange={set("slotPower")}
            />
            {can("miniSchedule") && (
              <>
                <label htmlFor="family-slot-action">Action</label>
                <select
                  id="family-slot-action"
                  value={v("slotAction")}
                  onChange={set("slotAction")}
                >
                  <option value="idle">idle</option>
                  <option value="charge">charge</option>
                  <option value="discharge">discharge</option>
                  <option value="followMeter">follow the meter</option>
                </select>
              </>
            )}
            <label>
              <input
                type="checkbox"
                checked={v("slotEnabled") === "1"}
                onChange={(e) =>
                  setValues((p) => ({
                    ...p,
                    slotEnabled: e.target.checked ? "1" : "0",
                  }))
                }
              />{" "}
              Enabled
            </label>
            <button
              disabled={disabled}
              onClick={() =>
                act("Time period", (m) => {
                  const base = {
                    enabled: v("slotEnabled") === "1",
                    start: parseTime(v("slotStart")),
                    end: parseTime(v("slotEnd")),
                    weekdays: Number(v("slotDays")),
                    power: Number(v("slotPower")),
                  };
                  return can("miniSchedule")
                    ? m.setMiniScheduleSlot(Number(v("slot")), {
                        ...base,
                        action: v("slotAction") as MiniSlotAction,
                      })
                    : m.setTimePeriod(Number(v("slot")), base);
                })
              }
            >
              Write
            </button>
          </div>
        </div>
      )}

      {can("workingMode") && (
        <div className="config-section">
          <h3>Settings</h3>
          <div className="form-group">
            <label htmlFor="family-mode">Working mode</label>
            <select id="family-mode" value={v("mode")} onChange={set("mode")}>
              {modes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              disabled={disabled}
              onClick={() =>
                act("Working mode", (m) =>
                  m.setWorkingMode(v("mode") as WorkingMode),
                )
              }
            >
              Set
            </button>
          </div>
          {numberSetting(
            "depthOfDischarge",
            "Depth of discharge (%)",
            "dod",
            (m, n) => m.setDepthOfDischarge(n),
          )}
          {numberSetting(
            "maxChargePower",
            "Max charging power (W)",
            "maxCharge",
            (m, n) => m.setMaxChargePower(n),
          )}
          {numberSetting(
            "maxDischargePower",
            "Max discharging power (W)",
            "maxDischarge",
            (m, n) => m.setMaxDischargePower(n),
          )}
          {numberSetting(
            "upsChargePower",
            "UPS charge power (W)",
            "ups",
            (m, n) => m.setUpsChargePower(n),
          )}
          {can("peakShaving") && (
            <div className="form-group">
              <label htmlFor="family-peak">Peak shaving (W)</label>
              <input
                id="family-peak"
                type="number"
                value={v("peak")}
                onChange={set("peak")}
              />
              <button
                disabled={disabled}
                onClick={() =>
                  act("Peak shaving", (m) =>
                    m.setPeakShaving(Number(v("peak"))),
                  )
                }
              >
                Set
              </button>
              <button
                disabled={disabled}
                onClick={() =>
                  act("Peak shaving off", (m) => m.setPeakShaving(null))
                }
              >
                Off
              </button>
            </div>
          )}
          {can("antiReverse") && (
            <div className="form-group">
              <label htmlFor="family-ar">Anti-reverse power (W, 0 = off)</label>
              <input
                id="family-ar"
                type="number"
                value={v("antiReverse")}
                onChange={set("antiReverse")}
              />
              <button
                disabled={disabled}
                onClick={() =>
                  act("Anti-reverse", (m) =>
                    m.setAntiReverse(
                      Number(v("antiReverse")) > 0,
                      Number(v("antiReverse")),
                    ),
                  )
                }
              >
                Set
              </button>
            </div>
          )}
          {can("powerLimits") && (
            <div className="form-group">
              <label htmlFor="family-feedin">Feed-in limit</label>
              <select
                id="family-feedin"
                value={v("feedIn")}
                onChange={set("feedIn")}
              >
                <option value="0">800 W</option>
                <option value="1">higher (1250 W on inverter 270)</option>
              </select>
              <label htmlFor="family-gridcharge">Grid charging</label>
              <select
                id="family-gridcharge"
                value={v("gridCharge")}
                onChange={set("gridCharge")}
              >
                <option value="0">1250 W</option>
                <option value="1">800 W</option>
              </select>
              <button
                disabled={disabled}
                onClick={() =>
                  act("Power limits", (m) =>
                    m.setPowerLimits(
                      v("feedIn") === "1",
                      v("gridCharge") === "1",
                    ),
                  )
                }
              >
                Set
              </button>
            </div>
          )}
          {can("localApi") && (
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={v("apiEnabled") === "1"}
                  onChange={(e) =>
                    setValues((p) => ({
                      ...p,
                      apiEnabled: e.target.checked ? "1" : "0",
                    }))
                  }
                />{" "}
                Local API, port
              </label>
              <input
                id="family-api-port"
                type="number"
                value={v("apiPort")}
                onChange={set("apiPort")}
              />
              {family === "venusMini" && (
                <>
                  <label htmlFor="family-api-remote">remote port</label>
                  <input
                    id="family-api-remote"
                    type="number"
                    value={v("apiRemotePort")}
                    onChange={set("apiRemotePort")}
                  />
                </>
              )}
              <button
                disabled={disabled}
                onClick={() =>
                  act("Local API", (m) =>
                    m.setLocalApi(
                      v("apiEnabled") === "1",
                      Number(v("apiPort")),
                      Number(v("apiRemotePort")),
                    ),
                  )
                }
              >
                Set
              </button>
            </div>
          )}
          {can("meterIp") && (
            <div className="form-group">
              <label htmlFor="family-meter-ip">
                Meter IP (P1 meter, EcoTracker)
              </label>
              <input
                id="family-meter-ip"
                type="text"
                value={v("meterIp")}
                onChange={set("meterIp")}
              />
              <button
                disabled={disabled}
                onClick={() =>
                  act("Meter IP", (m) => m.setMeterIp(v("meterIp")))
                }
              >
                Set
              </button>
            </div>
          )}
          {toggle("statusLed", "Status LED", (m, on) => m.setStatusLed(on))}
          {toggle("surplusFeedIn", "Surplus feed-in", (m, on) =>
            m.setSurplusFeedIn(on),
          )}
          {toggle("backup", "Backup output", (m, on) => m.setBackup(on))}
          {toggle(
            "bluetooth",
            "Bluetooth",
            (m, on) => m.setBluetooth(on),
            "Off ends this connection.",
          )}
          <div className="form-group">
            {can("phaseDetection") && (
              <button
                disabled={disabled}
                onClick={() =>
                  act("Phase detection", (m) => m.startPhaseDetection())
                }
              >
                Start phase detection
              </button>
            )}
            {can("clock") && (
              <button
                disabled={disabled}
                onClick={() => act("Clock", (m) => m.setClock(new Date()))}
              >
                Set the clock to now
              </button>
            )}
            {can("restart") && (
              <button
                disabled={disabled}
                onClick={() => act("Restart", (m) => m.restartDevice())}
              >
                Restart
              </button>
            )}
          </div>
        </div>
      )}
      {family === "b2500" && (
        <div className="config-section">
          <h3>Settings</h3>
          {[
            <div className="form-group" key="surplus">
              <span>Surplus feed-in (firmware 226 or later, HMJ 108)</span>
              <button
                disabled={disabled}
                onClick={() =>
                  act("Surplus feed-in on", (m) => m.setSurplusFeedIn(true))
                }
              >
                On
              </button>
              <button
                disabled={disabled}
                onClick={() =>
                  act("Surplus feed-in off", (m) => m.setSurplusFeedIn(false))
                }
              >
                Off
              </button>
            </div>,
          ]}
        </div>
      )}

      {family === "meter" && (
        <div className="config-section">
          <h3>Settings</h3>
          <div className="form-group">
            <label htmlFor="family-direction">
              Direction mask (CT002; bit 0-2 = phase A-C)
            </label>
            <input
              id="family-direction"
              type="number"
              value={v("direction")}
              onChange={set("direction")}
            />
            <button
              disabled={disabled}
              onClick={() =>
                act("Direction", (m) =>
                  m.setMeterDirection(Number(v("direction"))),
                )
              }
            >
              Set
            </button>
          </div>
          <div className="form-group">
            <button
              disabled={disabled}
              onClick={() =>
                act("Zero calibration", (m) => m.calibrateMeterZero())
              }
            >
              Zero-point calibration (CT002)
            </button>
            <button
              disabled={disabled}
              onClick={() => act("Restart", (m) => m.restartDevice())}
            >
              Restart
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilyStatusTab;
