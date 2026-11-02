/**
 * Project: Dodgeball Boss Rush
 * File: js/game.js
 * Description: Core Game Engine, Main Loop, Hitstop / Bullet Time Scaling, Camera Shake,
 * Combo Tracker, HUD Sync, and Game Lifecycle.
 */

(function(window) {
  'use strict';

  class GameEngine {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.width = 1280;
      this.height = 720;

      // Entities
      this.player = null;
      this.boss = null;
      this.arena = null;
      this.balls = [];

      // Loop & Timing
      this.lastTime = 0;
      this.isRunning = false;
      this.isPaused = false;
      this.timeScale = 1.0;
      this.bulletTimeTimer = 0;
      this.hitstopTimer = 0;

      // Camera & Screen Shake
      this.cameraShakeTimer = 0;
      this.cameraShakeIntensity = 0;
      this.cameraZoomCurrent = 1.0;

      // Combo System
      this.comboCount = 0;
      this.comboTimer = 0;
      this.isVictory = false;
      this.judgmentTimer = null;

      // Battle Speedrun Timer
      this.battleTime = 0;
      this.finalBattleTime = 0;
      this.finalBattleTimeFormatted = '00:00.00';

      // HUD Element Caches
      this.hud = {};
    }

    init() {
      this.canvas = document.getElementById('game-canvas');
      this.ctx = this.canvas.getContext('2d');

      this.cacheHUDElements();
      this.handleResize();
      window.addEventListener('resize', () => this.handleResize());

      // Initialize sound system
      window.SoundFX.init();

      // Instantiate entities
      this.arena = new window.Arena();
      this.player = new window.Player();
      this.boss = new window.Boss();
      this.balls = [];

      // Input layer
      this.input = new window.InputManager();

      // Inspector panel
      this.inspector = new window.DesignInspector();

      // Game state
      this.isRunning = true;
      this.lastTime = performance.now();
      requestAnimationFrame(this.loop.bind(this));
    }

    cacheHUDElements() {
      this.hud = {
        bossHpFill: document.getElementById('boss-hp-fill'),
        bossHpText: document.getElementById('boss-hp-text'),
        bossPhaseBadge: document.getElementById('boss-phase-badge'),
        bossStatusSubtext: document.getElementById('boss-status-subtext'),
        notchP2: document.getElementById('notch-phase-2'),
        notchP3: document.getElementById('notch-phase-3'),
        playerHpFill: document.getElementById('player-hp-fill'),
        playerHpText: document.getElementById('player-hp-text'),
        cdCatchProgress: document.getElementById('cd-catch-progress'),
        cdDashProgress: document.getElementById('cd-dash-progress'),
        comboCount: document.getElementById('combo-count'),
        comboMultiplier: document.getElementById('combo-multiplier'),
        comboTimerFill: document.getElementById('combo-timer-fill'),
        bulletTimeBanner: document.getElementById('bullet-time-banner'),
        resultModal: document.getElementById('game-result-modal'),
        resultTitle: document.getElementById('result-title'),
        resultStats: document.getElementById('result-stats'),
        btnRestart: document.getElementById('btn-restart-game'),
        battleTimerDisplay: document.getElementById('battle-timer-display'),
        btnOpenLeaderboard: document.getElementById('btn-open-leaderboard'),
        leaderboardModal: document.getElementById('leaderboard-modal'),
        btnCloseLeaderboard: document.getElementById('btn-close-leaderboard'),
        btnLeaderboardRestart: document.getElementById('btn-leaderboard-restart'),
        leaderboardTableBody: document.getElementById('leaderboard-table-body')
      };

      if (this.hud.btnRestart) {
        const restart = (e) => {
          if (e) e.stopPropagation();
          this.restartGame();
        };
        this.hud.btnRestart.addEventListener('click', restart);
        this.hud.btnRestart.addEventListener('touchend', restart, { passive: false });
      }

      if (this.hud.btnOpenLeaderboard) {
        this.hud.btnOpenLeaderboard.addEventListener('click', (e) => {
          if (e) e.stopPropagation();
          this.openLeaderboardModal();
        });
      }

      if (this.hud.btnCloseLeaderboard) {
        this.hud.btnCloseLeaderboard.addEventListener('click', (e) => {
          if (e) e.stopPropagation();
          this.closeLeaderboardModal();
        });
      }

      if (this.hud.btnLeaderboardRestart) {
        this.hud.btnLeaderboardRestart.addEventListener('click', (e) => {
          if (e) e.stopPropagation();
          this.closeLeaderboardModal();
          this.restartGame();
        });
      }
    }

    handleResize() {
      const wrapper = document.getElementById('canvas-wrapper');
      if (!wrapper || !this.canvas) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;

      this.width = w;
      this.height = h;

      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;

      this.ctx.resetTransform();
      this.ctx.scale(dpr, dpr);
    }

    restartGame() {
      this.isVictory = false;
      this.setPaused(false);
      this.player.reset();
      this.boss.reset();
      this.arena.rebuildObstacles();
      this.balls = [];
      this.comboCount = 0;
      this.comboTimer = 0;
      this.bulletTimeTimer = 0;
      this.hitstopTimer = 0;
      this.cameraShakeTimer = 0;

      // Reset Battle Timer
      this.battleTime = 0;
      this.finalBattleTime = 0;
      this.finalBattleTimeFormatted = '00:00.00';
      this.updateBattleTimerHUD('00:00.00');

      window.ParticleSystem.clear();

      if (this.hud.resultModal) {
        this.hud.resultModal.classList.remove('open');
      }
      if (this.hud.leaderboardModal) {
        this.hud.leaderboardModal.classList.remove('open');
      }

      this.isRunning = true;
      this.lastTime = performance.now();
    }

    updateBattleTimerHUD(overrideText) {
      if (!this.hud.battleTimerDisplay) return;
      if (overrideText) {
        this.hud.battleTimerDisplay.textContent = overrideText;
        return;
      }
      const ms = Math.round(this.battleTime * 1000);
      this.hud.battleTimerDisplay.textContent = window.StorageService ? window.StorageService.formatTimeMs(ms) : (this.battleTime.toFixed(2) + 's');
    }

    async openLeaderboardModal(highlightId = null) {
      if (!this.hud.leaderboardModal || !this.hud.leaderboardTableBody) return;
      this.hud.leaderboardTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color:#8b949e;">正在加载排行榜数据...</td></tr>';
      this.hud.leaderboardModal.classList.add('open');

      const records = window.StorageService ? await window.StorageService.loadLeaderboard() : [];
      if (!records || records.length === 0) {
        this.hud.leaderboardTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color:#8b949e;">暂无速通记录</td></tr>';
        return;
      }

      let html = '';
      records.forEach((rec, idx) => {
        const rank = idx + 1;
        let rankBadge = `${rank}`;
        let rowClass = 'leaderboard-row';
        if (rank === 1) {
          rankBadge = '🥇 1';
          rowClass += ' rank-1';
        } else if (rank === 2) {
          rankBadge = '🥈 2';
          rowClass += ' rank-2';
        } else if (rank === 3) {
          rankBadge = '🥉 3';
          rowClass += ' rank-3';
        }

        const isCurrentPlayer = highlightId && rec.id === highlightId;
        if (isCurrentPlayer) {
          rowClass += ' player-highlight';
        }

        html += `
          <tr class="${rowClass}">
            <td class="col-rank">${rankBadge}</td>
            <td class="col-name">${rec.name}${isCurrentPlayer ? ' <span class="badge-you">YOU</span>' : ''}</td>
            <td class="col-time">${rec.timeFormatted}</td>
            <td class="col-combo">${rec.combo || 0}</td>
            <td class="col-date">${rec.date || '-'}</td>
          </tr>
        `;
      });

      this.hud.leaderboardTableBody.innerHTML = html;
    }

    closeLeaderboardModal() {
      if (this.hud.leaderboardModal) {
        this.hud.leaderboardModal.classList.remove('open');
      }
    }

    onPlayerDeath() {
      if (this.isVictory) return;
      this.triggerScreenShake(1.4, 0.5);
      if (this.hud.resultModal && this.hud.resultTitle && this.hud.resultStats) {
        this.hud.resultTitle.className = 'result-title defeat';
        this.hud.resultTitle.textContent = 'DEFEAT / 战败';
        this.hud.resultStats.innerHTML = `
          Boss 剩余血量: ${Math.round((this.boss.hp / this.boss.maxHp) * 100)}%<br>
          最高连击数: ${this.comboCount} Hits
        `;
        this.hud.resultModal.classList.add('open');
      }
    }

    onObstacleDestroyed(obs) {
      if (this.boss && this.boss.alive && this.boss.currentPhase === 3 && window.GameConfig.boss.p3RequireClearObstacles !== false) {
        if (this.arena && this.arena.p3ObstaclesSpawned && !this.boss.p3ShieldBroken) {
          const remaining = this.arena.aliveObstacleCount;
          if (remaining === 0) {
            this.boss.p3ShieldBroken = true;
            this.boss.onShieldBreak();
          }
        }
      }
    }

    onBossDefeated() {
      if (this.isVictory) return;
      this.isVictory = true;

      // 0. Instantly freeze Battle Speedrun Timer!
      this.finalBattleTime = this.battleTime;
      const timeMs = Math.round(this.finalBattleTime * 1000);
      this.finalBattleTimeFormatted = window.StorageService ? window.StorageService.formatTimeMs(timeMs) : (this.finalBattleTime.toFixed(2) + 's');
      this.updateBattleTimerHUD(this.finalBattleTimeFormatted);

      // 1. Instantly protect player from any damage & clear held ball
      this.player.isInvulnerable = true;
      if (this.player.heldBall) {
        this.player.heldBall = null;
        this.player.isAiming = false;
        this.player.state = window.PlayerState.NORMAL;
      }

      // 2. Clear all wall emitters & residual balls on the field into confetti
      this.boss.alive = false;
      this.boss.wallEmitters = [];

      for (let i = 0; i < this.balls.length; i++) {
        const ball = this.balls[i];
        window.ParticleSystem.spawnSparks(ball.x, ball.y, 16, ball.color || '#00e5ff', 1.2);
        window.ParticleSystem.spawnShockwave(ball.x, ball.y, 40, 0.25, '#ffcc00');
        ball.alive = false;
      }
      this.balls = [];

      // 3. Boss Slain celebration FX
      this.triggerScreenShake(2.0, 0.6);
      window.SoundFX.playExplosion();
      if (window.SoundManager) {
        window.SoundManager.victoryFanfare();
      }
      window.ParticleSystem.spawnShockwave(this.boss.x, this.boss.y, 180, 0.55, '#ffcc00');
      window.ParticleSystem.spawnSparks(this.boss.x, this.boss.y, 50, '#ff3366', 2.0);
      window.ParticleSystem.spawnSparks(this.boss.x, this.boss.y, 45, '#ffcc00', 1.8);
      window.ParticleSystem.spawnDamageText(this.boss.x, this.boss.y - 20, 'BOSS SLAIN!', true, '#ffcc00');

      // 4. Dramatic 0.5s hitstop slow-motion freeze frame
      this.triggerHitstop(0.5);

      // 5. Present VICTORY result modal safely after hitstop with speedrun submit
      setTimeout(() => {
        if (!this.isVictory) return;
        this.setPaused(true);
        if (this.hud.resultModal && this.hud.resultTitle && this.hud.resultStats) {
          const lastName = window.StorageService ? window.StorageService.getLastPlayerName() : 'CYBER_PLAYER';
          this.hud.resultTitle.className = 'result-title victory';
          this.hud.resultTitle.textContent = '🏆 VICTORY! 挑战成功';
          this.hud.resultStats.innerHTML = `
            <div class="victory-time-banner">
              <span class="victory-time-label">⏱️ 速通耗时:</span>
              <span class="victory-time-val">${this.finalBattleTimeFormatted}</span>
            </div>
            <div class="victory-stats-row">
              <span>最高连击: <strong>${this.comboCount} Hits</strong></span>
              <span>最终倍率: <strong>${(this.getCurrentComboMultiplier() * 100).toFixed(0)}%</strong></span>
            </div>
            <div class="victory-input-box">
              <label for="victory-name-input">登记速通榜昵称 (1-12字)：</label>
              <input type="text" id="victory-name-input" maxlength="12" value="${lastName}" placeholder="输入玩家昵称..." autocomplete="off">
              <div class="victory-btn-actions">
                <button id="btn-submit-leaderboard" class="btn-primary-victory">⚡ 确认提交成绩</button>
                <button id="btn-view-leaderboard" class="btn-secondary-victory">🏆 查看排行榜</button>
              </div>
            </div>
          `;
          this.hud.resultModal.classList.add('open');

          const submitBtn = document.getElementById('btn-submit-leaderboard');
          const viewBtn = document.getElementById('btn-view-leaderboard');
          const nameInput = document.getElementById('victory-name-input');

          if (submitBtn) {
            submitBtn.onclick = async () => {
              const rawName = nameInput ? nameInput.value : '';
              submitBtn.disabled = true;
              submitBtn.textContent = '正在同步...';
              let recordId = null;
              if (window.StorageService) {
                const res = await window.StorageService.addRecord({
                  name: rawName,
                  timeMs: timeMs,
                  timeFormatted: this.finalBattleTimeFormatted,
                  combo: this.comboCount
                });
                recordId = res.newRecordId;
              }
              this.hud.resultModal.classList.remove('open');
              this.openLeaderboardModal(recordId);
            };
          }

          if (viewBtn) {
            viewBtn.onclick = () => {
              this.hud.resultModal.classList.remove('open');
              this.openLeaderboardModal();
            };
          }
        }
      }, 500);
    }

    // Right-Center Arcade Judgment HUD Banner Trigger
    showArcadeJudgment(title, sub, isPerfect = false) {
      const banner = document.getElementById('arcade-judgment-banner');
      const titleEl = document.getElementById('judgment-title');
      const subEl = document.getElementById('judgment-sub');
      if (!banner || !titleEl) return;

      titleEl.textContent = title;
      titleEl.className = 'judgment-title ' + (isPerfect ? 'perfect' : 'good');
      if (subEl) {
        subEl.textContent = sub || '';
      }

      banner.classList.remove('show');
      void banner.offsetWidth; // Force DOM reflow to restart CSS animation
      banner.classList.add('show');

      if (this.judgmentTimer) {
        clearTimeout(this.judgmentTimer);
      }
      this.judgmentTimer = setTimeout(() => {
        banner.classList.remove('show');
        this.judgmentTimer = null;
      }, 850);
    }

    setPaused(paused) {
      this.isPaused = paused;
      const pauseBanner = document.getElementById('pause-overlay-banner');
      if (pauseBanner) {
        pauseBanner.classList.toggle('active', paused);
      }
      const pauseBtn = document.getElementById('inspector-pause-btn');
      if (pauseBtn) {
        pauseBtn.textContent = paused ? '▶️ 继续' : '⏸️ 暂停';
        pauseBtn.title = paused ? '继续游戏进行' : '暂停游戏进行';
      }
    }

    togglePause() {
      this.setPaused(!this.isPaused);
    }

    // -------------------------------------------------------------
    // Bullet Time & Hitstop Controls
    // -------------------------------------------------------------
    triggerBulletTime(duration) {
      this.bulletTimeTimer = duration;
      window.SoundFX.setBulletTime(true);
      if (this.hud.bulletTimeBanner) {
        this.hud.bulletTimeBanner.classList.add('active');
      }
    }

    triggerHitstop(duration) {
      this.hitstopTimer = duration;
    }

    triggerScreenShake(intensity = 1.0, duration = 0.25) {
      const cfgIntensity = window.GameConfig.camera.screenShakeIntensity;
      this.cameraShakeIntensity = intensity * cfgIntensity;
      this.cameraShakeTimer = duration;
    }

    // -------------------------------------------------------------
    // Combo Calculations
    // -------------------------------------------------------------
    registerBossHit() {
      this.comboCount++;
      const cCfg = window.GameConfig.combo;
      this.comboTimer = cCfg.resetTimer;
    }

    resetCombo() {
      this.comboCount = 0;
      this.comboTimer = 0;
    }

    getCurrentComboMultiplier() {
      const cCfg = window.GameConfig.combo;
      const bonus = this.comboCount * cCfg.baseMultiplier;
      return Math.min(cCfg.maxCap, 1.0 + bonus);
    }

    // -------------------------------------------------------------
    // Main Game Loop
    // -------------------------------------------------------------
    loop(timestamp) {
      const rawDt = Math.min((timestamp - this.lastTime) / 1000, 0.08);
      this.lastTime = timestamp;

      this.update(rawDt);
      this.render();

      requestAnimationFrame(this.loop.bind(this));
    }

    update(rawDt) {
      // 0. Game paused check (e.g. during Inspector open)
      if (this.isPaused) {
        this.updateHUD();
        return;
      }

      // 1. Hitstop check (freeze frame)
      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= rawDt;
        return; // Pause updates during hitstop
      }

      // 2. Global Bullet Time calculation
      const pCfg = window.GameConfig.player;
      if (this.bulletTimeTimer > 0) {
        this.bulletTimeTimer -= rawDt;
        this.timeScale = pCfg.bulletTimeScale;
        if (this.bulletTimeTimer <= 0) {
          window.SoundFX.setBulletTime(false);
          if (this.hud.bulletTimeBanner) {
            this.hud.bulletTimeBanner.classList.remove('active');
          }
        }
      } else {
        this.timeScale = 1.0;
      }

      const dt = rawDt * this.timeScale;

      // Real-time battle speedrun timer (ticks when boss is alive and combat active)
      if (!this.isVictory && this.isRunning && this.boss && this.boss.alive) {
        this.battleTime += rawDt;
        this.updateBattleTimerHUD();
      }

      // 3. Screen shake decay
      if (this.cameraShakeTimer > 0) {
        this.cameraShakeTimer -= rawDt;
      }

      // 4. Combo timer update
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) {
          this.comboCount = 0;
        }
      }

      // 5. Update Arena & Obstacles
      const arenaCfg = window.GameConfig.arena;
      this.arena.update(dt);

      // 6. Update Player (including physical obstacle collision push-out)
      this.player.update(dt, rawDt, this.input.moveVector, arenaCfg, this.arena.obstacles);

      // 7. Update Boss (Frozen if Boss defeated / Victory)
      if (!this.isVictory && this.boss.alive) {
        this.boss.update(dt, this.player, arenaCfg);
      }

      // 8. Update Balls
      for (let i = this.balls.length - 1; i >= 0; i--) {
        const ball = this.balls[i];
        ball.update(dt, this.player, this.boss, this.arena.obstacles, arenaCfg);
        if (!ball.alive) {
          this.balls.splice(i, 1);
        }
      }

      // 9. Check Collisions: Enemy Flying Balls vs Player Catch / Dash / Hurt
      if (!this.isVictory && this.boss.alive) {
        this.checkPlayerBallCollisions();
      }

      // 10. Update Particles & Combat Text
      window.ParticleSystem.update(dt);

      // 11. Sync HUD elements
      this.updateHUD();
    }

    // Check collisions between Enemy Balls and Player
    checkPlayerBallCollisions() {
      if (this.isVictory || !this.boss.alive) return;
      const player = this.player;
      if (player.state === window.PlayerState.DEAD) return;

      const pCfg = window.GameConfig.player;

      for (let i = this.balls.length - 1; i >= 0; i--) {
        const ball = this.balls[i];
        if (!ball.alive || ball.state !== window.BallState.ENEMY_FLIGHT) continue;

        const dist = window.Physics.dist(player.x, player.y, ball.x, ball.y);

        // Case A: Player is in active CATCHING window
        if (player.state === window.PlayerState.CATCHING && dist <= 56) {
          if (!ball.canDirectCatch) {
            // Unblockable ball! Show text & let player take damage if too close
            window.ParticleSystem.spawnDamageText(player.x, player.y, 'UNBLOCKABLE / 无法接球!', true, '#ff3344');
          } else {
            // Determine Perfect Parry vs Good Catch based on remaining catchTimer
            // perfectWindow is the initial slice of the catchTimer
            const elapsedCatch = pCfg.goodWindow - player.catchTimer;
            const isPerfect = (elapsedCatch <= pCfg.perfectWindow);

            player.grabBall(ball, isPerfect);
            this.balls.splice(i, 1);
            return;
          }
        }

        // Case B: Player is DASHING with I-frames
        if (player.state === window.PlayerState.DASHING && player.isInvulnerable) {
          // If ball is very close during dash start, trigger Witch Time!
          if (dist <= 35 && !this.bulletTimeTimer) {
            this.triggerBulletTime(pCfg.bulletTimeDuration * 0.8);
            window.ParticleSystem.spawnDamageText(player.x, player.y, 'WITCH TIME!', true, '#ffcc00');
          }
          continue; // Unharmed!
        }

        // Case C: Normal Hurt collision
        if (dist <= (player.radius + ball.radius)) {
          player.takeDamage(ball.baseDamage);
          ball.alive = false;
        }
      }
    }

    // -------------------------------------------------------------
    // HUD Sync
    // -------------------------------------------------------------
    updateHUD() {
      // Boss HP Bar
      const boss = this.boss;
      const bossHpPct = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));
      if (this.hud.bossHpFill) {
        this.hud.bossHpFill.style.width = `${bossHpPct}%`;
      }
      if (this.hud.bossHpText) {
        this.hud.bossHpText.textContent = `${Math.round(boss.hp)} / ${boss.maxHp} (${bossHpPct.toFixed(0)}%)`;
      }
      if (this.hud.bossPhaseBadge) {
        this.hud.bossPhaseBadge.textContent = `PHASE ${boss.currentPhase}`;
      }

      // Boss Phase Notches
      const bCfg = window.GameConfig.boss;
      if (this.hud.notchP2) {
        this.hud.notchP2.style.left = `${bCfg.phase2.thresholdMax * 100}%`;
      }
      if (this.hud.notchP3) {
        this.hud.notchP3.style.left = `${bCfg.phase3.thresholdMax * 100}%`;
      }

      // Boss Status Subtext (Phase Transition / P3 Shield / Exposed)
      if (this.hud.bossStatusSubtext) {
        if (!boss.alive || this.isVictory) {
          this.hud.bossStatusSubtext.style.display = 'none';
        } else if (boss.phaseTransitionTimer > 0) {
          this.hud.bossStatusSubtext.style.display = 'block';
          this.hud.bossStatusSubtext.textContent = `⚡ PHASE SHIFT / INVULNERABLE (${boss.phaseTransitionTimer.toFixed(1)}s)`;
          this.hud.bossStatusSubtext.style.color = '#00e5ff';
        } else if (boss.currentPhase === 3 && boss.isInvulnerable && !boss.p3ShieldBroken) {
          const aliveCount = this.arena ? this.arena.aliveObstacleCount : boss.aliveObstaclesCount;
          this.hud.bossStatusSubtext.style.display = 'block';
          this.hud.bossStatusSubtext.textContent = `🛡️ SHIELD ACTIVE: DESTROY ALL PILLARS (${aliveCount}/4)`;
          this.hud.bossStatusSubtext.style.color = '#ffaa00';
        } else if (boss.currentPhase === 3 && boss.p3ShieldBroken && boss.weaknessStunTimer > 0) {
          this.hud.bossStatusSubtext.style.display = 'block';
          this.hud.bossStatusSubtext.textContent = '⚠️ BOSS EXPOSED / 破盾暴露，集火斩杀!';
          this.hud.bossStatusSubtext.style.color = '#00ffaa';
        } else {
          this.hud.bossStatusSubtext.style.display = 'none';
        }
      }

      // Player HP Bar
      const player = this.player;
      const playerHpPct = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
      if (this.hud.playerHpFill) {
        this.hud.playerHpFill.style.width = `${playerHpPct}%`;
      }
      if (this.hud.playerHpText) {
        this.hud.playerHpText.textContent = `${Math.round(player.hp)} / ${player.maxHp} (${playerHpPct.toFixed(0)}%)`;
      }

      // Catch & Dash Cooldown Dials
      const circumference = 113; // 2 * PI * 18
      const pCfg = window.GameConfig.player;

      if (this.hud.cdCatchProgress) {
        const catchRatio = (pCfg.catchCooldownEnabled && player.catchCooldownTimer > 0)
          ? (player.catchCooldownTimer / pCfg.catchCooldown)
          : 0;
        this.hud.cdCatchProgress.style.strokeDashoffset = `${circumference * catchRatio}`;
      }

      if (this.hud.cdDashProgress) {
        const dashRatio = (pCfg.dashCooldownEnabled && player.dashCooldownTimer > 0)
          ? (player.dashCooldownTimer / pCfg.dashCooldown)
          : 0;
        this.hud.cdDashProgress.style.strokeDashoffset = `${circumference * dashRatio}`;
      }

      // Combo System HUD
      const cCfg = window.GameConfig.combo;
      if (this.hud.comboCount) {
        this.hud.comboCount.textContent = `x${this.comboCount}`;
      }
      if (this.hud.comboMultiplier) {
        const mult = (this.getCurrentComboMultiplier() * 100).toFixed(0);
        this.hud.comboMultiplier.textContent = `${mult}% DMG`;
      }
      if (this.hud.comboTimerFill) {
        const timerRatio = (this.comboTimer > 0) ? (this.comboTimer / cCfg.resetTimer) : 0;
        this.hud.comboTimerFill.style.width = `${timerRatio * 100}%`;
      }
    }

    // -------------------------------------------------------------
    // Main Render Pipeline
    // -------------------------------------------------------------
    render() {
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;

      // Clear Canvas
      ctx.clearRect(0, 0, w, h);

      ctx.save();

      // Camera Center Translation
      ctx.translate(w / 2, h / 2);

      // Camera Screen Shake
      if (this.cameraShakeTimer > 0) {
        const mag = this.cameraShakeIntensity * 12;
        const offsetX = (Math.random() - 0.5) * mag;
        const offsetY = (Math.random() - 0.5) * mag;
        ctx.translate(offsetX, offsetY);
      }

      // Camera Zoom & Dynamic Bullet Time Zoom with Responsive Auto-Fit
      const camCfg = window.GameConfig.camera;
      const arenaCfg = window.GameConfig.arena;
      const arenaW = arenaCfg.shape === 'circle' ? arenaCfg.radius * 2 : arenaCfg.width;
      const arenaH = (arenaCfg.shape === 'circle' ? arenaCfg.radius * 2 : arenaCfg.height) * arenaCfg.perspectiveYScale;

      // Breathing padding for arena walls, Boss HUD and mobile touch controls
      const paddingX = 80;
      const paddingY = 110;
      const autoScale = Math.min(1.0, Math.min(w / (arenaW + paddingX), h / (arenaH + paddingY)));

      let targetZoom = camCfg.zoom * autoScale;
      if (camCfg.dynamicZoomOnBulletTime && this.bulletTimeTimer > 0) {
        targetZoom *= camCfg.bulletTimeZoomFactor;
      }
      this.cameraZoomCurrent += (targetZoom - this.cameraZoomCurrent) * 0.15;
      ctx.scale(this.cameraZoomCurrent, this.cameraZoomCurrent);

      const yScale = window.GameConfig.arena.perspectiveYScale;

      // 1. Render Arena Floor & Obstacles
      this.arena.render(ctx, yScale);

      // 2. Render Boss Entity
      this.boss.render(ctx, yScale);

      // 3. Render Grounded Balls & Active Flying Balls
      for (const ball of this.balls) {
        ball.render(ctx, yScale);
      }

      // 4. Render Player Entity (and trajectory line if aiming)
      this.player.render(ctx, yScale);

      // 5. Render Particle System (Sparks, Shockwaves, Damage Numbers)
      window.ParticleSystem.render(ctx, yScale);

      ctx.restore();
    }
  }

  window.Game = new GameEngine();
})(window);
