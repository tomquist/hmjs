import React from "react";

interface LogsTabProps {
  logs: string[];
  onClearLogs: () => void;
}

const LogsTab: React.FC<LogsTabProps> = ({ logs, onClearLogs }) => {
  // Ref for the logs container element
  const logsRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when logs update
  React.useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div id="logs-tab" className="tab-pane">
      <h2>Debug Logs</h2>
      <div className="log-actions">
        <button onClick={onClearLogs}>Clear Logs</button>
      </div>
      <div id="logs" className="logs" ref={logsRef}>
        {logs.map((log, index) => (
          <div key={index}>{log}</div>
        ))}
      </div>
    </div>
  );
};

export default LogsTab;
