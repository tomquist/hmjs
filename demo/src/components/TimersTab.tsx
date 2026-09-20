import React from "react";
import { TimerInfo, TimerInfoResponse } from "@tomquist/hmjs-protocol";

interface TimersTabProps {
  timerInfo: TimerInfoResponse | null;
  isConnected: boolean;
  onGetTimers: () => void;
  onSetTimers: (timers: TimerInfo[]) => Promise<void>;
}

const formatTime = (hour: number, minute: number): string => {
  return `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
};

const createEmptyTimer = (): TimerInfo => ({
  enabled: false,
  start: { hour: 0, minute: 0 },
  end: { hour: 0, minute: 0 },
  outputPower: 0,
});

const TimersTab: React.FC<TimersTabProps> = ({
  timerInfo,
  isConnected,
  onGetTimers,
  onSetTimers,
}) => {
  const [editableTimers, setEditableTimers] = React.useState<TimerInfo[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (timerInfo?.timers) {
      setEditableTimers(timerInfo.timers.map((t) => ({ ...t })));
    }
  }, [timerInfo]);

  const updateTimer = (
    index: number,
    update: (timer: TimerInfo) => TimerInfo,
  ) => {
    setEditableTimers((prev) => prev.map((t, i) => (i === index ? update(t) : t)));
  };

  const addTimer = () => {
    setEditableTimers((prev) => [...prev, createEmptyTimer()]);
  };

  const removeTimer = (index: number) => {
    setEditableTimers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleExportCsv = () => {
    const header =
      "enabled,start_hour,start_minute,end_hour,end_minute,output_power";
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
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "timers.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        alert("CSV must include a header and at least one timer row.");
        return;
      }

      const dataLines = lines.slice(1);
      const imported: TimerInfo[] = [];

      for (const line of dataLines) {
        const parts = line.split(",").map((p) => p.trim());
        if (parts.length < 6) {
          alert("Each CSV row must have 6 columns.");
          return;
        }

        const enabled = parts[0] === "1" || parts[0].toLowerCase() === "true";
        const startHour = Number(parts[1]);
        const startMinute = Number(parts[2]);
        const endHour = Number(parts[3]);
        const endMinute = Number(parts[4]);
        const outputPower = Number(parts[5]);

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
      alert("Add at least one timer before saving.");
      return;
    }
    await onSetTimers(editableTimers);
  };

  return (
    <div id="timers-tab" className="tab-pane">
      <div id="timers-container">
        <h2>Timer Schedule</h2>
        <div className="button-group">
          <button onClick={onGetTimers} disabled={!isConnected}>
            Get Timers
          </button>
          <button onClick={handleSaveTimers} disabled={!isConnected}>
            Set Timers
          </button>
          <button onClick={addTimer}>Add Timer</button>
          <button onClick={handleExportCsv} disabled={!editableTimers.length}>
            Export CSV
          </button>
          <button onClick={() => fileInputRef.current?.click()}>Import CSV</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportCsv}
            style={{ display: "none" }}
          />
        </div>

        {!!editableTimers.length && (
          <div className="device-info">
            <table className="info-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Enabled</th>
                  <th>Start Hour</th>
                  <th>Start Minute</th>
                  <th>End Hour</th>
                  <th>End Minute</th>
                  <th>Power (W)</th>
                  <th>Preview</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {editableTimers.map((timer, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>
                      <input
                        type="checkbox"
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
                        max={65535}
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
                      {formatTime(timer.end.hour, timer.end.minute)} @ {timer.outputPower}
                      W
                    </td>
                    <td>
                      <button type="button" onClick={() => removeTimer(index)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="status-line">
              <span>Entries: </span>
              <span>{editableTimers.length}</span>
              <span className="last-update">
                Last Updated: <span>{new Date().toLocaleTimeString()}</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimersTab;
