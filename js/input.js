/**
 * Project: Dodgeball Boss Rush
 * File: js/input.js
 * Description: Dual-Platform Input Layer (PC Keyboard/Mouse & Mobile Virtual Touch).
 * Features:
 *  - Auto mobile landscape 90° orientation with seamless coordinate transformation.
 *  - Zero-latency dynamic floating joystick across left half of screen.
 *  - Dual-action touch buttons with reverse slingshot drag aiming.
 *  - PC WASD 8-directional movement and mouse drag aiming.
 */

(function(window) {
  'use strict';

  class InputManager {
    constructor() {
      this.moveVector = { x: 0, y: 0 };
      this.keysPressed = {};

      // Mouse drag tracking for PC
      this.isMouseDownL = false;
      this.isMouseDownR = false;
      this.dragStartL = { x: 0, y: 0 };
      this.dragStartR = { x: 0, y: 0 };
      this.lastMouseX = window.innerWidth / 2;
      this.lastMouseY = window.innerHeight / 2;

      // Touch tracking
      this.touchJoystickId = null;
      this.touchJoystickOrigin = { x: 0, y: 0 };
      this.touchActionId = null;
      this.touchActionStart = { x: 0, y: 0 };
      this.activeActionButton = null; // 'catch' | 'dash'

      // Orientation state
      this.isRotated = false;
      this.forceOrientation = 'auto'; // 'auto' | 'landscape' | 'portrait'

      // Device detection
      this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      this.effectiveMode = 'pc';

      this.initEventListeners();
      this.checkOrientation();
      this.updateInputMode();

      // Listen for window resize & orientationchange
      window.addEventListener('resize', () => {
        this.checkOrientation();
      });
      window.addEventListener('orientationchange', () => {
        setTimeout(() => this.checkOrientation(), 150);
      });

      // Listen for inspector mode changes
      window.GameConfig.subscribe((path) => {
        if (path === '*' || path === 'input.inputMode') {
          this.updateInputMode();
        }
      });
    }

    // -------------------------------------------------------------
    // Mobile Landscape Auto-Orientation & Coordinate Mapping
    // -------------------------------------------------------------
    checkOrientation() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const app = document.getElementById('app-container');
      if (!app) return;

      const isMobile = this.isTouchDevice || (w <= 900);
      const isPortrait = (h > w);

      let shouldRotate = false;
      if (this.forceOrientation === 'landscape') {
        shouldRotate = isPortrait;
      } else if (this.forceOrientation === 'portrait') {
        shouldRotate = false;
      } else {
        // 'auto': on mobile in portrait, auto rotate into horizontal landscape!
        shouldRotate = isMobile && isPortrait;
      }

      this.isRotated = shouldRotate;

      if (shouldRotate) {
        app.style.setProperty('--rot-width', `${h}px`);
        app.style.setProperty('--rot-height', `${w}px`);
        app.classList.add('rotate-landscape');
      } else {
        app.style.removeProperty('--rot-width');
        app.style.removeProperty('--rot-height');
        app.classList.remove('rotate-landscape');
      }

      const orientBtn = document.getElementById('btn-orientation-toggle');
      if (orientBtn) {
        const textSpan = orientBtn.querySelector('span');
        if (textSpan) {
          textSpan.textContent = shouldRotate ? '🔄 强制横屏 (已启用)' : '🔄 切换横屏';
        }
      }

      // Recompute game canvas size to match container
      if (window.Game && window.Game.handleResize) {
        window.Game.handleResize();
      }
    }

    // Convert screen clientX, clientY into game container local coordinates
    toGameCoords(clientX, clientY) {
      if (this.isRotated) {
        // Rotated 90 degrees clockwise
        // Container width is window.innerHeight, height is window.innerWidth
        return {
          x: clientY,
          y: window.innerWidth - clientX
        };
      }
      return {
        x: clientX,
        y: clientY
      };
    }

    // Try screen orientation lock API where supported
    tryLockOrientation() {
      try {
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      } catch (e) {}
    }

    updateInputMode() {
      const mode = window.GameConfig.input.inputMode;
      if (mode === 'pc') {
        this.effectiveMode = 'pc';
      } else if (mode === 'touch') {
        this.effectiveMode = 'touch';
      } else {
        this.effectiveMode = this.isTouchDevice ? 'touch' : 'pc';
      }

      const touchUI = document.getElementById('touch-controls');
      if (touchUI) {
        touchUI.style.display = (this.effectiveMode === 'touch') ? 'block' : 'none';
      }
    }

    initEventListeners() {
      // -------------------------------------------------------------
      // Orientation Toggle Button in HUD
      // -------------------------------------------------------------
      const orientBtn = document.getElementById('btn-orientation-toggle');
      if (orientBtn) {
        orientBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.tryLockOrientation();
          if (this.forceOrientation === 'auto') {
            this.forceOrientation = this.isRotated ? 'portrait' : 'landscape';
          } else if (this.forceOrientation === 'landscape') {
            this.forceOrientation = 'portrait';
          } else {
            this.forceOrientation = 'landscape';
          }
          this.checkOrientation();
        });
      }

      // -------------------------------------------------------------
      // PC Keyboard Listeners (WASD + Arrows)
      // -------------------------------------------------------------
      window.addEventListener('keydown', (e) => {
        this.keysPressed[e.code] = true;
        this.updateKeyboardMovement();

        // Hotkey: Tab to toggle Inspector & Pause (only if dev mode active)
        if (e.code === 'Tab') {
          e.preventDefault();
          if (!window.devModeActive) return;
          const inspector = document.getElementById('inspector-panel');
          if (inspector) {
            const isCollapsed = inspector.classList.toggle('collapsed');
            if (window.Game) {
              window.Game.setPaused(!isCollapsed);
            }
          }
        }
      });

      window.addEventListener('keyup', (e) => {
        this.keysPressed[e.code] = false;
        this.updateKeyboardMovement();
      });

      // -------------------------------------------------------------
      // PC Mouse Listeners (LMB Catch/Throw, RMB Dash)
      // -------------------------------------------------------------
      this.lastMouseX = window.innerWidth / 2;
      this.lastMouseY = window.innerHeight / 2;

      window.addEventListener('mousedown', (e) => {
        if (this.effectiveMode !== 'pc') return;
        // Ignore clicks inside inspector or modal dialogs
        if (e.target && (e.target.closest('#inspector-panel') || e.target.closest('#inspector-toggle-btn') || e.target.closest('#json-modal') || e.target.closest('#game-result-modal') || e.target.closest('#btn-orientation-toggle'))) {
          return;
        }

        const player = window.Game.player;
        if (!player) return;

        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;

        if (e.button === 0) {
          // Left Mouse Button: Catch / Pickup / Aim
          this.isMouseDownL = true;
          this.dragStartL = { x: e.clientX, y: e.clientY };

          if (player.state === window.PlayerState.HOLDING_AIM) {
            // Already holding ball, continue aiming
          } else {
            player.triggerCatch();
          }
        } else if (e.button === 2) {
          // Right Mouse Button: Dash
          this.isMouseDownR = true;
          this.dragStartR = { x: e.clientX, y: e.clientY };

          if (player.state !== window.PlayerState.HOLDING_AIM) {
            player.triggerDash(this.moveVector.x, this.moveVector.y);
          }
        }
      });

      window.addEventListener('mousemove', (e) => {
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;

        if (this.effectiveMode !== 'pc') return;
        const player = window.Game.player;
        if (!player || player.state !== window.PlayerState.HOLDING_AIM) return;

        // Slingshot drag aiming
        if (this.isMouseDownL) {
          const dx = e.clientX - this.dragStartL.x;
          const dy = e.clientY - this.dragStartL.y;
          player.updateAimDrag(dx, dy);
        } else if (this.isMouseDownR) {
          const dx = e.clientX - this.dragStartR.x;
          const dy = e.clientY - this.dragStartR.y;
          player.updateAimDrag(dx, dy);
        }
      });

      window.addEventListener('mouseup', (e) => {
        if (this.effectiveMode !== 'pc') return;
        const player = window.Game.player;
        if (!player) return;

        if (e.button === 0) this.isMouseDownL = false;
        if (e.button === 2) this.isMouseDownR = false;

        // Any button release throws the ball if in aiming state!
        if (player.state === window.PlayerState.HOLDING_AIM) {
          player.releaseThrow();
        }
      });

      // Prevent context menu on RMB inside game canvas
      const canvasWrapper = document.getElementById('canvas-wrapper');
      if (canvasWrapper) {
        canvasWrapper.addEventListener('contextmenu', (e) => e.preventDefault());
      }

      // -------------------------------------------------------------
      // Mobile Virtual Touch Listeners (Zero-Latency Dynamic Joystick)
      // -------------------------------------------------------------
      this.initVirtualJoystick();
      this.initVirtualActionButtons();
    }

    // Update WASD keyboard movement vector
    updateKeyboardMovement() {
      let x = 0;
      let y = 0;

      if (this.keysPressed['KeyW'] || this.keysPressed['ArrowUp']) y -= 1;
      if (this.keysPressed['KeyS'] || this.keysPressed['ArrowDown']) y += 1;
      if (this.keysPressed['KeyA'] || this.keysPressed['ArrowLeft']) x -= 1;
      if (this.keysPressed['KeyD'] || this.keysPressed['ArrowRight']) x += 1;

      if (x !== 0 && y !== 0) {
        const invSqrt2 = Math.SQRT1_2;
        x *= invSqrt2;
        y *= invSqrt2;
      }

      this.moveVector.x = x;
      this.moveVector.y = y;
    }

    // Mobile Virtual Analog Stick (Locked in bottom-left corner with 35% default opacity)
    initVirtualJoystick() {
      const touchRegion = document.getElementById('joystick-touch-region');
      const stickZone = document.getElementById('joystick-zone');
      const thumb = document.getElementById('joystick-thumb');
      if (!touchRegion || !stickZone || !thumb) return;

      const maxRadius = 36;

      touchRegion.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.tryLockOrientation();

        const touch = e.changedTouches[0];
        this.touchJoystickId = touch.identifier;

        // Stick base is locked at the bottom-left corner
        const rect = stickZone.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const centerCoords = this.toGameCoords(centerX, centerY);
        this.touchJoystickOrigin = { x: centerCoords.x, y: centerCoords.y };

        stickZone.classList.add('active');
        thumb.classList.remove('resetting');

        const coords = this.toGameCoords(touch.clientX, touch.clientY);
        this.handleJoystickMove(coords.x, coords.y, maxRadius, thumb);
      }, { passive: false });

      window.addEventListener('touchmove', (e) => {
        if (this.touchJoystickId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this.touchJoystickId) {
            e.preventDefault();
            const coords = this.toGameCoords(t.clientX, t.clientY);
            this.handleJoystickMove(coords.x, coords.y, maxRadius, thumb);
            break;
          }
        }
      }, { passive: false });

      const onTouchEnd = (e) => {
        if (this.touchJoystickId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this.touchJoystickId) {
            e.preventDefault();
            this.touchJoystickId = null;
            this.moveVector = { x: 0, y: 0 };
            thumb.classList.add('resetting');
            thumb.style.transform = 'translate(0px, 0px)';
            stickZone.classList.remove('active');
            break;
          }
        }
      };

      window.addEventListener('touchend', onTouchEnd, { passive: false });
      window.addEventListener('touchcancel', onTouchEnd, { passive: false });
    }

    handleJoystickMove(localX, localY, maxRadius, thumb) {
      const dx = localX - this.touchJoystickOrigin.x;
      const dy = localY - this.touchJoystickOrigin.y;
      const dist = Math.hypot(dx, dy);

      // Low deadzone (1.5px) for immediate responsiveness
      if (dist < 1.5) {
        this.moveVector = { x: 0, y: 0 };
        thumb.style.transform = 'translate(0px, 0px)';
        return;
      }

      const clampedDist = Math.min(dist, maxRadius);
      const nx = dx / dist;
      const ny = dy / dist;

      // Analog linear magnitude
      const mag = clampedDist / maxRadius;
      this.moveVector = {
        x: nx * mag,
        y: ny * mag
      };

      thumb.style.transform = `translate(${nx * clampedDist}px, ${ny * clampedDist}px)`;
    }

    // Mobile Virtual Action Buttons (Dash & Catch with seamless drag-aim)
    initVirtualActionButtons() {
      const btnDash = document.getElementById('touch-btn-dash');
      const btnCatch = document.getElementById('touch-btn-catch');
      if (!btnDash || !btnCatch) return;

      const handleBtnStart = (type, btnEl, touch) => {
        const player = window.Game.player;
        if (!player) return;

        this.touchActionId = touch.identifier;
        const coords = this.toGameCoords(touch.clientX, touch.clientY);
        this.touchActionStart = { x: coords.x, y: coords.y };
        this.activeActionButton = type;
        btnEl.classList.add('active');

        if (type === 'catch') {
          player.triggerCatch();
        } else if (type === 'dash') {
          player.triggerDash(this.moveVector.x, this.moveVector.y);
        }
      };

      btnDash.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.tryLockOrientation();
        handleBtnStart('dash', btnDash, e.changedTouches[0]);
      }, { passive: false });

      btnCatch.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.tryLockOrientation();
        handleBtnStart('catch', btnCatch, e.changedTouches[0]);
      }, { passive: false });

      window.addEventListener('touchmove', (e) => {
        if (this.touchActionId === null) return;
        const player = window.Game.player;
        if (!player || player.state !== window.PlayerState.HOLDING_AIM) return;

        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this.touchActionId) {
            e.preventDefault();
            // Drag aiming with reverse slingshot vector in game coordinates
            const coords = this.toGameCoords(t.clientX, t.clientY);
            const dx = coords.x - this.touchActionStart.x;
            const dy = coords.y - this.touchActionStart.y;
            player.updateAimDrag(dx, dy);
            break;
          }
        }
      }, { passive: false });

      const handleBtnEnd = (e) => {
        if (this.touchActionId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this.touchActionId) {
            e.preventDefault();
            this.touchActionId = null;
            btnDash.classList.remove('active');
            btnCatch.classList.remove('active');

            const player = window.Game.player;
            if (player && player.state === window.PlayerState.HOLDING_AIM) {
              player.releaseThrow();
            }
            break;
          }
        }
      };

      window.addEventListener('touchend', handleBtnEnd, { passive: false });
      window.addEventListener('touchcancel', handleBtnEnd, { passive: false });
    }
  }

  window.InputManager = InputManager;
})(window);
