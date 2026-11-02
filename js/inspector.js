/**
 * Project: Dodgeball Boss Rush
 * File: js/inspector.js
 * Description: Design Inspector Panel UI Controller.
 * Provides real-time bidirectional binding to GameConfig for all 4 controllers:
 * Controller A (Player & Combo & Camera), Controller B (Ball Property & Presets),
 * Controller C (Arena & Obstacles), Controller D (Boss & Attack Patterns),
 * plus JSON Import/Export and Preset Switches with zero latency.
 */

(function(window) {
  'use strict';

  class DesignInspector {
    constructor() {
      this.currentTab = 'tab-player';
      this.bodyMomentumAnimId = null;
      this.tabsMomentumAnimId = null;
      this.initUI();
    }

    initUI() {
      // Toggle sidebar panel
      const toggleBtn = document.getElementById('inspector-toggle-btn');
      const panel = document.getElementById('inspector-panel');
      const closeBtn = document.getElementById('inspector-close-btn');
      const pauseBtn = document.getElementById('inspector-pause-btn');

      // Guarantee inspector starts completely closed on load
      if (panel) {
        panel.classList.add('collapsed');
      }

      if (toggleBtn && panel) {
        toggleBtn.addEventListener('click', () => {
          const isCollapsed = panel.classList.toggle('collapsed');
          // When opening inspector, pause game; when closing, resume!
          if (window.Game) {
            window.Game.setPaused(!isCollapsed);
          }
        });
      }
      if (closeBtn && panel) {
        closeBtn.addEventListener('click', () => {
          panel.classList.add('collapsed');
          if (window.Game) {
            window.Game.setPaused(false);
          }
        });
      }
      if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
          if (window.Game) {
            window.Game.togglePause();
          }
        });
      }

      // Tab switching
      const tabButtons = document.querySelectorAll('.tab-btn');
      tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          tabButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentTab = btn.getAttribute('data-tab');
          this.renderTabContent(this.currentTab);
        });
      });

      // Footer actions: Export JSON, Import JSON, Reset Defaults
      const btnExport = document.getElementById('btn-export-json');
      const btnImport = document.getElementById('btn-import-json');
      const btnReset = document.getElementById('btn-reset-params');
      const modal = document.getElementById('json-modal');
      const modalTextarea = document.getElementById('json-textarea');
      const modalClose = document.getElementById('modal-close-btn');
      const modalApply = document.getElementById('modal-apply-btn');
      const modalCopy = document.getElementById('modal-copy-btn');

      if (btnExport && modal && modalTextarea) {
        btnExport.addEventListener('click', () => {
          modalTextarea.value = window.GameConfig.exportJSON();
          modal.classList.add('open');
          modalApply.style.display = 'none';
          modalCopy.style.display = 'inline-block';
        });
      }

      if (btnImport && modal && modalTextarea) {
        btnImport.addEventListener('click', () => {
          modalTextarea.value = '';
          modal.classList.add('open');
          modalApply.style.display = 'inline-block';
          modalCopy.style.display = 'none';
        });
      }

      if (modalClose && modal) {
        modalClose.addEventListener('click', () => modal.classList.remove('open'));
      }

      if (modalCopy && modalTextarea) {
        modalCopy.addEventListener('click', () => {
          modalTextarea.select();
          document.execCommand('copy');
          alert('配置已成功复制到剪贴板！');
        });
      }

      if (modalApply && modalTextarea && modal) {
        modalApply.addEventListener('click', () => {
          const res = window.GameConfig.importJSON(modalTextarea.value);
          if (res.success) {
            alert('配置导入成功！参数已即时生效。');
            modal.classList.remove('open');
            this.renderTabContent(this.currentTab);
          } else {
            alert('导入失败：' + res.error);
          }
        });
      }

      if (btnReset) {
        btnReset.addEventListener('click', () => {
          if (confirm('确定要将所有策划参数恢复为初始默认值吗？')) {
            window.GameConfig.reset();
            this.renderTabContent(this.currentTab);
          }
        });
      }

      // Top Quick Actions: Save config.json, Copy config JSON, Export leaderboard.json
      const btnSaveConfigFile = document.getElementById('btn-save-config-file');
      const btnCopyConfigJson = document.getElementById('btn-copy-config-json');
      const btnExportLeaderboard = document.getElementById('btn-export-leaderboard-file');

      if (btnSaveConfigFile) {
        btnSaveConfigFile.addEventListener('click', async () => {
          if (window.StorageService) {
            const res = await window.StorageService.exportConfigFile();
            if (res && res.success) {
              if (window.showGameToast) {
                window.showGameToast('💾 已成功导出/保存 config.json！');
              } else {
                alert('💾 已成功导出/保存 config.json！');
              }
            }
          }
        });
      }

      if (btnCopyConfigJson) {
        btnCopyConfigJson.addEventListener('click', async () => {
          if (window.StorageService) {
            const ok = await window.StorageService.copyConfigToClipboard();
            if (ok) {
              if (window.showGameToast) {
                window.showGameToast('📋 完整配置 JSON 已复制并打印到控制台！');
              } else {
                alert('📋 完整配置 JSON 已复制到剪贴板！控制台亦已打印输出。');
              }
            }
          }
        });
      }

      if (btnExportLeaderboard) {
        btnExportLeaderboard.addEventListener('click', async () => {
          if (window.StorageService) {
            const res = await window.StorageService.exportLeaderboardFile();
            if (res && res.success) {
              if (window.showGameToast) {
                window.showGameToast('📤 已导出最新 leaderboard.json 文件！');
              } else {
                alert('📤 已导出最新 leaderboard.json 文件！');
              }
            }
          }
        });
      }

      // Initialize touch scrolling with rotation support
      this.initTouchScroll();
      this.initTabsTouchScroll();

      // Initial tab render
      this.renderTabContent('tab-player');
    }

    getTouchCoords(touch) {
      if (window.Game && window.Game.input && typeof window.Game.input.toGameCoords === 'function') {
        return window.Game.input.toGameCoords(touch.clientX, touch.clientY);
      }
      const app = document.getElementById('app-container');
      const isRotated = app && app.classList.contains('rotate-landscape');
      if (isRotated) {
        return {
          x: touch.clientY,
          y: window.innerWidth - touch.clientX
        };
      }
      return {
        x: touch.clientX,
        y: touch.clientY
      };
    }

    initTouchScroll() {
      const body = document.getElementById('inspector-body');
      if (!body) return;

      let isTouching = false;
      let startCoords = { x: 0, y: 0 };
      let lastCoords = { x: 0, y: 0 };
      let isScrolling = false;
      let isSliderTarget = false;
      let touchSamples = [];

      body.addEventListener('touchstart', (e) => {
        if (this.bodyMomentumAnimId) {
          cancelAnimationFrame(this.bodyMomentumAnimId);
          this.bodyMomentumAnimId = null;
        }
        if (!e.touches || e.touches.length === 0) return;
        const touch = e.touches[0];
        startCoords = this.getTouchCoords(touch);
        lastCoords = { ...startCoords };
        isTouching = true;
        isScrolling = false;

        const target = e.target;
        isSliderTarget = Boolean(target && target.tagName === 'INPUT' && target.type === 'range');

        touchSamples = [{ y: startCoords.y, time: performance.now() }];
      }, { passive: true });

      body.addEventListener('touchmove', (e) => {
        if (!isTouching || !e.touches || e.touches.length === 0) return;
        const touch = e.touches[0];
        const coords = this.getTouchCoords(touch);
        const dx = coords.x - startCoords.x;
        const dy = coords.y - startCoords.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (isSliderTarget && !isScrolling) {
          // If gesture is clearly vertical, switch to scrolling the panel
          if (absDy > absDx && absDy > 8) {
            isScrolling = true;
            isSliderTarget = false;
          } else {
            return;
          }
        } else if (!isScrolling) {
          if (absDy > 5 || absDx > 5) {
            if (absDy >= absDx) {
              isScrolling = true;
            }
          }
        }

        if (isScrolling) {
          if (e.cancelable) {
            e.preventDefault();
          }
          const deltaY = coords.y - lastCoords.y;
          body.scrollTop -= deltaY;

          const now = performance.now();
          touchSamples.push({ y: coords.y, time: now });
          if (touchSamples.length > 5) {
            touchSamples.shift();
          }
        }

        lastCoords = { ...coords };
      }, { passive: false });

      const onTouchEnd = () => {
        if (!isTouching) return;
        isTouching = false;

        if (isScrolling && touchSamples.length >= 2) {
          const first = touchSamples[0];
          const last = touchSamples[touchSamples.length - 1];
          const dt = last.time - first.time;
          if (dt > 10 && dt < 300) {
            let v = (last.y - first.y) / dt;
            v = Math.max(-2.2, Math.min(2.2, v));

            if (Math.abs(v) > 0.08) {
              let currentVelocity = v;
              const friction = 0.94;
              let lastTime = performance.now();

              const step = () => {
                const now = performance.now();
                const frameDt = Math.min(32, now - lastTime);
                lastTime = now;

                body.scrollTop -= currentVelocity * frameDt;
                currentVelocity *= Math.pow(friction, frameDt / 16.67);

                const maxScroll = body.scrollHeight - body.clientHeight;
                if (Math.abs(currentVelocity) > 0.02 && body.scrollTop > 0 && body.scrollTop < maxScroll) {
                  this.bodyMomentumAnimId = requestAnimationFrame(step);
                } else {
                  this.bodyMomentumAnimId = null;
                }
              };

              this.bodyMomentumAnimId = requestAnimationFrame(step);
            }
          }
        }

        isScrolling = false;
        isSliderTarget = false;
      };

      body.addEventListener('touchend', onTouchEnd, { passive: true });
      body.addEventListener('touchcancel', onTouchEnd, { passive: true });
    }

    initTabsTouchScroll() {
      const tabs = document.querySelector('.inspector-tabs');
      if (!tabs) return;

      let isTouching = false;
      let startCoords = { x: 0, y: 0 };
      let lastCoords = { x: 0, y: 0 };
      let isScrolling = false;
      let hasDragged = false;
      let touchSamples = [];

      tabs.addEventListener('touchstart', (e) => {
        if (this.tabsMomentumAnimId) {
          cancelAnimationFrame(this.tabsMomentumAnimId);
          this.tabsMomentumAnimId = null;
        }
        if (!e.touches || e.touches.length === 0) return;
        const touch = e.touches[0];
        startCoords = this.getTouchCoords(touch);
        lastCoords = { ...startCoords };
        isTouching = true;
        isScrolling = false;
        hasDragged = false;
        touchSamples = [{ x: startCoords.x, time: performance.now() }];
      }, { passive: true });

      tabs.addEventListener('touchmove', (e) => {
        if (!isTouching || !e.touches || e.touches.length === 0) return;
        const touch = e.touches[0];
        const coords = this.getTouchCoords(touch);
        const dx = coords.x - startCoords.x;
        const dy = coords.y - startCoords.y;

        if (!isScrolling && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
          if (Math.abs(dx) > Math.abs(dy)) {
            isScrolling = true;
            hasDragged = true;
          }
        }

        if (isScrolling) {
          if (e.cancelable) e.preventDefault();
          const deltaX = coords.x - lastCoords.x;
          tabs.scrollLeft -= deltaX;

          const now = performance.now();
          touchSamples.push({ x: coords.x, time: now });
          if (touchSamples.length > 5) touchSamples.shift();
        }

        lastCoords = { ...coords };
      }, { passive: false });

      const onTouchEnd = () => {
        if (!isTouching) return;
        isTouching = false;

        if (isScrolling && touchSamples.length >= 2) {
          const first = touchSamples[0];
          const last = touchSamples[touchSamples.length - 1];
          const dt = last.time - first.time;
          if (dt > 10 && dt < 300) {
            let v = (last.x - first.x) / dt;
            v = Math.max(-2.2, Math.min(2.2, v));
            if (Math.abs(v) > 0.08) {
              let currentVelocity = v;
              const friction = 0.94;
              let lastTime = performance.now();

              const step = () => {
                const now = performance.now();
                const frameDt = Math.min(32, now - lastTime);
                lastTime = now;

                tabs.scrollLeft -= currentVelocity * frameDt;
                currentVelocity *= Math.pow(friction, frameDt / 16.67);

                const maxScroll = tabs.scrollWidth - tabs.clientWidth;
                if (Math.abs(currentVelocity) > 0.02 && tabs.scrollLeft > 0 && tabs.scrollLeft < maxScroll) {
                  this.tabsMomentumAnimId = requestAnimationFrame(step);
                } else {
                  this.tabsMomentumAnimId = null;
                }
              };

              this.tabsMomentumAnimId = requestAnimationFrame(step);
            }
          }
        }
        isScrolling = false;
      };

      tabs.addEventListener('touchend', onTouchEnd, { passive: true });
      tabs.addEventListener('touchcancel', onTouchEnd, { passive: true });

      tabs.addEventListener('click', (e) => {
        if (hasDragged) {
          e.stopPropagation();
          e.preventDefault();
          hasDragged = false;
        }
      }, true);
    }

    renderTabContent(tabId) {
      if (this.bodyMomentumAnimId) {
        cancelAnimationFrame(this.bodyMomentumAnimId);
        this.bodyMomentumAnimId = null;
      }
      const container = document.getElementById('inspector-body');
      if (!container) return;
      container.innerHTML = '';
      container.scrollTop = 0;

      switch (tabId) {
        case 'tab-player':
          this.buildControllerA(container);
          break;
        case 'tab-ball':
          this.buildControllerB(container);
          break;
        case 'tab-arena':
          this.buildControllerC(container);
          break;
        case 'tab-boss':
          this.buildControllerD(container);
          break;
        case 'tab-audio':
          this.buildControllerE(container);
          break;
        default:
          break;
      }
    }

    // -------------------------------------------------------------
    // 控制器 A: 玩家、镜头与连击系统 (Player & Combo & Camera)
    // -------------------------------------------------------------
    buildControllerA(container) {
      const p = window.GameConfig.player;
      const c = window.GameConfig.combo;
      const cam = window.GameConfig.camera;
      const inp = window.GameConfig.input;

      // Group 1: 玩家基础与移动
      const g1 = this.createGroup('玩家基础属性与移动 (Player Movement)');
      this.addSlider(g1, '最大生命值 (Max HP)', p.maxHp, 50, 300, 10, val => {
        window.GameConfig.set('player.maxHp', val);
        window.Game.player.maxHp = val;
        window.Game.player.hp = Math.min(window.Game.player.hp, val);
      });
      this.addSlider(g1, '移动速度 (Move Speed)', p.moveSpeed, 150, 600, 10, val => {
        window.GameConfig.set('player.moveSpeed', val);
      });
      container.appendChild(g1);

      // Group 2: 接球与弹反判定窗
      const g2 = this.createGroup('接球 / 弹反判定 (Catch & Parry Window)');
      this.addToggle(g2, '接球独立冷却开关 (Catch CD Enabled)', p.catchCooldownEnabled, checked => {
        window.GameConfig.set('player.catchCooldownEnabled', checked);
      });
      this.addSlider(g2, '接球冷却时长 (Catch CD Time)', p.catchCooldown, 0.1, 3.0, 0.1, val => {
        window.GameConfig.set('player.catchCooldown', val);
      }, 's');
      this.addSlider(g2, '完美弹反窗口 (Perfect Window)', p.perfectWindow * 1000, 40, 200, 10, val => {
        window.GameConfig.set('player.perfectWindow', val / 1000);
      }, 'ms');
      this.addSlider(g2, '普通接球窗口 (Good Window)', p.goodWindow * 1000, 150, 500, 10, val => {
        window.GameConfig.set('player.goodWindow', val / 1000);
      }, 'ms');
      this.addSlider(g2, '子弹时间倍率 (Bullet Time Scale)', p.bulletTimeScale, 0.05, 0.50, 0.05, val => {
        window.GameConfig.set('player.bulletTimeScale', val);
      }, 'x');
      this.addSlider(g2, '子弹时间时长 (Bullet Time Duration)', p.bulletTimeDuration, 0.5, 4.0, 0.1, val => {
        window.GameConfig.set('player.bulletTimeDuration', val);
      }, 's');
      container.appendChild(g2);

      // Group 2.5: 接球挥空惩罚调优 (Catch Whiff Penalty)
      const gWhiff = this.createGroup('接球挥空惩罚调优 (Catch Whiff Penalty)');
      this.addToggle(gWhiff, '挥空减速开关 (Whiff Slowdown Switch)', p.whiffSlowdownEnabled !== false, checked => {
        window.GameConfig.set('player.whiffSlowdownEnabled', checked);
      });
      this.addSlider(gWhiff, '挥空移速保留比例 (Whiff Slowdown Multiplier)', p.whiffSlowdownMultiplier !== undefined ? p.whiffSlowdownMultiplier : 0.4, 0.0, 1.0, 0.05, val => {
        window.GameConfig.set('player.whiffSlowdownMultiplier', val);
      }, 'x');
      this.addSlider(gWhiff, '挥空减速持续时长 (Whiff Slowdown Duration)', p.whiffSlowdownDuration !== undefined ? p.whiffSlowdownDuration : 0.35, 0.05, 1.0, 0.05, val => {
        window.GameConfig.set('player.whiffSlowdownDuration', val);
      }, 's');
      this.addToggle(gWhiff, '闪避取消挥空硬直 (Dash Cancels Whiff)', p.dashCancelsWhiff !== false, checked => {
        window.GameConfig.set('player.dashCancelsWhiff', checked);
      });
      container.appendChild(gWhiff);

      // Group 3: 闪避与无敌帧
      const g3 = this.createGroup('闪避与无敌帧 (Dash & I-Frames)');
      this.addToggle(g3, '闪避独立冷却开关 (Dash CD Enabled)', p.dashCooldownEnabled, checked => {
        window.GameConfig.set('player.dashCooldownEnabled', checked);
      });
      this.addSlider(g3, '闪避冷却时长 (Dash CD Time)', p.dashCooldown, 0.1, 3.0, 0.1, val => {
        window.GameConfig.set('player.dashCooldown', val);
      }, 's');
      this.addSlider(g3, '闪避位移距离 (Dash Distance)', p.dashDistance, 80, 400, 10, val => {
        window.GameConfig.set('player.dashDistance', val);
      }, 'px');
      this.addSlider(g3, '无敌帧时长 (I-Frame Duration)', p.dashIFrameDuration * 1000, 50, 500, 10, val => {
        window.GameConfig.set('player.dashIFrameDuration', val / 1000);
      }, 'ms');
      container.appendChild(g3);

      // Group 4: 连击倍率系统
      const g4 = this.createGroup('连击系统 (Combo Multiplier)');
      this.addSlider(g4, '断连重置时间 (Combo Reset Timer)', c.resetTimer, 1.0, 10.0, 0.5, val => {
        window.GameConfig.set('combo.resetTimer', val);
      }, 's');
      this.addSlider(g4, '单次命中递增 (Base Combo Mult)', c.baseMultiplier * 100, 5, 50, 5, val => {
        window.GameConfig.set('combo.baseMultiplier', val / 100);
      }, '%/Hit');
      this.addSlider(g4, '连击倍率上限 (Max Combo Cap)', c.maxCap, 1.5, 5.0, 0.1, val => {
        window.GameConfig.set('combo.maxCap', val);
      }, 'x');
      container.appendChild(g4);

      // Group 5: 瞄准手感与阻尼调优
      const g5 = this.createGroup('瞄准手感与阻尼调优 (Aim Damping & Feel)');
      this.addSlider(g5, '瞄准平滑阻尼 (Aim Smoothing)', inp.aimSmoothing !== undefined ? inp.aimSmoothing : 0.35, 0.05, 1.0, 0.05, val => {
        window.GameConfig.set('input.aimSmoothing', val);
      }, ' (越小越稳)');
      this.addSlider(g5, '瞄准灵敏度 (Aim Sensitivity)', inp.aimSensitivity !== undefined ? inp.aimSensitivity : 1.0, 0.2, 2.5, 0.1, val => {
        window.GameConfig.set('input.aimSensitivity', val);
      }, 'x');
      this.addSlider(g5, '瞄准起步死区 (Aim Deadzone)', inp.aimDeadzone || 16, 5, 50, 1, val => {
        window.GameConfig.set('input.aimDeadzone', val);
      }, 'px');
      this.addSelect(g5, '瞄准角度吸附 (Angle Snap)', (inp.aimAngleSnap || 0).toString(), [
        { label: '自由连续角度 (0° Free Continuous)', value: '0' },
        { label: '5° 微度吸附 (5° Micro Snap)', value: '5' },
        { label: '10° 步进吸附 (10° Step Snap)', value: '10' },
        { label: '15° 档位吸附 (15° Notch Snap)', value: '15' },
        { label: '22.5° 八方向吸附 (22.5° 8-Way Snap)', value: '22.5' }
      ], val => {
        window.GameConfig.set('input.aimAngleSnap', parseFloat(val));
      });
      this.addToggle(g5, '反向弹弓拉拽瞄准 (Inverted Slingshot Aim)', inp.invertedAimDrag, checked => {
        window.GameConfig.set('input.invertedAimDrag', checked);
      });
      container.appendChild(g5);

      // Group 6: 镜头与系统设置
      const g6 = this.createGroup('镜头与系统设置 (Camera & System)');
      this.addSlider(g6, '全局镜头缩放 (Camera Zoom)', cam.zoom, 0.6, 1.8, 0.05, val => {
        window.GameConfig.set('camera.zoom', val);
      }, 'x');
      this.addSlider(g6, '屏幕震动强度 (Screen Shake)', cam.screenShakeIntensity, 0.1, 3.0, 0.1, val => {
        window.GameConfig.set('camera.screenShakeIntensity', val);
      });
      this.addToggle(g6, '子弹时间动态推近 (Dynamic Zoom on BT)', cam.dynamicZoomOnBulletTime, checked => {
        window.GameConfig.set('camera.dynamicZoomOnBulletTime', checked);
      });
      this.addSelect(g6, '双端输入模式强制切换 (Input Device)', inp.inputMode, [
        { label: '自动检测 (Auto Detect)', value: 'auto' },
        { label: '强制 PC 键鼠模式 (PC Keyboard/Mouse)', value: 'pc' },
        { label: '强制移动端触屏 (Virtual Touch)', value: 'touch' }
      ], val => {
        window.GameConfig.set('input.inputMode', val);
      });
      this.addSelect(g6, '移动端横竖屏显示 (Mobile Screen Orientation)', inp.orientationMode || 'auto', [
        { label: '自动横屏 (默认横屏 Landscape Default)', value: 'auto' },
        { label: '强制横屏旋转 (Force 90° Landscape)', value: 'landscape' },
        { label: '保持原始竖屏 (Natural Portrait)', value: 'portrait' }
      ], val => {
        window.GameConfig.set('input.orientationMode', val);
        if (window.Game && window.Game.input) {
          window.Game.input.forceOrientation = val;
          window.Game.input.checkOrientation();
        }
      });
      container.appendChild(g6);
    }

    // -------------------------------------------------------------
    // 控制器 B: 球体属性统一控件 (Ball Property Inspector)
    // -------------------------------------------------------------
    buildControllerB(container) {
      const ball = window.GameConfig.ball;
      const activeKey = ball.activePreset;
      const preset = window.GameConfig.getActiveBallPreset();

      // Preset Selector Dropdown
      const gPreset = this.createGroup('球体预设切换 (Ball Preset Selection)');
      this.addSelect(gPreset, '当前调试预设', activeKey, [
        { label: 'Preset 1: 标准白球 (Balanced)', value: 'preset1' },
        { label: 'Preset 2: 重型红球 (Heavy & Explosive)', value: 'preset2' },
        { label: 'Preset 3: 弧线紫球 (Curve Sine Wave)', value: 'preset3' },
        { label: 'Custom: 自定义球体', value: 'custom' }
      ], val => {
        window.GameConfig.set('ball.activePreset', val);
        this.renderTabContent('tab-ball');
      });
      container.appendChild(gPreset);

      // Group 1: 基础物理与弹道
      const g1 = this.createGroup(`基础物理与飞行 (${preset.name})`);
      this.addSlider(g1, '球体初速度 (Ball Speed)', preset.speed, 100, 800, 20, val => {
        preset.speed = val;
      }, 'px/s');
      this.addSlider(g1, '最高球速安全上限 (Max Speed Cap)', ball.maxSpeedCap !== undefined ? ball.maxSpeedCap : 1200, 400, 2400, 50, val => {
        window.GameConfig.set('ball.maxSpeedCap', val);
      }, 'px/s');
      this.addSlider(g1, '玩家投出速度倍率 (Player Throw Mult)', preset.playerThrowSpeedMultiplier, 1.0, 3.0, 0.1, val => {
        preset.playerThrowSpeedMultiplier = val;
      }, 'x');
      this.addSlider(g1, '球体半径 (Ball Radius)', preset.radius, 8, 30, 1, val => {
        preset.radius = val;
      }, 'px');
      this.addSlider(g1, '基础伤害 (Base Damage)', preset.baseDamage, 5, 120, 5, val => {
        preset.baseDamage = val;
      });
      this.addSelect(g1, '飞行弹道类型 (Trajectory Type)', preset.trajectoryType, [
        { label: '直线 (Straight)', value: 'straight' },
        { label: '正弦弧线 (Sine Wave)', value: 'sine' },
        { label: '弱追踪微调 (Weak Homing)', value: 'homing' }
      ], val => {
        preset.trajectoryType = val;
      });
      container.appendChild(g1);

      // Group 2: 接球与手持规则
      const g2 = this.createGroup('接球与手持自爆规则 (Catch & Overheat)');
      this.addToggle(g2, '允许途中直接接球 (Can Direct Catch)', preset.canDirectCatch, checked => {
        preset.canDirectCatch = checked;
      });
      this.addToggle(g2, '手持自爆开关 (Overheat Explode)', preset.overheatExplodeEnabled, checked => {
        preset.overheatExplodeEnabled = checked;
      });
      this.addSlider(g2, '手持自爆倒计时 (Overheat Timer)', preset.overheatTimer, 0.8, 5.0, 0.2, val => {
        preset.overheatTimer = val;
      }, 's');
      container.appendChild(g2);

      // Group 3: 版边墙壁交互属性
      const g3 = this.createGroup('版边（墙壁）交互属性 (Wall Interaction)');
      this.addSelect(g3, '碰撞版边行为 (Boundary Mode)', preset.boundaryMode, [
        { label: '反弹无损速 (Bounce on Wall)', value: 'bounce' },
        { label: '碰撞瞬间范围爆炸 (Explode on Wall)', value: 'explode' },
        { label: '直接穿透销毁 (Pass Through)', value: 'pass' }
      ], val => {
        preset.boundaryMode = val;
      });
      this.addSlider(g3, '最大反弹次数 (Max Wall Bounces)', preset.maxWallBounces, 0, 8, 1, val => {
        preset.maxWallBounces = val;
      }, '次');
      this.addSlider(g3, '墙壁爆炸半径 (AOE Radius)', preset.wallAoeRadius, 40, 250, 10, val => {
        preset.wallAoeRadius = val;
      }, 'px');
      container.appendChild(g3);

      // Group 4: 击中回弹与连击落地
      const g4 = this.createGroup('击中回弹与二次拾取 (Rebound on Hit)');
      this.addToggle(g4, '击中回弹总开关 (Rebound on Hit)', preset.reboundOnHit, checked => {
        preset.reboundOnHit = checked;
      });
      this.addSelect(g4, '回弹角度模式 (Rebound Angle Mode)', preset.reboundAngleMode, [
        { label: '物理反射 (Reflection)', value: 'reflection' },
        { label: '固定偏转 (Refraction)', value: 'refraction' },
        { label: '随机扇区 (Random)', value: 'random' }
      ], val => {
        preset.reboundAngleMode = val;
      });
      this.addSlider(g4, '角度偏移/随机范围 (Angle Variance)', preset.reboundAngleVariance, 0, 90, 5, val => {
        preset.reboundAngleVariance = val;
      }, '°');
      this.addSlider(g4, '回弹落地距离 (Rebound Distance)', preset.reboundDistance, 80, 450, 10, val => {
        preset.reboundDistance = val;
      }, 'px');
      this.addSlider(g4, '回弹抛物线弧度 (Rebound Arc Height)', preset.reboundArcHeight, 20, 120, 5, val => {
        preset.reboundArcHeight = val;
      }, 'px');
      container.appendChild(g4);

      // Group 5: 地面落球限时消失机制 (Grounded Ball Lifetime)
      const g5 = this.createGroup('地面落球限时消失机制 (Grounded Ball Lifetime)');
      this.addToggle(g5, '地面限时消失开关 (Ground Lifetime Switch)', ball.groundLifetimeEnabled !== false, checked => {
        window.GameConfig.set('ball.groundLifetimeEnabled', checked);
      });
      this.addSlider(g5, '地面停留秒数 (Ground Lifetime Duration)', ball.groundLifetimeDuration !== undefined ? ball.groundLifetimeDuration : 4.0, 1.0, 15.0, 0.5, val => {
        window.GameConfig.set('ball.groundLifetimeDuration', val);
      }, 's');
      container.appendChild(g5);

      // Group 6: 同屏与留存管控 (Retention & Caps)
      const g6 = this.createGroup('同屏与留存管控 (Retention & Caps)');
      this.addSlider(g6, '地面落球上限 (Max Grounded Balls)', ball.maxGroundedBalls !== undefined ? ball.maxGroundedBalls : 2, 1, 5, 1, val => {
        window.GameConfig.set('ball.maxGroundedBalls', val);
      }, '颗');
      this.addSlider(g6, '存活核心球上限 (Max Active Core Balls)', ball.maxActiveCoreBalls !== undefined ? ball.maxActiveCoreBalls : 3, 1, 6, 1, val => {
        window.GameConfig.set('ball.maxActiveCoreBalls', val);
      }, '颗');
      this.addToggle(g6, '仅击中Boss产生落球 (Only Player Thrown Drops)', ball.onlyPlayerThrownBallsDrop !== false, checked => {
        window.GameConfig.set('ball.onlyPlayerThrownBallsDrop', checked);
      });
      container.appendChild(g6);
    }

    // -------------------------------------------------------------
    // 控制器 C: 竞技场、灯光与障碍物 (Arena & Environment Inspector)
    // -------------------------------------------------------------
    buildControllerC(container) {
      const a = window.GameConfig.arena;

      // Group 1: 场地几何属性
      const g1 = this.createGroup('场地几何与 2.5D 视角 (Arena Geometry & 2.5D)');
      this.addSelect(g1, '场地形状 (Arena Shape)', a.shape, [
        { label: '矩形 (Rectangle)', value: 'rectangle' },
        { label: '圆形 (Circle)', value: 'circle' },
        { label: '八边形 (Octagon)', value: 'octagon' }
      ], val => {
        window.GameConfig.set('arena.shape', val);
      });
      this.addSlider(g1, '场地宽度 (Arena Width)', a.width, 600, 1400, 20, val => {
        window.GameConfig.set('arena.width', val);
      }, 'px');
      this.addSlider(g1, '场地高度 (Arena Height)', a.height, 400, 900, 20, val => {
        window.GameConfig.set('arena.height', val);
      }, 'px');
      this.addSlider(g1, '圆形半径 (Circle Radius)', a.radius, 250, 600, 10, val => {
        window.GameConfig.set('arena.radius', val);
      }, 'px');
      this.addSlider(g1, '伪 45° 纵向压扁系数 (Y-Scale)', a.perspectiveYScale, 0.5, 1.0, 0.05, val => {
        window.GameConfig.set('arena.perspectiveYScale', val);
      });
      container.appendChild(g1);

      // Group 2: 灯光与阴影
      const g2 = this.createGroup('灯光氛围与光晕 (Lighting & Vibe)');
      this.addToggle(g2, '实体发光光晕 (Glow Enabled)', a.glowEnabled, checked => {
        window.GameConfig.set('arena.glowEnabled', checked);
      });
      this.addSlider(g2, '光晕强度 (Glow Intensity)', a.glowIntensity, 0.2, 2.5, 0.1, val => {
        window.GameConfig.set('arena.glowIntensity', val);
      }, 'x');
      this.addSlider(g2, '地面阴影透明度 (Shadow Opacity)', a.shadowOpacity, 0.0, 0.9, 0.05, val => {
        window.GameConfig.set('arena.shadowOpacity', val);
      });
      container.appendChild(g2);

      // Group 3: 场地障碍物生成器
      const g3 = this.createGroup('场地障碍物生成器 (Obstacles Manager)');
      this.addSlider(g3, '障碍物数量 (Obstacle Count)', a.obstacleCount, 0, 8, 1, val => {
        window.GameConfig.set('arena.obstacleCount', val);
      });
      this.addSlider(g3, '障碍物柱体大小 (Size)', a.obstacleSize, 20, 70, 2, val => {
        window.GameConfig.set('arena.obstacleSize', val);
      }, 'px');
      this.addToggle(g3, '可被球砸碎 (Destructible)', a.obstacleDestructible, checked => {
        window.GameConfig.set('arena.obstacleDestructible', checked);
      });
      this.addSlider(g3, '障碍物耐久度 (Obstacle Max HP)', a.obstacleMaxHp !== undefined ? a.obstacleMaxHp : 75, 20, 250, 5, val => {
        window.GameConfig.set('arena.obstacleMaxHp', val);
      }, 'HP');
      this.addSelect(g3, '障碍物排布预设 (Layout Preset)', a.obstacleLayout, [
        { label: '四角对称 (Corner Symmetric)', value: 'corners' },
        { label: '环形阵列 (Ring Array)', value: 'ring' },
        { label: '随机分布 (Random)', value: 'random' },
        { label: '无障碍物 (None)', value: 'none' }
      ], val => {
        window.GameConfig.set('arena.obstacleLayout', val);
      });
      this.addToggle(g3, '所有阶段强制生成障碍物 (Force Spawn Obstacles All Phases)', a.forceSpawnObstaclesAllPhases || false, checked => {
        window.GameConfig.set('arena.forceSpawnObstaclesAllPhases', checked);
        if (window.Game && window.Game.arena) {
          window.Game.arena.rebuildObstacles();
        }
      });
      container.appendChild(g3);
    }

    // -------------------------------------------------------------
    // 控制器 D: Boss 阶段与弹幕攻击 (Boss & Pattern Inspector)
    // -------------------------------------------------------------
    buildControllerD(container) {
      const b = window.GameConfig.boss;

      // Group 1: Boss 基础状态
      const g1 = this.createGroup('Boss 基础体征 (Boss Base)');
      this.addSlider(g1, 'Boss 最大生命值 (Max HP)', b.maxHp, 100, 2000, 50, val => {
        window.GameConfig.set('boss.maxHp', val);
        window.Game.boss.maxHp = val;
        window.Game.boss.hp = Math.min(window.Game.boss.hp, val);
      });
      this.addSlider(g1, 'Boss 判定体型半径 (Hitbox Radius)', b.hitboxRadius, 20, 120, 5, val => {
        window.GameConfig.set('boss.hitboxRadius', val);
        window.Game.boss.hitboxRadius = val;
      }, 'px');
      this.addSelect(g1, 'Boss 站位模式 (Position Mode)', b.positionMode, [
        { label: '北侧边缘巨型 (Top Fixed)', value: 'top' },
        { label: '中央固定 (Center Fixed)', value: 'center' },
        { label: '缓慢游走 (Slow Roaming)', value: 'roaming' }
      ], val => {
        window.GameConfig.set('boss.positionMode', val);
      });
      container.appendChild(g1);

      // Group 1b: 攻击节奏与弹幕管控 (Pacing & Hazard Control)
      const gPace = this.createGroup('攻击节奏与弹幕管控 (Pacing & Hazard Control)');
      this.addSlider(gPace, '发射预警时间 (Telegraph Duration)', b.telegraphDuration !== undefined ? b.telegraphDuration : 0.5, 0.2, 1.0, 0.05, val => {
        window.GameConfig.set('boss.telegraphDuration', val);
      }, 's');
      this.addSlider(gPace, '转阶段无敌幽灵秒数 (Invuln Time)', b.phaseTransitionInvulnTime !== undefined ? b.phaseTransitionInvulnTime : 3.0, 1.0, 8.0, 0.5, val => {
        window.GameConfig.set('boss.phaseTransitionInvulnTime', val);
      }, 's');
      this.addToggle(gPace, '阵型混入普通能量弹 (Mix Minion Bullets)', b.mixMinionBullets !== false, checked => {
        window.GameConfig.set('boss.mixMinionBullets', checked);
      });
      this.addToggle(gPace, '弹幕位置随机排列 (Randomize Bullet Order)', b.randomizeBulletOrder !== false, checked => {
        window.GameConfig.set('boss.randomizeBulletOrder', checked);
      });
      this.addSlider(gPace, '发射角度随机微偏 (Spread Angle Jitter)', b.spreadAngleJitter !== undefined ? b.spreadAngleJitter : 5, 0, 15, 1, val => {
        window.GameConfig.set('boss.spreadAngleJitter', val);
      }, '°');
      this.addToggle(gPace, 'P3必须清空柱子破除无敌 (P3 Pillar Shield)', b.p3RequireClearObstacles !== false, checked => {
        window.GameConfig.set('boss.p3RequireClearObstacles', checked);
      });
      this.addButton(gPace, '✨ [一键重置为清爽推荐配置]', () => {
        window.GameConfig.applyCrispPreset();
        this.renderTabContent('tab-boss');
      }, {
        background: 'linear-gradient(135deg, #00f0ff, #0077ff)',
        color: '#000',
        fontWeight: 'bold',
        borderRadius: '6px'
      });
      container.appendChild(gPace);

      // Group 2: Phase 1 阶段弹幕 (100% ~ 70%)
      const gP1 = this.createGroup('阶段 1 弹幕 (Phase 1: 100% ~ 70% HP)');
      this.addSlider(gP1, '波次停火呼吸时间 (Wave Rest Interval)', b.phase1.fireInterval, 0.4, 5.0, 0.1, val => {
        window.GameConfig.set('boss.phase1.fireInterval', val);
      }, 's');
      this.addSelect(gP1, '发射源 (Emitter Source)', b.phase1.emitterSource, [
        { label: 'Boss 本体发射 (Boss Only)', value: 'boss' },
        { label: '四版边墙壁交叉火力 (Walls Only)', value: 'walls' },
        { label: '本体与墙壁同时发射 (Both)', value: 'both' }
      ], val => {
        window.GameConfig.set('boss.phase1.emitterSource', val);
      });
      this.addSelect(gP1, '发射阵型 (Formation Type)', b.phase1.formationType, [
        { label: '单发狙击 (Single Aimed)', value: 'single' },
        { label: '扇形散射 (Fan Spread)', value: 'fan' },
        { label: '360° 环形弹幕 (360 Ring)', value: 'ring' },
        { label: '螺旋连射 (Spiral)', value: 'spiral' }
      ], val => {
        window.GameConfig.set('boss.phase1.formationType', val);
      });
      this.addSlider(gP1, '扇形子弹颗数 (Fan Count)', b.phase1.fanCount, 2, 12, 1, val => {
        window.GameConfig.set('boss.phase1.fanCount', val);
      });
      this.addSlider(gP1, '扇形夹角范围 (Fan Angle)', b.phase1.fanSpreadAngle, 20, 140, 5, val => {
        window.GameConfig.set('boss.phase1.fanSpreadAngle', val);
      }, '°');
      this.addSelect(gP1, '发射球体预设', b.phase1.assignedBallPreset, [
        { label: '标准白球 (White)', value: 'preset1' },
        { label: '重型红球 (Red)', value: 'preset2' },
        { label: '弧线紫球 (Purple)', value: 'preset3' },
        { label: '混合交替 (Mixed)', value: 'mixed' }
      ], val => {
        window.GameConfig.set('boss.phase1.assignedBallPreset', val);
      });
      container.appendChild(gP1);

      // Group 3: Phase 2 阶段弹幕 (70% ~ 30%)
      const gP2 = this.createGroup('阶段 2 弹幕与机动 (Phase 2: 70% ~ 30% HP)');
      this.addToggle(gP2, 'P2 四边边缘瞬移机动 (P2 Edge Teleport)', b.p2EdgeTeleportEnabled !== false, checked => {
        window.GameConfig.set('boss.p2EdgeTeleportEnabled', checked);
      });
      this.addSlider(gP2, '每次瞬移前发射波次 (Waves Before Teleport)', b.wavesBeforeTeleport !== undefined ? b.wavesBeforeTeleport : 1, 1, 3, 1, val => {
        window.GameConfig.set('boss.wavesBeforeTeleport', val);
      });
      this.addSlider(gP2, '攻击后摇瞬移延迟 (Teleport Delay After Fire)', b.postFireTeleportDelay !== undefined ? b.postFireTeleportDelay : 1.0, 0.2, 3.0, 0.1, val => {
        window.GameConfig.set('boss.postFireTeleportDelay', val);
      }, 's');
      this.addSlider(gP2, '瞬移隐匿耗时 (Teleport Duration)', b.teleportDuration !== undefined ? b.teleportDuration : 0.4, 0.2, 1.0, 0.05, val => {
        window.GameConfig.set('boss.teleportDuration', val);
      }, 's');
      this.addSlider(gP2, '波次停火呼吸时间 (Wave Rest Interval)', b.phase2.fireInterval, 0.3, 5.0, 0.1, val => {
        window.GameConfig.set('boss.phase2.fireInterval', val);
      }, 's');
      this.addSelect(gP2, '发射源 (Emitter Source)', b.phase2.emitterSource, [
        { label: 'Boss 本体发射 (Boss Only)', value: 'boss' },
        { label: '四版边墙壁交叉火力 (Walls Only)', value: 'walls' },
        { label: '本体与墙壁同时发射 (Both)', value: 'both' }
      ], val => {
        window.GameConfig.set('boss.phase2.emitterSource', val);
      });
      this.addSelect(gP2, '发射阵型 (Formation Type)', b.phase2.formationType, [
        { label: '螺旋连射 (Spiral)', value: 'spiral' },
        { label: '扇形散射 (Fan Spread)', value: 'fan' },
        { label: '360° 环形弹幕 (360 Ring)', value: 'ring' },
        { label: '单发狙击 (Single Aimed)', value: 'single' }
      ], val => {
        window.GameConfig.set('boss.phase2.formationType', val);
      });
      this.addSlider(gP2, '螺旋流密度 (Spiral Rate)', b.phase2.spiralRate, 3, 12, 1, val => {
        window.GameConfig.set('boss.phase2.spiralRate', val);
      });
      this.addSelect(gP2, '发射球体预设', b.phase2.assignedBallPreset, [
        { label: '混合交替 (Mixed)', value: 'mixed' },
        { label: '标准白球 (White)', value: 'preset1' },
        { label: '重型红球 (Red)', value: 'preset2' },
        { label: '弧线紫球 (Purple)', value: 'preset3' }
      ], val => {
        window.GameConfig.set('boss.phase2.assignedBallPreset', val);
      });
      container.appendChild(gP2);

      // Group 4: Phase 3 阶段狂暴弹幕 (30% ~ 0%)
      const gP3 = this.createGroup('阶段 3 狂暴弹幕 (Phase 3: 30% ~ 0% HP)');
      this.addSlider(gP3, '波次停火呼吸时间 (Wave Rest Interval)', b.phase3.fireInterval, 0.2, 5.0, 0.05, val => {
        window.GameConfig.set('boss.phase3.fireInterval', val);
      }, 's');
      this.addSelect(gP3, '发射源 (Emitter Source)', b.phase3.emitterSource, [
        { label: '四版边墙壁交叉火力 (Walls Only)', value: 'walls' },
        { label: '本体与墙壁同时发射 (Both)', value: 'both' },
        { label: 'Boss 本体发射 (Boss Only)', value: 'boss' }
      ], val => {
        window.GameConfig.set('boss.phase3.emitterSource', val);
      });
      this.addSelect(gP3, '发射阵型 (Formation Type)', b.phase3.formationType, [
        { label: '360° 环形弹幕 (360 Ring)', value: 'ring' },
        { label: '螺旋连射 (Spiral)', value: 'spiral' },
        { label: '扇形散射 (Fan Spread)', value: 'fan' }
      ], val => {
        window.GameConfig.set('boss.phase3.formationType', val);
      });
      this.addSlider(gP3, '360 环形密度 (Ring Count)', b.phase3.ringCount, 6, 24, 2, val => {
        window.GameConfig.set('boss.phase3.ringCount', val);
      });
      this.addSelect(gP3, '发射球体预设', b.phase3.assignedBallPreset, [
        { label: '重型红球 (Red)', value: 'preset2' },
        { label: '混合交替 (Mixed)', value: 'mixed' },
        { label: '弧线紫球 (Purple)', value: 'preset3' },
        { label: '标准白球 (White)', value: 'preset1' }
      ], val => {
        window.GameConfig.set('boss.phase3.assignedBallPreset', val);
      });
      container.appendChild(gP3);
    }

    // -------------------------------------------------------------
    // 控制器 E: 音效控制台与程序化合成器 (Audio & SFX Inspector)
    // -------------------------------------------------------------
    buildControllerE(container) {
      const audioCfg = window.GameConfig.audio || { masterMute: false, masterVolume: 0.7 };
      const sm = window.SoundManager;

      // Group 1: 音频引擎状态与全局主通道
      const g1 = this.createGroup('音频引擎状态与主通道 (Audio Engine & Master)');
      const body1 = g1.querySelector('.param-group-body');

      const statusRow = document.createElement('div');
      statusRow.className = 'param-row';
      statusRow.style.padding = '8px 0';
      const curState = sm ? sm.getAudioState() : 'uninitialized';
      const isRunning = curState === 'running';

      statusRow.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:8px;">
          <span style="font-size:12px; color:#8b949e;">Web Audio 状态:</span>
          <span id="inspector-audio-status-text" style="font-family:monospace; font-weight:700; color:${isRunning ? '#00ffaa' : '#ffaa00'};">
            ${curState.toUpperCase()} ${sm && sm.sampleRate ? `(${sm.sampleRate}Hz)` : ''}
          </span>
        </div>
        <button id="btn-inspector-unlock-audio" class="btn-footer" style="width:100%; background:rgba(0,229,255,0.15); border-color:#00e5ff; color:#fff; font-size:12px; padding:8px 12px; border-radius:6px; cursor:pointer;">
          🔊 点击测试并立即激活音频通道 (Unlock Audio)
        </button>
      `;
      body1.appendChild(statusRow);

      const unlockBtn = statusRow.querySelector('#btn-inspector-unlock-audio');
      if (unlockBtn) {
        unlockBtn.addEventListener('click', () => {
          if (window.SoundManager) {
            window.SoundManager.unlockAudio();
            window.SoundManager.perfectParry();
          }
        });
      }

      this.addToggle(g1, '全局静音开关 (Master Mute)', audioCfg.masterMute, checked => {
        window.GameConfig.set('audio.masterMute', checked);
        if (window.SoundManager) window.SoundManager.setMute(checked);
      });

      this.addSlider(g1, '主音量滑块 (Master Volume)', audioCfg.masterVolume, 0.0, 1.0, 0.05, val => {
        window.GameConfig.set('audio.masterVolume', val);
        if (window.SoundManager) window.SoundManager.setVolume(val);
      });

      container.appendChild(g1);

      // Group 2: 程序化音效自检试听 (Procedural SFX Test Bench)
      const g2 = this.createGroup('程序化音效自检试听 (Procedural SFX Test Bench)');
      const body2 = g2.querySelector('.param-group-body');

      const testGrid = document.createElement('div');
      testGrid.className = 'sfx-test-grid';
      testGrid.style.display = 'grid';
      testGrid.style.gridTemplateColumns = '1fr 1fr';
      testGrid.style.gap = '8px';
      testGrid.style.marginTop = '6px';

      const tests = [
        { label: '⚔️ 完美打铁 (Parry)', action: () => sm && sm.perfectParry() },
        { label: '🛡️ 普通接球 (Catch)', action: () => sm && sm.goodCatch() },
        { label: '💨 挥空卡壳 (Whiff)', action: () => sm && sm.whiff() },
        { label: '🔒 CD拒绝 (Deny)', action: () => sm && sm.cooldownDeny() },
        { label: '⚡ 子弹时间 (Bullet)', action: () => { if (sm) { sm.bulletTimeEnter(); setTimeout(() => sm.bulletTimeExit(), 650); } } },
        { label: '🚀 松手射球 (Throw)', action: () => sm && sm.playerThrow(true, 1.4) },
        { label: '💥 重炮连击 (Boss Hit x5)', action: () => sm && sm.bossHit(5) },
        { label: '🏓 弹墙碰撞 (Bounce)', action: () => sm && sm.wallBounce() },
        { label: '💣 爆裂轰鸣 (Explode)', action: () => sm && sm.wallExplode() },
        { label: '🌪️ 闪避风声 (Dash)', action: () => sm && sm.dash() },
        { label: '💔 玩家受击 (Hurt)', action: () => sm && sm.playerHurt() },
        { label: '🎺 胜利和弦 (Victory)', action: () => sm && sm.victoryFanfare() }
      ];

      tests.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'btn-footer';
        btn.style.fontSize = '11px';
        btn.style.padding = '8px 4px';
        btn.style.textAlign = 'center';
        btn.style.whiteSpace = 'nowrap';
        btn.style.cursor = 'pointer';
        btn.textContent = t.label;
        btn.addEventListener('click', () => {
          t.action();
        });
        testGrid.appendChild(btn);
      });

      body2.appendChild(testGrid);
      container.appendChild(g2);
    }

    // -------------------------------------------------------------
    // UI Helpers (Group, Slider, Toggle, Select)
    // -------------------------------------------------------------
    createGroup(title) {
      const g = document.createElement('div');
      g.className = 'param-group';
      g.innerHTML = `
        <div class="param-group-header">
          <span>${title}</span>
        </div>
        <div class="param-group-body"></div>
      `;
      return g;
    }

    addButton(parentGroup, label, onClick, styleProps = {}) {
      const body = parentGroup.querySelector('.param-group-body') || parentGroup;
      const btn = document.createElement('button');
      btn.className = 'btn-footer';
      btn.style.width = '100%';
      btn.style.marginTop = '8px';
      btn.style.padding = '10px 12px';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '12px';
      btn.style.textAlign = 'center';
      Object.assign(btn.style, styleProps);
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      body.appendChild(btn);
      return btn;
    }

    addSlider(parentGroup, label, initialValue, min, max, step, onChange, unit = '') {
      const body = parentGroup.querySelector('.param-group-body');
      const row = document.createElement('div');
      row.className = 'param-row';

      const labelRow = document.createElement('div');
      labelRow.className = 'param-label-row';
      labelRow.innerHTML = `
        <span>${label}</span>
        <span class="val-display">${initialValue}${unit}</span>
      `;

      const ctrl = document.createElement('div');
      ctrl.className = 'param-control';
      const input = document.createElement('input');
      input.type = 'range';
      input.min = min;
      input.max = max;
      input.step = step;
      input.value = initialValue;

      const valDisplay = labelRow.querySelector('.val-display');

      const updateVal = (val) => {
        val = Math.max(min, Math.min(max, val));
        input.value = val;
        valDisplay.textContent = `${val}${unit}`;
        onChange(val);
      };

      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        valDisplay.textContent = `${val}${unit}`;
        onChange(val);
      });

      // Direct touch dragging with landscape rotation awareness
      const updateSliderFromTouch = (touch) => {
        const rect = input.getBoundingClientRect();
        const app = document.getElementById('app-container');
        const isRotated = app && app.classList.contains('rotate-landscape');
        let ratio;
        if (isRotated) {
          // Rotated 90deg clockwise: visual slider is horizontal, mapped to clientY (screen top to bottom)
          ratio = (touch.clientY - rect.top) / rect.height;
        } else {
          ratio = (touch.clientX - rect.left) / rect.width;
        }
        ratio = Math.max(0, Math.min(1, ratio));
        let rawVal = min + ratio * (max - min);
        if (step > 0) {
          rawVal = Math.round((rawVal - min) / step) * step + min;
        }
        const decimals = (step.toString().split('.')[1] || '').length;
        const finalVal = parseFloat(rawVal.toFixed(decimals));
        updateVal(finalVal);
      };

      let isTouchingSlider = false;
      let sliderTouchStartCoords = null;

      input.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length === 0) return;
        isTouchingSlider = true;
        sliderTouchStartCoords = this.getTouchCoords(e.touches[0]);
        updateSliderFromTouch(e.touches[0]);
      }, { passive: true });

      input.addEventListener('touchmove', (e) => {
        if (!isTouchingSlider || !e.touches || e.touches.length === 0) return;
        const coords = this.getTouchCoords(e.touches[0]);
        const dx = Math.abs(coords.x - sliderTouchStartCoords.x);
        const dy = Math.abs(coords.y - sliderTouchStartCoords.y);
        // If gesture is clearly vertical, cancel slider update so list can scroll smoothly
        if (dy > dx && dy > 8) {
          isTouchingSlider = false;
          return;
        }
        updateSliderFromTouch(e.touches[0]);
      }, { passive: true });

      const onTouchEndSlider = () => {
        isTouchingSlider = false;
      };
      input.addEventListener('touchend', onTouchEndSlider, { passive: true });
      input.addEventListener('touchcancel', onTouchEndSlider, { passive: true });

      ctrl.appendChild(input);
      row.appendChild(labelRow);
      row.appendChild(ctrl);
      body.appendChild(row);
    }

    addToggle(parentGroup, label, initialChecked, onChange) {
      const body = parentGroup.querySelector('.param-group-body');
      const row = document.createElement('div');
      row.className = 'param-row';

      const labelEl = document.createElement('label');
      labelEl.className = 'switch-label';
      labelEl.innerHTML = `
        <span>${label}</span>
        <input type="checkbox" ${initialChecked ? 'checked' : ''}>
        <span class="switch-toggle"></span>
      `;

      const checkbox = labelEl.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', () => {
        onChange(checkbox.checked);
      });

      row.appendChild(labelEl);
      body.appendChild(row);
    }

    addSelect(parentGroup, label, initialValue, options, onChange) {
      const body = parentGroup.querySelector('.param-group-body');
      const row = document.createElement('div');
      row.className = 'param-row';

      const labelRow = document.createElement('div');
      labelRow.className = 'param-label-row';
      labelRow.innerHTML = `<span>${label}</span>`;

      const select = document.createElement('select');
      select.className = 'param-select';
      options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === initialValue) o.selected = true;
        select.appendChild(o);
      });

      select.addEventListener('change', () => {
        onChange(select.value);
      });

      row.appendChild(labelRow);
      row.appendChild(select);
      body.appendChild(row);
    }
  }

  window.DesignInspector = DesignInspector;
})(window);
