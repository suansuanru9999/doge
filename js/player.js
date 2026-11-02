/**
 * Project: Dodgeball Boss Rush
 * File: js/player.js
 * Description: Player Character Controller & Combat State Machine.
 * Implements 360-degree movement, Dash with I-frames, Active Catch / Perfect Parry,
 * Slingshot Drag Aiming with trajectory preview, Grounded Active Pickup, and Overheat Explosion.
 */

(function(window) {
  'use strict';

  const PlayerState = {
    NORMAL: 'NORMAL',
    DASHING: 'DASHING',
    CATCHING: 'CATCHING',
    HOLDING_AIM: 'HOLDING_AIM',
    STUNNED: 'STUNNED',
    DEAD: 'DEAD'
  };

  class Player {
    constructor() {
      this.reset();
    }

    reset() {
      const cfg = window.GameConfig.player;
      this.maxHp = cfg.maxHp;
      this.hp = this.maxHp;
      this.radius = 18;

      this.x = 0;
      this.y = 150; // Spawn in south area of arena
      this.z = 0;
      this.vx = 0;
      this.vy = 0;
      this.facingX = 0;
      this.facingY = -1; // Facing North towards Boss by default

      this.state = PlayerState.NORMAL;
      this.alive = true;

      // Cooldowns (in seconds)
      this.catchCooldownTimer = 0;
      this.dashCooldownTimer = 0;

      // Whiff state & penalties
      this.isWhiffed = false;
      this.whiffSlowdownTimer = 0;
      this.whiffSlowdownDuration = 0.35;
      this.whiffJitterTimer = 0;
      this.whiffRejectFlashTimer = 0;

      // Catch window timer
      this.catchTimer = 0;

      // Dash state variables
      this.dashTimer = 0;
      this.dashDirX = 0;
      this.dashDirY = -1;
      this.isInvulnerable = false;

      // Held ball & Aiming state
      this.heldBall = null;
      this.isPerfectHeld = false;
      this.overheatTimer = 0;
      this.aimDirX = 0;
      this.aimDirY = -1;
      this.isAiming = false;
      this.aimOriginScreenX = 0;
      this.aimOriginScreenY = 0;
      this.currentDragScreenX = 0;
      this.currentDragScreenY = 0;

      // Visual flash
      this.flashWhiteTimer = 0;

      // Trail for dash ghosting
      this.dashGhosts = [];
    }

    // -------------------------------------------------------------
    // Input Actions Triggered by Controls (PC or Touch)
    // -------------------------------------------------------------

    // Trigger Active Catch / Parry
    triggerCatch() {
      if (this.state === PlayerState.DEAD || this.state === PlayerState.STUNNED) return;
      if (this.state === PlayerState.HOLDING_AIM) return;

      const cfg = window.GameConfig.player;

      // Cooldown check -> if still on CD, trigger "input rejected" feedback
      if (cfg.catchCooldownEnabled && this.catchCooldownTimer > 0) {
        this.triggerWhiffRejectFeedback();
        return;
      }

      // Check if nearby a grounded ball to pick up first!
      if (this.tryPickupGroundedBall()) {
        return;
      }

      // Enter CATCHING state
      this.state = PlayerState.CATCHING;
      this.catchTimer = cfg.goodWindow; // Catch window stays active for goodWindow duration
    }

    // Trigger Whiff Failure Penalty when active catch window expires without catching a ball
    triggerCatchWhiff() {
      const cfg = window.GameConfig.player;
      this.state = PlayerState.NORMAL;
      this.isWhiffed = true;

      // Start catch cooldown
      if (cfg.catchCooldownEnabled) {
        this.catchCooldownTimer = cfg.catchCooldown;
      }

      // 1. Horizontal micro-jitter (0.15s)
      this.whiffJitterTimer = 0.15;

      // 2. Bodily imbalance & movement slowdown
      this.whiffSlowdownDuration = cfg.whiffSlowdownDuration !== undefined ? cfg.whiffSlowdownDuration : 0.35;
      this.whiffSlowdownTimer = this.whiffSlowdownDuration;

      // 3. Floating combat text + red exclamation mark
      window.ParticleSystem.spawnDamageText(this.x, this.y - 14, '❗ WHIFF!', true, '#ff2244');

      // 4. Procedural Web Audio whiff sound
      window.SoundFX.playWhiff();

      // 5. Whiff sparks
      window.ParticleSystem.spawnSparks(this.x, this.y, 8, '#ff3344', 0.8);
    }

    // Trigger Input Rejected Feedback when spamming catch during active cooldown
    triggerWhiffRejectFeedback() {
      // 1. Flash locked circle brightly
      this.whiffRejectFlashTimer = 0.14;

      // 2. Character micro-jitters again
      this.whiffJitterTimer = 0.10;

      // 3. Play lockout "di-di / clack" sound
      window.SoundFX.playWhiffRejected();

      // 4. UI touch button shake animation
      const btnCatch = document.getElementById('touch-btn-catch');
      if (btnCatch) {
        btnCatch.classList.remove('shake-reject');
        void btnCatch.offsetWidth; // trigger reflow
        btnCatch.classList.add('shake-reject');
        setTimeout(() => btnCatch.classList.remove('shake-reject'), 250);
      }
    }

    // Trigger Dash
    triggerDash(moveDirX, moveDirY) {
      if (this.state === PlayerState.DEAD || this.state === PlayerState.STUNNED) return;
      if (this.state === PlayerState.DASHING) return;

      const cfg = window.GameConfig.player;

      // Cooldown check
      if (cfg.dashCooldownEnabled && this.dashCooldownTimer > 0) {
        return;
      }

      // Cancel Whiff Slowdown if dash cancel is permitted
      if (this.whiffSlowdownTimer > 0 && cfg.dashCancelsWhiff !== false) {
        this.whiffSlowdownTimer = 0;
        this.whiffJitterTimer = 0;
        window.ParticleSystem.spawnDamageText(this.x, this.y - 14, 'DASH CANCEL!', false, '#00e5ff');
      }

      // Determine dash direction (movement direction or facing direction)
      if (Math.hypot(moveDirX, moveDirY) > 0.1) {
        const norm = window.Physics.normalize(moveDirX, moveDirY);
        this.dashDirX = norm.x;
        this.dashDirY = norm.y;
      } else {
        this.dashDirX = this.facingX;
        this.dashDirY = this.facingY;
      }

      this.state = PlayerState.DASHING;
      this.dashTimer = cfg.dashDuration;
      this.isInvulnerable = true;

      if (cfg.dashCooldownEnabled) {
        this.dashCooldownTimer = cfg.dashCooldown;
      }

      window.SoundFX.playDash();
      window.ParticleSystem.spawnDashDust(this.x, this.y);
    }

    // Active key pickup check for grounded balls
    tryPickupGroundedBall() {
      const balls = window.Game.balls;
      for (let i = 0; i < balls.length; i++) {
        const ball = balls[i];
        if (ball.alive && ball.state === window.BallState.GROUNDED) {
          const d = window.Physics.dist(this.x, this.y, ball.x, ball.y);
          if (d <= ball.pickupRadius) {
            // Successfully picked up!
            this.grabBall(ball, false);
            return true;
          }
        }
      }
      return false;
    }

    // Grab ball into hands and transition to HOLDING_AIM
    grabBall(ball, isPerfect = false) {
      this.heldBall = ball;
      ball.state = window.BallState.HELD;
      ball.trail = [];
      this.isPerfectHeld = isPerfect;

      // Clear any whiff penalty on successful ball grab
      this.isWhiffed = false;
      this.whiffSlowdownTimer = 0;
      this.whiffJitterTimer = 0;
      this.whiffRejectFlashTimer = 0;

      const preset = window.GameConfig.ball.presets[ball.presetKey] || window.GameConfig.getActiveBallPreset();
      this.overheatTimer = preset.overheatTimer || 2.5;
      this.lastOverheatTickStep = -1;

      this.state = PlayerState.HOLDING_AIM;
      this.isAiming = true;

      // Default aim direction pointing towards Boss
      const boss = window.Game.boss;
      if (boss) {
        const toBoss = window.Physics.normalize(boss.x - this.x, boss.y - this.y);
        this.aimDirX = toBoss.x;
        this.aimDirY = toBoss.y;
      }

      // Reset drag start anchor to current pointer position so new drag begins cleanly
      if (window.Game && window.Game.input) {
        window.Game.input.dragStartL = { x: window.Game.input.lastMouseX, y: window.Game.input.lastMouseY };
        window.Game.input.dragStartR = { x: window.Game.input.lastMouseX, y: window.Game.input.lastMouseY };
      }

      // Enter bullet time
      const playerCfg = window.GameConfig.player;
      window.Game.triggerBulletTime(playerCfg.bulletTimeDuration * (isPerfect ? 1.2 : 0.8));

      if (isPerfect) {
        window.SoundFX.playParry();
        window.Game.triggerHitstop(window.GameConfig.camera.hitstopDuration);
        window.Game.triggerScreenShake(0.6, 0.2);
        window.ParticleSystem.spawnShockwave(this.x, this.y, 100, 0.35, '#ffcc00');
        window.ParticleSystem.spawnSparks(this.x, this.y, 25, '#ffcc00', 1.4);
      } else {
        window.SoundFX.playCatch();
        window.ParticleSystem.spawnSparks(this.x, this.y, 14, '#00f0ff', 1.0);
      }

      // Show Right-Center Arcade Judgment HUD Banner (replaces overhead text)
      if (window.Game && window.Game.showArcadeJudgment) {
        const comboMult = window.Game.getCurrentComboMultiplier ? window.Game.getCurrentComboMultiplier() : 1.0;
        const isPurple = (ball.presetKey === 'preset3');
        const throwMult = isPurple ? 2.0 : 1.0;
        const totalMult = comboMult * (isPerfect ? playerCfg.perfectThrowDamageMult : 1.0) * throwMult;

        let title = isPerfect ? 'PERFECT PARRY!' : 'GOOD CATCH!';
        let subText = isPerfect ?
          `DAMAGE MULTIPLIER x${(comboMult * playerCfg.perfectThrowDamageMult).toFixed(1)}` :
          `COMBO MULTIPLIER x${comboMult.toFixed(1)}`;

        if (isPurple) {
          title = 'PURPLE PARRY! x2.0';
          subText = `HIGH-VOLTAGE DOUBLE DMG x${totalMult.toFixed(1)}`;
        }
        window.Game.showArcadeJudgment(title, subText, isPerfect || isPurple);
      }
    }

    // Release held ball (throw)
    releaseThrow() {
      if (this.state !== PlayerState.HOLDING_AIM || !this.heldBall) return;

      const ball = this.heldBall;
      this.heldBall = null;
      this.isAiming = false;
      this.state = PlayerState.NORMAL;

      // Ensure ball is alive and in active Game.balls array
      ball.alive = true;
      if (window.Game && window.Game.balls.indexOf(ball) === -1) {
        window.Game.balls.push(ball);
      }

      // 1. Immediately restore global timeScale to 1.0 and exit bullet time
      if (window.Game) {
        window.Game.bulletTimeTimer = 0;
        window.Game.timeScale = 1.0;
        if (window.SoundManager && window.SoundManager.bulletTimeExit) {
          window.SoundManager.bulletTimeExit();
        }
      }

      // 2. Launch ball strictly along normalized aim direction with combo multiplier
      const normDir = window.Physics.normalize(this.aimDirX, this.aimDirY);
      const comboMult = window.Game.getCurrentComboMultiplier ? window.Game.getCurrentComboMultiplier() : 1.0;
      ball.launchFromPlayer(this.x, this.y, normDir.x, normDir.y, this.isPerfectHeld, comboMult);
    }

    // Update Aim drag vector from input with adjustable damping & sensitivity
    updateAimDrag(dragDeltaX, dragDeltaY) {
      if (this.state !== PlayerState.HOLDING_AIM) return;

      const inputCfg = window.GameConfig.input;
      const inverted = inputCfg.invertedAimDrag;
      const factor = (inverted ? -1 : 1) * (inputCfg.aimSensitivity || 1.0);
      let targetX = dragDeltaX * factor;
      let targetY = dragDeltaY * factor;

      // Clamp drag distance to maximum drag radius (prevent unbounded speed/drag vectors)
      const maxDrag = inputCfg.maxDragDistance || 240;
      const rawDist = Math.hypot(targetX, targetY);
      if (rawDist > maxDrag) {
        targetX = (targetX / rawDist) * maxDrag;
        targetY = (targetY / rawDist) * maxDrag;
      }

      const dist = Math.hypot(targetX, targetY);
      const minDeadzone = inputCfg.aimDeadzone || 16;

      if (dist >= minDeadzone) {
        let rawAngle = Math.atan2(targetY, targetX);

        // Optional magnetic angle notches
        const snapDeg = inputCfg.aimAngleSnap || 0;
        if (snapDeg > 0) {
          const snapRad = (snapDeg * Math.PI) / 180;
          rawAngle = Math.round(rawAngle / snapRad) * snapRad;
        }

        const desiredX = Math.cos(rawAngle);
        const desiredY = Math.sin(rawAngle);

        // Damping / Smoothing: 0.05 (heavy damping/rock steady) to 1.0 (raw instant snap)
        const smoothing = window.Physics.clamp(inputCfg.aimSmoothing !== undefined ? inputCfg.aimSmoothing : 0.35, 0.05, 1.0);
        if (smoothing >= 0.98) {
          this.aimDirX = desiredX;
          this.aimDirY = desiredY;
        } else {
          // Smooth rotation damping
          this.aimDirX += (desiredX - this.aimDirX) * smoothing;
          this.aimDirY += (desiredY - this.aimDirY) * smoothing;
          const len = Math.hypot(this.aimDirX, this.aimDirY) || 1;
          this.aimDirX /= len;
          this.aimDirY /= len;
        }

        this.facingX = this.aimDirX;
        this.facingY = this.aimDirY;
      }
    }

    // Overheat self-explosion
    triggerOverheatExplosion() {
      if (!this.heldBall) return;
      const ball = this.heldBall;
      this.heldBall = null;
      this.isAiming = false;
      this.state = PlayerState.NORMAL;

      ball.alive = false;

      // Deal self-damage
      this.takeDamage(20);

      window.SoundFX.playExplosion();
      window.Game.triggerScreenShake(1.2, 0.4);
      window.ParticleSystem.spawnShockwave(this.x, this.y, 120, 0.4, '#ff3344');
      window.ParticleSystem.spawnSparks(this.x, this.y, 30, '#ff3344', 1.6);
      window.ParticleSystem.spawnDamageText(this.x, this.y, 'OVERHEAT!', true, '#ff3344');
    }

    // Player takes damage
    takeDamage(amount) {
      if (this.isInvulnerable || this.state === PlayerState.DEAD) return;

      this.hp = Math.max(0, this.hp - amount);
      this.flashWhiteTimer = 0.15;
      window.SoundFX.playPlayerHit();
      window.Game.triggerScreenShake(0.8, 0.25);
      window.ParticleSystem.spawnSparks(this.x, this.y, 16, '#ff3344');
      window.ParticleSystem.spawnDamageText(this.x, this.y, `-${amount}`, false, '#ff3344');

      // Reset combo on hit
      window.Game.resetCombo();

      if (this.hp <= 0) {
        this.state = PlayerState.DEAD;
        this.alive = false;
        window.Game.onPlayerDeath();
      }
    }

    // -------------------------------------------------------------
    // Main Update Loop
    // -------------------------------------------------------------
    update(dt, rawDt, moveInput, arenaConfig, obstacles) {
      if (this.state === PlayerState.DEAD) return;

      const playerCfg = window.GameConfig.player;
      const realDt = rawDt || dt;

      // Cooldown tickers (real-time so bullet time doesn't prolong cooldown)
      if (this.catchCooldownTimer > 0) {
        this.catchCooldownTimer = Math.max(0, this.catchCooldownTimer - realDt);
      } else {
        this.isWhiffed = false;
      }
      if (this.dashCooldownTimer > 0) {
        this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - realDt);
      }
      if (this.flashWhiteTimer > 0) {
        this.flashWhiteTimer = Math.max(0, this.flashWhiteTimer - realDt);
      }

      // Whiff penalty tickers
      if (this.whiffJitterTimer > 0) {
        this.whiffJitterTimer = Math.max(0, this.whiffJitterTimer - realDt);
      }
      if (this.whiffRejectFlashTimer > 0) {
        this.whiffRejectFlashTimer = Math.max(0, this.whiffRejectFlashTimer - realDt);
      }
      if (this.whiffSlowdownTimer > 0) {
        this.whiffSlowdownTimer = Math.max(0, this.whiffSlowdownTimer - realDt);
      }

      // Update states
      switch (this.state) {
        case PlayerState.NORMAL:
          this.updateNormal(dt, moveInput, playerCfg, arenaConfig, obstacles);
          break;

        case PlayerState.CATCHING:
          this.updateCatching(dt, realDt, moveInput, playerCfg, arenaConfig, obstacles);
          break;

        case PlayerState.DASHING:
          this.updateDashing(dt, playerCfg, arenaConfig, obstacles);
          break;

        case PlayerState.HOLDING_AIM:
          this.updateHoldingAim(dt, realDt, moveInput, playerCfg, arenaConfig, obstacles);
          break;

        default:
          break;
      }
    }

    // Normal running & idle update
    updateNormal(dt, moveInput, playerCfg, arenaConfig, obstacles) {
      const moveMag = Math.hypot(moveInput.x, moveInput.y);
      if (moveMag > 0.015) {
        const norm = window.Physics.normalize(moveInput.x, moveInput.y);
        let actualSpeed = playerCfg.moveSpeed * Math.min(1.0, moveMag);

        // Apply Whiff Slowdown penalty if active
        if (playerCfg.whiffSlowdownEnabled !== false && this.whiffSlowdownTimer > 0) {
          const totalDur = this.whiffSlowdownDuration || 0.35;
          const minMult = playerCfg.whiffSlowdownMultiplier !== undefined ? playerCfg.whiffSlowdownMultiplier : 0.4;
          const t = Math.max(0, Math.min(1, 1 - (this.whiffSlowdownTimer / totalDur)));
          const ease = t * t * (3 - 2 * t);
          const currentMult = minMult + (1.0 - minMult) * ease;
          actualSpeed *= currentMult;
        }

        this.x += norm.x * actualSpeed * dt;
        this.y += norm.y * actualSpeed * dt;
        this.facingX = norm.x;
        this.facingY = norm.y;
      }
      this.resolveObstacleCollisions(obstacles);
      this.clampToArena(arenaConfig);
    }

    // Catching window active update
    updateCatching(dt, realDt, moveInput, playerCfg, arenaConfig, obstacles) {
      // Movement is slightly slowed during catch swing
      const moveMag = Math.hypot(moveInput.x, moveInput.y);
      if (moveMag > 0.015) {
        const norm = window.Physics.normalize(moveInput.x, moveInput.y);
        const actualSpeed = (playerCfg.moveSpeed * 0.5) * Math.min(1.0, moveMag);
        this.x += norm.x * actualSpeed * dt;
        this.y += norm.y * actualSpeed * dt;
      }
      this.resolveObstacleCollisions(obstacles);
      this.clampToArena(arenaConfig);

      // Decrement catch window
      this.catchTimer -= dt;
      if (this.catchTimer <= 0) {
        // Catch missed / whiffed! Enter penalty cooldown and slowdown
        this.triggerCatchWhiff();
      }
    }

    // Dashing state update
    updateDashing(dt, playerCfg, arenaConfig, obstacles) {
      this.dashTimer -= dt;

      // Dash ghost trail
      this.dashGhosts.unshift({ x: this.x, y: this.y, alpha: 0.7 });
      if (this.dashGhosts.length > 5) this.dashGhosts.pop();

      // Dash translation
      const dashSpeed = playerCfg.dashDistance / playerCfg.dashDuration;
      this.x += this.dashDirX * dashSpeed * dt;
      this.y += this.dashDirY * dashSpeed * dt;
      this.resolveObstacleCollisions(obstacles);
      this.clampToArena(arenaConfig);

      // Check if dashing over a grounded ball to scoop it up
      this.tryPickupGroundedBall();

      if (this.dashTimer <= 0) {
        this.state = PlayerState.NORMAL;
        this.isInvulnerable = false;
        this.dashGhosts = [];
      }
    }

    // Holding ball and aiming update
    updateHoldingAim(dt, realDt, moveInput, playerCfg, arenaConfig, obstacles) {
      // Allow slight movement while aiming
      const moveMag = Math.hypot(moveInput.x, moveInput.y);
      if (moveMag > 0.015) {
        const norm = window.Physics.normalize(moveInput.x, moveInput.y);
        const actualSpeed = (playerCfg.moveSpeed * 0.4) * Math.min(1.0, moveMag);
        this.x += norm.x * actualSpeed * dt;
        this.y += norm.y * actualSpeed * dt;
      }
      this.resolveObstacleCollisions(obstacles);
      this.clampToArena(arenaConfig);

      // Overheat timer countdown in real seconds
      const preset = window.GameConfig.ball.presets[this.heldBall.presetKey] || window.GameConfig.getActiveBallPreset();
      if (preset.overheatExplodeEnabled) {
        this.overheatTimer -= realDt;
        // Ticking audio cues when approaching 0 (edge-detected tick)
        const tickStep = Math.floor(this.overheatTimer * 6);
        if (this.overheatTimer < 1.0 && tickStep % 2 === 0 && this.lastOverheatTickStep !== tickStep) {
          this.lastOverheatTickStep = tickStep;
          window.SoundFX.playOverheatTick(1.0 + (1.0 - this.overheatTimer));
        }

        if (this.overheatTimer <= 0) {
          this.triggerOverheatExplosion();
        }
      }
    }

    // Smooth sliding push-out collision against physical obstacles
    resolveObstacleCollisions(obstacles) {
      if (!obstacles || obstacles.length === 0) return;
      for (const obs of obstacles) {
        if (!obs.alive) continue;
        const res = window.Physics.resolveCirclePushOut(this.x, this.y, this.radius, obs.x, obs.y, obs.radius);
        if (res.collided) {
          this.x = res.x;
          this.y = res.y;
        }
      }
    }

    // Keep player strictly within arena bounds
    clampToArena(arenaConfig) {
      const boundHit = window.Physics.checkArenaBoundary(this.x, this.y, this.radius, arenaConfig);
      if (boundHit.collided) {
        this.x = boundHit.correctedX;
        this.y = boundHit.correctedY;
      }
    }

    // -------------------------------------------------------------
    // Render Loop (2.5D Pseudo-45° Projected)
    // -------------------------------------------------------------
    render(ctx, yScale = 0.75) {
      if (this.state === PlayerState.DEAD) return;

      // High-frequency horizontal micro-jitter during whiff imbalance
      let jitterX = 0;
      if (this.whiffJitterTimer > 0) {
        const factor = this.whiffJitterTimer / 0.15;
        jitterX = Math.sin(this.whiffJitterTimer * 80) * 4.5 * factor;
      }

      const screenPos = window.Physics.toScreen(this.x, this.y, this.z, yScale);
      const groundPos = window.Physics.toScreen(this.x, this.y, 0, yScale);

      screenPos.x += jitterX;
      groundPos.x += jitterX;

      // 1. Dash Ghosts
      for (const g of this.dashGhosts) {
        const gScreen = window.Physics.toScreen(g.x, g.y, 0, yScale);
        ctx.save();
        ctx.beginPath();
        ctx.arc(gScreen.x, gScreen.y - 14, this.radius * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, ${g.alpha * 0.35})`;
        ctx.fill();
        ctx.restore();
      }

      // 2. Floor Elliptical Shadow
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(groundPos.x, groundPos.y, this.radius * 1.1, this.radius * yScale * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 0, 0, ${window.GameConfig.arena.shadowOpacity})`;
      ctx.fill();
      ctx.restore();

      // 3. Catch Action Wave Indicator (when in active CATCHING window)
      if (this.state === PlayerState.CATCHING) {
        ctx.save();
        ctx.beginPath();
        const catchR = 48;
        ctx.ellipse(groundPos.x, groundPos.y, catchR, catchR * yScale, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
      }

      // 3.5. Whiff Penalty Red Collapsing Locked Ring with Cross (X)
      if (this.isWhiffed && this.catchCooldownTimer > 0) {
        ctx.save();
        const totalCD = window.GameConfig.player.catchCooldown || 1.0;
        const elapsedCD = totalCD - this.catchCooldownTimer;
        // Inward collapse from 48px to 26px over 0.12s
        const collapseT = Math.min(1.0, elapsedCD / 0.12);
        const ringR = 48 - (48 - 26) * Math.sin(collapseT * Math.PI * 0.5);

        const isFlashing = (this.whiffRejectFlashTimer > 0);
        const strokeColor = isFlashing ? '#ffffff' : '#ff1744';
        const glowColor = isFlashing ? '#ff5577' : '#ff1744';
        const shadowBlur = isFlashing ? 18 : 10;

        // Base locked ellipse on ground
        ctx.beginPath();
        ctx.ellipse(groundPos.x, groundPos.y, ringR, ringR * yScale, 0, 0, Math.PI * 2);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isFlashing ? 3.5 : 2.5;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = shadowBlur;
        ctx.fillStyle = isFlashing ? 'rgba(255, 23, 68, 0.35)' : 'rgba(255, 23, 68, 0.14)';
        ctx.fill();
        ctx.stroke();

        // Diagonal slash / cross (X) inside the locked ring
        const crossW = ringR * 0.52;
        const crossH = ringR * yScale * 0.52;
        ctx.beginPath();
        // Line 1: top-left to bottom-right
        ctx.moveTo(groundPos.x - crossW, groundPos.y - crossH);
        ctx.lineTo(groundPos.x + crossW, groundPos.y + crossH);
        // Line 2: top-right to bottom-left
        ctx.moveTo(groundPos.x + crossW, groundPos.y - crossH);
        ctx.lineTo(groundPos.x - crossW, groundPos.y + crossH);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isFlashing ? 3.0 : 2.2;
        ctx.stroke();

        // CD Recharge Arc (showing recovery progress around the locked ring)
        const cdRemainRatio = Math.max(0, this.catchCooldownTimer / totalCD);
        ctx.beginPath();
        ctx.ellipse(groundPos.x, groundPos.y, ringR + 5, (ringR + 5) * yScale, 0, -Math.PI / 2, -Math.PI / 2 + (1 - cdRemainRatio) * Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();
      }

      // 4. Character Geometric Body (2.5D Capsule / Cylinder)
      ctx.save();
      const bodyH = 18; // Height offset for 2.5D cylinder
      const centerY = screenPos.y - bodyH;

      const isWhiffCD = (this.isWhiffed && this.catchCooldownTimer > 0);

      // Glowing Aura
      if (this.isInvulnerable) {
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 16;
      } else if (isWhiffCD) {
        ctx.shadowColor = (this.whiffRejectFlashTimer > 0) ? '#ff5577' : '#ff1744';
        ctx.shadowBlur = 14;
      } else if (window.GameConfig.arena.glowEnabled) {
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 10 * window.GameConfig.arena.glowIntensity;
      }

      // Main Circle / Capsule
      ctx.beginPath();
      ctx.arc(screenPos.x, centerY, this.radius, 0, Math.PI * 2);
      if (this.flashWhiteTimer > 0) {
        ctx.fillStyle = '#ffffff';
      } else if (this.isInvulnerable) {
        ctx.fillStyle = '#ffcc00';
      } else if (isWhiffCD) {
        // Darkened / grey-red tint during whiff CD
        ctx.fillStyle = (this.whiffRejectFlashTimer > 0) ? '#ff6688' : '#882233';
      } else {
        ctx.fillStyle = '#00e5ff';
      }
      ctx.fill();

      // Body 3D Base Connection
      ctx.beginPath();
      ctx.arc(screenPos.x, centerY + bodyH * 0.6, this.radius * 0.85, 0, Math.PI * 2);
      if (this.flashWhiteTimer > 0) {
        ctx.fillStyle = '#ffffff';
      } else if (isWhiffCD) {
        ctx.fillStyle = '#44111a';
      } else {
        ctx.fillStyle = '#008ba3';
      }
      ctx.fill();

      // Facing Direction Visor Indicator
      const visorX = screenPos.x + this.facingX * 10;
      const visorY = centerY + this.facingY * 8 * yScale;
      ctx.beginPath();
      ctx.arc(visorX, visorY, 4, 0, Math.PI * 2);
      ctx.fillStyle = isWhiffCD ? '#ff6677' : '#ffffff';
      ctx.fill();

      ctx.restore();

      // 5. Holding Ball & Overhead Overheat Ring
      if (this.state === PlayerState.HOLDING_AIM && this.heldBall) {
        const ballPreset = window.GameConfig.ball.presets[this.heldBall.presetKey] || window.GameConfig.getActiveBallPreset();
        const maxTimer = ballPreset.overheatTimer || 2.5;
        const progress = Math.max(0, this.overheatTimer / maxTimer);

        // Render Held Ball in hand
        const handDist = 26;
        const ballWorldX = this.x + this.aimDirX * handDist;
        const ballWorldY = this.y + this.aimDirY * handDist;
        const ballScreen = window.Physics.toScreen(ballWorldX, ballWorldY, 14, yScale);

        ctx.save();
        ctx.beginPath();
        ctx.arc(ballScreen.x, ballScreen.y, this.heldBall.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.heldBall.color;
        ctx.shadowColor = this.heldBall.glowColor;
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.restore();

        // Render Overheat Countdown Ring over player's head
        if (ballPreset.overheatExplodeEnabled) {
          const ringY = centerY - this.radius - 16;
          const ringRadius = 14;

          ctx.save();
          // Background ring
          ctx.beginPath();
          ctx.arc(screenPos.x, ringY, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 3;
          ctx.stroke();

          // Progress fill (turns red as it depletes)
          ctx.beginPath();
          ctx.arc(screenPos.x, ringY, ringRadius, -Math.PI / 2, -Math.PI / 2 + (1 - progress) * Math.PI * 2);
          ctx.strokeStyle = progress < 0.3 ? '#ff3344' : '#ffaa00';
          ctx.lineWidth = 3;
          ctx.shadowColor = progress < 0.3 ? '#ff3344' : '#ffaa00';
          ctx.shadowBlur = 8;
          ctx.stroke();
          ctx.restore();
        }

        // 6. Trajectory Aiming Line & Wall Bounce Prediction
        this.renderAimTrajectory(ctx, yScale);
      }
    }

    // Render Trajectory line with reverse drag tension dots and forward reflection prediction
    renderAimTrajectory(ctx, yScale) {
      const arenaCfg = window.GameConfig.arena;
      const hasWallBounce = this.heldBall.boundaryMode === 'bounce' && this.heldBall.maxWallBounces > 0;

      const traj = window.Physics.predictTrajectory(
        this.x, this.y,
        this.aimDirX, this.aimDirY,
        arenaCfg,
        hasWallBounce,
        900
      );

      // Primary Forward Trajectory Line
      if (traj.primary) {
        const p1 = window.Physics.toScreen(traj.primary.x1, traj.primary.y1, 10, yScale);
        const p2 = window.Physics.toScreen(traj.primary.x2, traj.primary.y2, 10, yScale);

        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([8, 6]);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = this.isPerfectHeld ? '#ffcc00' : '#00e5ff';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 8;
        ctx.stroke();

        // Forward Arrowhead at end of segment
        const arrowAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x - 14 * Math.cos(arrowAngle - 0.4), p2.y - 14 * Math.sin(arrowAngle - 0.4));
        ctx.lineTo(p2.x - 14 * Math.cos(arrowAngle + 0.4), p2.y - 14 * Math.sin(arrowAngle + 0.4));
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
        ctx.restore();
      }

      // Secondary Reflected Wall Bounce Ray (if wall bounce active!)
      if (traj.reflected) {
        const r1 = window.Physics.toScreen(traj.reflected.x1, traj.reflected.y1, 10, yScale);
        const r2 = window.Physics.toScreen(traj.reflected.x2, traj.reflected.y2, 10, yScale);

        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 6]);
        ctx.moveTo(r1.x, r1.y);
        ctx.lineTo(r2.x, r2.y);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.restore();
      }

      // Reverse Slingshot Tension Line (showing pull back)
      const pullDist = 45;
      const pullBackX = this.x - this.aimDirX * pullDist;
      const pullBackY = this.y - this.aimDirY * pullDist;
      const sCenter = window.Physics.toScreen(this.x, this.y, 10, yScale);
      const sPull = window.Physics.toScreen(pullBackX, pullBackY, 10, yScale);

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([3, 4]);
      ctx.moveTo(sCenter.x, sCenter.y);
      ctx.lineTo(sPull.x, sPull.y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Slingshot anchor dot
      ctx.beginPath();
      ctx.arc(sPull.x, sPull.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }
  }

  window.Player = Player;
  window.PlayerState = PlayerState;
})(window);
