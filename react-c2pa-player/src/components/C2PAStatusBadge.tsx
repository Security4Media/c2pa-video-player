import { useState } from 'react';

interface C2PAStatusBadgeProps {
  validationState: 'Trusted' | 'Valid' | 'Invalid' | 'Unknown';
  isVerified: boolean;
  details?: string[];
  className?: string;
}

export function C2PAStatusBadge({ 
  validationState, 
  isVerified, 
  details = [],
  className = '' 
}: C2PAStatusBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const getStatusColor = () => {
    switch (validationState) {
      case 'Trusted':
        return { bg: '#28a745', icon: '✓', text: 'Trusted' };
      case 'Valid':
        return { bg: '#17a2b8', icon: '✓', text: 'Valid' };
      case 'Invalid':
        return { bg: '#dc3545', icon: '✗', text: 'Invalid' };
      default:
        return { bg: '#ffc107', icon: '?', text: 'Unknown' };
    }
  };

  const status = getStatusColor();

  return (
    <div 
      className={`c2pa-status-badge ${className}`}
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 10000,
        cursor: 'pointer',
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: status.bg,
          color: 'white',
          padding: '10px 16px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          transition: 'all 0.3s ease',
          transform: showTooltip ? 'scale(1.05)' : 'scale(1)',
        }}
      >
        <div
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            border: '2px solid white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '14px',
          }}
        >
          {status.icon}
        </div>
        <div>
          <div style={{ fontSize: '12px', fontWeight: '600', opacity: 0.9 }}>
            C2PA Content Credentials
          </div>
          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
            {status.text}
          </div>
        </div>
      </div>

      {showTooltip && details.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: '0',
            marginTop: '8px',
            background: 'white',
            color: '#333',
            padding: '12px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            minWidth: '250px',
            maxWidth: '400px',
            fontSize: '12px',
            lineHeight: '1.6',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '8px', color: status.bg }}>
            Manifest Details
          </div>
          {details.map((detail, idx) => (
            <div key={idx} style={{ marginBottom: '4px' }}>
              {detail}
            </div>
          ))}
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #eee' }}>
            <strong>Verified:</strong> {isVerified ? 'Yes' : 'No'}
          </div>
        </div>
      )}
    </div>
  );
}
