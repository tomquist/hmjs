import React from "react";
import { CellInfo } from "@tomquist/hmjs-protocol";

interface CellInfoTabProps {
  cellInfo: CellInfo | null;
  isConnected: boolean;
  onGetCellInfo: () => void;
}

const CellInfoTab: React.FC<CellInfoTabProps> = ({
  cellInfo,
  isConnected,
  onGetCellInfo,
}) => {
  // Calculate cell statistics
  const cellStats = React.useMemo(() => {
    if (!cellInfo || !cellInfo.cellVoltages.length) return null;

    const minVoltage = Math.min(...cellInfo.cellVoltages);
    const maxVoltage = Math.max(...cellInfo.cellVoltages);
    const avgVoltage =
      cellInfo.cellVoltages.reduce((sum, v) => sum + v, 0) /
      cellInfo.cellVoltages.length;
    const voltageSpread = maxVoltage - minVoltage;

    return {
      minVoltage,
      maxVoltage,
      avgVoltage,
      voltageSpread,
    };
  }, [cellInfo]);

  return (
    <div id="cell-tab" className="tab-pane">
      <div id="cell-info-container">
        <h2>Battery Cell Information</h2>
        <button onClick={onGetCellInfo} disabled={!isConnected}>
          Get Cell Info
        </button>

        {cellInfo && (
          <div className="cell-info-container">
            {/* Summary section */}
            <div className="summary">
              <div>
                <strong>State of Charge:</strong> {cellInfo.soc}%
              </div>
              <div>
                <strong>Temperature:</strong> {cellInfo.temperature1}°C /{" "}
                {cellInfo.temperature2}°C
              </div>
              <div>
                <strong>Number of Cells:</strong> {cellInfo.cellVoltages.length}
              </div>
            </div>

            {/* Statistics */}
            {cellStats && (
              <div className="voltage-stats">
                <div>
                  <strong>Min Voltage:</strong>{" "}
                  {(cellStats.minVoltage / 1000).toFixed(3)} V
                </div>
                <div>
                  <strong>Max Voltage:</strong>{" "}
                  {(cellStats.maxVoltage / 1000).toFixed(3)} V
                </div>
                <div>
                  <strong>Avg Voltage:</strong>{" "}
                  {(cellStats.avgVoltage / 1000).toFixed(3)} V
                </div>
                <div>
                  <strong>Voltage Spread:</strong>{" "}
                  {(cellStats.voltageSpread / 1000).toFixed(3)} V
                </div>
              </div>
            )}

            {/* Cell voltages grid */}
            <div className="cell-voltages">
              {cellInfo.cellVoltages.map((voltage, index) => {
                const volts = (voltage / 1000).toFixed(3);
                return (
                  <div key={index} className="cell">
                    Cell {index + 1}: {volts}V
                  </div>
                );
              })}
            </div>

            {/* Last updated */}
            <div className="last-updated">
              Last Updated: {new Date().toLocaleTimeString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CellInfoTab;
