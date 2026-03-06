import { useEffect, useState } from 'react';
import { C2PAPlayer } from './components/C2PAPlayer';

function App() {
  const [videoPlayer, setVideoPlayer] = useState<any>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [isMonolithic, setIsMonolithic] = useState(true);
  const [statusMessage, setStatusMessage] = useState('Initializing...');

  useEffect(() => {
    console.log('[React C2PA] App mounted and initializing...');
    
    // Wait for the parent page to initialize the video player
    const checkForPlayer = () => {
      const video = document.querySelector('#videoPlayer') as HTMLVideoElement;
      
      if (video && (window as any).videojs) {
        setVideoElement(video);
        setStatusMessage('Found video element, waiting for player...');
        
        // Check if videojs player is already initialized
        const vjsPlayer = (window as any).videojs.getPlayer?.(video);
        if (vjsPlayer) {
          console.log('[React C2PA] Found existing videojs player');
          setVideoPlayer(vjsPlayer);
          setStatusMessage('Player initialized!');
        }
      } else if (!video) {
        setStatusMessage('Waiting for video element...');
      } else if (!(window as any).videojs) {
        setStatusMessage('Waiting for video.js library...');
      }
    };

    // Check immediately
    checkForPlayer();

    // Also check periodically in case player is initialized later
    const interval = setInterval(checkForPlayer, 500);

    // Expose initialization function for external use
    (window as any).initReactC2PAPlayer = (player: any, element: HTMLVideoElement, monolithic = true) => {
      console.log('[React C2PA] Initializing with player:', player, 'isMonolithic:', monolithic);
      setVideoPlayer(player);
      setVideoElement(element);
      setIsMonolithic(monolithic);
      setStatusMessage('Player connected!');
    };

    // Expose playback update function for C2PA status updates
    (window as any).c2paPlayerUpdate = (c2paStatus: any) => {
      console.log('[React C2PA] C2PA status update:', c2paStatus);
      // This will be handled by the C2PAPlayer component
    };

    console.log('[React C2PA] initReactC2PAPlayer function exposed on window');
    setStatusMessage('Ready, waiting for video player to load...');

    return () => {
      clearInterval(interval);
      delete (window as any).c2paPlayerUpdate;
    };
  }, []);

  return (
    <>
      {videoPlayer && videoElement ? (
        <C2PAPlayer 
          videoPlayer={videoPlayer} 
          videoElement={videoElement} 
          isMonolithic={isMonolithic}
        />
      ) : (
        <div style={{ 
          position: 'fixed', 
          bottom: '10px', 
          right: '10px', 
          background: 'rgba(0,0,0,0.7)', 
          color: 'white', 
          padding: '8px 12px', 
          borderRadius: '4px', 
          fontSize: '12px',
          zIndex: 9999
        }}>
          React C2PA: {statusMessage}
          <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.7 }}>
            Click "Load Stream" to initialize player
          </div>
        </div>
      )
      }
    </>
  );
}

export default App;
