import React, { useState } from "react";

interface PayloadExampleProps {
  commandCode: string;
  commandName: string;
  children: React.ReactNode;
}

const PayloadExample: React.FC<PayloadExampleProps> = ({
  commandCode,
  commandName,
  children,
}) => {
  const [showPayload, setShowPayload] = useState(false);

  return (
    <div className="payload-example">
      <div className="payload-header">
        <span className="command-info">
          <code>{commandCode}</code> - {commandName}
        </span>
        <button
          type="button"
          className="payload-toggle-button"
          onClick={() => setShowPayload(!showPayload)}
          aria-expanded={showPayload}
        >
          {showPayload ? "Hide" : "Show"} Payload
        </button>
      </div>
      {showPayload && <div className="payload-content">{children}</div>}
    </div>
  );
};

export default PayloadExample;
