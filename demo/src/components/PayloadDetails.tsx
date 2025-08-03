import React from "react";

interface PayloadDetailsProps {
  children: React.ReactNode;
}

export const PayloadDetails: React.FC<PayloadDetailsProps> = ({ children }) => {
  return <div className="payload-details">{children}</div>;
};

interface PayloadFormatProps {
  format: string;
}

export const PayloadFormat: React.FC<PayloadFormatProps> = ({ format }) => {
  return (
    <div className="payload-format">
      <code>{format}</code>
    </div>
  );
};

interface PayloadExampleCommandProps {
  children: React.ReactNode;
}

export const PayloadExampleCommand: React.FC<PayloadExampleCommandProps> = ({
  children,
}) => {
  return <div className="payload-example-cmd">{children}</div>;
};

interface StructureInfoProps {
  title: string;
  children: React.ReactNode;
  variant?: "timer" | "response";
}

export const StructureInfo: React.FC<StructureInfoProps> = ({
  title,
  children,
  variant = "timer",
}) => {
  const className =
    variant === "response" ? "timer-response-info" : "timer-structure";

  return (
    <div className={className}>
      <h6>{title}</h6>
      {children}
    </div>
  );
};

export default PayloadDetails;
