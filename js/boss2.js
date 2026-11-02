/**
 * Project: Dodgeball Boss Rush
 * File: js/boss2.js
 * Description: "Phantom Boss" (幻影首领) - Boss 2 Entity & 3-Phase Bullet Hell State Machine.
 * Features:
 *   - Dual Blue Halos (两道独立旋转的蓝色发光光环)
 *   - Phase 1: Stealth Drift + Pillar Collision Reveal + Hit Re-stealth + Emitter Control
 *   - Phase 2: Charge + Wall Collision Stun + Rear Fan Spread 反击 + Emitter Control
 *   - Phase 3: 10s Bullet Hell Survival + Overload Self-Destruction Victory
 */

(function(window) {
  'use strict';

  function colorWithAlpha(colorStr, alpha) {
    if (!colorStr || colorStr === 'transparent' || alpha <= 0.001) return 'transparent';
    if (colorStr.startsWith('#')) {
      let hex = colorStr.slice(1);
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
    }
    if (colorStr.startsWith('rgba')) {
      const parts = colorStr.match(/rgba?\(([^)]+)\)/);
      if (parts && parts[1]) {
        const nums = parts[1].split(',').map(s => s.trim());
        const r = nums[0] || 0;
        const g = nums[1] || 0;
        const b = nums[2] || 0;
        const origA = nums[3] !== undefined ? parseFloat(nums[3]) : 1.0;
        return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, origA * alpha)).toFixed(3)})`;
      }
    }
    if (colorStr.startsWith('rgb')) {
      const parts = colorStr.match(/rgb\(([^)]+)\)/);
      if (parts && parts[1]) {
        const nums = parts[1].split(',').map(s => s.trim());
        return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
      }
    }
    return colorStr;
  }

  class Boss2 {
    get b2Config() {
      if (window.GameConfig && window.GameConfig.boss2) return window.GameConfig.boss2;
      if (window.DEFAULT_GAME_CONFIG && window.DEFAULT_GAME_CONFIG.boss2) return window.DEFAULT_GAME_CONFIG.boss2;
      return {};
    }

    get arenaConfig() {
      if (window.GameConfig && window.GameConfig.arena) return window.GameConfig.arena;
      if (window.DEFAULT_GAME_CONFIG && window.DEFAULT_GAME_CONFIG.arena) return window.DEFAULT_GAME_CONFIG.arena;
      return { shape: 'rect', width: 800, height: 500, radius: 350, shadowOpacity: 0.35 };
    }

    get ballConfig() {
      if (window.GameConfig && window.GameConfig.ball) return window.GameConfig.ball;
      if (window.DEFAULT_GAME_CONFIG && window.DEFAULT_GAME_CONFIG.ball) return window.DEFAULT_GAME_CONFIG.ball;
      return { maxActiveCoreBalls: 3 };
    }

    constructor() {
      this.reset();
    }

    reset() {
      const cfg = this.b2Config;
      this.name = cfg.name || 'PHANTOM BOSS';
      this.maxHp = cfg.maxHp || 650;
      this.hp = this.maxHp;
      this.hitboxRadius = cfg.hitboxRadius || 52;
      this.alive = true;

      // Position coordinates (spawns in upper region)
      const arenaCfg = this.arenaConfig;
      const halfH = arenaCfg.shape === 'circle' ? arenaCfg.radius : arenaCfg.height / 2;
      this.x = 0;
      this.y = -halfH * 0.55;
      this.z = 0;
      this.vx = 0;
      this.vy = 0;

      // Dual Blue Halos
      this.halo1Angle = 0;
      this.halo2Angle = Math.PI / 4;
      this.halo1Radius = cfg.halo1Radius || 78;
      this.halo1Speed = cfg.halo1Speed !== undefined ? cfg.halo1Speed : 1.4;
      this.halo1Color = cfg.halo1Color || '#00f0ff';
      this.halo2Radius = cfg.halo2Radius || 104;
      this.halo2Speed = cfg.halo2Speed !== undefined ? cfg.halo2Speed : -1.0;
      this.halo2Color = cfg.halo2Color || '#1e90ff';
      this.haloGlowIntensity = cfg.haloGlowIntensity || 1.0;

      // Visual animations
      this.beatTimer = 0;
      this.beatScale = 1.0;
      this.flashWhiteTimer = 0;

      // Phase State Machine
      this.currentPhase = 1; // 1 | 2 | 3
      this.phaseTransitionTimer = 0;
      this.spiralAngle = 0;

      // Phase 1: Stealth Drift & Pillar Collision Reveal
      const p1Cfg = (cfg.phase1) || {};
      this.p1State = 'STEALTH_DRIFT'; // 'STEALTH_DRIFT' | 'REVEALED'
      this.isStealthed = true;
      this.isStealth = true;
      this.stealthOpacity = this.p1StealthOpacity;
      this.currentOpacity = this.stealthOpacity;
      this.isDrifting = true;
      this.driftSpeed = p1Cfg.driftSpeed || 120;
      // Initialize random drift angle
      const initAngle = Math.random() * Math.PI * 2;
      this.driftDir = { x: Math.cos(initAngle), y: Math.sin(initAngle) };
      this.isRevealed = false;
      this.revealTimer = 0;
      this.revealDurationOnHitPillar = this.p1RevealDuration;
      this.p1FireTimer = p1Cfg.fireInterval || 2.5;

      // Phase 2: Charge, Wall Stun & Rear Spread
      const p2Cfg = (cfg.phase2) || {};
      this.p2State = 'CHARGE_REST'; // CHARGE_REST | CHARGE_TELEGRAPH | CHARGING | STUNNED
      this.chargeDelay = p2Cfg.chargeDelay || 2.5;
      this.chargeSpeed = p2Cfg.chargeSpeed || 550;
      this.chargeTelegraphTime = p2Cfg.telegraphDuration || 0.6;
      this.wallStunDuration = p2Cfg.wallStunDuration || 3.0;
      this.p2StateTimer = this.chargeDelay;
      this.chargeDir = { x: 0, y: 1 };
      this.chargeTarget = { x: 0, y: 0 };
      this.ghostTrails = [];
      this.stunStarsAngle = 0;
      this.p2FireTimer = p2Cfg.fireInterval || 2.8;

      // Phase 3: 10s Bullet Hell Survival & Self-Destruction
      const p3Cfg = (cfg.phase3) || {};
      this.p3SurvivalTotal = p3Cfg.survivalDuration || 10.0;
      this.survivalTimer = this.p3SurvivalTotal;
      this.p3FireTimer = p3Cfg.fireInterval || 0.65;
      this.p3TetherAngle = 0;
      this.isSelfDestructing = false;
      this.selfDestructTimer = 0;

      // Wall emitters (populated when emitterSource includes 'walls' or 'both')
      this.wallEmitters = [];
      this.initWallEmitters(arenaCfg);
      this.mixedShuffleBag = [];
    }

    get p1StealthOpacity() {
      // Dynamic realtime lookup from window.GameConfig.boss2.p1StealthOpacity
      if (window.GameConfig && window.GameConfig.boss2) {
        if (window.GameConfig.boss2.p1StealthOpacity !== undefined) {
          const v = Number(window.GameConfig.boss2.p1StealthOpacity);
          if (!isNaN(v)) return Math.max(0.0, Math.min(1.0, v));
        }
        if (window.GameConfig.boss2.phase1 && window.GameConfig.boss2.phase1.stealthOpacity !== undefined) {
          const v = Number(window.GameConfig.boss2.phase1.stealthOpacity);
          if (!isNaN(v)) return Math.max(0.0, Math.min(1.0, v));
        }
      }
      if (window.DEFAULT_GAME_CONFIG && window.DEFAULT_GAME_CONFIG.boss2) {
        if (window.DEFAULT_GAME_CONFIG.boss2.p1StealthOpacity !== undefined) {
          const v = Number(window.DEFAULT_GAME_CONFIG.boss2.p1StealthOpacity);
          if (!isNaN(v)) return Math.max(0.0, Math.min(1.0, v));
        }
      }
      return 0.15;
    }

    get p1RevealDuration() {
      const cfg = this.b2Config;
      if (cfg.p1RevealDuration !== undefined) return cfg.p1RevealDuration;
      if (cfg.phase1 && cfg.phase1.revealDurationOnHitPillar !== undefined) return cfg.phase1.revealDurationOnHitPillar;
      if (cfg.phase1 && cfg.phase1.revealDuration !== undefined) return cfg.phase1.revealDuration;
      return 4.0;
    }

    get isInvulnerable() {
      // In P1: strictly invulnerable when in STEALTH_DRIFT state
      if (this.currentPhase === 1 && (this.p1State === 'STEALTH_DRIFT' || this.isStealthed || !this.isRevealed)) {
        return true;
      }
      // In P3 survival phase, boss is invulnerable / overload shielded
      if (this.currentPhase === 3) return true;
      // In phase transitions (3.0s), boss is invulnerable
      if (this.phaseTransitionTimer > 0) return true;
      return false;
    }

    get isHitboxDisabled() {
      // In P1 STEALTH_DRIFT: hurtbox completely disabled so player thrown balls pass straight through!
      if (this.currentPhase === 1 && (this.p1State === 'STEALTH_DRIFT' || this.isStealthed || !this.isRevealed)) {
        return true;
      }
      return false;
    }

    getCurrentPhaseConfig() {
      const cfg = this.b2Config;
      if (this.currentPhase === 1) return cfg.phase1 || {};
      if (this.currentPhase === 2) return cfg.phase2 || {};
      return cfg.phase3 || {};
    }

    initWallEmitters(arenaConfig) {
      this.wallEmitters = [];
      const aCfg = arenaConfig || this.arenaConfig;
      const isCircle = aCfg.shape === 'circle';
      const r = (aCfg.radius || 350) - 20;
      const hw = ((aCfg.width || 800) / 2) - 20;
      const hh = ((aCfg.height || 500) / 2) - 20;

      if (isCircle) {
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          this.wallEmitters.push({
            x: Math.cos(a) * r,
            y: Math.sin(a) * r,
            nx: -Math.cos(a),
            ny: -Math.sin(a)
          });
        }
      } else {
        this.wallEmitters.push({ x: 0, y: -hh, nx: 0, ny: 1 });  // North
        this.wallEmitters.push({ x: hw, y: 0, nx: -1, ny: 0 });  // East
        this.wallEmitters.push({ x: 0, y: hh, nx: 0, ny: -1 });  // South
        this.wallEmitters.push({ x: -hw, y: 0, nx: 1, ny: 0 });  // West
      }
    }

    // -------------------------------------------------------------
    // Damage, Collision & State Transition Logic
    // -------------------------------------------------------------
    takeDamage(amount) {
      if (!this.alive || this.isInvulnerable) return;

      this.hp = Math.max(0, this.hp - amount);
      this.flashWhiteTimer = 0.12;

      window.SoundFX.playBossHit();
      window.ParticleSystem.spawnSparks(this.x, this.y, 18, '#00f0ff');
      window.ParticleSystem.spawnDamageText(this.x, this.y - 30, `-${amount}`, false, '#00e5ff');

      // Check Phase Shifts (P1 > 70%, P2: 70% ~ 30%, P3: <= 30%)
      const p1Cfg = this.b2Config.phase1 || {};
      const p2Cfg = this.b2Config.phase2 || {};
      const p2ThresholdHp = this.maxHp * (p1Cfg.thresholdMin !== undefined ? p1Cfg.thresholdMin : 0.70);
      const p3ThresholdHp = this.maxHp * (p2Cfg.thresholdMin !== undefined ? p2Cfg.thresholdMin : 0.30);

      if (this.currentPhase === 1 && this.hp <= p2ThresholdHp) {
        this.transitionToPhase(2);
        return;
      } else if (this.currentPhase === 2 && this.hp <= p3ThresholdHp) {
        this.transitionToPhase(3);
        return;
      }

      if (this.hp <= 0 && this.currentPhase !== 3) {
        this.hp = 0;
        this.alive = false;
        if (window.Game) {
          window.Game.onBossDefeated();
        }
        return;
      }

      // Requirement 3: Taking damage while revealed forces Boss back into STEALTH_DRIFT immediately!
      if (this.currentPhase === 1 && (this.p1State === 'REVEALED' || this.isRevealed)) {
        this.enterStealth();
      }
    }

    onBallHit(ball) {
      // Called when player's ball collides with Boss2
      if (this.currentPhase === 1 && (this.p1State === 'REVEALED' || this.isRevealed)) {
        this.enterStealth();
      }
    }

    // P1 Break Stealth: Shockwave triggered when player's ball strikes an obstacle
    breakStealthByPlayerBall(obstacle) {
      if (this.currentPhase !== 1 || this.p1State !== 'STEALTH_DRIFT') return;

      this.p1State = 'REVEALED';
      this.isStealthed = false;
      this.isStealth = false;
      this.isRevealed = true;
      this.isDrifting = false;
      this.vx = 0;
      this.vy = 0;
      this.currentOpacity = 1.0;
      this.revealTimer = this.p1RevealDuration;

      // Heavy shockwave impact feedback from both obstacle and Boss
      if (window.Game) {
        window.Game.triggerScreenShake(1.4, 0.35);
      }
      if (window.SoundFX && window.SoundFX.playExplosion) {
        window.SoundFX.playExplosion();
      }
      if (window.SoundFX && window.SoundFX.playDash) {
        window.SoundFX.playDash();
      }

      // Directed blue reveal pulse wave from obstacle to Boss
      if (obstacle && window.ParticleSystem) {
        window.ParticleSystem.spawnShockwave(obstacle.x, obstacle.y, 140, 0.45, '#00e5ff');
        window.ParticleSystem.spawnSparks(obstacle.x, obstacle.y, 25, '#00ffff', 1.8);

        const steps = 8;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const px = obstacle.x + (this.x - obstacle.x) * t;
          const py = obstacle.y + (this.y - obstacle.y) * t;
          setTimeout(() => {
            if (window.ParticleSystem) {
              window.ParticleSystem.spawnShockwave(px, py, 30 + s * 5, 0.25, '#00f0ff');
              window.ParticleSystem.spawnSparks(px, py, 6, '#00ffff', 1.2);
            }
          }, s * 20);
        }
      }

      if (window.ParticleSystem) {
        window.ParticleSystem.spawnShockwave(this.x, this.y, 150, 0.5, '#00f0ff');
        window.ParticleSystem.spawnSparks(this.x, this.y, 35, '#00e5ff', 2.0);
        window.ParticleSystem.spawnDamageText(this.x, this.y - 45, 'REVEALED / 真身暴露!', true, '#00f0ff');
      }
    }

    // Alias for compatibility
    breakStealthOnPillar(obstacle) {
      this.breakStealthByPlayerBall(obstacle);
    }

    // P1 Re-enter Stealth & Resume Drift
    enterStealth() {
      if (this.currentPhase !== 1) return;

      this.p1State = 'STEALTH_DRIFT';
      this.isStealthed = true;
      this.isStealth = true;
      this.isRevealed = false;
      this.isDrifting = true;
      this.revealTimer = 0;
      this.stealthOpacity = this.p1StealthOpacity;
      this.currentOpacity = this.stealthOpacity;

      const p1Cfg = (this.b2Config && this.b2Config.phase1) || {};
      this.driftSpeed = p1Cfg.driftSpeed || 120;

      // Pick new drift vector away from player
      const player = window.Game ? window.Game.player : null;
      let newAngle = Math.random() * Math.PI * 2;
      if (player) {
        const awayDir = window.Physics.normalize(this.x - player.x, this.y - player.y);
        newAngle = Math.atan2(awayDir.y, awayDir.x) + (Math.random() - 0.5) * 1.2;
      }
      this.driftDir = { x: Math.cos(newAngle), y: Math.sin(newAngle) };

      // Stealth smoke & sound
      if (window.SoundFX && window.SoundFX.playDash) {
        window.SoundFX.playDash();
      }
      if (window.ParticleSystem) {
        window.ParticleSystem.spawnShockwave(this.x, this.y, 70, 0.3, '#88aaff');
        window.ParticleSystem.spawnSparks(this.x, this.y, 18, '#88aaff', 1.2);
        window.ParticleSystem.spawnDamageText(this.x, this.y - 35, 'STEALTH DRIFT / 隐形游走!', true, '#88aaff');
      }
    }

    // P2 Obstacle Impact during Charge -> Stun & Rear Spread 反击 (Core P2 Rule)
    onObstacleImpact(obstacle) {
      if (this.currentPhase !== 2 || this.p2State !== 'CHARGING') return;

      const p2Cfg = this.b2Config.phase2 || {};
      this.p2State = 'STUNNED';
      this.p2StateTimer = p2Cfg.wallStunDuration || 3.0;

      // Damage the obstacle Boss rammed into
      if (obstacle && typeof obstacle.damage === 'function') {
        obstacle.damage(40);
      }

      // Push boss slightly back from obstacle so it doesn't get stuck
      if (obstacle) {
        const push = window.Physics.normalize(this.x - obstacle.x, this.y - obstacle.y);
        this.x = obstacle.x + push.x * (obstacle.radius + this.hitboxRadius + 6);
        this.y = obstacle.y + push.y * (obstacle.radius + this.hitboxRadius + 6);
      }

      // Screen shake and impact FX
      if (window.Game) {
        window.Game.triggerScreenShake(1.6, 0.45);
      }
      window.SoundFX.playExplosion();
      window.ParticleSystem.spawnShockwave(this.x, this.y, 140, 0.45, '#ffcc00');
      window.ParticleSystem.spawnSparks(this.x, this.y, 35, '#ffaa00', 2.0);
      window.ParticleSystem.spawnDamageText(this.x, this.y - 45, 'OBSTACLE STUNNED / 撞柱硬直!', true, '#ffcc00');

      // Rear Fan Spread 反击: Fire outward from Boss's back (opposite of charge direction)
      const rearDirX = -this.chargeDir.x;
      const rearDirY = -this.chargeDir.y;
      const rearAngle = Math.atan2(rearDirY, rearDirX);

      const count = p2Cfg.rearFanCount || 5;
      const spreadRad = (p2Cfg.rearFanSpreadAngle || 75) * (Math.PI / 180);
      const startAngle = rearAngle - spreadRad / 2;
      const step = count > 1 ? spreadRad / (count - 1) : 0;

      const pool = ['preset1', 'preset3']; // Mix white and high-damage purple core balls so player can counter-attack!
      for (let i = 0; i < count; i++) {
        const a = startAngle + step * i;
        const isCore = (i === Math.floor(count / 2) || i === 0 || i === count - 1);
        const pKey = isCore ? pool[Math.floor(Math.random() * pool.length)] : 'preset1';
        this.spawnBullet(this.x, this.y, Math.cos(a), Math.sin(a), pKey, !isCore);
      }
    }

    // P2 Wall Impact during Charge -> Stun fallback
    onWallImpact(wallNx, wallNy) {
      if (this.currentPhase !== 2 || this.p2State !== 'CHARGING') return;
      this.onObstacleImpact(null);
    }

    transitionToPhase(newPhase) {
      this.currentPhase = newPhase;
      this.phaseTransitionTimer = 2.5;

      // Visual fanfare for phase shift
      if (window.Game) {
        window.Game.triggerScreenShake(1.5, 0.4);
      }
      window.SoundFX.playExplosion();
      window.ParticleSystem.spawnShockwave(this.x, this.y, 150, 0.5, '#00e5ff');
      window.ParticleSystem.spawnSparks(this.x, this.y, 40, '#00ffff', 2.0);
      window.ParticleSystem.spawnDamageText(this.x, this.y - 40, `PHASE ${newPhase}!`, true, '#00e5ff');

      // Update HUD phase badge
      const badge = document.getElementById('boss-phase-badge');
      if (badge) {
        badge.textContent = `PHASE ${newPhase}`;
        badge.className = `boss-phase-badge phase-${newPhase}`;
      }

      if (newPhase === 2) {
        // P2: Drop stealth completely, start charge sequence
        this.p1State = 'REVEALED';
        this.isStealthed = false;
        this.isStealth = false;
        this.isRevealed = true;
        this.isDrifting = false;
        this.currentOpacity = 1.0;
        this.p2State = 'CHARGE_REST';
        this.p2StateTimer = this.chargeDelay;
      } else if (newPhase === 3) {
        // P3: Survival Bullet Hell
        this.p1State = 'REVEALED';
        this.isStealthed = false;
        this.isStealth = false;
        this.isRevealed = true;
        this.isDrifting = false;
        this.currentOpacity = 1.0;
        const p3Cfg = this.b2Config.phase3 || {};
        this.survivalTimer = p3Cfg.survivalDuration || 10.0;
        this.p3SurvivalTotal = this.survivalTimer;

        // Display Survival Timer Banner in HUD
        const banner = document.getElementById('survival-timer-banner');
        if (banner) {
          banner.style.display = 'inline-flex';
        }
      }
    }

    // -------------------------------------------------------------
    // Update Loop
    // -------------------------------------------------------------
    update(dt, player, arenaConfig) {
      if (!this.alive) return;

      // 0. Update Dual Halos
      this.halo1Angle += dt * this.halo1Speed;
      this.halo2Angle += dt * this.halo2Speed;

      // Heartbeat pulse animation
      this.beatTimer += dt * 3.5;
      this.beatScale = 1.0 + Math.sin(this.beatTimer) * 0.05;

      // White flash decay
      if (this.flashWhiteTimer > 0) {
        this.flashWhiteTimer = Math.max(0, this.flashWhiteTimer - dt);
      }
      if (this.phaseTransitionTimer > 0) {
        this.phaseTransitionTimer = Math.max(0, this.phaseTransitionTimer - dt);
      }

      // -----------------------------------------------------------
      // PHASE 1: Stealth Drift & Pillar Reveal
      // -----------------------------------------------------------
      if (this.currentPhase === 1) {
        const p1Cfg = this.b2Config.phase1 || {};
        this.stealthOpacity = this.p1StealthOpacity;
        this.driftSpeed = p1Cfg.driftSpeed || 120;

        if (this.p1State === 'STEALTH_DRIFT') {
          this.isStealthed = true;
          this.isStealth = true;
          this.isRevealed = false;
          this.isDrifting = true;
          this.currentOpacity = this.stealthOpacity;

          // Slow drift movement (Boss passes straight through obstacles in P1)
          this.x += this.driftDir.x * this.driftSpeed * dt;
          this.y += this.driftDir.y * this.driftSpeed * dt;

          // Bounce off arena perimeter
          this.handlePerimeterDriftBounce(arenaConfig);
        } else if (this.p1State === 'REVEALED') {
          this.isStealthed = false;
          this.isStealth = false;
          this.isRevealed = true;
          this.isDrifting = false;
          this.vx = 0;
          this.vy = 0;
          this.currentOpacity = 1.0;

          // Standing still in revealed state: tick reveal timer
          this.revealTimer -= dt;
          if (this.revealTimer <= 0) {
            // Time expired without player hit: re-enter stealth
            this.enterStealth();
          }
        }

        // Periodic Attack Emitters in P1
        this.p1FireTimer -= dt;
        if (this.p1FireTimer <= 0) {
          this.p1FireTimer = p1Cfg.fireInterval || 2.5;
          this.triggerAttackWave(p1Cfg, player);
        }
      }

      // -----------------------------------------------------------
      // PHASE 2: Charge, Wall Stun & Rear Spread
      // -----------------------------------------------------------
      else if (this.currentPhase === 2) {
        const p2Cfg = this.b2Config.phase2 || {};
        this.currentOpacity = 1.0;

        // Update ghost afterimages
        if (this.p2State === 'CHARGING') {
          this.ghostTrails.unshift({ x: this.x, y: this.y, alpha: 0.65 });
          if (this.ghostTrails.length > 6) this.ghostTrails.pop();
        } else if (this.ghostTrails.length > 0) {
          for (let i = this.ghostTrails.length - 1; i >= 0; i--) {
            this.ghostTrails[i].alpha -= dt * 3.5;
            if (this.ghostTrails[i].alpha <= 0) this.ghostTrails.splice(i, 1);
          }
        }

        this.p2StateTimer -= dt;

        if (this.p2State === 'CHARGE_REST') {
          // Firing regular waves during breathing window
          this.p2FireTimer -= dt;
          if (this.p2FireTimer <= 0) {
            this.p2FireTimer = p2Cfg.fireInterval || 2.8;
            this.triggerAttackWave(p2Cfg, player);
          }

          if (this.p2StateTimer <= 0) {
            // Enter Telegraph
            this.p2State = 'CHARGE_TELEGRAPH';
            this.p2StateTimer = p2Cfg.telegraphDuration || 0.6;
            // Lock charge direction towards player
            const toP = window.Physics.normalize(player.x - this.x, player.y - this.y);
            this.chargeDir = toP;
            window.SoundFX.playDash();
          }
        } else if (this.p2State === 'CHARGE_TELEGRAPH') {
          // Slight twitch tracking player
          const toP = window.Physics.normalize(player.x - this.x, player.y - this.y);
          this.chargeDir.x += (toP.x - this.chargeDir.x) * 0.15;
          this.chargeDir.y += (toP.y - this.chargeDir.y) * 0.15;
          this.chargeDir = window.Physics.normalize(this.chargeDir.x, this.chargeDir.y);

          if (this.p2StateTimer <= 0) {
            // Launch High-Speed Charge!
            this.p2State = 'CHARGING';
            this.p2StateTimer = 2.0; // Max charge duration safety timeout
            window.SoundFX.playDash();
            window.ParticleSystem.spawnShockwave(this.x, this.y, 80, 0.3, '#ffaa00');
          }
        } else if (this.p2State === 'CHARGING') {
          const spd = p2Cfg.chargeSpeed || 550;
          this.x += this.chargeDir.x * spd * dt;
          this.y += this.chargeDir.y * spd * dt;

          // Check hit against player
          const dPlayer = window.Physics.dist(this.x, this.y, player.x, player.y);
          if (dPlayer <= (this.hitboxRadius + player.radius)) {
            // If player is not invulnerable, hurt player
            if (!player.isInvulnerable) {
              player.takeDamage(35);
              const push = window.Physics.normalize(player.x - this.x, player.y - this.y);
              player.x += push.x * 30;
              player.y += push.y * 30;
            }
          }

          // Check hit against arena obstacles (P2 Core Rule: Ramming an obstacle causes STUN!)
          let hitObstacle = false;
          const obstacles = (window.Game && window.Game.arena) ? window.Game.arena.aliveObstacles : [];
          for (const obs of obstacles) {
            const dObs = window.Physics.dist(this.x, this.y, obs.x, obs.y);
            if (dObs <= (this.hitboxRadius + obs.radius)) {
              this.onObstacleImpact(obs);
              hitObstacle = true;
              break;
            }
          }

          if (!hitObstacle) {
            // Check hit against arena wall boundary (Wall hit does NOT stun Boss!)
            const wallHit = this.checkWallCollision(arenaConfig);
            if (wallHit.collided) {
              this.p2State = 'CHARGE_REST';
              this.p2StateTimer = p2Cfg.chargeDelay || 2.5;
              this.x += wallHit.nx * 10;
              this.y += wallHit.ny * 10;
              window.SoundFX.playWallBounce();
              window.ParticleSystem.spawnSparks(this.x, this.y, 14, '#88aaff', 1.0);
              window.ParticleSystem.spawnDamageText(this.x, this.y - 35, 'MISSED / 未撞中掩体', false, '#88aaff');
            } else if (this.p2StateTimer <= 0) {
              // Safety timeout: stop charge and rest
              this.p2State = 'CHARGE_REST';
              this.p2StateTimer = p2Cfg.chargeDelay || 2.5;
            }
          }
        } else if (this.p2State === 'STUNNED') {
          // Boss is stunned! Tick stun timer & spin dizzy stars
          this.stunStarsAngle += dt * 4.0;
          if (this.p2StateTimer <= 0) {
            // Stun ends, return to charge rest
            this.p2State = 'CHARGE_REST';
            this.p2StateTimer = p2Cfg.chargeDelay || 2.5;
            window.ParticleSystem.spawnDamageText(this.x, this.y - 35, 'RECOVERED / 恢复战斗!', false, '#00f0ff');
          }
        }
      }

      // -----------------------------------------------------------
      // PHASE 3: 10s Bullet Hell Survival & Overload Self-Destruction
      // -----------------------------------------------------------
      else if (this.currentPhase === 3) {
        const p3Cfg = this.b2Config.phase3 || {};

        // Glide towards center upper position (0, -40)
        this.x += (0 - this.x) * dt * 2.5;
        this.y += (-40 - this.y) * dt * 2.5;

        // Tick survival countdown
        this.survivalTimer = Math.max(0, this.survivalTimer - dt);

        // Update Survival Timer Banner in HUD
        const digits = document.getElementById('survival-countdown-digits');
        if (digits) {
          digits.textContent = this.survivalTimer.toFixed(1) + 's';
        }

        // Rapid Bullet Hell Salvo
        this.p3FireTimer -= dt;
        if (this.p3FireTimer <= 0) {
          this.p3FireTimer = p3Cfg.fireInterval || 0.65;
          this.triggerAttackWave(p3Cfg, player);
        }

        // Check 10s Survival Victory: Overload Self-Destruction!
        if (this.survivalTimer <= 0 && !this.isSelfDestructing) {
          this.triggerOverloadSelfDestruction();
        }
      }
    }

    // -------------------------------------------------------------
    // Perimeter & Wall Collision Math
    // -------------------------------------------------------------
    handlePerimeterDriftBounce(arenaConfig) {
      const aCfg = arenaConfig || this.arenaConfig;
      const isCircle = aCfg.shape === 'circle';
      const r = (aCfg.radius || 350) - this.hitboxRadius;
      const hw = ((aCfg.width || 800) / 2) - this.hitboxRadius;
      const hh = ((aCfg.height || 500) / 2) - this.hitboxRadius;

      if (isCircle) {
        const dist = Math.hypot(this.x, this.y);
        if (dist > r) {
          const nx = this.x / dist;
          const ny = this.y / dist;
          this.x = nx * r;
          this.y = ny * r;
          // Reflect driftDir: v = v - 2*(v.n)*n
          const dot = this.driftDir.x * nx + this.driftDir.y * ny;
          this.driftDir.x -= 2 * dot * nx;
          this.driftDir.y -= 2 * dot * ny;
        }
      } else {
        if (this.x < -hw) {
          this.x = -hw;
          this.driftDir.x = Math.abs(this.driftDir.x);
        } else if (this.x > hw) {
          this.x = hw;
          this.driftDir.x = -Math.abs(this.driftDir.x);
        }
        if (this.y < -hh) {
          this.y = -hh;
          this.driftDir.y = Math.abs(this.driftDir.y);
        } else if (this.y > hh) {
          this.y = hh;
          this.driftDir.y = -Math.abs(this.driftDir.y);
        }
      }
    }

    checkWallCollision(arenaConfig) {
      const aCfg = arenaConfig || this.arenaConfig;
      const isCircle = aCfg.shape === 'circle';
      const r = (aCfg.radius || 350) - this.hitboxRadius;
      const hw = ((aCfg.width || 800) / 2) - this.hitboxRadius;
      const hh = ((aCfg.height || 500) / 2) - this.hitboxRadius;

      if (isCircle) {
        const dist = Math.hypot(this.x, this.y);
        if (dist >= r) {
          const nx = -this.x / dist;
          const ny = -this.y / dist;
          this.x = (this.x / dist) * r;
          this.y = (this.y / dist) * r;
          return { collided: true, nx, ny };
        }
      } else {
        if (this.x <= -hw) {
          this.x = -hw;
          return { collided: true, nx: 1, ny: 0 };
        }
        if (this.x >= hw) {
          this.x = hw;
          return { collided: true, nx: -1, ny: 0 };
        }
        if (this.y <= -hh) {
          this.y = -hh;
          return { collided: true, nx: 0, ny: 1 };
        }
        if (this.y >= hh) {
          this.y = hh;
          return { collided: true, nx: 0, ny: -1 };
        }
      }
      return { collided: false };
    }

    // -------------------------------------------------------------
    // P3 Overload Self-Destruction
    // -------------------------------------------------------------
    triggerOverloadSelfDestruction() {
      this.isSelfDestructing = true;
      this.alive = false;

      // Massive Multi-Stage Explosion
      if (window.Game) {
        window.Game.triggerScreenShake(2.5, 0.8);
        window.Game.triggerHitstop(0.6);
      }
      window.SoundFX.playExplosion();
      window.ParticleSystem.spawnShockwave(this.x, this.y, 220, 0.7, '#00f0ff');
      window.ParticleSystem.spawnShockwave(this.x, this.y, 160, 0.5, '#ffffff');
      window.ParticleSystem.spawnSparks(this.x, this.y, 60, '#00e5ff', 2.5);
      window.ParticleSystem.spawnSparks(this.x, this.y, 50, '#ffcc00', 2.0);
      window.ParticleSystem.spawnDamageText(this.x, this.y - 40, 'CORE OVERLOAD / 自爆破灭!', true, '#00f0ff');

      // Hide survival banner
      const banner = document.getElementById('survival-timer-banner');
      if (banner) {
        banner.style.display = 'none';
      }

      // Trigger Victory after dramatic hitstop
      setTimeout(() => {
        if (window.Game) {
          window.Game.onBossDefeated();
        }
      }, 500);
    }

    // -------------------------------------------------------------
    // Emitters & Bullet Formations
    // -------------------------------------------------------------
    getNextMixedPreset() {
      const bCfg = window.GameConfig && window.GameConfig.ball;
      const weights = (bCfg && bCfg.mixedWeights) || { white: 1, purple: 1, red: 1 };
      const wWhite = Math.max(0, weights.white !== undefined ? weights.white : 1);
      const wPurple = Math.max(0, weights.purple !== undefined ? weights.purple : 1);
      const wRed = Math.max(0, weights.red !== undefined ? weights.red : 1);

      if (!this.mixedShuffleBag || this.mixedShuffleBag.length === 0) {
        this.mixedShuffleBag = [];
        const mult = (wWhite === 1 && wPurple === 1 && wRed === 1) ? 2 : 1;
        for (let i = 0; i < wWhite * mult; i++) this.mixedShuffleBag.push('preset1'); // White
        for (let i = 0; i < wPurple * mult; i++) this.mixedShuffleBag.push('preset3'); // Purple
        for (let i = 0; i < wRed * mult; i++) this.mixedShuffleBag.push('preset2'); // Red

        if (this.mixedShuffleBag.length === 0) {
          this.mixedShuffleBag = ['preset1', 'preset3', 'preset2', 'preset1', 'preset3', 'preset2'];
        }

        // Fisher-Yates shuffle
        for (let i = this.mixedShuffleBag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = this.mixedShuffleBag[i];
          this.mixedShuffleBag[i] = this.mixedShuffleBag[j];
          this.mixedShuffleBag[j] = tmp;
        }
      }

      let nextPreset = this.mixedShuffleBag.pop() || 'preset1';
      // Anti-streak guard: prevent 3 or more consecutive uncatchable red balls
      if (nextPreset === 'preset2' && (this.consecutiveRedCount || 0) >= 2) {
        const nonRedIdx = this.mixedShuffleBag.findIndex(p => p !== 'preset2');
        if (nonRedIdx !== -1) {
          const nonRed = this.mixedShuffleBag[nonRedIdx];
          this.mixedShuffleBag[nonRedIdx] = nextPreset;
          nextPreset = nonRed;
        }
      }
      if (nextPreset === 'preset2') {
        this.consecutiveRedCount = (this.consecutiveRedCount || 0) + 1;
      } else {
        this.consecutiveRedCount = 0;
      }
      return nextPreset;
    }

    resolvePresetKey(presetKey) {
      if (presetKey === 'mixed') {
        return this.getNextMixedPreset();
      }
      return presetKey || 'preset1';
    }

    triggerAttackWave(phaseCfg, player) {
      const source = phaseCfg.emitterSource || 'boss';
      const formation = phaseCfg.formationType || 'fan';
      const presetKey = phaseCfg.assignedBallPreset || 'mixed';

      if (source === 'boss' || source === 'both') {
        this.fireFormationFromPoint(this.x, this.y, formation, phaseCfg, player, presetKey);
      }
      if (source === 'walls' || source === 'both') {
        this.fireWallMinionSalvo(player);
      }
    }

    fireWallMinionSalvo(player) {
      for (const emitter of this.wallEmitters) {
        const aimDir = window.Physics.normalize(player.x - emitter.x, player.y - emitter.y);
        this.spawnBullet(emitter.x, emitter.y, aimDir.x, aimDir.y, 'preset1', true);
      }
    }

    fireFormationFromPoint(originX, originY, formation, phaseCfg, player, presetKey) {
      const toPlayer = window.Physics.normalize(player.x - originX, player.y - originY);
      const baseAngle = Math.atan2(toPlayer.y, toPlayer.x);

      if (formation === 'single') {
        const resolvedKey = this.resolvePresetKey(presetKey);
        this.spawnBullet(originX, originY, Math.cos(baseAngle), Math.sin(baseAngle), resolvedKey, false);
      } else if (formation === 'fan') {
        const count = phaseCfg.fanCount || 5;
        const spreadRad = (phaseCfg.fanSpreadAngle || 60) * (Math.PI / 180);
        const startAngle = baseAngle - spreadRad / 2;
        const step = count > 1 ? spreadRad / (count - 1) : 0;

        let slots = [];
        const coreCount = count >= 7 ? 2 : 1;
        for (let i = 0; i < count; i++) slots.push(i >= coreCount);
        for (let i = slots.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = slots[i];
          slots[i] = slots[j];
          slots[j] = tmp;
        }

        for (let i = 0; i < count; i++) {
          const a = startAngle + step * i;
          const isMinion = slots[i];
          const resolvedKey = isMinion ? 'preset1' : this.resolvePresetKey(presetKey);
          this.spawnBullet(originX, originY, Math.cos(a), Math.sin(a), resolvedKey, isMinion);
        }
      } else if (formation === 'ring') {
        const count = phaseCfg.ringCount || 12;
        const step = (Math.PI * 2) / count;
        const coreCount = Math.min(3, count);

        // Shuffle core ball slots across the 360 ring
        let slots = [];
        for (let i = 0; i < count; i++) slots.push(i >= coreCount);
        for (let i = slots.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = slots[i];
          slots[i] = slots[j];
          slots[j] = tmp;
        }

        for (let i = 0; i < count; i++) {
          const a = baseAngle + step * i;
          const isMinion = slots[i];
          const resolvedKey = isMinion ? 'preset1' : this.resolvePresetKey(presetKey);
          this.spawnBullet(originX, originY, Math.cos(a), Math.sin(a), resolvedKey, isMinion, !isMinion);
        }
      } else if (formation === 'spiral') {
        const count = phaseCfg.spiralRate || 8;
        this.spiralAngle += 0.40;

        for (let i = 0; i < count; i++) {
          const a = this.spiralAngle + (i * Math.PI * 2) / count;
          const isMinion = (i !== 0);
          const resolvedKey = isMinion ? 'preset1' : this.resolvePresetKey(presetKey);
          this.spawnBullet(originX, originY, Math.cos(a), Math.sin(a), resolvedKey, isMinion);
        }
      }
    }

    spawnBullet(x, y, dirX, dirY, presetKey, isMinion = false, forceCore = false) {
      if (!window.Game || !window.Game.balls) return;

      const preset = (window.GameConfig && typeof window.GameConfig.getBallPreset === 'function')
        ? window.GameConfig.getBallPreset(presetKey)
        : ((window.DEFAULT_GAME_CONFIG && window.DEFAULT_GAME_CONFIG.ball && window.DEFAULT_GAME_CONFIG.ball.presets && window.DEFAULT_GAME_CONFIG.ball.presets[presetKey]) || {
            speed: 380, radius: 10, baseDamage: 25, canDirectCatch: true, color: '#ffffff', glowColor: 'rgba(255,255,255,0.8)'
          });
      const isCore = forceCore || (!isMinion && preset.canDirectCatch);

      // Core ball cap check
      if (isCore) {
        const maxCore = this.ballConfig.maxActiveCoreBalls || 3;
        let activeCore = 0;
        for (const b of window.Game.balls) {
          if (b.alive && b.canDirectCatch && !b.isMinion) activeCore++;
        }
        if (activeCore >= maxCore && !forceCore) {
          isMinion = true;
        }
      }

      const bulletSpeed = preset.speed || 380;
      const bullet = new window.Ball({
        x: x + dirX * (this.hitboxRadius + 10),
        y: y + dirY * (this.hitboxRadius + 10),
        z: 10,
        dirX: dirX,
        dirY: dirY,
        vx: dirX * bulletSpeed,
        vy: dirY * bulletSpeed,
        speed: bulletSpeed,
        radius: isMinion ? 7 : preset.radius,
        damage: isMinion ? 12 : preset.baseDamage,
        trajectoryType: preset.trajectoryType,
        sineFrequency: preset.sineFrequency,
        sineAmplitude: preset.sineAmplitude,
        canDirectCatch: isMinion ? false : preset.canDirectCatch,
        isMinion,
        presetKey,
        preset,
        color: isMinion ? 'rgba(0, 229, 255, 0.85)' : preset.color,
        glowColor: isMinion ? 'rgba(0, 200, 255, 0.45)' : preset.glowColor,
        state: window.BallState ? window.BallState.ENEMY_FLIGHT : 0
      });

      window.Game.balls.push(bullet);
    }

    // -------------------------------------------------------------
    // Render Loop
    // -------------------------------------------------------------
    render(ctx, yScale = 0.75) {
      if (!this.alive) return;

      const screenPos = window.Physics.toScreen(this.x, this.y, this.z, yScale);
      const groundPos = window.Physics.toScreen(this.x, this.y, 0, yScale);
      const centerY = screenPos.y - 15;
      const centerX = screenPos.x;

      // 1. Single Source of Truth: Realtime read config.boss2.p1StealthOpacity every single frame
      const isP1Stealth = (this.currentPhase === 1 && (this.p1State === 'STEALTH_DRIFT' || this.isStealthed || !this.isRevealed));
      const isP1Revealed = (this.currentPhase === 1 && (this.p1State === 'REVEALED' || this.isRevealed));

      const rawConfigOp = (window.GameConfig && window.GameConfig.boss2 && window.GameConfig.boss2.p1StealthOpacity !== undefined)
        ? Number(window.GameConfig.boss2.p1StealthOpacity)
        : this.p1StealthOpacity;
      const liveStealthOpacity = Math.max(0.0, Math.min(1.0, isNaN(rawConfigOp) ? 0.15 : rawConfigOp));

      // Calculate outermost baseAlpha: strictly liveStealthOpacity when in stealth, 1.0 when revealed
      const baseAlpha = isP1Stealth ? liveStealthOpacity : (isP1Revealed ? 1.0 : this.currentOpacity);

      // Rule 2: If baseAlpha <= 0.001 (slider at 0), skip ALL drawing of Boss entirely!
      if (isP1Stealth && baseAlpha <= 0.001) {
        return;
      }

      ctx.save();
      ctx.globalAlpha = baseAlpha;

      // 1. Floor Shadow
      if (baseAlpha > 0.02) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(groundPos.x, groundPos.y, this.hitboxRadius * 1.3, this.hitboxRadius * yScale * 0.7, 0, 0, Math.PI * 2);
        const shadowOp = (this.arenaConfig.shadowOpacity !== undefined ? this.arenaConfig.shadowOpacity : 0.35);
        ctx.fillStyle = `rgba(0, 0, 0, ${(shadowOp * (isP1Stealth ? 0.35 : 1.2) * baseAlpha).toFixed(3)})`;
        ctx.globalAlpha = baseAlpha;
        ctx.fill();
        ctx.restore();
      }

      // 2. Ghost Trails during Charge (P2)
      if (this.ghostTrails.length > 0) {
        for (const tr of this.ghostTrails) {
          const tPos = window.Physics.toScreen(tr.x, tr.y, 0, yScale);
          ctx.save();
          ctx.beginPath();
          ctx.arc(tPos.x, tPos.y - 15, this.hitboxRadius * 0.9, 0, Math.PI * 2);
          ctx.fillStyle = colorWithAlpha('#00f0ff', baseAlpha * tr.alpha * 0.35);
          ctx.globalAlpha = baseAlpha * tr.alpha * 0.35;
          ctx.shadowColor = colorWithAlpha('#00e5ff', baseAlpha);
          ctx.shadowBlur = Math.round(12 * baseAlpha);
          ctx.fill();
          ctx.restore();
        }
      }

      // 3. P2 Charge Telegraph Warning Line
      if (this.p2State === 'CHARGE_TELEGRAPH') {
        ctx.save();
        const laserDist = 800;
        ctx.beginPath();
        ctx.setLineDash([12, 6]);
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + this.chargeDir.x * laserDist, centerY + this.chargeDir.y * laserDist * yScale);
        ctx.strokeStyle = colorWithAlpha('#ff3366', baseAlpha);
        ctx.lineWidth = 3.0;
        ctx.globalAlpha = baseAlpha;
        ctx.shadowColor = colorWithAlpha('#ff0044', baseAlpha);
        ctx.shadowBlur = Math.round(16 * baseAlpha);
        ctx.stroke();
        ctx.restore();
      }

      // 4. Dual Blue Halos (两道独立旋转的蓝色发光光环)
      this.renderDualHalos(ctx, centerX, centerY, yScale, baseAlpha);

      // 5. Boss Core Geometric Body
      const currentR = this.hitboxRadius * this.beatScale;

      // P1 Stealth Drift: Ethereal dashed protective ring & status tag
      if (isP1Stealth) {
        ctx.save();
        ctx.globalAlpha = baseAlpha;
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentR + 12, 0, Math.PI * 2);
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -this.halo1Angle * 18;
        ctx.strokeStyle = colorWithAlpha('#00f0ff', baseAlpha);
        ctx.lineWidth = 2.5;
        ctx.shadowColor = colorWithAlpha('#00f0ff', baseAlpha);
        ctx.shadowBlur = Math.round(12 * baseAlpha);
        ctx.stroke();

        if (baseAlpha > 0.08) {
          ctx.font = 'bold 11px "Courier New", monospace';
          ctx.fillStyle = colorWithAlpha('#00f0ff', baseAlpha);
          ctx.textAlign = 'center';
          ctx.fillText('👻 STEALTH [INVULNERABLE]', centerX, centerY - currentR - 14);
        }
        ctx.restore();
      }

      // P1 Revealed: Targeting Crosshairs & Countdown
      if (isP1Revealed) {
        ctx.save();
        ctx.globalAlpha = baseAlpha;
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentR + 10, 0, Math.PI * 2);
        ctx.strokeStyle = colorWithAlpha('#ffff00', baseAlpha);
        ctx.lineWidth = 2.5;
        ctx.shadowColor = colorWithAlpha('#ffff00', baseAlpha);
        ctx.shadowBlur = Math.round(14 * baseAlpha);
        ctx.stroke();

        const retR = currentR + 18;
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          ctx.beginPath();
          ctx.moveTo(centerX + Math.cos(a) * (currentR + 4), centerY + Math.sin(a) * (currentR + 4));
          ctx.lineTo(centerX + Math.cos(a) * retR, centerY + Math.sin(a) * retR);
          ctx.strokeStyle = colorWithAlpha('#00ffff', baseAlpha);
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        const secStr = Math.max(0, this.revealTimer).toFixed(1);
        ctx.font = 'bold 12px "Courier New", monospace';
        ctx.fillStyle = colorWithAlpha('#ffff00', baseAlpha);
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 6;
        ctx.fillText(`🎯 EXPOSED! ${secStr}s`, centerX, centerY - currentR - 16);
        ctx.restore();
      }

      // Outer Energy Shell
      ctx.beginPath();
      ctx.arc(centerX, centerY, currentR, 0, Math.PI * 2);
      const shellFill = this.flashWhiteTimer > 0 ? '#ffffff' : (this.currentPhase === 3 ? '#0a2244' : '#081628');
      const shellStroke = this.currentPhase === 3 ? '#00ffff' : (this.p2State === 'STUNNED' ? '#ffcc00' : '#00e5ff');
      ctx.fillStyle = colorWithAlpha(shellFill, baseAlpha);
      ctx.strokeStyle = colorWithAlpha(shellStroke, baseAlpha);
      ctx.lineWidth = 3.0;
      ctx.globalAlpha = baseAlpha;
      ctx.shadowColor = colorWithAlpha(shellStroke, baseAlpha);
      ctx.shadowBlur = Math.round(20 * this.haloGlowIntensity * baseAlpha);
      ctx.fill();
      ctx.stroke();

      // Cyber Shield Plating Details
      ctx.beginPath();
      ctx.arc(centerX - currentR * 0.35, centerY - currentR * 0.25, currentR * 0.35, 0, Math.PI * 2);
      ctx.arc(centerX + currentR * 0.35, centerY - currentR * 0.25, currentR * 0.35, 0, Math.PI * 2);
      const plateColor = this.flashWhiteTimer > 0 ? '#ffffff' : (this.currentPhase === 3 ? '#104080' : '#143054');
      ctx.fillStyle = colorWithAlpha(plateColor, baseAlpha);
      ctx.globalAlpha = baseAlpha;
      ctx.fill();

      // Center Eye / Core Crystal (Pulsing Diamond/Circle)
      ctx.beginPath();
      ctx.arc(centerX, centerY, currentR * 0.30, 0, Math.PI * 2);
      const eyeColor = this.p2State === 'STUNNED' ? '#ffcc00' : (this.currentPhase === 3 ? '#00ffff' : '#00e5ff');
      ctx.fillStyle = colorWithAlpha(eyeColor, baseAlpha);
      ctx.globalAlpha = baseAlpha;
      ctx.shadowColor = colorWithAlpha(eyeColor, baseAlpha);
      ctx.shadowBlur = Math.round(15 * baseAlpha);
      ctx.fill();

      // 6. Stun Stars Indicator (P2 Wall Stun)
      if (this.p2State === 'STUNNED') {
        this.renderStunStars(ctx, centerX, centerY - currentR - 18, yScale, baseAlpha);
      }

      // 7. P3 Overload Electric Sparks
      if (this.currentPhase === 3 && Math.random() < 0.45) {
        window.ParticleSystem.spawnSparks(this.x, this.y, 1, '#00ffff', 0.8);
      }

      ctx.restore();
    }

    renderDualHalos(ctx, centerX, centerY, yScale, baseAlpha = 1.0) {
      const isStunned = (this.p2State === 'STUNNED');
      const isP3 = (this.currentPhase === 3);
      const rScale = isP3 ? 1.25 : 1.0;

      // Halo 1: Inner Glowing Cyan Halo (Tilted 25°)
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(0.35); // 20° tilt

      const h1R = this.halo1Radius * rScale;
      ctx.beginPath();
      ctx.ellipse(0, 0, h1R, h1R * yScale * 0.65, 0, 0, Math.PI * 2);
      ctx.strokeStyle = colorWithAlpha(this.halo1Color, baseAlpha);
      ctx.lineWidth = isP3 ? 3.5 : 2.5;
      ctx.globalAlpha = baseAlpha;
      ctx.shadowColor = colorWithAlpha(this.halo1Color, baseAlpha);
      ctx.shadowBlur = Math.round(18 * this.haloGlowIntensity * baseAlpha);
      ctx.setLineDash([14, 8]);
      ctx.lineDashOffset = -this.halo1Angle * 25;
      ctx.stroke();

      // Orbital Node on Halo 1
      const n1X = Math.cos(this.halo1Angle) * h1R;
      const n1Y = Math.sin(this.halo1Angle) * (h1R * yScale * 0.65);
      ctx.beginPath();
      ctx.arc(n1X, n1Y, 5, 0, Math.PI * 2);
      ctx.fillStyle = colorWithAlpha('#ffffff', baseAlpha);
      ctx.globalAlpha = baseAlpha;
      ctx.shadowColor = colorWithAlpha(this.halo1Color, baseAlpha);
      ctx.shadowBlur = Math.round(12 * baseAlpha);
      ctx.fill();

      ctx.restore();

      // Halo 2: Outer Glowing Deep Neon Blue Halo (Tilted -25°, Counter-Rotating)
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(-0.35); // -20° tilt

      const h2R = this.halo2Radius * rScale;
      ctx.beginPath();
      ctx.ellipse(0, 0, h2R, h2R * yScale * 0.65, 0, 0, Math.PI * 2);
      ctx.strokeStyle = colorWithAlpha(this.halo2Color, baseAlpha);
      ctx.lineWidth = isP3 ? 3.0 : 2.0;
      ctx.globalAlpha = baseAlpha;
      ctx.shadowColor = colorWithAlpha(this.halo2Color, baseAlpha);
      ctx.shadowBlur = Math.round(16 * this.haloGlowIntensity * baseAlpha);
      ctx.setLineDash([18, 10]);
      ctx.lineDashOffset = -this.halo2Angle * 25;
      ctx.stroke();

      // Orbital Node on Halo 2
      const n2X = Math.cos(this.halo2Angle) * h2R;
      const n2Y = Math.sin(this.halo2Angle) * (h2R * yScale * 0.65);
      ctx.beginPath();
      ctx.arc(n2X, n2Y, 6, 0, Math.PI * 2);
      ctx.fillStyle = colorWithAlpha('#00ffff', baseAlpha);
      ctx.globalAlpha = baseAlpha;
      ctx.shadowColor = colorWithAlpha(this.halo2Color, baseAlpha);
      ctx.shadowBlur = Math.round(14 * baseAlpha);
      ctx.fill();

      ctx.restore();
    }

    renderStunStars(ctx, centerX, topY, yScale, baseAlpha = 1.0) {
      ctx.save();
      ctx.globalAlpha = baseAlpha;
      const starCount = 3;
      const orbitR = 24;

      for (let i = 0; i < starCount; i++) {
        const a = this.stunStarsAngle + (i * Math.PI * 2) / starCount;
        const sx = centerX + Math.cos(a) * orbitR;
        const sy = topY + Math.sin(a) * orbitR * yScale;

        ctx.beginPath();
        ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = colorWithAlpha('#ffcc00', baseAlpha);
        ctx.shadowColor = colorWithAlpha('#ffcc00', baseAlpha);
        ctx.shadowBlur = Math.round(10 * baseAlpha);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  window.Boss2 = Boss2;
})(window);
