/**
 * Project: Dodgeball Boss Rush
 * File: js/particles.js
 * Description: High-juice geometric particle system, floating combat damage text,
 * expanding shockwave rings, and visual spark bursts.
 */

(function(window) {
  'use strict';

  class ParticleSystem {
    constructor() {
      this.particles = [];
      this.damageTexts = [];
      this.shockwaves = [];
    }

    clear() {
      this.particles = [];
      this.damageTexts = [];
      this.shockwaves = [];
    }

    // -------------------------------------------------------------
    // Geometric Sparks & Shards
    // -------------------------------------------------------------
    spawnSparks(x, y, count = 16, color = '#00f0ff', speedMult = 1.0) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (120 + Math.random() * 280) * speedMult;
        const size = 3 + Math.random() * 5;
        const shape = Math.random() < 0.5 ? 'square' : 'triangle';
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size,
          shape,
          color,
          alpha: 1.0,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 15,
          life: 0.35 + Math.random() * 0.25,
          maxLife: 0.35 + Math.random() * 0.25
        });
      }
    }

    // Dash trail dust
    spawnDashDust(x, y, color = 'rgba(0, 229, 255, 0.6)') {
      for (let i = 0; i < 4; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 20 + Math.random() * 60;
        this.particles.push({
          x: x + (Math.random() - 0.5) * 10,
          y: y + (Math.random() - 0.5) * 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 4 + Math.random() * 4,
          shape: 'circle',
          color,
          alpha: 0.8,
          rotation: 0,
          rotSpeed: 0,
          life: 0.25,
          maxLife: 0.25
        });
      }
    }

    // -------------------------------------------------------------
    // Expanding Shockwave Rings
    // -------------------------------------------------------------
    spawnShockwave(x, y, maxRadius = 80, duration = 0.35, color = '#00f0ff') {
      this.shockwaves.push({
        x,
        y,
        radius: 5,
        maxRadius,
        duration,
        time: 0,
        color
      });
    }

    // -------------------------------------------------------------
    // Floating Damage Numbers & Combat Text
    // -------------------------------------------------------------
    spawnDamageText(x, y, text, isCrit = false, color = '#ffffff') {
      this.damageTexts.push({
        x: x + (Math.random() - 0.5) * 16,
        y: y - 10,
        vy: -75 - Math.random() * 30,
        text,
        isCrit,
        color: (isCrit && color === '#ffffff') ? '#ffcc00' : color,
        scale: isCrit ? 1.4 : 1.0,
        alpha: 1.0,
        life: 0.85,
        maxLife: 0.85
      });
    }

    // -------------------------------------------------------------
    // Update Loop
    // -------------------------------------------------------------
    update(dt) {
      // Update particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92; // Friction drag
        p.vy *= 0.92;
        p.rotation += p.rotSpeed * dt;
        p.alpha = Math.max(0, p.life / p.maxLife);
      }

      // Update shockwaves
      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const sw = this.shockwaves[i];
        sw.time += dt;
        if (sw.time >= sw.duration) {
          this.shockwaves.splice(i, 1);
          continue;
        }
        const progress = sw.time / sw.duration;
        sw.radius = sw.maxRadius * Math.sin(progress * Math.PI * 0.5);
      }

      // Update damage texts
      for (let i = this.damageTexts.length - 1; i >= 0; i--) {
        const dtObj = this.damageTexts[i];
        dtObj.life -= dt;
        if (dtObj.life <= 0) {
          this.damageTexts.splice(i, 1);
          continue;
        }
        dtObj.y += dtObj.vy * dt;
        dtObj.vy *= 0.94;
        dtObj.alpha = Math.min(1.0, dtObj.life / (dtObj.maxLife * 0.4));
      }
    }

    // -------------------------------------------------------------
    // Render Loop (2.5D Pseudo-45° Projected)
    // -------------------------------------------------------------
    render(ctx, yScale = 0.75) {
      // 1. Shockwaves
      for (const sw of this.shockwaves) {
        const alpha = Math.max(0, 1 - sw.time / sw.duration);
        ctx.save();
        ctx.beginPath();
        // Elliptical shockwave matching 2.5D floor perspective
        ctx.ellipse(sw.x, sw.y * yScale, sw.radius, sw.radius * yScale, 0, 0, Math.PI * 2);
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = 3 * alpha;
        ctx.globalAlpha = alpha;
        ctx.stroke();
        ctx.restore();
      }

      // 2. Particles
      for (const p of this.particles) {
        ctx.save();
        ctx.translate(p.x, p.y * yScale);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;

        if (p.shape === 'square') {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        } else if (p.shape === 'triangle') {
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size, p.size);
          ctx.lineTo(-p.size, p.size);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // 3. Floating Damage Texts
      for (const t of this.damageTexts) {
        ctx.save();
        ctx.font = `900 ${t.isCrit ? '18px' : '14px'} -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = t.alpha;

        const screenY = t.y * yScale;

        // Shadow outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText(t.text, t.x, screenY);

        // Fill text
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, screenY);
        ctx.restore();
      }
    }
  }

  window.ParticleSystem = new ParticleSystem();
})(window);
