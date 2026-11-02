/**
 * Project: Dodgeball Boss Rush
 * File: js/boss.js
 * Description: "Mom's Heart" Geometric Boss Entity & 3-Phase Bullet Hell State Machine.
 * Supports center/top/roaming positioning, 4 arena wall emitters, dynamic pattern generation
 * (Single, Fan Spread, 360 Ring, Spiral), and phase transitions.
 */

(function(window) {
  'use strict';

  class Boss {
    constructor() {
      this.reset();
    }

    reset() {
      const cfg = window.GameConfig.boss;
      this.maxHp = cfg.maxHp;
      this.hp = this.maxHp;
      this.hitboxRadius = cfg.hitboxRadius;
      this.alive = true;

      // Position coordinates (placed at top edge by default)
      const arenaCfg = window.GameConfig.arena;
      const halfH = arenaCfg.shape === 'circle' ? arenaCfg.radius : arenaCfg.height / 2;
      this.x = 0;
      this.y = -halfH + this.hitboxRadius + 30;
      this.z = 0;

      // Roaming movement variables
      this.roamAngle = 0;
      this.roamSpeed = cfg.roamingSpeed;

      // Heartbeat pulse animation
      this.beatTimer = 0;
      this.beatScale = 1.0;

      // Phase State Machine
      this.currentPhase = 1; // 1 | 2 | 3
      this.fireTimer = 0;
      this.spiralAngle = 0;

      // Attack Rhythm State Machine: REST -> TELEGRAPH -> FIRE
      this.attackState = 'REST'; // REST | TELEGRAPH | FIRE
      this.restTimer = 1.0;
      this.telegraphTimer = 0;
      this.telegraphMaxTime = 0.5;
      this.telegraphAimDir = { x: 0, y: 1 };
      this.wallSalvoFired = false;

      // Phase Transition & Invulnerability Properties
      this.phaseTransitionTimer = 0;
      this.phaseTransitionMaxTime = 3.0;
      this.p3ShieldBroken = false;
      this.tetherTimer = 0;
      this.weaknessStunTimer = 0;
      this.invulnPulseTimer = 0;

      // Hit visual flash
      this.flashWhiteTimer = 0;

      // 4 Wall Emitter positions (North, South, East, West)
      this.wallEmitters = [
        { id: 'north', x: 0, y: -250, nx: 0, ny: 1 },
        { id: 'south', x: 0, y: 250, nx: 0, ny: -1 },
        { id: 'east', x: 400, y: 0, nx: -1, ny: 0 },
        { id: 'west', x: -400, y: 0, nx: 1, ny: 0 }
      ];

      // P2 Edge Teleportation State
      this.p2WaveCount = 0;
      this.currentAnchorIndex = 0;
      this.isTeleporting = false;
      this.teleportTimer = 0;
      this.teleportDuration = 0.4;
      this.teleportOriginPos = { x: this.x, y: this.y };
      this.teleportTargetPos = { x: this.x, y: this.y };
      this.isPendingTeleport = false;
      this.postFireTeleportTimer = 0;
      this.postFireTeleportDuration = 1.0;
      this.mixedShuffleBag = [];
    }

    // Count remaining alive obstacles in the arena (Single Source of Truth)
    get aliveObstaclesCount() {
      if (!window.Game || !window.Game.arena) return 0;
      return window.Game.arena.aliveObstacleCount;
    }

    // Boss invulnerability: Single Source of Truth
    get isInvulnerable() {
      if (!this.alive) return false;
      // 0. P2 Teleport vanish phase is intangible
      if (this.isTeleporting) return true;
      // 1. Phase transition 3.0s invulnerability
      if (this.phaseTransitionTimer > 0) return true;
      // 2. P3 Pillar-Break Shield: in P3, if require clear obstacles is enabled,
      // Boss is 100% invulnerable until all pillars are shattered!
      if (this.currentPhase === 3 && window.GameConfig.boss.p3RequireClearObstacles !== false) {
        if (!this.p3ShieldBroken) {
          return true;
        }
      }
      return false;
    }

    // Get 4 perimeter edge anchors for P2 hit-and-run teleportation
    getEdgeAnchors(arenaConfig) {
      const pad = this.hitboxRadius + 30;
      if (arenaConfig.shape === 'circle') {
        const R = Math.max(100, arenaConfig.radius - pad);
        return [
          { id: 'north', x: 0, y: -R },
          { id: 'south', x: 0, y: R },
          { id: 'east', x: R, y: 0 },
          { id: 'west', x: -R, y: 0 }
        ];
      } else {
        const halfW = (arenaConfig.width || 960) / 2 - pad;
        const halfH = (arenaConfig.height || 600) / 2 - pad;
        return [
          { id: 'north', x: 0, y: -halfH },
          { id: 'south', x: 0, y: halfH },
          { id: 'east', x: halfW, y: 0 },
          { id: 'west', x: -halfW, y: 0 }
        ];
      }
    }

    // Start P2 hit-and-run vanish and teleportation
    startP2Teleport(arenaConfig) {
      const bCfg = window.GameConfig.boss;
      const anchors = this.getEdgeAnchors(arenaConfig);

      // Choose a different anchor from current
      const candidateIndices = [];
      for (let i = 0; i < anchors.length; i++) {
        const dx = anchors[i].x - this.x;
        const dy = anchors[i].y - this.y;
        if (Math.hypot(dx, dy) > 80) {
          candidateIndices.push(i);
        }
      }
      const chosenIdx = candidateIndices.length > 0
        ? candidateIndices[Math.floor(Math.random() * candidateIndices.length)]
        : (this.currentAnchorIndex + 1) % anchors.length;

      this.currentAnchorIndex = chosenIdx;
      const targetAnchor = anchors[chosenIdx];

      const dur = bCfg.teleportDuration !== undefined ? bCfg.teleportDuration : 0.4;
      this.isTeleporting = true;
      this.teleportTimer = dur;
      this.teleportDuration = dur;
      this.teleportOriginPos = { x: this.x, y: this.y };
      this.teleportTargetPos = { x: targetAnchor.x, y: targetAnchor.y };

      // Teleport vanish FX
      if (window.ParticleSystem) {
        window.ParticleSystem.spawnDashDust(this.x, this.y, 'rgba(255, 51, 102, 0.8)');
        window.ParticleSystem.spawnSparks(this.x, this.y, 20, '#ff3366', 1.2);
        window.ParticleSystem.spawnShockwave(this.x, this.y, this.hitboxRadius * 1.2, 0.25, '#ff3366');
      }
      if (window.SoundFX && window.SoundFX.playDash) {
        window.SoundFX.playDash();
      }
    }

    // Hitbox is completely disabled during invulnerability (balls pass through)
    get isHitboxDisabled() {
      return this.isInvulnerable;
    }

    // Collider presence is derived strictly from invulnerability
    get hasCollider() {
      return !this.isInvulnerable;
    }

    // Determine current phase based on current HP percentage and config thresholds
    checkPhaseTransition() {
      if (this.phaseTransitionTimer > 0) return; // Prevent double transition during active phase shift
      const hpPct = this.hp / this.maxHp;
      const bCfg = window.GameConfig.boss;

      let targetPhase = 1;
      if (hpPct <= bCfg.phase3.thresholdMax) {
        targetPhase = 3;
      } else if (hpPct <= bCfg.phase2.thresholdMax) {
        targetPhase = 2;
      } else {
        targetPhase = 1;
      }

      if (targetPhase !== this.currentPhase) {
        this.currentPhase = targetPhase;
        this.onPhaseChange(targetPhase);
      }
    }

    onPhaseChange(newPhase) {
      const bCfg = window.GameConfig.boss;
      const invulnDur = bCfg.phaseTransitionInvulnTime !== undefined ? bCfg.phaseTransitionInvulnTime : 3.0;
      this.phaseTransitionTimer = invulnDur;
      this.phaseTransitionMaxTime = invulnDur;
      this.isTeleporting = false;
      this.isPendingTeleport = false;
      this.postFireTeleportTimer = 0;
      this.p2WaveCount = 0;

      window.SoundFX.playExplosion();
      window.Game.triggerScreenShake(1.2, 0.4);
      window.ParticleSystem.spawnShockwave(this.x, this.y, 200, 0.5, '#ff3366');
      window.ParticleSystem.spawnSparks(this.x, this.y, 40, '#ff3366', 2.0);
      window.ParticleSystem.spawnDamageText(this.x, this.y, `PHASE ${newPhase}!`, true, '#ff3366');

      if (newPhase === 2) {
        if (bCfg.p2EdgeTeleportEnabled !== false) {
          const arenaCfg = window.GameConfig.arena;
          const anchors = this.getEdgeAnchors(arenaCfg);
          this.currentAnchorIndex = 0;
          this.x = anchors[0].x;
          this.y = anchors[0].y;
        }
      } else if (newPhase === 3) {
        // Requirement: "当 Boss 受到足够伤害进入 Phase 3 时，立即强制瞬移回竞技场中央（Center: 0, -40）"
        this.x = 0;
        this.y = -40;
        this.p3ShieldBroken = false;

        if (window.Game && window.Game.arena) {
          window.Game.arena.startP3WarningAndSpawn();
        }

        window.ParticleSystem.spawnShockwave(this.x, this.y, 250, 0.6, '#00e5ff');
        window.ParticleSystem.spawnSparks(this.x, this.y, 35, '#00e5ff', 1.8);
      }
    }

    // Trigger shield shatter when all P3 obstacles are destroyed
    onShieldBreak() {
      window.SoundFX.playExplosion();
      window.Game.triggerScreenShake(1.4, 0.45);
      window.ParticleSystem.spawnShockwave(this.x, this.y, 250, 0.6, '#00e5ff');
      window.ParticleSystem.spawnSparks(this.x, this.y, 50, '#00e5ff', 2.2);
      window.ParticleSystem.spawnDamageText(this.x, this.y, 'SHIELD BROKEN / EXPOSED!', true, '#00e5ff');
      this.weaknessStunTimer = 2.0;
    }

    // Take damage from player thrown ball
    takeDamage(amount, isCrit = false) {
      if (!this.alive || this.isInvulnerable) return;

      this.hp = Math.max(0, this.hp - amount);
      this.flashWhiteTimer = 0.12;

      this.checkPhaseTransition();

      if (this.hp <= 0) {
        this.alive = false;
        window.Game.onBossDefeated();
      }
    }

    // -------------------------------------------------------------
    // Main Update Loop
    // -------------------------------------------------------------
    update(dt, player, arenaConfig) {
      if (!this.alive) return;

      const bCfg = window.GameConfig.boss;
      this.hitboxRadius = bCfg.hitboxRadius;

      if (this.flashWhiteTimer > 0) {
        this.flashWhiteTimer = Math.max(0, this.flashWhiteTimer - dt);
      }
      if (this.phaseTransitionTimer > 0) {
        this.phaseTransitionTimer = Math.max(0, this.phaseTransitionTimer - dt);
      }
      if (this.weaknessStunTimer > 0) {
        this.weaknessStunTimer = Math.max(0, this.weaknessStunTimer - dt);
      }
      this.tetherTimer += dt;
      this.invulnPulseTimer += dt;

      // In P3: automatically check if all obstacles have been broken to trigger shield break (Single Source of Truth)
      if (this.currentPhase === 3 && window.GameConfig.boss.p3RequireClearObstacles !== false && !this.p3ShieldBroken) {
        const arena = window.Game && window.Game.arena;
        if (arena && arena.p3ObstaclesSpawned) {
          if (this.aliveObstaclesCount === 0) {
            this.p3ShieldBroken = true;
            this.onShieldBreak();
          }
        }
      }

      // P2 Post-Fire Teleport Delay window: Boss stays vulnerable at current spot (affected by timeScale via dt)
      if (this.currentPhase === 2 && this.isPendingTeleport && this.postFireTeleportTimer > 0) {
        this.postFireTeleportTimer -= dt;

        // Visual telegraph in last 0.3s: inward converging sparks
        if (this.postFireTeleportTimer <= 0.3 && Math.random() < 0.45 && window.ParticleSystem) {
          window.ParticleSystem.spawnSparks(
            this.x + (Math.random() - 0.5) * this.hitboxRadius,
            this.y + (Math.random() - 0.5) * this.hitboxRadius,
            2, '#ff3366', 0.8
          );
        }

        // Delay window expired -> formally start teleport vanish!
        if (this.postFireTeleportTimer <= 0) {
          this.isPendingTeleport = false;
          this.postFireTeleportTimer = 0;
          this.startP2Teleport(arenaConfig);
          return;
        }
      }

      // P2 Edge Teleport in progress
      if (this.isTeleporting) {
        this.teleportTimer -= dt;

        // Push player safely away from teleport target anchor so player is never trapped or telefragged
        if (player && this.teleportTargetPos) {
          const safeR = this.hitboxRadius + (player.radius || 20) + 15;
          const dx = player.x - this.teleportTargetPos.x;
          const dy = player.y - this.teleportTargetPos.y;
          const dist = Math.hypot(dx, dy);
          if (dist < safeR) {
            const pushX = dist > 0.001 ? (dx / dist) : 1;
            const pushY = dist > 0.001 ? (dy / dist) : 0;
            player.x = this.teleportTargetPos.x + pushX * safeR;
            player.y = this.teleportTargetPos.y + pushY * safeR;
          }
        }

        // Teleport complete -> materialize at target anchor!
        if (this.teleportTimer <= 0) {
          this.isTeleporting = false;
          this.x = this.teleportTargetPos.x;
          this.y = this.teleportTargetPos.y;

          // Push player one final time at destination
          if (player) {
            const safeR = this.hitboxRadius + (player.radius || 20) + 15;
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist < safeR) {
              const pushX = dist > 0.001 ? (dx / dist) : 1;
              const pushY = dist > 0.001 ? (dy / dist) : 0;
              player.x = this.x + pushX * safeR;
              player.y = this.y + pushY * safeR;
            }
          }

          if (window.ParticleSystem) {
            window.ParticleSystem.spawnShockwave(this.x, this.y, this.hitboxRadius * 1.8, 0.35, '#ff3366');
            window.ParticleSystem.spawnSparks(this.x, this.y, 25, '#ff3366', 1.5);
          }
          if (window.SoundFX && window.SoundFX.playExplosion) {
            window.SoundFX.playExplosion();
          }
          if (window.Game && window.Game.triggerScreenShake) {
            window.Game.triggerScreenShake(0.6, 0.2);
          }

          // Ready for next attack cycle
          this.attackState = 'REST';
          this.restTimer = 0.3; // brief breathing window before telegraph begins
        }

        return; // Skip normal attack pattern updates while teleporting
      }

      // 1. Heartbeat pulse animation (lub-dub rhythm like Mom's Heart)
      this.beatTimer += dt * 3.5;
      const beatRaw = Math.sin(this.beatTimer);
      this.beatScale = 1.0 + Math.max(0, beatRaw) * 0.14;

      // 2. Position updates based on positionMode
      this.updatePosition(dt, arenaConfig);

      // 3. Update Wall Emitter positions matching current arena geometry
      this.updateWallEmitters(arenaConfig);

      // 4. Attack Pattern Execution
      this.updateAttackPattern(dt, player);
    }

    // Position modes: Center Fixed / Top Fixed / Roaming
    updatePosition(dt, arenaConfig) {
      const mode = window.GameConfig.boss.positionMode;
      const bCfg = window.GameConfig.boss;

      // In P2 with edge teleport enabled, Boss position is maintained by anchor teleportation
      if (this.currentPhase === 2 && bCfg.p2EdgeTeleportEnabled !== false) {
        return;
      }

      // In P3, Boss is locked to Center
      if (this.currentPhase === 3) {
        this.x = 0;
        this.y = -40;
        return;
      }

      if (mode === 'top') {
        const halfH = arenaConfig.shape === 'circle' ? arenaConfig.radius : arenaConfig.height / 2;
        this.x = 0;
        this.y = -halfH + this.hitboxRadius + 30;
      } else if (mode === 'roaming') {
        this.roamAngle += dt * 0.8;
        const roamRadiusX = (arenaConfig.width ? arenaConfig.width / 4 : arenaConfig.radius * 0.4);
        const roamRadiusY = (arenaConfig.height ? arenaConfig.height / 5 : arenaConfig.radius * 0.3);
        this.x = Math.cos(this.roamAngle) * roamRadiusX;
        this.y = -60 + Math.sin(this.roamAngle * 1.5) * roamRadiusY;
      } else {
        // Center fixed
        this.x = 0;
        this.y = -40;
      }
    }

    // Update positions of 4 perimeter wall emitters
    updateWallEmitters(arenaConfig) {
      if (arenaConfig.shape === 'circle') {
        const R = arenaConfig.radius - 15;
        this.wallEmitters[0].x = 0;  this.wallEmitters[0].y = -R; this.wallEmitters[0].nx = 0;  this.wallEmitters[0].ny = 1;
        this.wallEmitters[1].x = 0;  this.wallEmitters[1].y = R;  this.wallEmitters[1].nx = 0;  this.wallEmitters[1].ny = -1;
        this.wallEmitters[2].x = R;  this.wallEmitters[2].y = 0;  this.wallEmitters[2].nx = -1; this.wallEmitters[2].ny = 0;
        this.wallEmitters[3].x = -R; this.wallEmitters[3].y = 0;  this.wallEmitters[3].nx = 1;  this.wallEmitters[3].ny = 0;
      } else {
        const halfW = arenaConfig.width / 2 - 15;
        const halfH = arenaConfig.height / 2 - 15;
        this.wallEmitters[0].x = 0;      this.wallEmitters[0].y = -halfH; this.wallEmitters[0].nx = 0;  this.wallEmitters[0].ny = 1;
        this.wallEmitters[1].x = 0;      this.wallEmitters[1].y = halfH;  this.wallEmitters[1].nx = 0;  this.wallEmitters[1].ny = -1;
        this.wallEmitters[2].x = halfW;  this.wallEmitters[2].y = 0;      this.wallEmitters[2].nx = -1; this.wallEmitters[2].ny = 0;
        this.wallEmitters[3].x = -halfW; this.wallEmitters[3].y = 0;      this.wallEmitters[3].nx = 1;  this.wallEmitters[3].ny = 0;
      }
    }

    // Get current phase attack configuration
    getCurrentPhaseConfig() {
      const bCfg = window.GameConfig.boss;
      if (this.currentPhase === 3) return bCfg.phase3;
      if (this.currentPhase === 2) return bCfg.phase2;
      return bCfg.phase1;
    }

    // Count active in-flight or grounded Core Dodgeballs
    getActiveCoreBallCount() {
      if (!window.Game || !window.Game.balls) return 0;
      return window.Game.balls.filter(b => b.alive && !b.isMinion).length;
    }

    // Execute attack patterns based on phase settings and rhythm state machine
    updateAttackPattern(dt, player) {
      // While boss is in post-fire teleport delay, freeze attack cycle
      if (this.isPendingTeleport) {
        return;
      }

      // Aiming Window Protection:
      // While player is holding aim or inside bullet time, freeze boss attack timer
      if (player && (player.state === window.PlayerState.HOLDING_AIM || (window.Game && window.Game.bulletTimeTimer > 0))) {
        return;
      }

      const phaseCfg = this.getCurrentPhaseConfig();
      const interval = phaseCfg.fireInterval || 2.8;
      const bCfg = window.GameConfig.boss;
      const telegraphDur = bCfg.telegraphDuration !== undefined ? bCfg.telegraphDuration : 0.5;

      if (this.attackState === 'REST') {
        this.restTimer -= dt;
        if (this.restTimer <= 0) {
          // Transition to TELEGRAPH phase
          this.attackState = 'TELEGRAPH';
          this.telegraphTimer = telegraphDur;
          this.telegraphMaxTime = telegraphDur;
          this.wallSalvoFired = false;

          const toPlayer = window.Physics.normalize(player.x - this.x, player.y - this.y);
          this.telegraphAimDir = toPlayer;

          // In Phase 3: perimeter wall minion salvo fires right at the start of telegraph!
          if (this.currentPhase === 3 && phaseCfg.emitterSource === 'both') {
            this.fireWallMinionSalvo(player);
            this.wallSalvoFired = true;
          }
        }
      } else if (this.attackState === 'TELEGRAPH') {
        // Dynamically track player position during telegraph
        const toPlayer = window.Physics.normalize(player.x - this.x, player.y - this.y);
        this.telegraphAimDir = toPlayer;

        this.telegraphTimer -= dt;
        if (this.telegraphTimer <= 0) {
          // Fire Instant!
          this.attackState = 'FIRE';
          this.triggerAttackWave(phaseCfg, player);

          // Transition to breathing rest window
          this.attackState = 'REST';
          this.restTimer = interval;
        }
      }
    }

    // Fire wall perimeter minion salvo (hazard bullets only: uncatchable, no bounce, no drops)
    fireWallMinionSalvo(player) {
      const presetKey = 'preset1';
      for (const emitter of this.wallEmitters) {
        const aimDir = window.Physics.normalize(player.x - emitter.x, player.y - emitter.y);
        this.spawnBullet(emitter.x, emitter.y, aimDir.x, aimDir.y, presetKey, true);
      }
      if (window.SoundFX && window.SoundFX.wallBounce) {
        window.SoundFX.wallBounce();
      }
    }

    // Fire bullet wave
    triggerAttackWave(phaseCfg, player) {
      const source = phaseCfg.emitterSource; // boss | walls | both
      const formation = phaseCfg.formationType; // single | fan | ring | spiral
      const presetKey = phaseCfg.assignedBallPreset || 'preset1';

      if (source === 'boss' || source === 'both') {
        this.fireFormationFromPoint(this.x, this.y, formation, phaseCfg, player, presetKey);
      }

      if (source === 'walls' || (source === 'both' && !this.wallSalvoFired)) {
        this.fireWallMinionSalvo(player);
      }

      // Check P2 Edge Teleportation trigger after firing wave (with post-fire vulnerable delay window)
      const bCfg = window.GameConfig.boss;
      if (this.currentPhase === 2 && bCfg.p2EdgeTeleportEnabled !== false) {
        this.p2WaveCount++;
        const threshold = bCfg.wavesBeforeTeleport || 1;
        if (this.p2WaveCount >= threshold) {
          this.p2WaveCount = 0;
          const delay = bCfg.postFireTeleportDelay !== undefined ? bCfg.postFireTeleportDelay : 1.0;
          this.postFireTeleportTimer = delay;
          this.postFireTeleportDuration = delay;
          this.isPendingTeleport = true;
          // Hold attackState in REST while staying in vulnerable delay window
          this.attackState = 'REST';
          this.restTimer = delay + 1.0;
        }
      }
    }

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

    // Resolve specific ball preset or randomly sample from preset pool if 'mixed' (1:1:1 shuffle bag)
    resolvePresetKey(presetKey) {
      if (presetKey === 'mixed') {
        return this.getNextMixedPreset();
      }
      return presetKey || 'preset1';
    }

    // Fisher-Yates array shuffle for bullet formation slots
    shuffleSlots(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
      }
      return arr;
    }

    // Fire formation from specific point with Minion Bullet mixing, slot shuffling and angle jitter
    fireFormationFromPoint(originX, originY, formation, phaseCfg, player, presetKey) {
      const toPlayer = window.Physics.normalize(player.x - originX, player.y - originY);
      const baseAngle = Math.atan2(toPlayer.y, toPlayer.x);

      const bCfg = window.GameConfig.boss;
      const mixMinions = bCfg.mixMinionBullets !== false;
      const doShuffle = bCfg.randomizeBulletOrder !== false;

      // Apply random angle jitter if configured
      const jitterDeg = (bCfg && bCfg.spreadAngleJitter !== undefined) ? bCfg.spreadAngleJitter : 5;
      let angleJitter = 0;
      if (jitterDeg > 0) {
        angleJitter = (Math.random() - 0.5) * 2 * (jitterDeg * Math.PI / 180);
      }
      const effectiveAngle = baseAngle + angleJitter;

      if (formation === 'single') {
        // Single aimed sniper shot: Core Dodgeball
        const resolvedKey = this.resolvePresetKey(presetKey);
        this.spawnBullet(originX, originY, Math.cos(effectiveAngle), Math.sin(effectiveAngle), resolvedKey, false);
      } else if (formation === 'fan') {
        // Fan spread: Core Ball + Minion Hazard Bullets with Fisher-Yates slot shuffling
        const count = phaseCfg.fanCount || 5;
        const spreadRad = (phaseCfg.fanSpreadAngle || 60) * (Math.PI / 180);
        const startAngle = effectiveAngle - spreadRad / 2;
        const step = count > 1 ? spreadRad / (count - 1) : 0;

        // Build bullet slot types (false = Core Ball, true = Minion Bullet)
        let slots = [];
        if (mixMinions) {
          const coreCount = count >= 7 ? 2 : 1;
          for (let i = 0; i < count; i++) {
            slots.push(i >= coreCount);
          }
          if (doShuffle) {
            this.shuffleSlots(slots);
          } else {
            const centerIdx = Math.floor(count / 2);
            slots = [];
            for (let i = 0; i < count; i++) slots.push(i !== centerIdx);
          }
        } else {
          slots = new Array(count).fill(false);
        }

        for (let i = 0; i < count; i++) {
          const a = startAngle + step * i;
          const isMinion = slots[i];
          const resolvedKey = isMinion ? 'preset1' : this.resolvePresetKey(presetKey);
          this.spawnBullet(originX, originY, Math.cos(a), Math.sin(a), resolvedKey, isMinion);
        }
      } else if (formation === 'ring') {
        // 360 degree ring: 3 Core Balls randomly positioned among minions via Fisher-Yates shuffle
        const count = phaseCfg.ringCount || 12;
        const step = (Math.PI * 2) / count;

        let slots = [];
        if (mixMinions) {
          // Requirement: 360° 环形弹幕的核心特殊球数量从 1 个增加到 3 个
          const coreCount = Math.min(3, count);
          for (let i = 0; i < count; i++) {
            slots.push(i >= coreCount);
          }
          if (doShuffle) {
            this.shuffleSlots(slots);
          } else {
            slots = [...new Array(coreCount).fill(false), ...new Array(count - coreCount).fill(true)];
          }
        } else {
          slots = new Array(count).fill(false);
        }

        for (let i = 0; i < count; i++) {
          const a = effectiveAngle + step * i;
          const isMinion = slots[i];
          const resolvedKey = isMinion ? 'preset1' : this.resolvePresetKey(presetKey);
          // Guarantee all 3 Core Balls spawn in 360 ring burst
          this.spawnBullet(originX, originY, Math.cos(a), Math.sin(a), resolvedKey, isMinion, !isMinion);
        }
      } else if (formation === 'spiral') {
        // Rotating spiral bursts with slot shuffling
        const count = phaseCfg.spiralRate || 6;
        this.spiralAngle += 0.45;

        let slots = [];
        if (mixMinions) {
          for (let i = 0; i < count; i++) {
            slots.push(i !== 0);
          }
          if (doShuffle) {
            this.shuffleSlots(slots);
          }
        } else {
          slots = new Array(count).fill(false);
        }

        for (let i = 0; i < count; i++) {
          const a = this.spiralAngle + (i * Math.PI * 2) / count + angleJitter;
          const isMinion = slots[i];
          const resolvedKey = isMinion ? 'preset1' : this.resolvePresetKey(presetKey);
          this.spawnBullet(originX, originY, Math.cos(a), Math.sin(a), resolvedKey, isMinion);
        }
      }
    }

    // Spawn a bullet into game world with active Core Ball cap enforcement
    spawnBullet(x, y, dirX, dirY, presetKey, isMinion = false, forceCore = false) {
      const bCfg = window.GameConfig.ball;
      const maxActiveCore = (bCfg && bCfg.maxActiveCoreBalls !== undefined) ? bCfg.maxActiveCoreBalls : 3;

      // Downgrade Core Ball to Minion Bullet if field cap reached (unless forceCore from 360 ring burst)
      if (!isMinion && !forceCore && this.getActiveCoreBallCount() >= maxActiveCore) {
        isMinion = true;
      }

      const preset = window.GameConfig.getBallPreset(presetKey);

      const ball = new window.Ball({
        x: x + dirX * (this.hitboxRadius + 10),
        y: y + dirY * (this.hitboxRadius + 10),
        dirX,
        dirY,
        vx: dirX * preset.speed,
        vy: dirY * preset.speed,
        speed: preset.speed,
        radius: preset.radius,
        damage: preset.baseDamage,
        trajectoryType: preset.trajectoryType,
        canDirectCatch: isMinion ? false : preset.canDirectCatch,
        isMinion,
        presetKey,
        preset,
        color: isMinion ? 'rgba(255, 60, 100, 0.9)' : preset.color,
        glowColor: isMinion ? 'rgba(255, 60, 100, 0.45)' : preset.glowColor,
        state: window.BallState.ENEMY_FLIGHT
      });

      window.Game.balls.push(ball);
    }

    // -------------------------------------------------------------
    // Render Loop (2.5D Pseudo-45° Projected)
    // -------------------------------------------------------------
    render(ctx, yScale = 0.75) {
      if (!this.alive) return;

      const phaseCfg = this.getCurrentPhaseConfig();

      // 0. P2 Edge Teleport Animation (Vanish at Origin, Warning Ripples & Ghost Silhouette at Target)
      if (this.isTeleporting) {
        const vanishProgress = Math.max(0, Math.min(1, this.teleportTimer / (this.teleportDuration || 0.4)));
        const arriveProgress = 1.0 - vanishProgress;

        // A. Vanish silhouette at origin
        if (this.teleportOriginPos && vanishProgress > 0.05) {
          const origScreen = window.Physics.toScreen(this.teleportOriginPos.x, this.teleportOriginPos.y, 0, yScale);
          const origR = this.hitboxRadius * (0.3 + 0.7 * vanishProgress);
          ctx.save();
          ctx.globalAlpha = vanishProgress * 0.7;
          ctx.beginPath();
          ctx.arc(origScreen.x, origScreen.y - 15 * vanishProgress, origR, 0, Math.PI * 2);
          ctx.fillStyle = '#ff3366';
          ctx.shadowColor = '#ff3366';
          ctx.shadowBlur = 20;
          ctx.fill();
          ctx.restore();
        }

        // B. Warning ripples & ghost silhouette at target anchor
        if (this.teleportTargetPos) {
          const tgtScreen = window.Physics.toScreen(this.teleportTargetPos.x, this.teleportTargetPos.y, 0, yScale);
          const tgtR = this.hitboxRadius;

          ctx.save();
          // Expanding ground pulse ring
          const ringR = tgtR * (1.1 + 0.7 * ((arriveProgress * 3) % 1));
          ctx.beginPath();
          ctx.ellipse(tgtScreen.x, tgtScreen.y, ringR, ringR * yScale, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 51, 102, ${1.0 - ((arriveProgress * 3) % 1)})`;
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Target anchor floor warning disk
          ctx.beginPath();
          ctx.ellipse(tgtScreen.x, tgtScreen.y, tgtR * 1.1, tgtR * yScale * 0.7, 0, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 30, 70, ${0.15 + 0.15 * Math.sin(this.teleportTimer * 25)})`;
          ctx.fill();

          // Target ghost silhouette
          ctx.beginPath();
          ctx.arc(tgtScreen.x, tgtScreen.y - 15, tgtR * (0.6 + 0.4 * arriveProgress), 0, Math.PI * 2);
          ctx.strokeStyle = '#ff3366';
          ctx.lineWidth = 2.0;
          ctx.setLineDash([6, 6]);
          ctx.lineDashOffset = -this.teleportTimer * 30;
          ctx.shadowColor = '#ff3366';
          ctx.shadowBlur = 15;
          ctx.stroke();

          // Ghost eye / core
          ctx.beginPath();
          ctx.arc(tgtScreen.x, tgtScreen.y - 15, tgtR * 0.25, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + 0.5 * arriveProgress})`;
          ctx.fill();

          ctx.restore();
        }

        // Render wall emitters if active during teleport
        if (phaseCfg.emitterSource === 'walls' || phaseCfg.emitterSource === 'both') {
          for (const emitter of this.wallEmitters) {
            const eScreen = window.Physics.toScreen(emitter.x, emitter.y, 10, yScale);
            ctx.save();
            ctx.beginPath();
            ctx.arc(eScreen.x, eScreen.y, 12, 0, Math.PI * 2);
            ctx.fillStyle = '#ff3366';
            ctx.shadowColor = '#ff3366';
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(eScreen.x, eScreen.y);
            ctx.lineTo(eScreen.x + emitter.nx * 16, eScreen.y + emitter.ny * 16 * yScale);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.restore();
          }
        }

        return; // Boss is currently in teleport flight
      }

      const screenPos = window.Physics.toScreen(this.x, this.y, this.z, yScale);
      const groundPos = window.Physics.toScreen(this.x, this.y, 0, yScale);

      // 1. Floor Shadow
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(groundPos.x, groundPos.y, this.hitboxRadius * 1.3, this.hitboxRadius * yScale * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 0, 0, ${window.GameConfig.arena.shadowOpacity * 1.2})`;
      ctx.fill();
      ctx.restore();

      // 2. Wall Emitters Render
      if (phaseCfg.emitterSource === 'walls' || phaseCfg.emitterSource === 'both') {
        for (const emitter of this.wallEmitters) {
          const eScreen = window.Physics.toScreen(emitter.x, emitter.y, 10, yScale);
          ctx.save();
          ctx.beginPath();
          ctx.arc(eScreen.x, eScreen.y, 12, 0, Math.PI * 2);
          ctx.fillStyle = '#ff3366';
          ctx.shadowColor = '#ff3366';
          ctx.shadowBlur = 12;
          ctx.fill();

          // Cannon barrel pointing inward
          ctx.beginPath();
          ctx.moveTo(eScreen.x, eScreen.y);
          ctx.lineTo(eScreen.x + emitter.nx * 16, eScreen.y + emitter.ny * 16 * yScale);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          ctx.stroke();
          ctx.restore();
        }
      }

      // 2b. Telegraph Warning Laser / Hazard Cone
      if (this.attackState === 'TELEGRAPH') {
        const tProgress = 1.0 - (this.telegraphTimer / (this.telegraphMaxTime || 0.5));
        const blinkAlpha = 0.4 + 0.6 * Math.abs(Math.sin(this.telegraphTimer * 20));
        const aimDir = this.telegraphAimDir || { x: 0, y: 1 };
        const baseAngle = Math.atan2(aimDir.y, aimDir.x);
        const laserDist = 700;

        ctx.save();

        if (phaseCfg.formationType === 'fan') {
          // Hazard cone for fan
          const spreadRad = (phaseCfg.fanSpreadAngle || 60) * (Math.PI / 180);
          const startA = baseAngle - spreadRad / 2;
          const endA = baseAngle + spreadRad / 2;
          const x1 = screenPos.x + Math.cos(startA) * laserDist;
          const y1 = screenPos.y + Math.sin(startA) * laserDist * yScale;
          const x2 = screenPos.x + Math.cos(endA) * laserDist;
          const y2 = screenPos.y + Math.sin(endA) * laserDist * yScale;

          ctx.beginPath();
          ctx.moveTo(screenPos.x, screenPos.y);
          ctx.lineTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.closePath();
          ctx.fillStyle = `rgba(255, 40, 70, ${0.08 + 0.14 * tProgress})`;
          ctx.fill();

          // Border lines
          ctx.beginPath();
          ctx.setLineDash([8, 8]);
          ctx.moveTo(screenPos.x, screenPos.y);
          ctx.lineTo(x1, y1);
          ctx.moveTo(screenPos.x, screenPos.y);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = `rgba(255, 50, 80, ${blinkAlpha * 0.75})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Center Aiming Laser Line
        ctx.beginPath();
        ctx.setLineDash([10, 6]);
        ctx.lineDashOffset = -this.telegraphTimer * 40;
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(screenPos.x + aimDir.x * laserDist, screenPos.y + aimDir.y * laserDist * yScale);
        ctx.strokeStyle = `rgba(255, 45, 85, ${blinkAlpha})`;
        ctx.lineWidth = 2.0 + tProgress * 2.5;
        ctx.shadowColor = '#ff2255';
        ctx.shadowBlur = 14;
        ctx.stroke();

        ctx.restore();
      }

      // 2c. P3 Energy Tethers to Active Pillars
      if (this.currentPhase === 3 && this.isInvulnerable && !this.p3ShieldBroken && window.Game && window.Game.arena) {
        const obstacles = window.Game.arena.obstacles;
        if (obstacles && obstacles.length > 0) {
          ctx.save();
          for (const obs of obstacles) {
            if (!obs.alive || obs.isDead || obs.hp <= 0) continue;
            const obsScreen = window.Physics.toScreen(obs.x, obs.y, 28 * (obs.riseProgress || 1.0), yScale);

            // Flowing energy laser beam
            ctx.beginPath();
            ctx.moveTo(screenPos.x, screenPos.y - 15);
            ctx.lineTo(obsScreen.x, obsScreen.y);
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 2.5 + Math.sin(this.tetherTimer * 10) * 0.8;
            ctx.shadowColor = '#00e5ff';
            ctx.shadowBlur = 14;
            ctx.setLineDash([12, 6]);
            ctx.lineDashOffset = -this.tetherTimer * 45;
            ctx.stroke();

            // Terminal energy connection node
            ctx.beginPath();
            ctx.arc(obsScreen.x, obsScreen.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#00e5ff';
            ctx.shadowColor = '#00e5ff';
            ctx.shadowBlur = 10;
            ctx.fill();
          }
          ctx.restore();
        }
      }

      // 3. Mom's Heart Core Construct
      ctx.save();

      const invuln = this.isInvulnerable;
      if (invuln) {
        // Ghostly translucent opacity
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.invulnPulseTimer * 8);
      }

      // Phase flicker in last 0.3s of post-fire teleport delay: "About to warp / strike now!"
      const isTeleportImminent = this.isPendingTeleport && this.postFireTeleportTimer <= 0.3 && this.postFireTeleportTimer > 0;
      if (isTeleportImminent && !invuln) {
        const flicker = Math.sin(this.postFireTeleportTimer * 45) > 0;
        ctx.globalAlpha = flicker ? 0.65 : 0.95;
      }

      const isTelegraphing = this.attackState === 'TELEGRAPH';
      let currentR = this.hitboxRadius * (this.beatScale + (isTelegraphing ? 0.08 * Math.sin(this.telegraphTimer * 30) : 0));

      // Weakness Stun Jitter
      let jitterX = 0, jitterY = 0;
      if (this.weaknessStunTimer > 0) {
        jitterX = (Math.random() - 0.5) * 8;
        jitterY = (Math.random() - 0.5) * 8;
      }

      const centerY = screenPos.y - 15 + jitterY;
      const centerX = screenPos.x + jitterX;

      // Outer Pulsing Orbit Ring
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, currentR * 1.25, currentR * 1.25 * yScale, 0, 0, Math.PI * 2);
      ctx.strokeStyle = invuln ? '#00e5ff' : (isTelegraphing ? '#ff0055' : (this.currentPhase === 3 ? '#ff0033' : (this.currentPhase === 2 ? '#ff6600' : '#ff3366')));
      ctx.lineWidth = isTelegraphing ? 3.5 : 2.5;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = isTelegraphing ? 25 : 16;
      ctx.stroke();

      // Imminent Teleport Glitch Warning Ring
      if (isTeleportImminent) {
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, currentR * 1.4, currentR * 1.4 * yScale, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff3366';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -this.postFireTeleportTimer * 40;
        ctx.shadowColor = '#ff3366';
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Outer Invulnerability Shield Ring
      if (invuln) {
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, currentR * 1.5, currentR * 1.5 * yScale, 0, 0, Math.PI * 2);
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = this.invulnPulseTimer * 30;
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 3.0;
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 20;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Inner Core Glow
      ctx.beginPath();
      ctx.arc(centerX, centerY, currentR, 0, Math.PI * 2);
      ctx.fillStyle = this.flashWhiteTimer > 0 ? '#ffffff' : (invuln ? '#0a3a55' : (this.currentPhase === 3 ? '#cc0033' : '#aa1133'));
      ctx.shadowColor = invuln ? '#00e5ff' : '#ff3366';
      ctx.shadowBlur = 25;
      ctx.fill();

      // Organic Heart Vent Details / Geometric Chambers
      ctx.beginPath();
      ctx.arc(centerX - currentR * 0.35, centerY - currentR * 0.25, currentR * 0.35, 0, Math.PI * 2);
      ctx.arc(centerX + currentR * 0.35, centerY - currentR * 0.25, currentR * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = this.flashWhiteTimer > 0 ? '#ffffff' : (invuln ? '#1a6688' : '#ff3366');
      ctx.fill();

      // Center Eye / Core Crystal
      ctx.beginPath();
      ctx.arc(centerX, centerY, currentR * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = invuln ? '#00e5ff' : '#ffffff';
      ctx.shadowColor = invuln ? '#00e5ff' : '#ffffff';
      ctx.shadowBlur = 12;
      ctx.fill();

      // Floating Shield Status Label above Boss
      if (invuln) {
        const aliveCount = this.aliveObstaclesCount;
        const statusMsg = this.phaseTransitionTimer > 0 ?
          `⚡ PHASE SHIFT (${this.phaseTransitionTimer.toFixed(1)}s)` :
          `🛡️ SHIELD ACTIVE (${aliveCount}/4 PILLARS)`;
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#00e5ff';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 8;
        ctx.fillText(statusMsg, centerX, centerY - currentR * 1.5 * yScale - 12);
      }

      ctx.restore();
    }
  }

  window.Boss = Boss;
})(window);
