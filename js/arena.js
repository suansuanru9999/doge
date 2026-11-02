/**
 * Project: Dodgeball Boss Rush
 * File: js/arena.js
 * Description: Arena Geometry Renderer, Cyberpunk Tech Floor Grid, Lighting Atmosphere,
 * and Dynamic Destructible Obstacles Generator.
 */

(function(window) {
  'use strict';

  class Obstacle {
    constructor(x, y, radius, destructible = true) {
      this.x = x;
      this.y = y;
      this.radius = radius;
      this.destructible = destructible;
      const cfg = window.GameConfig.arena;
      this.maxHp = (cfg && cfg.obstacleMaxHp) ? cfg.obstacleMaxHp : 100;
      this.hp = this.maxHp;
      this.alive = true;
      this.isDead = false;
      this.flashTimer = 0;
      this.shakeTimer = 0;
      this.riseProgress = 1.0; // 0 to 1 for spawn rising animation
    }

    damage(amount) {
      if (!this.destructible || !this.alive || this.isDead) return;
      this.hp = Math.max(0, this.hp - amount);
      this.flashTimer = 0.12;
      this.shakeTimer = 0.15;
      window.ParticleSystem.spawnSparks(this.x, this.y, 14, '#ffaa00', 1.0);

      if (this.hp <= 0) {
        this.alive = false;
        this.isDead = true;
        window.SoundFX.playExplosion();
        window.Game.triggerScreenShake(0.9, 0.3);
        window.ParticleSystem.spawnShockwave(this.x, this.y, this.radius * 2.5, 0.4, '#ffaa00');
        window.ParticleSystem.spawnSparks(this.x, this.y, 30, '#00e5ff', 1.6);
        window.ParticleSystem.spawnDashDust(this.x, this.y, 'rgba(255, 170, 0, 0.6)');

        // Notify Game of obstacle destruction for P3 Shield check
        if (window.Game && window.Game.onObstacleDestroyed) {
          window.Game.onObstacleDestroyed(this);
        }
      }
    }

    update(dt) {
      if (this.flashTimer > 0) {
        this.flashTimer = Math.max(0, this.flashTimer - dt);
      }
      if (this.shakeTimer > 0) {
        this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      }
      if (this.riseProgress < 1.0) {
        this.riseProgress = Math.min(1.0, this.riseProgress + dt * 2.5);
      }
    }

    render(ctx, yScale = 0.75) {
      if (!this.alive) return;

      // Shake displacement on hit
      let sx = 0, sy = 0;
      if (this.shakeTimer > 0) {
        const factor = this.shakeTimer / 0.15;
        sx = (Math.random() - 0.5) * 6 * factor;
        sy = (Math.random() - 0.5) * 6 * factor;
      }

      const drawX = this.x + sx;
      const drawY = this.y + sy;

      const groundPos = window.Physics.toScreen(drawX, drawY, 0, yScale);
      const pillarH = 28 * this.riseProgress;
      const topPos = window.Physics.toScreen(drawX, drawY, pillarH, yScale);

      // 1. Floor Shadow
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(groundPos.x, groundPos.y, this.radius * 1.15 * this.riseProgress, this.radius * yScale * 0.75 * this.riseProgress, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fill();
      ctx.restore();

      // 2. 3D Pillar Body
      ctx.save();
      ctx.fillStyle = this.flashTimer > 0 ? '#ffffff' : '#1a2636';
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2;

      // Base cylinder
      ctx.beginPath();
      ctx.arc(topPos.x, topPos.y, this.radius * this.riseProgress, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Pillar core glowing accent
      ctx.beginPath();
      ctx.arc(topPos.x, topPos.y, this.radius * 0.4 * this.riseProgress, 0, Math.PI * 2);
      ctx.fillStyle = this.destructible ? '#ffaa00' : '#00e5ff';
      ctx.fill();

      // 3. Crack Decals on top if damaged
      const hpRatio = Math.max(0, Math.min(1, this.hp / this.maxHp));
      if (this.destructible && hpRatio < 0.7 && this.riseProgress >= 0.8) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 68, 68, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(topPos.x - this.radius * 0.4, topPos.y - this.radius * 0.2);
        ctx.lineTo(topPos.x + this.radius * 0.1, topPos.y + this.radius * 0.1);
        ctx.lineTo(topPos.x + this.radius * 0.4, topPos.y - this.radius * 0.3);
        if (hpRatio < 0.35) {
          ctx.moveTo(topPos.x, topPos.y - this.radius * 0.5);
          ctx.lineTo(topPos.x - this.radius * 0.2, topPos.y + this.radius * 0.3);
          ctx.lineTo(topPos.x + this.radius * 0.3, topPos.y + this.radius * 0.4);
        }
        ctx.stroke();
        ctx.restore();
      }

      // 4. Concise Tech Health Gauge Ring
      if (this.destructible && this.riseProgress >= 0.8) {
        // Track ring
        ctx.beginPath();
        ctx.arc(topPos.x, topPos.y, this.radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 3.5;
        ctx.stroke();

        // Active HP fill arc
        const hpColor = hpRatio > 0.6 ? '#00ffaa' : (hpRatio > 0.3 ? '#ffcc00' : '#ff3344');
        ctx.beginPath();
        ctx.arc(topPos.x, topPos.y, this.radius + 6, -Math.PI / 2, -Math.PI / 2 + hpRatio * Math.PI * 2);
        ctx.strokeStyle = hpColor;
        ctx.lineWidth = 3.5;
        ctx.shadowColor = hpColor;
        ctx.shadowBlur = 8;
        ctx.stroke();

        // 5. Overhead Tech HP Pill Badge
        const badgeY = topPos.y - this.radius - 12;
        const text = `HP ${Math.ceil(this.hp)}/${this.maxHp}`;
        ctx.font = 'bold 10px monospace';
        const txtWidth = ctx.measureText(text).width;
        const badgeW = txtWidth + 10;
        const badgeH = 15;

        ctx.fillStyle = 'rgba(8, 14, 22, 0.85)';
        ctx.strokeStyle = hpColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(topPos.x - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 4);
        } else {
          ctx.rect(topPos.x - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = hpColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, topPos.x, badgeY);
      }

      ctx.restore();
    }
  }

  class Arena {
    constructor() {
      this.obstacles = [];
      this.p3WarningTimer = 0;
      this.p3WarningDuration = 1.0;
      this.p3WarningPositions = [];
      this.p3ObstaclesSpawned = false;
      this.rebuildObstacles();

      // Rebuild obstacles when config updates
      window.GameConfig.subscribe((path) => {
        if (path === '*' || path.startsWith('arena.obstacle') || path === 'arena.forceSpawnObstaclesAllPhases') {
          this.rebuildObstacles();
        }
      });
    }

    get aliveObstacles() {
      return this.obstacles.filter(o => o.alive && !o.isDead && o.hp > 0);
    }

    get aliveObstacleCount() {
      return this.aliveObstacles.length;
    }

    // Generate obstacles based on current config preset (P1/P2 are clean unless forceSpawn is true)
    rebuildObstacles() {
      this.obstacles = [];
      this.p3WarningTimer = 0;
      this.p3ObstaclesSpawned = false;
      const cfg = window.GameConfig.arena;
      const forceAll = cfg.forceSpawnObstaclesAllPhases === true;
      const isP3 = window.Game && window.Game.boss && window.Game.boss.currentPhase === 3;

      if (!forceAll && !isP3) {
        return;
      }

      if (isP3 || forceAll) {
        this.p3ObstaclesSpawned = true;
      }

      const count = cfg.obstacleCount;
      const size = cfg.obstacleSize;
      const destructible = cfg.obstacleDestructible;
      const layout = cfg.obstacleLayout;

      if (layout === 'none' || count <= 0) return;

      if (layout === 'corners') {
        const offsetW = cfg.shape === 'circle' ? cfg.radius * 0.55 : cfg.width * 0.32;
        const offsetH = cfg.shape === 'circle' ? cfg.radius * 0.55 : cfg.height * 0.32;
        const positions = [
          { x: -offsetW, y: -offsetH },
          { x: offsetW, y: -offsetH },
          { x: -offsetW, y: offsetH },
          { x: offsetW, y: offsetH }
        ];
        const actualCount = Math.min(count, 4);
        for (let i = 0; i < actualCount; i++) {
          this.obstacles.push(new Obstacle(positions[i].x, positions[i].y, size, destructible));
        }
      } else if (layout === 'ring') {
        const ringRadius = cfg.shape === 'circle' ? cfg.radius * 0.6 : 240;
        const step = (Math.PI * 2) / count;
        for (let i = 0; i < count; i++) {
          const a = step * i;
          const ox = Math.cos(a) * ringRadius;
          const oy = Math.sin(a) * ringRadius;
          this.obstacles.push(new Obstacle(ox, oy, size, destructible));
        }
      } else if (layout === 'random') {
        const spanW = (cfg.width || 800) * 0.65;
        const spanH = (cfg.height || 500) * 0.65;
        for (let i = 0; i < count; i++) {
          const ox = (Math.random() - 0.5) * spanW;
          const oy = (Math.random() - 0.5) * spanH;
          // Avoid spawning right on top of Boss center
          if (Math.hypot(ox, oy) > 120) {
            this.obstacles.push(new Obstacle(ox, oy, size, destructible));
          }
        }
      }
    }

    // Start 1.0s ground fissure warning and then dynamically rise 4 pillars
    startP3WarningAndSpawn() {
      const cfg = window.GameConfig.arena;
      const offsetW = cfg.shape === 'circle' ? cfg.radius * 0.52 : (cfg.width ? cfg.width * 0.32 : 300);
      const offsetH = cfg.shape === 'circle' ? cfg.radius * 0.52 : (cfg.height ? cfg.height * 0.32 : 200);

      this.p3WarningPositions = [
        { x: -offsetW, y: -offsetH },
        { x: offsetW, y: -offsetH },
        { x: -offsetW, y: offsetH },
        { x: offsetW, y: offsetH }
      ];
      this.p3WarningDuration = 1.0;
      this.p3WarningTimer = this.p3WarningDuration;
      this.obstacles = [];
      this.p3ObstaclesSpawned = false; // Strictly false during warning!

      if (window.ParticleSystem) {
        for (const pos of this.p3WarningPositions) {
          window.ParticleSystem.spawnSparks(pos.x, pos.y, 10, '#ff3344', 0.8);
        }
      }
      if (window.Game && window.Game.triggerScreenShake) {
        window.Game.triggerScreenShake(0.5, 0.4);
      }
    }

    // Spawn or reset P3 Obstacles array (symmetrical 4 pillars with rising animation)
    spawnP3Obstacles() {
      this.p3WarningTimer = 0;
      const cfg = window.GameConfig.arena;
      const size = cfg.obstacleSize || 38;
      const destructible = true;
      const offsetW = cfg.shape === 'circle' ? cfg.radius * 0.52 : (cfg.width ? cfg.width * 0.32 : 300);
      const offsetH = cfg.shape === 'circle' ? cfg.radius * 0.52 : (cfg.height ? cfg.height * 0.32 : 200);

      const positions = [
        { x: -offsetW, y: -offsetH },
        { x: offsetW, y: -offsetH },
        { x: -offsetW, y: offsetH },
        { x: offsetW, y: offsetH }
      ];

      this.obstacles = [];
      for (const pos of positions) {
        const obs = new Obstacle(pos.x, pos.y, size, destructible);
        obs.riseProgress = 0.0;
        this.obstacles.push(obs);

        if (window.ParticleSystem) {
          window.ParticleSystem.spawnDashDust(pos.x, pos.y, 'rgba(0, 229, 255, 0.7)');
          window.ParticleSystem.spawnShockwave(pos.x, pos.y, size * 2, 0.4, '#00e5ff');
        }
      }

      this.p3ObstaclesSpawned = true; // Pillars are now formally spawned on field!

      if (window.SoundFX && window.SoundFX.playExplosion) {
        window.SoundFX.playExplosion();
      }
      if (window.Game && window.Game.triggerScreenShake) {
        window.Game.triggerScreenShake(0.8, 0.3);
      }
    }

    update(dt) {
      // 1. P3 telegraph ground warning & player push-out protection
      let justSpawned = false;
      if (this.p3WarningTimer > 0) {
        this.p3WarningTimer -= dt;

        // Push player safely away from the rising warning zones
        if (window.Game && window.Game.player) {
          const p = window.Game.player;
          const cfg = window.GameConfig.arena;
          const warnR = (cfg.obstacleSize || 38) + (p.radius || 20) + 12;
          for (const pos of this.p3WarningPositions) {
            const dx = p.x - pos.x;
            const dy = p.y - pos.y;
            const dist = Math.hypot(dx, dy);
            if (dist < warnR) {
              const pushX = dist > 0.001 ? (dx / dist) : 1;
              const pushY = dist > 0.001 ? (dy / dist) : 0;
              p.x = pos.x + pushX * warnR;
              p.y = pos.y + pushY * warnR;
            }
          }
        }

        // Warning phase finished -> rise pillars!
        if (this.p3WarningTimer <= 0) {
          this.spawnP3Obstacles();
          justSpawned = true;
        }
      }

      // 2. Update active obstacles
      if (!justSpawned) {
        for (const obs of this.obstacles) {
          obs.update(dt);
        }
      }
    }

    // -------------------------------------------------------------
    // Render Loop (2.5D Pseudo-45° Projected)
    // -------------------------------------------------------------
    render(ctx, yScale = 0.75) {
      const cfg = window.GameConfig.arena;

      ctx.save();

      // 1. Arena Floor Base & Boundary Outline
      if (cfg.shape === 'circle') {
        const R = cfg.radius;
        // Floor fill
        ctx.beginPath();
        ctx.ellipse(0, 0, R, R * yScale, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#111824';
        ctx.fill();

        // Perimeter glowing border
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 15 * cfg.glowIntensity;
        ctx.stroke();
      } else if (cfg.shape === 'octagon') {
        const R = cfg.radius;
        const cos45 = Math.SQRT1_2;
        const pts = [
          { x: R, y: 0 },
          { x: R * cos45, y: R * cos45 },
          { x: 0, y: R },
          { x: -R * cos45, y: R * cos45 },
          { x: -R, y: 0 },
          { x: -R * cos45, y: -R * cos45 },
          { x: 0, y: -R },
          { x: R * cos45, y: -R * cos45 }
        ];

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y * yScale);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y * yScale);
        }
        ctx.closePath();
        ctx.fillStyle = '#111824';
        ctx.fill();

        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 15 * cfg.glowIntensity;
        ctx.stroke();
      } else {
        // Rectangle Arena
        const halfW = cfg.width / 2;
        const halfH = cfg.height / 2;

        ctx.beginPath();
        ctx.rect(-halfW, -halfH * yScale, cfg.width, cfg.height * yScale);
        ctx.fillStyle = '#111824';
        ctx.fill();

        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 15 * cfg.glowIntensity;
        ctx.stroke();
      }

      ctx.restore();

      // 2. Floor Grid & Center Tech Markings
      this.renderFloorGrid(ctx, cfg, yScale);

      // 2b. P3 Telegraph Ground Warning Fissures
      if (this.p3WarningTimer > 0 && this.p3WarningPositions.length > 0) {
        ctx.save();
        const progress = 1.0 - (this.p3WarningTimer / (this.p3WarningDuration || 1.0));
        const blinkAlpha = 0.6 + 0.4 * Math.sin(this.p3WarningTimer * 20);

        for (const pos of this.p3WarningPositions) {
          const warnPos = window.Physics.toScreen(pos.x, pos.y, 0, yScale);
          const warnR = (cfg.obstacleSize || 38) + 12;

          // Ground red aura fill
          ctx.beginPath();
          ctx.ellipse(warnPos.x, warnPos.y, warnR, warnR * yScale, 0, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 30, 60, ${0.12 + 0.12 * Math.sin(this.p3WarningTimer * 15)})`;
          ctx.fill();

          // Outer dashed warning circle
          ctx.beginPath();
          ctx.ellipse(warnPos.x, warnPos.y, warnR, warnR * yScale, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 45, 85, ${blinkAlpha})`;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([8, 6]);
          ctx.lineDashOffset = -this.p3WarningTimer * 30;
          ctx.stroke();

          // Expanding pulse wave
          const pulseR = warnR * ((progress * 3) % 1);
          ctx.beginPath();
          ctx.ellipse(warnPos.x, warnPos.y, pulseR, pulseR * yScale, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 60, 60, ${1 - ((progress * 3) % 1)})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
          ctx.stroke();

          // Fissure ground cracks
          ctx.beginPath();
          ctx.moveTo(warnPos.x - warnR * 0.5, warnPos.y - warnR * 0.2 * yScale);
          ctx.lineTo(warnPos.x, warnPos.y);
          ctx.lineTo(warnPos.x + warnR * 0.6, warnPos.y + warnR * 0.3 * yScale);
          ctx.moveTo(warnPos.x - warnR * 0.3, warnPos.y + warnR * 0.4 * yScale);
          ctx.lineTo(warnPos.x, warnPos.y);
          ctx.lineTo(warnPos.x + warnR * 0.2, warnPos.y - warnR * 0.5 * yScale);
          ctx.strokeStyle = `rgba(255, 68, 68, ${0.7 + 0.3 * Math.sin(this.p3WarningTimer * 25)})`;
          ctx.lineWidth = 2.0;
          ctx.stroke();
        }
        ctx.restore();
      }

      // 3. Obstacles
      for (const obs of this.obstacles) {
        obs.render(ctx, yScale);
      }
    }

    // Cyberpunk tech lines on the floor
    renderFloorGrid(ctx, cfg, yScale) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.08)';
      ctx.lineWidth = 1;

      const gridSize = 60;
      const spanX = cfg.width ? cfg.width / 2 : cfg.radius;
      const spanY = cfg.height ? cfg.height / 2 : cfg.radius;

      // Vertical lines
      for (let x = -spanX; x <= spanX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, -spanY * yScale);
        ctx.lineTo(x, spanY * yScale);
        ctx.stroke();
      }

      // Horizontal lines (scaled by yScale)
      for (let y = -spanY; y <= spanY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(-spanX, y * yScale);
        ctx.lineTo(spanX, y * yScale);
        ctx.stroke();
      }

      // Center Concentric Rings
      ctx.beginPath();
      ctx.ellipse(0, 0, 100, 100 * yScale, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 0, 180, 180 * yScale, 0, 0, Math.PI * 2);
      ctx.setLineDash([8, 8]);
      ctx.stroke();

      ctx.restore();
    }
  }

  window.Obstacle = Obstacle;
  window.Arena = Arena;
})(window);
