import { useEffect } from 'react';
import crIconUrl from '../assets/icons/cr-icon.svg?url';
import crInvalidIconUrl from '../assets/icons/cr-invalid.svg?url';

interface C2PAControlButtonProps {
  videoPlayer: any;
  onToggle: () => void;
  validationState: 'Trusted' | 'Valid' | 'Invalid' | 'Unknown';
}

export function C2PAControlButton({ videoPlayer, onToggle, validationState }: C2PAControlButtonProps) {
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

  // Register and add button as a Video.js component
  useEffect(() => {
    if (!videoPlayer || !window.videojs) return;

    const videojs = window.videojs as any;
    const Button = videojs.getComponent('Button');
    if (!Button) {
      console.error('[C2PA Button] Button component not found');
      return;
    }

    // Check if button already exists in control bar
    try {
      const existingButton = videoPlayer.controlBar.getChild('C2PAButton');
      if (existingButton) {
        console.log('[C2PA Button] Button already exists');
        // Update the callback
        if (existingButton.options_) {
          existingButton.options_.onToggle = onToggle;
        }
        return;
      }
    } catch (e) {
      // Button doesn't exist, continue
    }

    // Check if component is already registered
    let C2PAButton = null;
    try {
      C2PAButton = videojs.getComponent('C2PAButton');
      console.log('[C2PA Button] Component already registered');
    } catch (e) {
      // Component not registered yet, register it
      console.log('[C2PA Button] Registering component...');
      
      // Create the button component using ES6 class syntax
      class C2PAButtonClass extends Button {
        constructor(player: any, options: any) {
          super(player, options);
          this.controlText('Content Credentials');
          this.addClass('vjs-c2pa-button');
          
          // Store options for later use
          this.options_ = options;
        }

        buildCSSClass() {
          return `vjs-c2pa-button ${super.buildCSSClass()}`;
        }

        handleClick() {
          // Trigger the React callback
          if (this.options_ && this.options_.onToggle) {
            this.options_.onToggle();
          }
        }

        createEl() {
          const el = super.createEl('button', {
            className: 'vjs-c2pa-button vjs-control vjs-button',
          });

          // Create icon element
          const icon = document.createElement('img');
          icon.src = this.options_?.iconUrl || crIconUrl;
          icon.alt = 'Content Credentials';
          icon.style.width = '2em';
          icon.style.height = '2em';
          icon.style.pointerEvents = 'none';
          if (this.options_?.color) {
            icon.style.filter = `drop-shadow(0 0 2px ${this.options_.color})`;
          }

          el.appendChild(icon);
          return el;
        }
      }

      // Register the component
      videojs.registerComponent('C2PAButton', C2PAButtonClass);
      console.log('[C2PA Button] Component registered successfully');
      
      // Verify registration
      try {
        C2PAButton = videojs.getComponent('C2PAButton');
        console.log('[C2PA Button] Component verified:', !!C2PAButton);
      } catch (verifyError) {
        console.error('[C2PA Button] Failed to verify component registration:', verifyError);
        return;
      }
    }

    const options = {
      onToggle,
      iconUrl: getIcon(),
      color: getColor(),
    };

    try {
      // Add button to control bar at the beginning (index 0)
      videoPlayer.controlBar.addChild(
        'C2PAButton',
        options,
        0 // Position at the start
      );
      console.log('[C2PA Button] Added button to control bar');
    } catch (error) {
      console.error('[C2PA Button] Error adding button:', error);
    }

    return () => {
      // Cleanup: remove button when component unmounts
      try {
        const button = videoPlayer.controlBar.getChild('C2PAButton');
        if (button) {
          videoPlayer.controlBar.removeChild(button);
        }
      } catch (e) {
        // Button already removed or doesn't exist
      }
    };
  }, [videoPlayer, onToggle]);

  // Update button icon when validation state changes
  useEffect(() => {
    if (!videoPlayer) return;

    try {
      const button = videoPlayer.controlBar.getChild('C2PAButton');
      if (button && button.el()) {
        const icon = button.el().querySelector('img');
        if (icon) {
          icon.src = getIcon();
          icon.style.filter = `drop-shadow(0 0 2px ${getColor()})`;
        }
      }
    } catch (e) {
      // Button doesn't exist yet
    }
  }, [videoPlayer, validationState]);

  // This component doesn't render anything - it just manages the Video.js button
  return null;
}
