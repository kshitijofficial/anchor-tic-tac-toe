import React from "react";

/**
 * Loading spinner component
 */
export const LoadingSpinner: React.FC = () => {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px',
    }}>
      <div className="spinner"></div>
    </div>
  );
};
