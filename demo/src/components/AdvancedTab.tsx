import React, { useState, useEffect, useRef, useCallback } from "react";
import ProtocolInfo from "./ProtocolInfo";

interface AdvancedTabProps {
  isConnected: boolean;
  onSendRawCommand: (hexString: string) => Promise<void>;
  onBuildCommand: (
    commandType: string,
    payload: string,
    payloadType?: "hex" | "string",
  ) => string;
  rawResponses: string[];
}

const AdvancedTab: React.FC<AdvancedTabProps> = ({
  isConnected,
  onSendRawCommand,
  onBuildCommand,
  rawResponses,
}) => {
  const [hexCommand, setHexCommand] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastError, setLastError] = useState<string>("");

  // Command builder state
  const [commandType, setCommandType] = useState("");
  const [payload, setPayload] = useState("");
  const [payloadType, setPayloadType] = useState<"hex" | "string">("hex");
  const [buildError, setBuildError] = useState<string>("");

  // Ref for auto-scrolling hex dump container
  const hexDumpContainerRef = useRef<HTMLDivElement>(null);

  // Clear error when command changes
  useEffect(() => {
    if (lastError) {
      setLastError("");
    }
  }, [hexCommand, lastError]);

  const handleSendCommand = async () => {
    if (!hexCommand.trim()) {
      setLastError("Please enter a hex command");
      return;
    }

    setIsSending(true);
    setLastError("");

    try {
      await onSendRawCommand(hexCommand.trim());
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendCommand();
    }
  };

  const handleBuildCommand = () => {
    if (!commandType.trim()) {
      setBuildError("Please enter a command type");
      return;
    }

    try {
      const builtHex = onBuildCommand(
        commandType.trim(),
        payload.trim(),
        payloadType,
      );
      setHexCommand(builtHex);
      setBuildError("");
    } catch (error) {
      setBuildError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleBuildAndSendCommand = async () => {
    if (!commandType.trim()) {
      setBuildError("Please enter a command type");
      return;
    }

    if (!isConnected) {
      setBuildError("Not connected to device");
      return;
    }

    setIsSending(true);
    setBuildError("");

    try {
      const builtHex = onBuildCommand(
        commandType.trim(),
        payload.trim(),
        payloadType,
      );
      setHexCommand(builtHex);
      await onSendRawCommand(builtHex);
    } catch (error) {
      setBuildError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSending(false);
    }
  };

  // Clear build error when inputs change
  useEffect(() => {
    if (buildError) {
      setBuildError("");
    }
  }, [commandType, payload, payloadType, buildError]);

  // Convert payload when switching types - using proper memoization to avoid infinite loops
  const convertPayload = useCallback(
    (currentPayload: string, newPayloadType: "hex" | "string") => {
      if (!currentPayload.trim()) return currentPayload;

      try {
        if (newPayloadType === "string") {
          // Converting from hex to string
          const cleanHex = currentPayload
            .replace(/\s+/g, "")
            .replace(/0x/gi, "");
          if (/^[0-9a-fA-F]*$/.test(cleanHex) && cleanHex.length % 2 === 0) {
            const bytes = new Uint8Array(cleanHex.length / 2);
            for (let i = 0; i < cleanHex.length; i += 2) {
              bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
            }
            const decoder = new TextDecoder("utf-8", { fatal: false });
            const converted = decoder.decode(bytes);
            // Only convert if it results in mostly printable characters
            if (
              converted &&
              // eslint-disable-next-line no-control-regex
              converted.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").length >
                converted.length * 0.5
            ) {
              return converted;
            }
          }
        } else {
          // Converting from string to hex
          const encoder = new TextEncoder();
          const bytes = encoder.encode(currentPayload);
          return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" ");
        }
      } catch (error) {
        console.log("Payload conversion failed:", error);
      }
      return currentPayload;
    },
    [],
  );

  // Track previous payload type to detect changes
  const previousPayloadType = useRef(payloadType);

  useEffect(() => {
    // Only convert when payload type actually changes
    if (previousPayloadType.current !== payloadType) {
      setPayload((currentPayload) =>
        convertPayload(currentPayload, payloadType),
      );
      previousPayloadType.current = payloadType;
    }
  }, [payloadType, convertPayload]);

  // Get the converted representation for display
  const getConvertedPayload = (): string => {
    if (!payload.trim()) return "";

    try {
      if (payloadType === "hex") {
        // Show string representation of hex
        const cleanHex = payload.replace(/\s+/g, "").replace(/0x/gi, "");
        if (/^[0-9a-fA-F]*$/.test(cleanHex) && cleanHex.length % 2 === 0) {
          const bytes = new Uint8Array(cleanHex.length / 2);
          for (let i = 0; i < cleanHex.length; i += 2) {
            bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
          }
          const decoder = new TextDecoder("utf-8", { fatal: false });
          const decoded = decoder.decode(bytes);
          // Show printable characters, replace non-printable with dots
          // eslint-disable-next-line no-control-regex
          return decoded.replace(/[\u0000-\u001F\u007F-\u009F]/g, ".");
        }
      } else {
        // Show hex representation of string
        const encoder = new TextEncoder();
        const bytes = encoder.encode(payload);
        return Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ");
      }
    } catch {
      return "Invalid format";
    }

    return "";
  };

  // Auto-scroll to bottom when new responses arrive
  useEffect(() => {
    if (hexDumpContainerRef.current) {
      hexDumpContainerRef.current.scrollTop =
        hexDumpContainerRef.current.scrollHeight;
    }
  }, [rawResponses]);

  return (
    <div id="advanced-tab" className="tab-pane">
      <div className="advanced-container">
        <h2>🔧 Advanced Mode</h2>

        <div className="danger-warning">
          <div className="warning-header">
            ⚠️ <strong>DANGER - ADVANCED USERS ONLY</strong> ⚠️
          </div>
          <div className="warning-content">
            <p>
              <strong>
                This mode allows you to send raw hex commands directly to the
                device.
              </strong>
            </p>
            <ul>
              <li>
                Improper commands may damage your device or cause unexpected
                behavior
              </li>
              <li>Only use if you understand the device protocol</li>
              <li>Commands are sent without validation or safety checks</li>
              <li>Use at your own risk - no warranty provided</li>
            </ul>
          </div>
        </div>

        <div className="command-builder-section">
          <h3>Command Builder</h3>
          <p>Build valid commands using the protocol structure:</p>

          <div className="builder-inputs">
            <div className="builder-row">
              <label htmlFor="command-type">Command Type:</label>
              <input
                id="command-type"
                type="text"
                value={commandType}
                onChange={(e) => setCommandType(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && e.shiftKey && isConnected) {
                    e.preventDefault();
                    handleBuildAndSendCommand();
                  } else if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleBuildCommand();
                  }
                }}
                placeholder="3, 4, 0x0F, etc."
                className="builder-input"
              />
            </div>

            <div className="builder-row">
              <label htmlFor="payload">Payload (optional):</label>
              <div className="payload-input-group">
                <div className="payload-type-selector">
                  <label>
                    <input
                      type="radio"
                      name="payloadType"
                      value="hex"
                      checked={payloadType === "hex"}
                      onChange={(e) =>
                        setPayloadType(e.target.value as "hex" | "string")
                      }
                    />
                    Hex
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="payloadType"
                      value="string"
                      checked={payloadType === "string"}
                      onChange={(e) =>
                        setPayloadType(e.target.value as "hex" | "string")
                      }
                    />
                    String
                  </label>
                </div>
                <input
                  id="payload"
                  type="text"
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && e.shiftKey && isConnected) {
                      e.preventDefault();
                      handleBuildAndSendCommand();
                    } else if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleBuildCommand();
                    }
                  }}
                  placeholder={
                    payloadType === "hex"
                      ? "48 4d 2d 42 (hex bytes, spaces optional)"
                      : "Hello World (UTF-8 string)"
                  }
                  className="builder-input"
                />
                {payload.trim() && getConvertedPayload() && (
                  <div className="payload-conversion-info">
                    <span className="conversion-label">
                      {payloadType === "hex" ? "As String:" : "As Hex:"}
                    </span>
                    <span className="conversion-value">
                      {getConvertedPayload()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="build-buttons">
              <button onClick={handleBuildCommand} className="build-button">
                Build Command
              </button>
              <button
                onClick={handleBuildAndSendCommand}
                disabled={!isConnected || isSending}
                className="build-send-button"
              >
                {isSending ? "Sending..." : "Build & Send"}
              </button>
            </div>
          </div>

          {buildError && (
            <div className="error-message">Error: {buildError}</div>
          )}

          <ProtocolInfo className="builder-examples" />
        </div>

        <div className="command-section">
          <h3>Send Raw Command</h3>

          <div className="input-group">
            <label htmlFor="hex-input">Hex Command:</label>
            <input
              id="hex-input"
              type="text"
              value={hexCommand}
              onChange={(e) => setHexCommand(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="73 05 23 03 55 (spaces optional)"
              disabled={!isConnected || isSending}
              className="hex-input"
            />
            <button
              onClick={handleSendCommand}
              disabled={!isConnected || isSending || !hexCommand.trim()}
              className="send-button"
            >
              {isSending ? "Sending..." : "Send Command"}
            </button>
          </div>

          {lastError && <div className="error-message">Error: {lastError}</div>}
        </div>

        <div className="response-section">
          <div className="response-header-section">
            <h3>Raw Responses (Hex Dump)</h3>
            {rawResponses.length > 0 && (
              <button
                onClick={() => {
                  // We'll need to pass this up to the parent component to clear responses
                  // For now, let's just clear the container scroll
                  if (hexDumpContainerRef.current) {
                    hexDumpContainerRef.current.scrollTop = 0;
                  }
                }}
                className="clear-responses-button"
                title="Scroll to top"
              >
                ↑ Top
              </button>
            )}
          </div>
          <div className="hex-dump-container" ref={hexDumpContainerRef}>
            {rawResponses.length === 0 ? (
              <div className="no-responses">
                No responses yet. Send a command to see hex data.
              </div>
            ) : (
              rawResponses.map((response, index) => (
                <div key={index} className="hex-response">
                  <div className="response-header">
                    <span className="response-timestamp">
                      [{index + 1}] {response.split(" - ")[0]}
                    </span>
                  </div>
                  <pre className="hex-data">{response.split(" - ")[1]}</pre>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="help-section">
          <h4>Help</h4>
          <ul>
            <li>
              <strong>Command Builder:</strong> Press <kbd>Enter</kbd> to build
              command, <kbd>Shift+Enter</kbd> to build & send
            </li>
            <li>
              <strong>Raw Hex Input:</strong> Enter hex commands with or without
              spaces (e.g., &quot;73 05 23 03 55&quot; or
              &quot;7305230355&quot;)
            </li>
            <li>
              <strong>Responses:</strong> All device responses are shown as hex
              dumps with auto-scroll
            </li>

            <li>
              <strong>Debug Logs:</strong> Check the logs panel below for
              additional details
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdvancedTab;
