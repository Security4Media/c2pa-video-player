import { useState, useEffect, useRef } from 'react';
import crIconUrl from '../assets/icons/cr-icon.svg?url';
import crInvalidIconUrl from '../assets/icons/cr-invalid.svg?url';

interface C2PAControlButtonProps {
  videoPlayer: any;
  onToggle: () => void;
  validationState: 'Trusted' | 'Valid' | 'Invalid' | 'Unknown';
}

export function C2PAControlButton({ videoPlayer, onToggle, validationState }: C2PAControlButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Get icon based on validation state
  const getIcon = () => {
    switch (validationState) {
      case 'Trusted':
      case 'Valid':
        return crIconUrl;
      case 'Invalid':
        return crInvalidIconUrl;
      default:
        return crIconUrl;
    }
  };

  const getColor = () => {
    switch (validationState) {
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

  // Position the button in the Video.js control bar (before play button)
  useEffect(() => {
    if (!videoPlayer || !buttonRef.current) return;

    const controlBar = videoPlayer.controlBar?.el();
    if (!controlBar) return;

    const playButton = controlBar.querySelector('.vjs-play-control');
    
    if (playButton) {
      controlBar.insertBefore(buttonRef.current, playButton);
    } else {
      const firstChild = controlBar.firstChild;
      if (firstChild) {
        controlBar.insertBefore(buttonRef.current, firstChild);
      } else {
        controlBar.appendChild(buttonRef.current);
      }
    }

    // Native event listener as backup
    const handleNativeClick = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle();
    };

    buttonRef.current.addEventListener('click', handleNativeClick, true);

    return () => {
      if (buttonRef.current) {
        buttonRef.current.removeEventListener('click', handleNativeClick, true);
        const currentRef = buttonRef.current;
        if (controlBar.contains(currentRef)) {
          controlBar.removeChild(currentRef);
        }
      }
    };
  }, [videoPlayer, onToggle]);

  return (
    <div
      ref={buttonRef}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '4em',
        height: '100%',
        cursor: 'pointer',
        position: 'relative',
        background: isHovered ? 'rgba(255,255,255,0.15)' : 'transparent',
        transition: 'background 0.2s',
        borderRight: '1px solid rgba(255,255,255,0.1)',
        marginLeft: '0',
        pointerEvents: 'all',
        userSelect: 'none',
        touchAction: 'manipulation',
      }}
      title="Content Credentials"
      className="vjs-control vjs-button c2pa-control-button"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }
      }}
    >
      <div style={{
        width: '2.5em',
        height: '2.5em',
        background: `url(${getIcon()}) center center / contain no-repeat`,
        filter: isHovered ? 'brightness(1.2)' : 'none',
        transition: 'filter 0.2s',
        pointerEvents: 'none',
      }} />
      
      {/* Status indicator dot */}
      <div style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: getColor(),
        border: '1.5px solid rgba(0,0,0,0.5)',
        boxShadow: `0 0 4px ${getColor()}`,
      }} />

      {/* Hover tooltip */}
      {isHovered && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '8px',
          background: 'rgba(0,0,0,0.9)',
          color: 'white',
          padding: '6px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 1000,
        }}>
          Content Credentials: {validationState}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '4px solid rgba(0,0,0,0.9)',
          }} />
        </div>
      )}
    </div>
  );
}
