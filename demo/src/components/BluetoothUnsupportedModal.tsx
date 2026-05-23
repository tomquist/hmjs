import React, { useState } from "react";

interface BluetoothUnsupportedModalProps {
  isIOS: boolean;
}

const BLUEFY_APP_STORE_URL = "https://apps.apple.com/app/id1492822055";

const BluetoothUnsupportedModal: React.FC<BluetoothUnsupportedModalProps> = ({
  isIOS,
}) => {
  const [copied, setCopied] = useState(false);

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

  const handleCopy = async () => {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(pageUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }

      // Fallback for environments without the async Clipboard API
      // (e.g. older iOS Safari, non-secure contexts).
      if (typeof document === "undefined") {
        return;
      }
      const textarea = document.createElement("textarea");
      textarea.value = pageUrl;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "0";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, pageUrl.length);
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(textarea);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Swallow — leave `copied` as-is so the button label doesn't lie.
    }
  };

  return (
    <div className="disclaimer-overlay">
      <div className="disclaimer-modal bluetooth-unsupported-modal">
        <div className="disclaimer-header">
          <span className="disclaimer-icon">&#128268;</span> Web Bluetooth not
          available
        </div>
        <div className="disclaimer-body">
          {isIOS ? (
            <>
              <p>
                iOS browsers (Safari, Chrome, Edge, Firefox) do{" "}
                <strong>not support the Web Bluetooth API</strong>, so this demo
                cannot connect to your device directly.
              </p>
              <p>
                To use this tool on iPhone or iPad, please open it in{" "}
                <strong>Bluefy – Web BLE Browser</strong>, a free third-party
                browser that adds Web Bluetooth support on iOS:
              </p>
              <p>
                <a
                  href={BLUEFY_APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bluefy-link"
                >
                  Get Bluefy on the App Store
                </a>
              </p>
              <p>
                After installing, open Bluefy and paste this page&apos;s URL
                into its address bar:
              </p>
              <div className="bluetooth-url-row">
                <code className="bluetooth-url">{pageUrl}</code>
                <button
                  type="button"
                  className="disclaimer-button bluetooth-copy-button"
                  onClick={handleCopy}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                Web Bluetooth is <strong>not supported</strong> in this browser.
              </p>
              <p>
                Please open this page in <strong>Chrome</strong>,{" "}
                <strong>Edge</strong>, or <strong>Opera</strong> on a desktop or
                Android device.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BluetoothUnsupportedModal;
