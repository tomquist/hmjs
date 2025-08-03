import React, { useState } from "react";

interface CollapsibleSectionProps {
  title: string;
  buttonText: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  buttonText,
  children,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="protocol-section">
      <div className="protocol-section-header">
        <h4>{title}</h4>
        <button
          type="button"
          className="collapse-button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
        >
          {isOpen ? "Hide" : "Show"} {buttonText}
        </button>
      </div>
      {isOpen && children}
    </div>
  );
};

export default CollapsibleSection;
