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
      this.activeBossId = (window.GameConfig && window.GameConfig.activeBossId) || 'boss1';
      this.boss = this.createBossInstance(this.activeBossId);
      this.balls = [];

      this.syncBossUI();

      // Input layer
      this.input = new window.InputManager();

      // Inspector panel
      this.inspector = new window.DesignInspector();

      // Tutorial & Boss Select Modal states
      this.isTutorialOpen = false;
      this.isBossSelectOpen = false;
      this.currentLeaderboardBoss = this.activeBossId === 'boss2' ? 'phantom' : 'bigboss';

      // Game state
      this.isRunning = true;
      this.lastTime = performance.now();

      // Pop tutorial modal on startup (game awaits player confirmation)
      this.openTutorialModal();

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
        resultModal: document.getElementById('game-result-modal'),
        resultTitle: document.getElementById('result-title'),
        resultStats: document.getElementById('result-stats'),
        btnRestart: document.getElementById('btn-restart-game'),
        battleTimerDisplay: document.getElementById('battle-timer-display'),
        btnOpenLeaderboard: document.getElementById('btn-open-leaderboard'),
        leaderboardModal: document.getElementById('leaderboard-modal'),
        btnCloseLeaderboard: document.getElementById('btn-close-leaderboard'),
        btnLeaderboardRestart: document.getElementById('btn-leaderboard-restart'),
        leaderboardTableBody: document.getElementById('leaderboard-table-body'),
        tutorialModal: document.getElementById('tutorial-modal'),
        btnStartGame: document.getElementById('btn-start-game'),
        btnCloseTutorial: document.getElementById('btn-close-tutorial'),
        bossSelectModal: document.getElementById('boss-select-modal'),
        btnCloseBossSelect: document.getElementById('btn-close-boss-select'),
        tabLbBigboss: document.getElementById('tab-lb-bigboss'),
        tabLbPhantom: document.getElementById('tab-lb-phantom'),
        bossNameLabel: document.getElementById('boss-name-label'),
        btnSwitchBoss: document.getElementById('btn-switch-boss'),
        btnSwitchBossText: document.getElementById('btn-switch-boss-text'),
        survivalTimerBanner: document.getElementById('survival-timer-banner'),
        survivalCountdownDigits: document.getElementById('survival-countdown-digits')
      };

      if (this.hud.btnSwitchBoss) {
        const switchBossHandler = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          this.switchBoss();
        };
        this.hud.btnSwitchBoss.addEventListener('click', switchBossHandler);
        this.hud.btnSwitchBoss.addEventListener('touchend', switchBossHandler, { passive: false });
      }

      if (this.hud.btnStartGame) {
        const startFight = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          this.closeTutorialModal();
        };
        this.hud.btnStartGame.addEventListener('click', startFight);
        this.hud.btnStartGame.addEventListener('touchend', startFight, { passive: false });
      }

      if (this.hud.btnCloseTutorial) {
        const closeT = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          this.closeTutorialModal();
        };
        this.hud.btnCloseTutorial.addEventListener('click', closeT);
        this.hud.btnCloseTutorial.addEventListener('touchend', closeT, { passive: false });
      }

      if (this.hud.tutorialModal) {
        const backdropClick = (e) => {
          if (e.target === this.hud.tutorialModal) {
            if (e) {
              e.preventDefault();
              e.stopPropagation();
            }
            this.closeTutorialModal();
          }
        };
        this.hud.tutorialModal.addEventListener('click', backdropClick);
      }

      // Boss Select Modal event listeners
      if (this.hud.btnCloseBossSelect) {
        const closeBS = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          this.closeBossSelectModal();
        };
        this.hud.btnCloseBossSelect.addEventListener('click', closeBS);
        this.hud.btnCloseBossSelect.addEventListener('touchend', closeBS, { passive: false });
      }

      if (this.hud.bossSelectModal) {
        const backdropBSClick = (e) => {
          if (e.target === this.hud.bossSelectModal) {
            if (e) {
              e.preventDefault();
              e.stopPropagation();
            }
            this.closeBossSelectModal();
          }
        };
        this.hud.bossSelectModal.addEventListener('click', backdropBSClick);
      }

      // Delegate boss card fight buttons
      const fightBtns = document.querySelectorAll('.btn-select-fight');
      fightBtns.forEach(btn => {
        const handleFight = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          const bossId = btn.getAttribute('data-boss-id') || 'boss1';
          this.selectBossAndStartGame(bossId);
        };
        btn.addEventListener('click', handleFight);
        btn.addEventListener('touchend', handleFight, { passive: false });
      });

      // Delegate boss card view leaderboard buttons
      const viewLbBtns = document.querySelectorAll('.btn-select-lb');
      viewLbBtns.forEach(btn => {
        const handleViewLb = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          const bossId = btn.getAttribute('data-boss-id') || 'bigboss';
          this.openLeaderboardModal(null, bossId);
        };
        btn.addEventListener('click', handleViewLb);
        btn.addEventListener('touchend', handleViewLb, { passive: false });
      });

      // Leaderboard tab switcher buttons
      const lbTabBtns = document.querySelectorAll('.leaderboard-tab-btn');
      lbTabBtns.forEach(tabBtn => {
        const handleTab = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          const boss = tabBtn.getAttribute('data-boss') || 'bigboss';
          this.renderLeaderboardTable(null, boss);
        };
        tabBtn.addEventListener('click', handleTab);
        tabBtn.addEventListener('touchend', handleTab, { passive: false });
      });

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
          const targetBoss = this.currentLeaderboardBoss === 'phantom' ? 'boss2' : 'boss1';
          if (this.activeBossId !== targetBoss) {
            this.switchBoss(targetBoss);
          } else {
            this.restartGame();
          }
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

    createBossInstance(id) {
      if (id === 'boss2' && window.Boss2) {
        return new window.Boss2();
      }
      return new window.Boss();
    }

    switchBoss(bossId) {
      if (bossId) {
        this.activeBossId = bossId;
      } else {
        this.activeBossId = this.activeBossId === 'boss1' ? 'boss2' : 'boss1';
      }
      if (window.GameConfig) {
        window.GameConfig.activeBossId = this.activeBossId;
      }
      this.boss = this.createBossInstance(this.activeBossId);
      this.syncBossUI();
      this.restartGame();

      if (window.ParticleSystem) {
        window.ParticleSystem.spawnShockwave(0, 0, 160, 0.45, '#00e5ff');
      }
      if (window.SoundFX && window.SoundFX.playDash) {
        window.SoundFX.playDash();
      }
    }

    syncBossUI() {
      const isBoss2 = this.activeBossId === 'boss2';
      if (this.hud.bossNameLabel) {
        this.hud.bossNameLabel.textContent = isBoss2 ? 'PHANTOM BOSS' : 'BIGBOSS';
      }
      if (this.hud.btnSwitchBossText) {
        this.hud.btnSwitchBossText.textContent = isBoss2 ? '👑 切换关卡 1: BIGBOSS' : '👻 切换关卡 2: 幻影首领';
      }
      if (this.hud.btnSwitchBoss) {
        if (isBoss2) {
          this.hud.btnSwitchBoss.classList.add('boss2-active');
        } else {
          this.hud.btnSwitchBoss.classList.remove('boss2-active');
        }
      }
      if (this.hud.survivalTimerBanner) {
        this.hud.survivalTimerBanner.style.display = 'none';
      }
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

      if (this.hud && this.hud.survivalTimerBanner) {
        this.hud.survivalTimerBanner.style.display = 'none';
      }

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
      if (this.hud.tutorialModal) {
        this.hud.tutorialModal.classList.remove('open');
      }
      if (this.hud.bossSelectModal) {
        this.hud.bossSelectModal.classList.remove('open');
      }
      this.isTutorialOpen = false;
      this.isBossSelectOpen = false;

      this.isRunning = true;
      this.lastTime = performance.now();
    }

    openTutorialModal() {
      if (this.hud && this.hud.tutorialModal) {
        this.hud.tutorialModal.classList.add('open');
      }
      this.isTutorialOpen = true;
    }

    closeTutorialModal() {
      if (this.hud && this.hud.tutorialModal) {
        this.hud.tutorialModal.classList.remove('open');
      }
      this.isTutorialOpen = false;
      this.lastTime = performance.now();
      window.SoundFX.playDash();

      // Immediately open Boss Selection Modal!
      this.openBossSelectModal();
    }

    openBossSelectModal() {
      if (this.hud && this.hud.bossSelectModal) {
        this.hud.bossSelectModal.classList.add('open');
      }
      this.isBossSelectOpen = true;
      this.setPaused(true);
    }

    closeBossSelectModal() {
      if (this.hud && this.hud.bossSelectModal) {
        this.hud.bossSelectModal.classList.remove('open');
      }
      this.isBossSelectOpen = false;
      this.setPaused(false);
      this.isRunning = true;
      this.lastTime = performance.now();
    }

    selectBossAndStartGame(bossId) {
      const targetBoss = bossId === 'boss2' ? 'boss2' : 'boss1';
      this.closeBossSelectModal();
      if (this.activeBossId !== targetBoss) {
        this.switchBoss(targetBoss);
      } else {
        this.restartGame();
      }
      this.setPaused(false);
      this.isRunning = true;
      this.lastTime = performance.now();

      if (window.SoundManager) {
        window.SoundManager.unlockAudio();
        window.SoundManager.perfectParry();
      }
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

    async openLeaderboardModal(highlightId = null, initialBossId = null) {
      if (!this.hud.leaderboardModal) return;
      const targetBoss = initialBossId
        ? (window.StorageService ? window.StorageService.normalizeBossId(initialBossId) : initialBossId)
        : (this.activeBossId === 'boss2' ? 'phantom' : 'bigboss');
      this.currentLeaderboardBoss = targetBoss;
      this.hud.leaderboardModal.classList.add('open');
      await this.renderLeaderboardTable(highlightId, targetBoss);
    }

    syncLeaderboardTabsUI(activeBoss) {
      const norm = window.StorageService ? window.StorageService.normalizeBossId(activeBoss) : activeBoss;
      if (this.hud.tabLbBigboss) {
        if (norm === 'bigboss') {
          this.hud.tabLbBigboss.classList.add('active');
        } else {
          this.hud.tabLbBigboss.classList.remove('active');
        }
      }
      if (this.hud.tabLbPhantom) {
        if (norm === 'phantom') {
          this.hud.tabLbPhantom.classList.add('active');
        } else {
          this.hud.tabLbPhantom.classList.remove('active');
        }
      }
    }

    async renderLeaderboardTable(highlightId = null, bossId = 'bigboss') {
      const norm = window.StorageService ? window.StorageService.normalizeBossId(bossId) : bossId;
      this.currentLeaderboardBoss = norm;
      this.syncLeaderboardTabsUI(norm);

      if (!this.hud.leaderboardTableBody) return;
      this.hud.leaderboardTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color:#8b949e;">正在加载排行榜数据...</td></tr>';

      const records = window.StorageService ? await window.StorageService.loadLeaderboard(norm) : [];
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
      if (this.isBossSelectOpen) {
        if (this.hud.bossSelectModal) {
          this.hud.bossSelectModal.classList.add('open');
        }
      } else if (!this.isTutorialOpen) {
        this.setPaused(false);
        this.isRunning = true;
      }
    }

    onPlayerDeath() {
      if (this.isVictory) return;
      this.triggerScreenShake(1.4, 0.5);
      if (this.hud.resultModal && this.hud.resultTitle && this.hud.resultStats) {
        const bName = (this.boss && this.boss.name) ? this.boss.name : 'BIGBOSS';
        this.hud.resultTitle.className = 'result-title defeat';
        this.hud.resultTitle.textContent = 'DEFEAT / 战败';
        this.hud.resultStats.innerHTML = `
          ${bName} 剩余血量: ${Math.round((this.boss.hp / this.boss.maxHp) * 100)}%<br>
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
      const bName = (this.boss && this.boss.name) ? this.boss.name : 'BIGBOSS';
      this.triggerScreenShake(2.0, 0.6);
      window.SoundFX.playExplosion();
      if (window.SoundManager) {
        window.SoundManager.victoryFanfare();
      }
      window.ParticleSystem.spawnShockwave(this.boss.x, this.boss.y, 180, 0.55, '#ffcc00');
      window.ParticleSystem.spawnSparks(this.boss.x, this.boss.y, 50, '#ff3366', 2.0);
      window.ParticleSystem.spawnSparks(this.boss.x, this.boss.y, 45, '#ffcc00', 1.8);
      window.ParticleSystem.spawnDamageText(this.boss.x, this.boss.y - 20, `${bName} SLAIN!`, true, '#ffcc00');

      if (this.hud && this.hud.survivalTimerBanner) {
        this.hud.survivalTimerBanner.style.display = 'none';
      }

      // 4. Dramatic 0.5s hitstop slow-motion freeze frame
      this.triggerHitstop(0.5);

      // 5. Present VICTORY result modal safely after hitstop with speedrun submit
      setTimeout(() => {
        if (!this.isVictory) return;
        this.setPaused(true);
        if (this.hud.resultModal && this.hud.resultTitle && this.hud.resultStats) {
          const lastName = window.StorageService ? window.StorageService.getLastPlayerName() : 'CYBER_PLAYER';
          this.hud.resultTitle.className = 'result-title victory';
          this.hud.resultTitle.textContent = `🏆 VICTORY! ${bName} 击破达成`;
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
              const currentBossKey = this.activeBossId === 'boss2' ? 'phantom' : 'bigboss';
              if (window.StorageService) {
                const res = await window.StorageService.addRecord({
                  name: rawName,
                  timeMs: timeMs,
                  timeFormatted: this.finalBattleTimeFormatted,
                  combo: this.comboCount
                }, currentBossKey);
                recordId = res.newRecordId;
              }
              this.hud.resultModal.classList.remove('open');
              this.openLeaderboardModal(recordId, currentBossKey);
            };
          }

          if (viewBtn) {
            viewBtn.onclick = () => {
              this.hud.resultModal.classList.remove('open');
              const currentBossKey = this.activeBossId === 'boss2' ? 'phantom' : 'bigboss';
              this.openLeaderboardModal(null, currentBossKey);
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
      // 0. Game paused check (e.g. during Inspector open or Tutorial modal)
      if (this.isPaused || this.isTutorialOpen) {
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

      // Single Source of Truth Safety Guard: Ensure player invulnerability strictly clears if not in active Dash I-Frame
      if (this.player && !this.isVictory) {
        if (this.player.state !== window.PlayerState.DASHING || this.player.dashInvulnerableTimer <= 0) {
          this.player.dashInvulnerableTimer = 0;
          this.player.isInvulnerable = false;
        }
      }

      // 7. Update Boss (Frozen if Boss defeated / Victory)
      if (!this.isVictory && this.boss.alive) {
        this.boss.update(dt, this.player, arenaCfg);

        // Check Boss 2 Pillar Collision in P1 (bumping into pillars breaks stealth)
        if (this.boss instanceof window.Boss2 && this.boss.currentPhase === 1 && this.boss.isDrifting && this.arena) {
          for (const obs of this.arena.aliveObstacles) {
            const dist = window.Physics.dist(this.boss.x, this.boss.y, obs.x, obs.y);
            if (dist <= (this.boss.hitboxRadius + obs.radius)) {
              this.boss.breakStealthOnPillar(obs);
              break;
            }
          }
        }
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
            // Strict Rule 1: Attempting to catch forbidden red ball / uncatchable bullet triggers immediate failure penalty!
            const penaltyDamage = ball.baseDamage || 45;
            player.takeDamage(penaltyDamage);
            window.ParticleSystem.spawnDamageText(player.x, player.y - 18, '触碰违禁红球 / FORBIDDEN RED BALL!', true, '#ff1133');
            window.ParticleSystem.spawnShockwave(player.x, player.y, 70, 0.35, '#ff2233');
            window.ParticleSystem.spawnSparks(player.x, player.y, 22, '#ff1133', 1.5);
            window.SoundFX.playExplosion();
            this.triggerScreenShake(0.8, 0.25);

            // Knock player back slightly away from red ball
            const pushDir = window.Physics.normalize(player.x - ball.x, player.y - ball.y);
            player.x += pushDir.x * 24;
            player.y += pushDir.y * 24;
            player.state = window.PlayerState.NORMAL;

            // Destroy the dangerous ball on triggered explosion
            ball.alive = false;
            this.balls.splice(i, 1);
            return;
          } else {
            // Determine Perfect Parry vs Good Catch based on ball's specific catchWindowMultiplier
            const preset = ball.preset || (window.GameConfig.ball.presets && window.GameConfig.ball.presets[ball.presetKey]) || {};
            const windowMult = (preset.catchWindowMultiplier !== undefined) ? preset.catchWindowMultiplier : 1.0;
            const effectiveGoodWindow = pCfg.goodWindow * windowMult;
            const effectivePerfectWindow = pCfg.perfectWindow * windowMult;

            const elapsedCatch = pCfg.goodWindow - player.catchTimer;

            if (elapsedCatch <= effectiveGoodWindow) {
              const isPerfect = (elapsedCatch <= effectivePerfectWindow);
              player.grabBall(ball, isPerfect);
              this.balls.splice(i, 1);
              return;
            } else {
              // Missed tighter catch window for high-risk balls
              window.ParticleSystem.spawnDamageText(player.x, player.y - 14, 'TOO LATE / 判定过窄!', true, '#bd40ff');
            }
          }
        }

        // Case B: Player is DASHING with I-frames
        if (player.state === window.PlayerState.DASHING && player.isInvulnerable && player.dashInvulnerableTimer > 0) {
          // Dash-Catch Dynamic: Both Catch and Dash can catch catchable balls (white/purple)!
          if (ball.canDirectCatch && !ball.isMinion && dist <= 50) {
            player.grabBall(ball, true); // Dashing into catchable ball counts as parry catch!
            this.balls.splice(i, 1);
            return;
          }

          // Rule 2: Dash I-frames safely penetrate through uncatchable red balls & minion barrages!
          if (dist <= 35 && !this.bulletTimeTimer) {
            this.triggerBulletTime(pCfg.bulletTimeDuration * 0.8);
            window.ParticleSystem.spawnDamageText(player.x, player.y, 'WITCH TIME / 极限闪避!', true, '#ffcc00');
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
      const isBoss2 = this.activeBossId === 'boss2' || (boss instanceof window.Boss2);
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
      if (this.hud.bossNameLabel) {
        this.hud.bossNameLabel.textContent = boss.name || (isBoss2 ? 'PHANTOM BOSS' : 'BIGBOSS');
      }

      // Boss Phase Notches
      const bCfg = isBoss2 && window.GameConfig.boss2 ? window.GameConfig.boss2 : window.GameConfig.boss;
      if (this.hud.notchP2 && bCfg.phase2) {
        this.hud.notchP2.style.left = `${bCfg.phase2.thresholdMax * 100}%`;
      }
      if (this.hud.notchP3 && bCfg.phase3) {
        this.hud.notchP3.style.left = `${bCfg.phase3.thresholdMax * 100}%`;
      }

      // Boss Status Subtext (Phase Transition / P3 Shield / Exposed / Phantom states)
      if (this.hud.bossStatusSubtext) {
        if (!boss.alive || this.isVictory) {
          this.hud.bossStatusSubtext.style.display = 'none';
        } else if (boss.phaseTransitionTimer > 0) {
          this.hud.bossStatusSubtext.style.display = 'block';
          this.hud.bossStatusSubtext.textContent = `⚡ PHASE SHIFT / INVULNERABLE (${boss.phaseTransitionTimer.toFixed(1)}s)`;
          this.hud.bossStatusSubtext.style.color = '#00e5ff';
        } else if (isBoss2) {
          this.hud.bossStatusSubtext.style.display = 'block';
          if (boss.currentPhase === 1) {
            if (boss.isRevealed) {
              this.hud.bossStatusSubtext.textContent = `🎯 REVEALED / 破隐现身 (${boss.revealTimer.toFixed(1)}s) 抓紧反击!`;
              this.hud.bossStatusSubtext.style.color = '#00e5ff';
            } else {
              this.hud.bossStatusSubtext.textContent = '👻 STEALTH DRIFT / 潜行漂移中 (引诱撞柱破隐!)';
              this.hud.bossStatusSubtext.style.color = '#bd40ff';
            }
          } else if (boss.currentPhase === 2) {
            if (boss.p2State === 'STUNNED') {
              this.hud.bossStatusSubtext.textContent = `💥 WALL STUNNED / 撞墙硬直 (${boss.p2StateTimer.toFixed(1)}s) 全力反击!`;
              this.hud.bossStatusSubtext.style.color = '#00ffaa';
            } else if (boss.p2State === 'CHARGING') {
              this.hud.bossStatusSubtext.textContent = '⚡ HIGH-SPEED CHARGE / 极速冲撞! 引诱撞墙!';
              this.hud.bossStatusSubtext.style.color = '#ff3366';
            } else if (boss.p2State === 'CHARGE_TELEGRAPH') {
              this.hud.bossStatusSubtext.textContent = '⚠️ CHARGE TELEGRAPH / 蓄力预警! 准备闪避!';
              this.hud.bossStatusSubtext.style.color = '#ffaa00';
            } else {
              this.hud.bossStatusSubtext.textContent = '🎯 READY TO CHARGE / 寻找冲撞时机';
              this.hud.bossStatusSubtext.style.color = '#88aaff';
            }
          } else if (boss.currentPhase === 3) {
            this.hud.bossStatusSubtext.textContent = `⚠️ SURVIVAL OVERLOAD / 弹幕自爆倒计时 (${boss.survivalTimer.toFixed(1)}s)!`;
            this.hud.bossStatusSubtext.style.color = '#ff3366';
          }
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

      // Survival Timer Banner in HUD for Boss 2 Phase 3
      if (this.hud.survivalTimerBanner) {
        if (isBoss2 && boss.currentPhase === 3 && boss.alive && !this.isVictory) {
          this.hud.survivalTimerBanner.style.display = 'inline-flex';
          if (this.hud.survivalCountdownDigits) {
            this.hud.survivalCountdownDigits.textContent = (boss.survivalTimer || 0).toFixed(1) + 's';
          }
        } else {
          this.hud.survivalTimerBanner.style.display = 'none';
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
