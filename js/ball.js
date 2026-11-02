/**
 * Project: Dodgeball Boss Rush
 * File: js/ball.js
 * Description: Ball Entity Class & Ball Pool Manager.
 * Implements trajectory calculations (straight/sine/homing), wall bounce/explosion,
 * parabolic rebound arc landing, grounded aura pickup states, and overheat explosion.
 */

(function(window) {
  'use strict';

  // Ball State Constants
  const BallState = {
    ENEMY_FLIGHT: 'ENEMY_FLIGHT',
    PLAYER_FLIGHT: 'PLAYER_FLIGHT',
    REBOUND_ARC: 'REBOUND_ARC',
    GROUNDED: 'GROUNDED',
    HELD: 'HELD',
    EXPLODING: 'EXPLODING'
  };

  class Ball {
    constructor(props = {}) {
      this.id = Math.random().toString(36).substr(2, 9);
      this.init(props);
    }

    init(props = {}) {
      // Basic coordinates
      this.x = props.x || 0;
      this.y = props.y || 0;
      this.z = props.z || 0; // Visual height for 2.5D jumping/parabolic arc
      this.initX = this.x;
      this.initY = this.y;

      // Configuration snapshot or preset inheritance
      this.isMinion = !!props.isMinion;
      const preset = props.preset || window.GameConfig.getActiveBallPreset();
      this.presetKey = props.presetKey || window.GameConfig.ball.activePreset;

      // Speed & Direction Vector Resolution
      let speed = props.speed || (preset && preset.speed) || 360;
      let dirX = props.dirX;
      let dirY = props.dirY;

      if (dirX !== undefined && dirY !== undefined) {
        const dLen = Math.hypot(dirX, dirY) || 1;
        dirX /= dLen;
        dirY /= dLen;
      } else if (props.vx !== undefined && props.vy !== undefined) {
        const vLen = Math.hypot(props.vx, props.vy);
        if (vLen > 0.0001) {
          dirX = props.vx / vLen;
          dirY = props.vy / vLen;
          speed = vLen;
        } else {
          dirX = 0;
          dirY = 1;
        }
      } else {
        dirX = 0;
        dirY = 1;
      }

      this.speed = speed;
      this.vx = (props.vx !== undefined) ? props.vx : dirX * speed;
      this.vy = (props.vy !== undefined) ? props.vy : dirY * speed;

      if (this.isMinion) {
        this.radius = Math.max(6, Math.round((props.radius || preset.radius || 14) * 0.5));
        this.baseDamage = Math.max(8, Math.round((props.damage || preset.baseDamage || 25) * 0.5));
        this.canDirectCatch = false;
        this.boundaryMode = 'pass';
        this.maxWallBounces = 0;
        this.wallBouncesLeft = 0;
        this.reboundOnHit = false;
        this.color = props.color || 'rgba(255, 45, 85, 0.85)';
        this.glowColor = props.glowColor || 'rgba(255, 45, 85, 0.45)';
      } else {
        this.radius = props.radius || preset.radius || 14;
        this.baseDamage = props.damage || preset.baseDamage || 25;
        this.color = props.color || preset.color || '#ffffff';
        this.glowColor = props.glowColor || preset.glowColor || '#00f0ff';
        this.canDirectCatch = (props.canDirectCatch !== undefined) ? props.canDirectCatch : preset.canDirectCatch;
        this.boundaryMode = preset.boundaryMode || 'bounce';
        this.maxWallBounces = preset.maxWallBounces !== undefined ? preset.maxWallBounces : 2;
        this.wallBouncesLeft = this.maxWallBounces;
        this.reboundOnHit = (preset.reboundOnHit !== undefined) ? preset.reboundOnHit : true;
      }

      this.trajectoryType = props.trajectoryType || preset.trajectoryType || 'straight';
      this.sineFrequency = preset.sineFrequency || 6.0;
      this.sineAmplitude = preset.sineAmplitude || 40;
      this.homingRate = 1.6;

      this.overheatExplodeEnabled = preset.overheatExplodeEnabled;
      this.overheatTimer = preset.overheatTimer || 2.5;

      this.wallAoeRadius = preset.wallAoeRadius || 80;
      this.wallAoeDamage = preset.wallAoeDamage || 20;

      this.destroyOnHit = preset.destroyOnHit || false;
      this.reboundAngleMode = preset.reboundAngleMode || 'reflection';
      this.reboundAngleVariance = preset.reboundAngleVariance || 15;
      this.reboundDistance = preset.reboundDistance || 220;
      this.reboundArcHeight = preset.reboundArcHeight || 65;

      // State machine
      this.state = props.state || BallState.ENEMY_FLIGHT;
      this.alive = true;
      this.age = 0;
      this.isPerfectThrow = false;
      this.damageMultiplier = 1.0;

      // Sine wave trajectory base vector (derived from normalized dirX/dirY)
      this.baseDirX = dirX;
      this.baseDirY = dirY;
      this.perpDirX = -dirY;
      this.perpDirY = dirX;
      this.traveledDist = 0;

      // Parabolic Arc parameters (used during rebound)
      this.arcDuration = 0.65;
      this.arcTimer = 0;
      this.arcStartX = 0;
      this.arcStartY = 0;
      this.arcTargetX = 0;
      this.arcTargetY = 0;

      // Grounded state aura pulse & lifetime
      this.auraTimer = 0;
      this.pickupRadius = 65; // Radius player must be within to press Catch & pickup
      this.groundLifeTimer = 0;
      this.maxGroundLife = 4.0;

      // Tail trail effect
      this.trail = [];
    }

    // Launch ball from player's hands
    launchFromPlayer(x, y, dirX, dirY, isPerfect = false, comboMultiplier = 1.0) {
      this.x = x;
      this.y = y;
      this.z = 10;
      this.initX = x;
      this.initY = y;
      this.traveledDist = 0;
      this.isPerfectThrow = isPerfect;

      // Ensure aim direction vector is strictly normalized
      const norm = window.Physics.normalize(dirX, dirY);
      dirX = norm.x;
      dirY = norm.y;

      const playerCfg = window.GameConfig.player;
      const ballCfg = window.GameConfig.ball;
      const preset = (ballCfg.presets && ballCfg.presets[this.presetKey]) || window.GameConfig.getActiveBallPreset();

      // STRICTLY calculate from preset base speed, NEVER compound multiply on this.speed!
      const basePresetSpeed = preset.speed || 360;
      let throwSpeed = basePresetSpeed * (preset.playerThrowSpeedMultiplier || 1.5);
      if (isPerfect) {
        throwSpeed *= (playerCfg.perfectThrowSpeedMult || 1.6);
      }

      // Hard safety speed cap (prevents any extreme tunneling or clipping)
      const maxSpeedCap = (ballCfg && ballCfg.maxSpeedCap !== undefined) ? ballCfg.maxSpeedCap : 1200;
      throwSpeed = Math.min(throwSpeed, maxSpeedCap);
      this.speed = throwSpeed;

      this.vx = dirX * throwSpeed;
      this.vy = dirY * throwSpeed;

      this.baseDirX = dirX;
      this.baseDirY = dirY;
      this.perpDirX = -dirY;
      this.perpDirY = dirX;

      const presetDamageMult = (preset && preset.throwDamageMultiplier !== undefined) ? preset.throwDamageMultiplier : 1.0;
      this.damageMultiplier = comboMultiplier * (isPerfect ? playerCfg.perfectThrowDamageMult : 1.0) * presetDamageMult;
      this.state = BallState.PLAYER_FLIGHT;
      this.wallBouncesLeft = this.maxWallBounces;
      this.age = 0;
      this.trail = [];

      window.SoundFX.playThrow(isPerfect);
      window.ParticleSystem.spawnSparks(x, y, isPerfect ? 24 : 12, isPerfect ? '#ffcc00' : '#00f0ff', 1.2);
    }

    // Trigger Rebound Arc landing sequence after hitting Boss
    startRebound(bossX, bossY, hitX, hitY) {
      this.trail = [];
      if (this.isMinion || !this.reboundOnHit) {
        if (this.destroyOnHit || this.isMinion) {
          this.alive = false;
        }
        return;
      }

      this.state = BallState.REBOUND_ARC;
      this.arcTimer = 0;
      this.arcDuration = 0.6;
      this.arcStartX = hitX;
      this.arcStartY = hitY;

      // Compute rebound landing target
      const outNorm = window.Physics.calculateReboundVelocity(
        this.vx, this.vy,
        bossX, bossY,
        hitX, hitY,
        this.reboundAngleMode,
        this.reboundAngleVariance
      );

      // Clamp target within arena bounds
      const targetDist = this.reboundDistance;
      const arenaCfg = window.GameConfig.arena;
      let rawTargetX = hitX + outNorm.x * targetDist;
      let rawTargetY = hitY + outNorm.y * targetDist;

      if (arenaCfg.shape === 'circle') {
        const d = Math.hypot(rawTargetX, rawTargetY);
        const maxR = arenaCfg.radius - 40;
        if (d > maxR) {
          rawTargetX = (rawTargetX / d) * maxR;
          rawTargetY = (rawTargetY / d) * maxR;
        }
      } else {
        const maxW = arenaCfg.width / 2 - 40;
        const maxH = arenaCfg.height / 2 - 40;
        rawTargetX = window.Physics.clamp(rawTargetX, -maxW, maxW);
        rawTargetY = window.Physics.clamp(rawTargetY, -maxH, maxH);
      }

      this.arcTargetX = rawTargetX;
      this.arcTargetY = rawTargetY;
    }

    // Trigger wall AOE explosion
    triggerWallExplosion() {
      this.state = BallState.EXPLODING;
      this.alive = false;
      this.trail = [];
      window.SoundFX.playExplosion();
      window.ParticleSystem.spawnShockwave(this.x, this.y, this.wallAoeRadius, 0.4, '#ff3344');
      window.ParticleSystem.spawnSparks(this.x, this.y, 28, '#ff3344', 1.4);
    }

    // Main Update Loop
    update(dt, player, boss, obstacles, arenaConfig) {
      if (!this.alive) {
        this.trail = [];
        return;
      }
      this.age += dt;

      // Record trail positions during flight
      if (this.state === BallState.ENEMY_FLIGHT || this.state === BallState.PLAYER_FLIGHT) {
        this.trail.unshift({ x: this.x, y: this.y, z: this.z, alpha: 0.8 });
        if (this.trail.length > 8) this.trail.pop();

        // Distinct micro-particles for Purple High-Damage core ball
        if (this.presetKey === 'preset3' && !this.isMinion && Math.random() < 0.28) {
          window.ParticleSystem.spawnSparks(this.x, this.y, 1, '#e066ff', 0.6);
        }
      }

      // Always decay lingering trail points regardless of state and prune dead points
      if (this.trail.length > 0) {
        for (let i = this.trail.length - 1; i >= 0; i--) {
          this.trail[i].alpha -= dt * 3.5;
          if (this.trail[i].alpha <= 0) {
            this.trail.splice(i, 1);
          }
        }
      }

      switch (this.state) {
        case BallState.ENEMY_FLIGHT:
          this.updateEnemyFlight(dt, player, obstacles, arenaConfig);
          break;

        case BallState.PLAYER_FLIGHT:
          this.updatePlayerFlight(dt, boss, obstacles, arenaConfig);
          break;

        case BallState.REBOUND_ARC:
          this.updateReboundArc(dt);
          break;

        case BallState.GROUNDED:
          this.updateGrounded(dt);
          break;

        default:
          break;
      }
    }

    // Enemy bullet flight update
    updateEnemyFlight(dt, player, obstacles, arenaConfig) {
      if (this.trajectoryType === 'straight') {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
      } else if (this.trajectoryType === 'sine') {
        // Forward movement in target aim/formation direction
        this.x += this.baseDirX * this.speed * dt;
        this.y += this.baseDirY * this.speed * dt;
        // Perpendicular harmonic oscillation wave
        const waveSpeed = Math.cos(this.age * this.sineFrequency) * this.sineAmplitude * this.sineFrequency;
        this.x += this.perpDirX * waveSpeed * dt;
        this.y += this.perpDirY * waveSpeed * dt;
        // Keep vx, vy updated for physics/reflection
        this.vx = this.baseDirX * this.speed + this.perpDirX * waveSpeed;
        this.vy = this.baseDirY * this.speed + this.perpDirY * waveSpeed;
      } else if (this.trajectoryType === 'homing') {
        // Weak homing towards player
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const desired = window.Physics.normalize(dx, dy);
        this.vx += desired.x * this.homingRate * this.speed * dt;
        this.vy += desired.y * this.homingRate * this.speed * dt;
        const norm = window.Physics.normalize(this.vx, this.vy);
        this.vx = norm.x * this.speed;
        this.vy = norm.y * this.speed;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
      }

      // Check obstacle collision
      if (obstacles && obstacles.length > 0) {
        for (const obs of obstacles) {
          if (!obs.alive) continue;
          if (window.Physics.circleCircle(this.x, this.y, this.radius, obs.x, obs.y, obs.radius)) {
            const isBoss2 = (window.Game && window.Game.activeBossId === 'boss2') || obs.isDynamic;

            // Boss 2 Cover Mechanic (P3 Bullet Hell & Tactical Cover):
            // Enemy bullets colliding with dynamic obstacles are BLOCKED and DESTROYED, damaging the obstacle!
            if (isBoss2) {
              const bulletDmg = this.isMinion ? 6 : Math.max(12, Math.round((this.damage || 20) * 0.6));
              obs.damage(bulletDmg);
              this.alive = false;
              this.trail = [];
              window.SoundFX.playWallBounce();
              window.ParticleSystem.spawnSparks(this.x, this.y, 10, '#00e5ff', 0.9);
              return;
            }

            // Boss 1 Default Obstacle Reflection
            const dx = this.x - obs.x;
            const dy = this.y - obs.y;
            const d = Math.hypot(dx, dy) || 1;
            const nx = dx / d;
            const ny = dy / d;
            this.x = obs.x + nx * (this.radius + obs.radius + 1);
            this.y = obs.y + ny * (this.radius + obs.radius + 1);

            const ref = window.Physics.reflect(this.vx, this.vy, nx, ny);
            this.vx = ref.x;
            this.vy = ref.y;
            this.baseDirX = ref.x;
            this.baseDirY = ref.y;

            window.SoundFX.playWallBounce();
            window.ParticleSystem.spawnSparks(this.x, this.y, 8, this.color, 0.8);
            break;
          }
        }
      }

      // Check boundary collision
      const boundHit = window.Physics.checkArenaBoundary(this.x, this.y, this.radius, arenaConfig);
      if (boundHit.collided) {
        if (this.isMinion) {
          // Minion bullet dies immediately on wall collision without bouncing or dropping
          this.alive = false;
          this.trail = [];
          window.ParticleSystem.spawnSparks(this.x, this.y, 6, this.color, 0.6);
          return;
        }

        if (this.boundaryMode === 'explode') {
          this.triggerWallExplosion();
          return;
        }

        if (this.boundaryMode === 'bounce' && this.wallBouncesLeft > 0) {
          this.wallBouncesLeft--;
          this.x = boundHit.correctedX;
          this.y = boundHit.correctedY;
          const ref = window.Physics.reflect(this.vx, this.vy, boundHit.nx, boundHit.ny);
          this.vx = ref.x;
          this.vy = ref.y;
          this.baseDirX = ref.x;
          this.baseDirY = ref.y;
          window.SoundFX.playWallBounce();
          window.ParticleSystem.spawnSparks(this.x, this.y, 8, this.color, 0.8);
        } else {
          // Pass through or out of bounces
          this.alive = false;
          this.trail = [];
        }
      }
    }

    // Player thrown ball flight update
    updatePlayerFlight(dt, boss, obstacles, arenaConfig) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Obstacle collision
      if (obstacles && obstacles.length > 0) {
        for (const obs of obstacles) {
          if (!obs.alive) continue;
          if (window.Physics.circleCircle(this.x, this.y, this.radius, obs.x, obs.y, obs.radius)) {
            const hitDamage = Math.round(this.baseDamage * this.damageMultiplier);
            if (obs.destructible) {
              obs.damage(hitDamage);
            }
            window.SoundFX.playWallBounce();
            window.ParticleSystem.spawnSparks(this.x, this.y, this.isPerfectThrow ? 24 : 14, '#ffaa00', 1.2);
            window.ParticleSystem.spawnDamageText(
              obs.x, obs.y,
              `-${hitDamage}${this.isPerfectThrow ? ' CRIT!' : ''}`,
              this.isPerfectThrow,
              '#ffaa00'
            );

            // Phase 1 Core Rule for Boss 2 (PHANTOM BOSS):
            // When player thrown ball strikes an obstacle, shockwave exposes & reveals stealth Boss!
            if (boss && boss instanceof window.Boss2 && boss.currentPhase === 1) {
              if (boss.p1State === 'STEALTH_DRIFT' || boss.isStealthed || !boss.isRevealed) {
                if (typeof boss.breakStealthByPlayerBall === 'function') {
                  boss.breakStealthByPlayerBall(obs);
                } else if (typeof boss.breakStealthOnPillar === 'function') {
                  boss.breakStealthOnPillar(obs);
                }
              }
            }

            // Rebound on hit triggers and lands on floor as pickable ball!
            this.trail = [];
            if (this.reboundOnHit && !this.isMinion) {
              this.startRebound(obs.x, obs.y, this.x, this.y);
            } else {
              this.alive = false;
            }
            return;
          }
        }
      }

      // Boss collision: only if boss is alive AND NOT invulnerable / hitbox disabled!
      // In P1 STEALTH_DRIFT, Boss is strictly invulnerable and hitbox is disabled, so thrown balls pass straight through!
      if (boss && boss.alive && !boss.isHitboxDisabled && !boss.isInvulnerable && boss.hasCollider !== false) {
        const hitBoss = window.Physics.circleCircle(this.x, this.y, this.radius, boss.x, boss.y, boss.hitboxRadius);
        if (hitBoss) {
          const totalDamage = Math.round(this.baseDamage * this.damageMultiplier);
          boss.takeDamage(totalDamage, this.isPerfectThrow);

          if (window.Game && window.Game.registerBossHit) {
            window.Game.registerBossHit();
          }

          window.SoundFX.playBossHit(window.Game.comboCount);
          window.ParticleSystem.spawnSparks(this.x, this.y, this.isPerfectThrow ? 32 : 20, this.isPerfectThrow ? '#ffcc00' : '#00f0ff', 1.5);
          window.ParticleSystem.spawnDamageText(
            this.x, this.y,
            `+${totalDamage}${this.isPerfectThrow ? ' CRIT!' : ''}`,
            this.isPerfectThrow,
            this.isPerfectThrow ? '#ffcc00' : '#00f0ff'
          );

          // Rebound into pickable ball or destroy
          this.trail = [];
          if (this.reboundOnHit && !this.isMinion) {
            this.startRebound(boss.x, boss.y, this.x, this.y);
          } else {
            this.alive = false;
          }
          return;
        }
      }

      // Arena boundary collision
      const boundHit = window.Physics.checkArenaBoundary(this.x, this.y, this.radius, arenaConfig);
      if (boundHit.collided) {
        if (this.boundaryMode === 'explode') {
          this.triggerWallExplosion();
          return;
        }

        if (this.boundaryMode === 'bounce' && this.wallBouncesLeft > 0) {
          this.wallBouncesLeft--;
          this.x = boundHit.correctedX;
          this.y = boundHit.correctedY;
          const ref = window.Physics.reflect(this.vx, this.vy, boundHit.nx, boundHit.ny);
          this.vx = ref.x;
          this.vy = ref.y;
          window.SoundFX.playWallBounce();
          window.ParticleSystem.spawnSparks(this.x, this.y, 10, this.glowColor, 0.8);
        } else {
          this.alive = false;
          this.trail = [];
        }
      }
    }

    // Parabolic Rebound Arc in air before landing
    updateReboundArc(dt) {
      this.arcTimer += dt;
      const progress = Math.min(1.0, this.arcTimer / this.arcDuration);

      // Linear horizontal movement towards target
      this.x = this.arcStartX + (this.arcTargetX - this.arcStartX) * progress;
      this.y = this.arcStartY + (this.arcTargetY - this.arcStartY) * progress;

      // Parabolic vertical height curve: 4 * H * p * (1 - p)
      this.z = 4 * this.reboundArcHeight * progress * (1 - progress);

      if (progress >= 1.0) {
        // Touchdown on ground!
        this.z = 0;
        this.state = BallState.GROUNDED;
        this.vx = 0;
        this.vy = 0;
        this.trail = [];
        const ballCfg = window.GameConfig.ball;
        this.maxGroundLife = ballCfg.groundLifetimeDuration !== undefined ? ballCfg.groundLifetimeDuration : 4.0;
        this.groundLifeTimer = this.maxGroundLife;

        // FIFO enforcement: Max Grounded Balls cap
        if (window.Game && window.Game.balls) {
          const maxGrounded = ballCfg.maxGroundedBalls !== undefined ? ballCfg.maxGroundedBalls : 2;
          const groundedBalls = window.Game.balls.filter(b => b.alive && b.state === BallState.GROUNDED && b !== this);
          groundedBalls.sort((a, b) => b.age - a.age); // Oldest first
          while (groundedBalls.length >= maxGrounded) {
            const oldest = groundedBalls.shift();
            if (oldest) {
              oldest.alive = false;
              window.ParticleSystem.spawnSparks(oldest.x, oldest.y, 16, '#ff4466', 1.0);
              window.ParticleSystem.spawnDashDust(oldest.x, oldest.y, 'rgba(255, 68, 102, 0.5)');
            }
          }
        }

        window.SoundFX.playWallBounce();
        window.ParticleSystem.spawnDashDust(this.x, this.y, 'rgba(0, 255, 180, 0.6)');
      }
    }

    // Grounded neutral ball update
    updateGrounded(dt) {
      this.auraTimer += dt * 3.0;
      const ballCfg = window.GameConfig.ball;
      if (ballCfg.groundLifetimeEnabled !== false) {
        this.groundLifeTimer -= dt;
        if (this.groundLifeTimer <= 0) {
          // Ball dissolves harmlessly
          this.alive = false;
          window.ParticleSystem.spawnSparks(this.x, this.y, 14, '#cccccc', 0.85);
          window.ParticleSystem.spawnDashDust(this.x, this.y, 'rgba(200, 200, 200, 0.4)');
        }
      }
    }

    // -------------------------------------------------------------
    // Render Loop (2.5D Pseudo-45° Projected)
    // -------------------------------------------------------------
    render(ctx, yScale = 0.75) {
      if (!this.alive || this.state === BallState.HELD) return;

      const screenPos = window.Physics.toScreen(this.x, this.y, this.z, yScale);
      const groundPos = window.Physics.toScreen(this.x, this.y, 0, yScale);

      const ballCfg = window.GameConfig.ball;
      const isExpiring = (this.state === BallState.GROUNDED && ballCfg.groundLifetimeEnabled !== false && this.groundLifeTimer <= 1.2);
      const isBlinkDim = isExpiring && (Math.sin(this.groundLifeTimer * 28) > 0);

      // 1. Ground Aura or Shadow
      if (this.state === BallState.GROUNDED) {
        // Cyan / Green pulsing breathing aura: "Currently Pickable"
        const pulse = 1.0 + Math.sin(this.auraTimer) * 0.15;
        const auraR = this.pickupRadius * pulse;

        ctx.save();
        if (isBlinkDim) {
          ctx.globalAlpha = 0.3;
        }
        ctx.beginPath();
        ctx.ellipse(groundPos.x, groundPos.y, auraR, auraR * yScale, 0, 0, Math.PI * 2);
        ctx.strokeStyle = isExpiring ? '#ff4466' : '#00ffaa';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -this.auraTimer * 10;
        ctx.shadowColor = isExpiring ? '#ff4466' : '#00ffaa';
        ctx.shadowBlur = isExpiring ? 16 : 12;
        ctx.stroke();

        // Subtle glowing floor circle
        ctx.fillStyle = isExpiring ? 'rgba(255, 68, 102, 0.1)' : 'rgba(0, 255, 170, 0.08)';
        ctx.fill();

        // Lifetime countdown arc inside aura
        if (ballCfg.groundLifetimeEnabled !== false && this.maxGroundLife > 0) {
          const ratio = Math.max(0, Math.min(1, this.groundLifeTimer / this.maxGroundLife));
          const arcR = auraR * 0.75;
          ctx.beginPath();
          ctx.ellipse(groundPos.x, groundPos.y, arcR, arcR * yScale, 0, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
          ctx.strokeStyle = isExpiring ? '#ff4466' : 'rgba(0, 255, 170, 0.65)';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([]);
          ctx.stroke();
        }

        ctx.restore();
      } else if (this.state === BallState.REBOUND_ARC) {
        // Red / Orange flashing aura: "Dangerous / In-Flight / Not yet pickable"
        const blink = Math.sin(this.arcTimer * 18) > 0;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(groundPos.x, groundPos.y, 25, 25 * yScale, 0, 0, Math.PI * 2);
        ctx.strokeStyle = blink ? '#ff3344' : '#888888';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      } else {
        // Standard floor shadow
        const shadowScale = Math.max(0.3, 1.0 - (this.z / 150));
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(groundPos.x, groundPos.y, this.radius * shadowScale, this.radius * yScale * 0.6 * shadowScale, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fill();
        ctx.restore();
      }

      // 2. Motion Trail
      if (this.trail.length > 0 && this.state !== BallState.GROUNDED && this.state !== BallState.EXPLODING) {
        const trailLimit = this.isMinion ? 3 : this.trail.length;
        for (let i = 0; i < Math.min(this.trail.length, trailLimit); i++) {
          const tr = this.trail[i];
          if (tr.alpha <= 0) continue;
          const trScreen = window.Physics.toScreen(tr.x, tr.y, tr.z, yScale);
          ctx.save();
          ctx.beginPath();
          ctx.arc(trScreen.x, trScreen.y, this.radius * (this.isMinion ? 0.6 : 0.75), 0, Math.PI * 2);
          ctx.fillStyle = this.color;
          ctx.globalAlpha = Math.max(0, tr.alpha * (this.isMinion ? 0.25 : 0.4));
          ctx.fill();
          ctx.restore();
        }
      }

      // 3. Ball Geometric Body
      ctx.save();
      if (isBlinkDim) {
        ctx.globalAlpha = 0.25;
      }
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, this.radius, 0, Math.PI * 2);

      // Glow effect
      if (window.GameConfig.arena.glowEnabled) {
        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = (this.isMinion ? 6 : 14) * window.GameConfig.arena.glowIntensity;
      }

      ctx.fillStyle = this.color;
      ctx.fill();

      if (!this.isMinion) {
        // Core Dodgeball: High contrast white stroke + sharp specular highlight
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(screenPos.x - this.radius * 0.28, screenPos.y - this.radius * 0.28, this.radius * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fill();

        // Specific Visual Flavor for Red (Forbidden Hazard) and Purple (High-Voltage Counter) Balls
        if (this.presetKey === 'preset2') {
          // Red Ball: High-frequency alert warning dashed pulse ring
          const alertPulse = 1.0 + Math.sin(performance.now() * 0.016) * 0.28;
          ctx.beginPath();
          ctx.arc(screenPos.x, screenPos.y, this.radius * alertPulse * 1.35, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 34, 51, 0.9)';
          ctx.lineWidth = 2.0;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (this.presetKey === 'preset3') {
          // Purple Ball: High-voltage electric corona micro-glow ring
          const purplePulse = 1.0 + Math.sin(performance.now() * 0.010) * 0.22;
          ctx.beginPath();
          ctx.arc(screenPos.x, screenPos.y, this.radius * purplePulse * 1.25, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(224, 102, 255, 0.75)';
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
      } else {
        // Minion Hazard Bullet: subtle translucent outer ring
        ctx.strokeStyle = 'rgba(255, 80, 120, 0.6)';
        ctx.lineWidth = 1.0;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  window.Ball = Ball;
  window.BallState = BallState;
})(window);
