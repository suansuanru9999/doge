/**
 * Project: Dodgeball Boss Rush
 * File: js/config.js
 * Description: Global reactive configuration object (GameConfig) and Preset Management.
 * All core parameters are centralized here with zero-latency live updates and JSON import/export.
 */

(function(window) {
  'use strict';

  // Preset definitions for Ball Properties
  const BALL_PRESETS = {
    preset1: {
      name: '标准白球 (Normal Core Ball)',
      speed: 380,
      playerThrowSpeedMultiplier: 1.5,
      radius: 14,
      baseDamage: 25,
      trajectoryType: 'straight', // straight | sine | homing
      sineFrequency: 6.0,
      sineAmplitude: 40,
      canDirectCatch: true,
      catchWindowMultiplier: 1.0,
      throwDamageMultiplier: 1.0,
      overheatExplodeEnabled: true,
      overheatTimer: 2.5,
      boundaryMode: 'bounce', // pass | bounce | explode
      maxWallBounces: 2,
      wallAoeRadius: 80,
      wallAoeDamage: 20,
      destroyOnHit: false,
      reboundOnHit: true,
      reboundAngleMode: 'reflection', // reflection | refraction | random
      reboundAngleVariance: 15, // degrees
      reboundDistance: 220,
      reboundArcHeight: 60,
      color: '#ffffff',
      glowColor: '#00f0ff'
    },
    preset2: {
      name: '重型红球 (Explosive Uncatchable)',
      speed: 320,
      playerThrowSpeedMultiplier: 1.3,
      radius: 18,
      baseDamage: 45,
      trajectoryType: 'straight',
      sineFrequency: 4.0,
      sineAmplitude: 30,
      canDirectCatch: false, // 严格不可接！触碰受罚，必须闪避无敌穿透
      catchWindowMultiplier: 0.0,
      throwDamageMultiplier: 1.0,
      overheatExplodeEnabled: true,
      overheatTimer: 2.0,
      boundaryMode: 'explode', // explodes on wall contact!
      maxWallBounces: 0,
      wallAoeRadius: 130,
      wallAoeDamage: 35,
      destroyOnHit: false,
      reboundOnHit: true,
      reboundAngleMode: 'random',
      reboundAngleVariance: 45,
      reboundDistance: 170,
      reboundArcHeight: 80,
      color: '#ff2233',
      glowColor: '#ff0033'
    },
    preset3: {
      name: '强袭紫球 (High-Damage Purple Ball)',
      speed: 420,
      playerThrowSpeedMultiplier: 1.6,
      radius: 13,
      baseDamage: 50, // 高额伤害 (2.0x baseDamage)
      trajectoryType: 'sine',
      sineFrequency: 7.0,
      sineAmplitude: 45,
      canDirectCatch: true,
      catchWindowMultiplier: 0.75, // 窄判定窗口 (75% of normal window)
      throwDamageMultiplier: 2.0, // 玩家反弹投掷双倍伤害 (2.0x)
      overheatExplodeEnabled: true,
      overheatTimer: 2.5,
      boundaryMode: 'bounce',
      maxWallBounces: 3,
      wallAoeRadius: 70,
      wallAoeDamage: 15,
      destroyOnHit: false,
      reboundOnHit: true,
      reboundAngleMode: 'refraction',
      reboundAngleVariance: 30,
      reboundDistance: 260,
      reboundArcHeight: 50,
      color: '#bd40ff',
      glowColor: '#e066ff'
    },
    custom: {
      name: '自定义球 (Custom)',
      speed: 360,
      playerThrowSpeedMultiplier: 1.5,
      radius: 16,
      baseDamage: 35,
      trajectoryType: 'straight',
      sineFrequency: 5.0,
      sineAmplitude: 35,
      canDirectCatch: true,
      overheatExplodeEnabled: true,
      overheatTimer: 2.5,
      boundaryMode: 'bounce',
      maxWallBounces: 2,
      wallAoeRadius: 90,
      wallAoeDamage: 25,
      destroyOnHit: false,
      reboundOnHit: true,
      reboundAngleMode: 'reflection',
      reboundAngleVariance: 20,
      reboundDistance: 220,
      reboundArcHeight: 65,
      color: '#00ffcc',
      glowColor: '#33ffaa'
    }
  };

  // Factory default configuration
  const DEFAULT_CONFIG = {
    // -------------------------------------------------------------------------
    // 控制器 A: 玩家、镜头与连击系统 (Player & Combo & Camera)
    // -------------------------------------------------------------------------
    player: {
      maxHp: 100,
      moveSpeed: 340,
      catchCooldownEnabled: true,
      catchCooldown: 1.0, // seconds
      whiffSlowdownEnabled: true, // Whiff Slowdown Switch
      whiffSlowdownMultiplier: 0.4, // Whiff Slowdown Multiplier (0.0 to 1.0)
      whiffSlowdownDuration: 0.35, // Whiff Slowdown Duration (seconds)
      dashCancelsWhiff: true, // Dash Cancels Whiff
      dashCooldownEnabled: true,
      dashCooldown: 1.0,  // seconds
      dashDistance: 190,  // pixels
      dashDuration: 0.22, // seconds
      dashIFrameDuration: 0.22, // invulnerability duration
      perfectWindow: 0.12, // 120ms Perfect Parry window
      goodWindow: 0.25,    // 250ms Good Catch window
      bulletTimeScale: 0.15, // 0.15x slow motion
      bulletTimeDuration: 1.8, // seconds
      perfectThrowSpeedMult: 1.6, // Bonus multiplier on throw after perfect parry
      perfectThrowDamageMult: 2.0 // Bonus damage multiplier
    },
    combo: {
      resetTimer: 4.0, // Combo drops if no hit within 4.0s
      baseMultiplier: 0.15, // +15% damage per hit
      maxCap: 3.0 // Cap at 3.0x multiplier (+200% extra)
    },
    camera: {
      zoom: 1.0,
      screenShakeIntensity: 1.0,
      screenShakeDuration: 0.25,
      dynamicZoomOnBulletTime: true,
      bulletTimeZoomFactor: 1.12,
      hitstopDuration: 0.06 // 60ms freeze frame
    },

    // -------------------------------------------------------------------------
    // 控制器 B: 球体属性统一控件 (Ball Property Inspector)
    // -------------------------------------------------------------------------
    ball: {
      activePreset: 'preset1', // preset1 | preset2 | preset3 | custom
      maxSpeedCap: 1200, // Maximum allowed ball flight speed in px/s (hard safety cap)
      groundLifetimeEnabled: true, // Ground Lifetime Switch (true = disappears on timer, false = permanent)
      groundLifetimeDuration: 4.0, // Ground Lifetime Duration in seconds (1.0s to 15.0s, default 4.0s)
      maxGroundedBalls: 2, // Maximum grounded balls allowed on floor simultaneously (FIFO eviction, default 2)
      maxActiveCoreBalls: 3, // Maximum in-flight Core Dodgeballs allowed (default 3)
      onlyPlayerThrownBallsDrop: true, // Only balls thrown by player that hit Boss drop to ground (default true)
      presets: JSON.parse(JSON.stringify(BALL_PRESETS))
    },

    // -------------------------------------------------------------------------
    // 控制器 C: 竞技场、灯光与障碍物控件 (Arena & Environment Inspector)
    // -------------------------------------------------------------------------
    arena: {
      shape: 'rectangle', // rectangle | circle | octagon
      width: 960,
      height: 600,
      radius: 420,
      perspectiveYScale: 0.75, // Pseudo-45 degree Y-axis compression (0.5 to 1.0)
      ambientColor: '#0a0e14',
      ambientIntensity: 1.0,
      glowEnabled: true,
      glowIntensity: 1.0,
      shadowOpacity: 0.45,
      obstacleCount: 4, // 0 to 8
      obstacleSize: 38,
      obstacleDestructible: true,
      obstacleMaxHp: 100, // Max HP per obstacle (takes 2-3 solid hits from player)
      obstacleLayout: 'corners', // corners | ring | random | none
      forceSpawnObstaclesAllPhases: false // Force spawn obstacles in all phases (default false: P3 only)
    },

    // -------------------------------------------------------------------------
    // 控制器 D: Boss 阶段与攻击手段控件 (Boss & Pattern Inspector)
    // -------------------------------------------------------------------------
    boss: {
      maxHp: 600,
      hitboxRadius: 55, // 20 to 120
      positionMode: 'top', // top | center | roaming
      roamingSpeed: 70,
      telegraphDuration: 0.5, // Attack Telegraph Warning duration before firing (seconds, default 0.5s)
      mixMinionBullets: true, // Mix Minion Bullets into spread patterns (only center is Core Ball, default true)
      randomizeBulletOrder: true, // Randomize slot order of Core Balls and Minion Bullets (Fisher-Yates)
      spreadAngleJitter: 5, // Random angle jitter per wave in degrees (0 to 15 deg)
      phaseTransitionInvulnTime: 3.0, // Invulnerability & Hitbox-disabled duration on phase shift (seconds, default 3.0s)
      p3RequireClearObstacles: true, // In P3, boss remains invulnerable until all pillars are shattered (default true)
      p2EdgeTeleportEnabled: true, // In P2, boss teleports between 4 arena edge anchors after firing (default true)
      wavesBeforeTeleport: 1, // Waves fired before teleporting to a new edge anchor in P2 (1 to 3, default 1)
      postFireTeleportDelay: 1.0, // Delay before teleporting after firing a wave in P2 (seconds, 0.2s to 3.0s, default 1.0s)
      teleportDuration: 0.4, // Vanish and re-appear duration during P2 teleport in seconds (0.2s to 1.0s, default 0.4s)
      phase1: {
        thresholdMax: 1.0,
        thresholdMin: 0.70,
        fireInterval: 2.8, // Wave Rest Window (P1 default 2.8s)
        emitterSource: 'boss', // boss | walls | both
        formationType: 'single', // single sniper core ball
        fanCount: 3,
        fanSpreadAngle: 45,
        assignedBallPreset: 'preset1' // preset1 | preset2 | preset3 | mixed
      },
      phase2: {
        thresholdMax: 0.70,
        thresholdMin: 0.30,
        fireInterval: 3.0, // Wave Rest Window (P2 default 3.0s breathing window)
        emitterSource: 'boss',
        formationType: 'fan', // Fan spread (1 center core ball + flanking minion bullets)
        fanCount: 5,
        fanSpreadAngle: 60,
        spiralRate: 6,
        assignedBallPreset: 'mixed'
      },
      phase3: {
        thresholdMax: 0.30,
        thresholdMin: 0.0,
        fireInterval: 2.6, // Wave Rest Window (P3 default 2.6s breathing window)
        emitterSource: 'both', // Wall emitters minion salvo + Boss core ball
        formationType: 'fan',
        fanCount: 5,
        fanSpreadAngle: 75,
        ringCount: 10,
        assignedBallPreset: 'mixed'
      }
    },

    // -------------------------------------------------------------------------
    // 输入与交互通用设置 (Controls & Input)
    // -------------------------------------------------------------------------
    input: {
      inputMode: 'auto', // auto | pc | touch
      orientationMode: 'auto', // auto (landscape default on mobile) | landscape | portrait
      invertedAimDrag: true, // Reverse pull (slingshot style: pull back to launch forward)
      aimSensitivity: 1.0, // 0.2 to 2.5 Aim sensitivity
      aimSmoothing: 0.35, // 0.05 (heavy damping / rock steady) to 1.0 (raw instant snap)
      aimDeadzone: 16, // Minimum drag distance (px) before aim angle starts rotating
      aimAngleSnap: 0 // 0 = Free continuous, 5 = 5° micro-snap, 15 = 15° notch snap
    },

    // -------------------------------------------------------------------------
    // 音效与合成器设置 (Audio & SFX)
    // -------------------------------------------------------------------------
    audio: {
      masterMute: false,
      masterVolume: 0.7
    },

    // -------------------------------------------------------------------------
    // 存储与全网同步 (Storage & Cloud Sync)
    // -------------------------------------------------------------------------
    storage: {
      cloudSyncUrl: 'https://dogeball-6c1fd-default-rtdb.firebaseio.com/',
      apiKey: ''
    }
  };

  // Expose authoritative default configuration
  const DEFAULT_GAME_CONFIG = deepClone(DEFAULT_CONFIG);
  window.DEFAULT_GAME_CONFIG = DEFAULT_GAME_CONFIG;

  // Create deep clone helper
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // LocalStorage Persistence Helpers (Supports both new and legacy keys)
  const STORAGE_KEY = 'DODGEBALL_GAME_CONFIG_V1';
  const LEGACY_STORAGE_KEY = 'dogeball_game_config_v1';

  function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    for (const key of Object.keys(source)) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key]) && key in target && typeof target[key] === 'object') {
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  function loadFromStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return deepMerge(deepClone(DEFAULT_CONFIG), parsed);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load config from storage:', e);
    }
    return deepClone(DEFAULT_CONFIG);
  }

  function saveToStorage(cfg) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const str = JSON.stringify(cfg);
        window.localStorage.setItem(STORAGE_KEY, str);
        window.localStorage.setItem(LEGACY_STORAGE_KEY, str);
      }
    } catch (e) {
      console.warn('Failed to save config to storage:', e);
    }
  }

  // Debounced Cloud Auto-Sync (1500ms after user finishes tweaking parameters)
  let cloudAutoSyncTimer = null;
  function triggerCloudAutoSync() {
    if (cloudAutoSyncTimer) clearTimeout(cloudAutoSyncTimer);
    cloudAutoSyncTimer = setTimeout(async () => {
      try {
        const cloudUrl = (currentConfig.storage && currentConfig.storage.cloudSyncUrl) || DEFAULT_CONFIG.storage.cloudSyncUrl;
        if (cloudUrl && cloudUrl.trim()) {
          if (window.StorageService && typeof window.StorageService.saveConfigToCloud === 'function') {
            await window.StorageService.saveConfigToCloud(currentConfig);
            console.log('[GameConfig] Auto-synced modified parameters to Cloud Database.');
          }
        }
      } catch (e) {}
    }, 1500);
  }

  // Active configuration instance (loaded from LocalStorage or defaults)
  let currentConfig = loadFromStorage();

  // Event listeners for config changes
  const listeners = [];

  const GameConfig = {
    // Direct access to nested structures
    get player() { return currentConfig.player; },
    get combo() { return currentConfig.combo; },
    get camera() { return currentConfig.camera; },
    get ball() { return currentConfig.ball; },
    get arena() { return currentConfig.arena; },
    get boss() { return currentConfig.boss; },
    get input() { return currentConfig.input; },
    get audio() { return currentConfig.audio; },
    get storage() { return currentConfig.storage; },

    // Asynchronously load config.json (static) and Firebase / Cloud Database (realtime authoritative)
    async loadConfigAsync() {
      let loadedSource = 'storage';

      // 1. Fetch static ./config.json as baseline
      try {
        const res = await fetch('./config.json?t=' + Date.now());
        if (res.ok) {
          const json = await res.json();
          if (json && typeof json === 'object') {
            currentConfig = deepMerge(deepClone(DEFAULT_CONFIG), json);
            loadedSource = 'file';
          }
        }
      } catch (err) {
        console.warn('[GameConfig] Could not fetch ./config.json:', err);
      }

      // 2. Fetch authoritative real-time config from Firebase / Cloud DB
      try {
        const cloudUrl = (currentConfig.storage && currentConfig.storage.cloudSyncUrl) || DEFAULT_CONFIG.storage.cloudSyncUrl;
        const apiKey = (currentConfig.storage && currentConfig.storage.apiKey) || '';
        if (cloudUrl && cloudUrl.trim()) {
          let cloudData = null;
          if (window.StorageService && typeof window.StorageService.loadConfigFromCloud === 'function') {
            cloudData = await window.StorageService.loadConfigFromCloud();
          } else {
            // Direct endpoint resolution fallback
            let endpoint = cloudUrl.trim();
            if (endpoint.endsWith('.json')) {
              const parts = endpoint.split('/');
              parts[parts.length - 1] = 'config.json';
              endpoint = parts.join('/');
            } else {
              endpoint = endpoint.replace(/\/+$/, '') + '/config.json';
            }
            let requestUrl = endpoint;
            if (apiKey && apiKey.trim().length > 0 && endpoint.includes('firebaseio.com')) {
              requestUrl += (requestUrl.includes('?') ? '&' : '?') + 'auth=' + encodeURIComponent(apiKey.trim());
            }
            const res = await fetch(requestUrl);
            if (res.ok) {
              const data = await res.json();
              if (data && typeof data === 'object' && Object.keys(data).length > 0) {
                cloudData = data;
              }
            }
          }

          if (cloudData && typeof cloudData === 'object' && Object.keys(cloudData).length > 0) {
            currentConfig = deepMerge(currentConfig, cloudData);
            loadedSource = 'cloud';
            console.log('[GameConfig] Authoritative config loaded from Firebase Cloud Database:', cloudData);
          }
        }
      } catch (err) {
        console.warn('[GameConfig] Cloud config load failed, using local/static:', err);
      }

      // Save to localStorage as synced cache
      saveToStorage(currentConfig);
      this.notify('*', currentConfig);
      return { success: true, source: loadedSource };
    },

    // Sync current configuration to cloud database (Firebase)
    async syncToCloud() {
      if (window.StorageService && typeof window.StorageService.saveConfigToCloud === 'function') {
        const res = await window.StorageService.saveConfigToCloud(currentConfig);
        if (res && res.success) {
          saveToStorage(currentConfig);
        }
        return res;
      }
      return { success: false, error: 'StorageService unavailable' };
    },

    // Pull authoritative configuration from cloud database (Firebase)
    async pullFromCloud() {
      let cloudData = null;
      if (window.StorageService && typeof window.StorageService.loadConfigFromCloud === 'function') {
        cloudData = await window.StorageService.loadConfigFromCloud();
      }
      if (cloudData && typeof cloudData === 'object' && Object.keys(cloudData).length > 0) {
        currentConfig = deepMerge(deepClone(DEFAULT_CONFIG), cloudData);
        saveToStorage(currentConfig);
        this.notify('*', currentConfig);
        return { success: true, data: currentConfig };
      }
      return { success: false, error: '云端暂未保存任何配置数据 (Cloud config is empty)' };
    },

    // Retrieve active ball preset object
    getActiveBallPreset() {
      const activeKey = currentConfig.ball.activePreset;
      return currentConfig.ball.presets[activeKey] || currentConfig.ball.presets.preset1;
    },

    // Retrieve specific ball preset by key or fallback to mixed/random
    getBallPreset(key) {
      if (key === 'mixed') {
        const list = ['preset1', 'preset2', 'preset3'];
        const randomKey = list[Math.floor(Math.random() * list.length)];
        return currentConfig.ball.presets[randomKey];
      }
      return currentConfig.ball.presets[key] || this.getActiveBallPreset();
    },

    // Subscribe to config changes
    subscribe(callback) {
      if (typeof callback === 'function') {
        listeners.push(callback);
      }
    },

    // Notify all subscribers
    notify(path, value) {
      for (const cb of listeners) {
        try {
          cb(path, value, currentConfig);
        } catch (e) {
          console.error('Error in config listener:', e);
        }
      }
    },

    // Update parameter by dot-notation path, e.g. "player.moveSpeed", 360
    set(path, value) {
      const keys = path.split('.');
      let obj = currentConfig;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      saveToStorage(currentConfig);
      this.notify(path, value);
      triggerCloudAutoSync();
    },

    // Get value by dot path
    get(path) {
      const keys = path.split('.');
      let obj = currentConfig;
      for (const k of keys) {
        if (obj === undefined || obj === null) return undefined;
        obj = obj[k];
      }
      return obj;
    },

    // Apply Crisp Pacing Preset (清爽推荐配置)
    applyCrispPreset() {
      currentConfig.ball.maxGroundedBalls = 2;
      currentConfig.ball.maxActiveCoreBalls = 3;
      currentConfig.ball.maxSpeedCap = 1200;
      currentConfig.ball.onlyPlayerThrownBallsDrop = true;
      currentConfig.ball.groundLifetimeEnabled = true;
      currentConfig.ball.groundLifetimeDuration = 4.0;

      currentConfig.boss.telegraphDuration = 0.5;
      currentConfig.boss.mixMinionBullets = true;
      currentConfig.boss.randomizeBulletOrder = true;
      currentConfig.boss.spreadAngleJitter = 5;
      currentConfig.boss.phaseTransitionInvulnTime = 3.0;
      currentConfig.boss.p3RequireClearObstacles = true;
      currentConfig.boss.p2EdgeTeleportEnabled = true;
      currentConfig.boss.wavesBeforeTeleport = 1;
      currentConfig.boss.postFireTeleportDelay = 1.0;
      currentConfig.boss.teleportDuration = 0.4;
      currentConfig.arena.obstacleMaxHp = 100;
      currentConfig.arena.forceSpawnObstaclesAllPhases = false;
      currentConfig.boss.phase1.fireInterval = 2.8;
      currentConfig.boss.phase1.formationType = 'single';
      currentConfig.boss.phase2.fireInterval = 3.0;
      currentConfig.boss.phase2.formationType = 'fan';
      currentConfig.boss.phase2.fanCount = 5;
      currentConfig.boss.phase3.fireInterval = 2.6;
      currentConfig.boss.phase3.emitterSource = 'both';

      saveToStorage(currentConfig);
      this.notify('*', currentConfig);
      triggerCloudAutoSync();
    },

    // Reset all parameters to factory defaults and update LocalStorage
    reset() {
      currentConfig = deepClone(DEFAULT_CONFIG);
      saveToStorage(currentConfig);
      this.notify('*', currentConfig);
    },

    // Clear LocalStorage persistence
    clearStorage() {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {
        console.warn('Failed to clear storage:', e);
      }
    },

    // Export current config as formatted JSON string
    exportJSON() {
      return JSON.stringify(currentConfig, null, 2);
    },

    // Import config from JSON string or object with validation
    importJSON(jsonString) {
      try {
        const parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid JSON format: must be an object');
        }
        // Deep merge into currentConfig
        currentConfig = deepMerge(deepClone(DEFAULT_CONFIG), parsed);
        saveToStorage(currentConfig);
        this.notify('*', currentConfig);
        triggerCloudAutoSync();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    // Raw config reference
    get raw() {
      return currentConfig;
    }
  };

  window.GameConfig = GameConfig;

  // Attempt background fetch immediately
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    GameConfig.loadConfigAsync();
  }
})(window);
