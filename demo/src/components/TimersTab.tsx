import React from "react";
import { TimerInfo, TimerInfoResponse } from "@tomquist/hmjs-protocol";

interface TimersTabProps {
  timerInfo: TimerInfoResponse | null;
  isConnected: boolean;
  onGetTimers: () => void;
  onSetTimers: (timers: TimerInfo[]) => Promise<void>;
}

const CSV_HEADER =
  "enabled,start_hour,start_minute,end_hour,end_minute,output_power";

const formatTime = (hour: number, minute: number): string => {
  return `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
};

const TimersTab: React.FC<TimersTabProps> = ({
  timerInfo,
  isConnected,
  onGetTimers,
  onSetTimers,
}) => {
  const [editableTimers, setEditableTimers] = React.useState<TimerInfo[]>([]);
  const [lastUpdate, setLastUpdate] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (timerInfo?.timers) {
      setEditableTimers(timerInfo.timers.map((t) => ({ ...t })));
      setLastUpdate(new Date().toLocaleTimeString());
    }
  }, [timerInfo]);

  const updateTimer = (
    index: number,
    update: (timer: TimerInfo) => TimerInfo,
  ) => {
    setEditableTimers((prev) =>
      prev.map((t, i) => (i === index ? update(t) : t)),
    );
  };

  const handleExportCsv = () => {
    const rows = editableTimers.map((t) =>
      [
        t.enabled ? 1 : 0,
        t.start.hour,
        t.start.minute,
        t.end.hour,
        t.end.minute,
        t.outputPower,
      ].join(","),
    );
    const csv = [CSV_HEADER, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "timers.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the browser a chance to start the download before dropping the URL
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleImportCsv = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const slotCount = editableTimers.length;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const dataLines = lines.slice(1);
      if (dataLines.length !== slotCount) {
        alert(
          `CSV must contain a header and exactly ${slotCount} timer rows (one per device slot).`,
        );
        return;
      }

      const imported: TimerInfo[] = [];

      for (const line of dataLines) {
        const parts = line.split(",").map((p) => p.trim());
        if (parts.length < 6) {
          alert("Each CSV row must have 6 columns.");
          return;
        }

        const enabled = parts[0] === "1" || parts[0].toLowerCase() === "true";
        const [startHour, startMinute, endHour, endMinute, outputPower] = parts
          .slice(1, 6)
          .map(Number);

        if (
          [startHour, startMinute, endHour, endMinute, outputPower].some((n) =>
            Number.isNaN(n),
          )
        ) {
          alert("CSV contains non-numeric timer fields.");
          return;
        }

        imported.push({
          enabled,
          start: { hour: startHour, minute: startMinute },
          end: { hour: endHour, minute: endMinute },
          outputPower,
        });
      }

      setEditableTimers(imported);
    };

    reader.readAsText(file);
    event.target.value = "";
  };

  const handleSaveTimers = async () => {
    if (!editableTimers.length) {
      alert("Read the current schedule from the device before saving.");
      return;
    }
    await onSetTimers(editableTimers);
  };

  const hasTimers = editableTimers.length > 0;

  return (
    <div id="timers-tab" className="tab-pane">
      <div id="timers-container">
        <h2>Timer Schedule</h2>
        <p className="timers-hint">
          The device rewrites all of its timer slots at once, so the complete
          schedule is read first and written back as a whole. Disable a slot you
          do not want to use instead of removing it. Every write is stored in
          the device&apos;s flash memory, so avoid writing the schedule
          repeatedly.
        </p>
        <div className="button-group">
          <button onClick={onGetTimers} disabled={!isConnected}>
            Get Timers
          </button>
          <button
            onClick={handleSaveTimers}
            disabled={!isConnected || !hasTimers}
          >
            Set Timers
          </button>
          <button onClick={handleExportCsv} disabled={!hasTimers}>
            Export CSV
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!hasTimers}
          >
            Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportCsv}
            style={{ display: "none" }}
          />
        </div>

        {!hasTimers && (
          <p>
            No timer schedule loaded. Press &quot;Get Timers&quot; to read the
            current schedule from the device.
          </p>
        )}

        {hasTimers && (
          <div className="device-info">
            <table className="info-table">
              <thead>
                <tr>
                  <th>Slot</th>
                  <th>Enabled</th>
                  <th>Start Hour</th>
                  <th>Start Minute</th>
                  <th>End Hour</th>
                  <th>End Minute</th>
                  <th>Power (W)</th>
                  <th>Preview</th>
                </tr>
              </thead>
              <tbody>
                {editableTimers.map((timer, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Timer ${index + 1} enabled`}
                        checked={timer.enabled}
                        onChange={(e) =>
                          updateTimer(index, (t) => ({
                            ...t,
                            enabled: e.target.checked,
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={timer.start.hour}
                        onChange={(e) =>
                          updateTimer(index, (t) => ({
                            ...t,
                            start: { ...t.start, hour: Number(e.target.value) },
                          }))
                        }
                        className="timer-input"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={timer.start.minute}
                        onChange={(e) =>
                          updateTimer(index, (t) => ({
                            ...t,
                            start: {
                              ...t.start,
                              minute: Number(e.target.value),
                            },
                          }))
                        }
                        className="timer-input"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={timer.end.hour}
                        onChange={(e) =>
                          updateTimer(index, (t) => ({
                            ...t,
                            end: { ...t.end, hour: Number(e.target.value) },
                          }))
                        }
                        className="timer-input"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={timer.end.minute}
                        onChange={(e) =>
                          updateTimer(index, (t) => ({
                            ...t,
                            end: { ...t.end, minute: Number(e.target.value) },
                          }))
                        }
                        className="timer-input"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={800}
                        value={timer.outputPower}
                        onChange={(e) =>
                          updateTimer(index, (t) => ({
                            ...t,
                            outputPower: Number(e.target.value),
                          }))
                        }
                        className="timer-input"
                      />
                    </td>
                    <td>
                      {formatTime(timer.start.hour, timer.start.minute)} -{" "}
                      {formatTime(timer.end.hour, timer.end.minute)} @{" "}
                      {timer.outputPower}W
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="status-line">
              <span>Slots: </span>
              <span>{editableTimers.length}</span>
              {timerInfo && (
                <span>
                  {" "}
                  | Adaptive mode:{" "}
                  {timerInfo.adaptiveModeEnabled ? "on" : "off"}
                </span>
              )}
              <span className="last-update">
                Last Updated: <span>{lastUpdate ?? "-"}</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimersTab;
