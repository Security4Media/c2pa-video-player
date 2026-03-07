import React, { useState } from 'react';
import VideoJS, { VideoJSOptions } from './VideoJS';
import crIconUrl from '../assets/icons/cr-icon.svg';
import crIconInvalidUrl from '../assets/icons/cr-invalid.svg';

export interface VideoJSWithC2PAProps {
  options: VideoJSOptions;
  onReady?: (player: any) => void;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onC2PAButtonClick?: () => void;
  validationState?: 'Unknown' | 'Valid' | 'Trusted' | 'Invalid';
}

const VideoJSWithC2PA: React.FC<VideoJSWithC2PAProps> = ({
  options,
  onReady,
  onTimeUpdate,
  onDurationChange,
  onC2PAButtonClick,
  validationState = 'Unknown',
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const getIcon = () => {
    switch (validationState) {
      case 'Invalid':
        return crIconInvalidUrl;
      case 'Trusted':
      case 'Valid':
      case 'Unknown':
      default:
        return crIconUrl;
    }
  };

  const getColor = () => {
    switch (validationState) {
      case 'Trusted':
        return '#00ff00';
      case 'Valid':
        return '#00ffff';
      case 'Invalid':
        return '#ff0000';
      default:
        return '#ffffff';
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <VideoJS
        options={options}
        onReady={onReady}
        onTimeUpdate={onTimeUpdate}
        onDurationChange={onDurationChange}
      />
      
      {/* C2PA Button Overlay - positioned to integrate with control bar */}
      <button
        onClick={onC2PAButtonClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="c2pa-button"
        style={{
          position: 'absolute',
          bottom: '0.5em',
          left: '0.5em',
          width: '3em',
          height: '3em',
          padding: '0.5em',
          background: isHovered ? 'rgba(0, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.7)',
          border: 'none',
          borderRadius: '0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 200ms ease',
          zIndex: 1,
          font: 'inherit',
        }}
        title="Content Credentials"
        aria-label="Show Content Credentials"
        aria-pressed={false}
        type="button"
      >
        <img
          src={getIcon()}
          alt=""
          aria-hidden="true"
          style={{
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            filter: `drop-shadow(0 0 2px ${getColor()})`,
          }}
        />
      </button>
    </div>
  );
};

export default VideoJSWithC2PA;
