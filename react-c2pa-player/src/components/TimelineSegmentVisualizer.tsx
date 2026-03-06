interface TimelineSegmentVisualizerProps {
  validationState: 'Trusted' | 'Valid' | 'Invalid' | 'Unknown';
  currentTime?: number;
  duration?: number;
}

export function TimelineSegmentVisualizer({ 
  validationState,
  currentTime = 0,
  duration = 100,
}: TimelineSegmentVisualizerProps) {

  const getStateColor = (state: string) => {
    switch (state) {
      case 'Trusted':
        return '#28a745';
      case 'Valid':
        return '#17a2b8';
      case 'Invalid':
        return '#dc3545';
      default:
        return '#ffc107';
    }
  };

  const getStateLabel = (state: string) => {
    switch (state) {
      case 'Trusted':
        return '✓ Trusted Content';
      case 'Valid':
        return '✓ Valid Content';
      case 'Invalid':
        return '✗ Invalid Content';
      default:
        return '? Unknown Status';
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%) scale(0.75)',
      zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.85)',
      padding: '12px 20px',
      borderRadius: '8px',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    }}>
      <div style={{
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: getStateColor(validationState),
        boxShadow: `0 0 8px ${getStateColor(validationState)}`,
        animation: 'pulse 2s infinite',
      }} />
      <div style={{ fontSize: '13px', fontWeight: '500' }}>
        {getStateLabel(validationState)}
      </div>
      <div style={{
        marginLeft: '8px',
        padding: '4px 10px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '4px',
        fontSize: '11px',
        fontFamily: 'monospace',
      }}>
        {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(0.95); }
        }
      `}</style>
    </div>
  );
}
