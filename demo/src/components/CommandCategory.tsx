import React from "react";
import PayloadExample from "./PayloadExample";

interface CommandCategoryProps {
  title: string;
  icon: string;
  children: React.ReactNode;
}

const CommandCategory: React.FC<CommandCategoryProps> = ({
  title,
  icon,
  children,
}) => {
  return (
    <div className="command-category">
      <h5>
        {icon} {title}
      </h5>
      <ul>{children}</ul>
    </div>
  );
};

// Simple command component for commands without payload details
interface SimpleCommandProps {
  commandCode: string;
  description: string;
}

export const SimpleCommand: React.FC<SimpleCommandProps> = ({
  commandCode,
  description,
}) => {
  return (
    <li>
      <code>{commandCode}</code> - {description}
    </li>
  );
};

// Command with payload example
interface PayloadCommandProps {
  commandCode: string;
  commandName: string;
  children: React.ReactNode;
}

export const PayloadCommand: React.FC<PayloadCommandProps> = ({
  commandCode,
  commandName,
  children,
}) => {
  return (
    <li>
      <PayloadExample commandCode={commandCode} commandName={commandName}>
        {children}
      </PayloadExample>
    </li>
  );
};

export default CommandCategory;
