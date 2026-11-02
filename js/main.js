/**
 * Project: Dodgeball Boss Rush
 * File: js/main.js
 * Description: Application bootstrap entry point & Developer Mode Triple-Click Handler.
 */

(function(window) {
  'use strict';

  // Global Developer Mode State (default: locked/hidden)
  window.devModeActive = false;

  // Floating Toast Notification
  let toastTimer = null;
  window.showGameToast = function(msg, duration = 2400) {
    const toast = document.getElementById('dev-mode-toast');
    if (!toast) return;

    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.classList.add('show');

    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      toastTimer = null;
    }, duration);
  };

  // Toggle Developer Mode Visibility
  window.toggleDevMode = function(forceState = null) {
    window.devModeActive = forceState !== null ? forceState : !window.devModeActive;
    const devElements = document.querySelectorAll('.dev-element');

    devElements.forEach(el => {
      if (window.devModeActive) {
        el.classList.remove('dev-hidden');
      } else {
        el.classList.add('dev-hidden');
      }
    });

    if (window.devModeActive) {
      // Play unlock chime sound
      try {
        if (window.SoundFX && window.SoundFX.playParry) {
          window.SoundFX.playParry();
        } else if (window.SoundManager && window.SoundManager.playParryReflect) {
          window.SoundManager.playParryReflect();
        }
      } catch (e) {}
      window.showGameToast('🛠️ 开发者模式已激活 (Dev Mode ON)');
      console.log('[DevMode] Activated: Inspector & dev controls unlocked.');
    } else {
      // Collapse inspector if open
      const panel = document.getElementById('inspector-panel');
      if (panel && !panel.classList.contains('collapsed')) {
        panel.classList.add('collapsed');
        if (window.Game && window.Game.isPaused) {
          window.Game.setPaused(false);
        }
      }
      window.showGameToast('🔒 开发者模式已关闭 (Dev Mode OFF)');
      console.log('[DevMode] Deactivated: Inspector & dev controls hidden.');
    }
  };

  // Setup Left-Top 80x80px Triple-Click Hotzone (3 clicks within 800ms)
  function setupDevHotzone() {
    const hotzone = document.getElementById('dev-mode-hotzone');
    if (!hotzone) return;

    let clickTimestamps = [];

    const handleTap = (e) => {
      if (e) {
        e.stopPropagation();
        if (e.cancelable && e.type === 'touchstart') {
          e.preventDefault();
        }
      }

      const now = performance.now();
      clickTimestamps.push(now);

      // Keep only clicks within 800ms window
      clickTimestamps = clickTimestamps.filter(t => now - t <= 800);

      if (clickTimestamps.length >= 3) {
        clickTimestamps = [];
        window.toggleDevMode();
      }
    };

    hotzone.addEventListener('pointerdown', handleTap);
    hotzone.addEventListener('touchstart', handleTap, { passive: false });
  }

  // Application bootstrap
  window.addEventListener('DOMContentLoaded', async () => {
    console.log('[Dodgeball Boss Rush] Initializing game engine...');
    setupDevHotzone();

    // Ensure authoritative config is loaded from static and cloud database before starting engine
    if (window.GameConfig && typeof window.GameConfig.loadConfigAsync === 'function') {
      try {
        await window.GameConfig.loadConfigAsync();
      } catch (err) {
        console.warn('Initial config load error:', err);
      }
    }

    if (window.Game) {
      window.Game.init();
      console.log('[Dodgeball Boss Rush] Engine started successfully.');
    }
  });

})(window);
