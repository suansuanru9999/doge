/**
 * Project: Dodgeball Boss Rush
 * File: js/audio.js
 * Description: Procedural Web Audio Sound FX Engine (SoundManager).
 * Synthesizes 9+ core combat sound effects using zero external audio files.
 * Features:
 *  - Singleton AudioContext with autoplay unlock on any user interaction.
 *  - Sekiro-style crisp metallic parry chimes (perfectParry).
 *  - Shield absorption catches (goodCatch).
 *  - Air stall whiff penalties (whiff) & mechanical reject clicks (cooldownDeny).
 *  - Deep sub-bass slow motion transitions (bulletTimeEnter/Exit).
 *  - Aerodynamic projectile throw whooshes (playerThrow).
 *  - Heavy bass cannon boss impacts with chromatic combo escalations (bossHit).
 *  - Wall bounce pings & reverberant explosive blasts (wallBounce/wallExplode).
 *  - High-pass dash whooshes & distorted alarm player hurt sounds.
 *  - Triumphant victory fanfare chord arpeggios.
 */

(function(window) {
  'use strict';

  let audioCtx = null;
  let masterGain = null;
  let bulletTimeFilter = null;
  let noiseBuffer = null;
  let isMuted = false;
  let currentVolume = 0.7;
  let isBulletTimeActive = false;

  // -------------------------------------------------------------
  // 1. AudioContext Singleton & Autoplay Unlock
  // -------------------------------------------------------------
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      try {
        audioCtx = new AudioContextClass();
        setupAudioGraph();
      } catch (err) {
        console.warn('Unable to instantiate AudioContext:', err);
      }
    }
    return audioCtx;
  }

  function setupAudioGraph() {
    if (!audioCtx) return;

    // Bullet time master low-pass filter
    bulletTimeFilter = audioCtx.createBiquadFilter();
    bulletTimeFilter.type = 'lowpass';
    bulletTimeFilter.frequency.setValueAtTime(20000, audioCtx.currentTime);

    // Master volume gain node
    masterGain = audioCtx.createGain();
    const cfgAudio = (window.GameConfig && window.GameConfig.audio) ? window.GameConfig.audio : null;
    isMuted = cfgAudio ? !!cfgAudio.masterMute : false;
    currentVolume = cfgAudio && typeof cfgAudio.masterVolume === 'number' ? cfgAudio.masterVolume : 0.7;
    masterGain.gain.setValueAtTime(isMuted ? 0.0001 : currentVolume, audioCtx.currentTime);

    bulletTimeFilter.connect(masterGain);
    masterGain.connect(audioCtx.destination);

    // Watch for state changes
    audioCtx.onstatechange = () => {
      updateAudioStatusUI();
    };

    // Pre-cache 1-second white noise buffer for instantaneous synthesis
    initNoiseBuffer();
  }

  function initNoiseBuffer() {
    if (!audioCtx || noiseBuffer) return;
    try {
      const sampleRate = audioCtx.sampleRate || 44100;
      const bufferSize = sampleRate; // 1 second
      noiseBuffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    } catch (e) {
      console.warn('Error creating noise buffer:', e);
    }
  }

  function getNoiseBuffer() {
    if (!noiseBuffer && audioCtx) {
      initNoiseBuffer();
    }
    return noiseBuffer;
  }

  function unlockAudio() {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        updateAudioStatusUI();
      }).catch(err => {
        console.warn('AudioContext resume failed:', err);
      });
    } else {
      updateAudioStatusUI();
    }
  }

  function updateAudioStatusUI() {
    const ctx = audioCtx;
    const isRunning = ctx && ctx.state === 'running';
    const isSuspended = ctx && ctx.state === 'suspended';

    // 1. Update In-Game HUD Badge (#btn-audio-status)
    const hudBadge = document.getElementById('btn-audio-status');
    if (hudBadge) {
      hudBadge.classList.remove('active', 'suspended', 'muted');
      const textEl = hudBadge.querySelector('.status-text');
      if (isMuted) {
        hudBadge.classList.add('muted');
        if (textEl) textEl.textContent = 'Audio: Muted';
      } else if (isRunning) {
        hudBadge.classList.add('active');
        if (textEl) textEl.textContent = 'Audio: Active';
      } else {
        hudBadge.classList.add('suspended');
        if (textEl) textEl.textContent = 'Audio: Unlock';
      }
    }

    // 2. Update Inspector text if open
    const inspText = document.getElementById('inspector-audio-status-text');
    if (inspText) {
      if (isMuted) {
        inspText.style.color = '#ff4466';
        inspText.textContent = 'MUTED';
      } else if (isRunning) {
        inspText.style.color = '#00ffaa';
        inspText.textContent = `ACTIVE (${ctx.sampleRate}Hz)`;
      } else if (isSuspended) {
        inspText.style.color = '#ffaa00';
        inspText.textContent = 'SUSPENDED';
      } else {
        inspText.style.color = '#8b949e';
        inspText.textContent = 'UNINITIALIZED';
      }
    }
  }

  // -------------------------------------------------------------
  // 2. SoundManager Engine Definition
  // -------------------------------------------------------------
  const SoundManager = {
    init() {
      // Setup global gesture capture to unlock audio immediately on first interaction
      const gestureEvents = ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click'];
      const onUserGesture = () => {
        unlockAudio();
      };

      gestureEvents.forEach(evt => {
        window.addEventListener(evt, onUserGesture, { capture: true, passive: true });
        document.addEventListener(evt, onUserGesture, { capture: true, passive: true });
      });

      // Hook click on the HUD audio status button
      const hudBadge = document.getElementById('btn-audio-status');
      if (hudBadge) {
        hudBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          unlockAudio();
          this.perfectParry();
        });
      }

      // Sync with GameConfig live changes
      if (window.GameConfig) {
        window.GameConfig.subscribe(path => {
          if (path === '*' || path === 'audio.masterMute' || path === 'audio.masterVolume') {
            const cfg = window.GameConfig.audio;
            if (cfg) {
              this.setMute(cfg.masterMute);
              this.setVolume(cfg.masterVolume);
            }
          }
        });
      }

      // Initialize initial graph and UI state
      getAudioContext();
      updateAudioStatusUI();
    },

    ensureContext() {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      return ctx;
    },

    unlockAudio() {
      unlockAudio();
    },

    getAudioState() {
      return audioCtx ? audioCtx.state : 'uninitialized';
    },

    get sampleRate() {
      return audioCtx ? audioCtx.sampleRate : 0;
    },

    get isMuted() {
      return isMuted;
    },

    get volume() {
      return currentVolume;
    },

    getNoiseBuffer() {
      return getNoiseBuffer();
    },

    setMute(muted) {
      isMuted = !!muted;
      if (audioCtx && masterGain) {
        const now = audioCtx.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(isMuted ? 0.0001 : currentVolume, now);
      }
      updateAudioStatusUI();
    },

    setVolume(vol) {
      currentVolume = Math.max(0, Math.min(1, vol));
      if (audioCtx && masterGain && !isMuted) {
        const now = audioCtx.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(currentVolume, now);
      }
    },

    // -------------------------------------------------------------
    // Bullet Time Master Audio Filter Transitions
    // -------------------------------------------------------------
    setBulletTime(active) {
      isBulletTimeActive = !!active;
      if (active) {
        this.bulletTimeEnter();
      } else {
        this.bulletTimeExit();
      }
    },

    // 5. 进入子弹时间 (bulletTimeEnter)
    bulletTimeEnter() {
      const ctx = this.ensureContext();
      if (!ctx || isMuted) return;
      const now = ctx.currentTime;

      // Sub-bass 220Hz -> 45Hz exponential dive
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.42);
      gain.gain.setValueAtTime(0.65, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);

      osc.connect(gain);
      gain.connect(bulletTimeFilter);

      // Lowpass filter cutoff dives from 20000Hz down to 750Hz
      if (bulletTimeFilter) {
        bulletTimeFilter.frequency.cancelScheduledValues(now);
        bulletTimeFilter.frequency.setValueAtTime(bulletTimeFilter.frequency.value, now);
        bulletTimeFilter.frequency.exponentialRampToValueAtTime(750, now + 0.12);
      }

      osc.start(now);
      osc.stop(now + 0.5);
    },

    bulletTimeExit() {
      const ctx = this.ensureContext();
      if (!ctx || !bulletTimeFilter) return;
      const now = ctx.currentTime;

      bulletTimeFilter.frequency.cancelScheduledValues(now);
      bulletTimeFilter.frequency.setValueAtTime(bulletTimeFilter.frequency.value, now);
      bulletTimeFilter.frequency.exponentialRampToValueAtTime(20000, now + 0.15);
    },

    // -------------------------------------------------------------
    // 9 Core Combat Sound FX Synthesizers
    // -------------------------------------------------------------

    // 1. perfectParry（完美接球/打铁声）
    // 高频清脆金属碰撞声（双高频正弦波/三角波叠加 1200Hz + 2400Hz 极速起音与泛音衰减 + 4500Hz 碰撞白噪）
    perfectParry() {
      const ctx = this.ensureContext();
      if (!ctx || isMuted) return;
      const now = ctx.currentTime;

      // Primary Chime: 1200Hz -> 1050Hz Sine
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1200, now);
      osc1.frequency.exponentialRampToValueAtTime(1050, now + 0.32);
      gain1.gain.setValueAtTime(0.75, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
      osc1.connect(gain1);
      gain1.connect(bulletTimeFilter);

      // Overchime Harmonic: 2400Hz -> 2000Hz Triangle (Sekiro blade deflect sheen)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(2400, now);
      osc2.frequency.exponentialRampToValueAtTime(2000, now + 0.22);
      gain2.gain.setValueAtTime(0.65, now);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      osc2.connect(gain2);
      gain2.connect(bulletTimeFilter);

      // Upper metallic shimmer: 3600Hz Sine
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(3600, now);
      osc3.frequency.exponentialRampToValueAtTime(2800, now + 0.12);
      gain3.gain.setValueAtTime(0.4, now);
      gain3.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc3.connect(gain3);
      gain3.connect(bulletTimeFilter);

      // Metallic impact click (Bandpass filtered noise burst at 4500Hz)
      const noise = ctx.createBufferSource();
      const nBuf = this.getNoiseBuffer();
      if (nBuf) {
        noise.buffer = nBuf;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(4500, now);
        noiseFilter.Q.setValueAtTime(8.0, now);
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.6, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(bulletTimeFilter);
        noise.start(now);
        noise.stop(now + 0.05);
      }

      osc1.start(now); osc2.start(now); osc3.start(now);
      osc1.stop(now + 0.35); osc2.stop(now + 0.25); osc3.stop(now + 0.15);
    },

    // 2. goodCatch（普通接球）
    // 中频饱满护盾吸纳声（300Hz -> 600Hz 快速上扬正弦波 + 120Hz -> 55Hz 短促低频闷响）
    goodCatch() {
      const ctx = this.ensureContext();
      if (!ctx || isMuted) return;
      const now = ctx.currentTime;

      // 300Hz -> 600Hz upward swoop sine
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.09);
      gain.gain.setValueAtTime(0.55, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
      osc.connect(gain);
      gain.connect(bulletTimeFilter);

      // Low punch thud 120Hz -> 55Hz
      const thud = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thud.type = 'triangle';
      thud.frequency.setValueAtTime(120, now);
      thud.frequency.exponentialRampToValueAtTime(55, now + 0.1);
      thudGain.gain.setValueAtTime(0.5, now);
      thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      thud.connect(thudGain);
      thudGain.connect(bulletTimeFilter);

      osc.start(now); thud.start(now);
      osc.stop(now + 0.14); thud.stop(now + 0.11);
    },

    // 3. whiff（接球挥空惩罚）
    // 低沉干瘪漏气与破绽卡壳声（白噪音低通滤波扫频 1200Hz -> 200Hz + 180Hz -> 70Hz 锯齿波快速下坠）
    whiff() {
      const ctx = this.ensureContext();
      if (!ctx || isMuted) return;
      const now = ctx.currentTime;

      // 180Hz -> 70Hz rapid descent sawtooth (muffled via lowpass filter)
      const osc = ctx.createOscillator();
      const oscFilter = ctx.createBiquadFilter();
      const oscGain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.22);
      oscFilter.type = 'lowpass';
      oscFilter.frequency.setValueAtTime(650, now);
      oscGain.gain.setValueAtTime(0.5, now);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      osc.connect(oscFilter);
      oscFilter.connect(oscGain);
      oscGain.connect(bulletTimeFilter);

      // Decompression air hiss (white noise lowpass sweep 1200Hz -> 200Hz)
      const noise = ctx.createBufferSource();
      const nBuf = this.getNoiseBuffer();
      if (nBuf) {
        noise.buffer = nBuf;
        const nFilter = ctx.createBiquadFilter();
        nFilter.type = 'lowpass';
        nFilter.frequency.setValueAtTime(1200, now);
        nFilter.frequency.exponentialRampToValueAtTime(200, now + 0.2);
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.45, now);
        nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(bulletTimeFilter);
        noise.start(now);
        noise.stop(now + 0.21);
      }

      osc.start(now);
      osc.stop(now + 0.25);
    },

    // 4. cooldownDeny（冷却中狂按拒绝声）
    // 短促双连发“咔哒/滴滴”机械锁定提示音（150Hz 与 130Hz 方波短脉冲）
    cooldownDeny() {
      const ctx = this.ensureContext();
      if (!ctx || isMuted) return;
      const now = ctx.currentTime;

      [0, 0.048].forEach((offset, idx) => {
        const t = now + offset;
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(idx === 0 ? 150 : 130, t);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, t);
        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(bulletTimeFilter);

        osc.start(t);
        osc.stop(t + 0.04);
      });
    },

    // 6. playerThrow（松手将球射出）
    // 强力破空呼啸声（200Hz -> 500Hz 快速冲击配合高频风声噪波 600Hz -> 2400Hz）
    playerThrow(isPerfect = false, speedRatio = 1.0) {
      const ctx = this.ensureContext();
      if (!ctx || isMuted) return;
      const now = ctx.currentTime;

      const baseFreq = isPerfect ? 240 : 200;
      const topFreq = (isPerfect ? 600 : 480) * Math.min(1.5, Math.max(0.8, speedRatio));

      // Tonal whoosh
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isPerfect ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(topFreq, now + 0.14);
      gain.gain.setValueAtTime(isPerfect ? 0.6 : 0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.connect(gain);
      gain.connect(bulletTimeFilter);

      // Aerodynamic wind noise
      const noise = ctx.createBufferSource();
      const nBuf = this.getNoiseBuffer();
      if (nBuf) {
        noise.buffer = nBuf;
        const nFilter = ctx.createBiquadFilter();
        nFilter.type = 'bandpass';
        nFilter.frequency.setValueAtTime(600, now);
        nFilter.frequency.exponentialRampToValueAtTime(2400, now + 0.1);
        nFilter.Q.setValueAtTime(3.0, now);
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(isPerfect ? 0.5 : 0.35, now);
        nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(bulletTimeFilter);
        noise.start(now);
        noise.stop(now + 0.17);
      }

      osc.start(now);
      osc.stop(now + 0.17);
    },

    // 7. bossHit（球砸中 Boss）
    // 厚重低频重炮打击声（120Hz -> 30Hz 强力 Punch 正弦波 + 爆裂白噪音）
    // 连击连段音高递增：pitch *= 1 + combo * 0.05
    bossHit(combo = 1) {
      const ctx = this.ensureContext();
      if (!ctx || isMuted) return;
      const now = ctx.currentTime;

      // Heavy punch sine 120Hz -> 30Hz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
      gain.gain.setValueAtTime(0.75, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.connect(gain);
      gain.connect(bulletTimeFilter);

      // Explosive crack noise
      const noise = ctx.createBufferSource();
      const nBuf = this.getNoiseBuffer();
      if (nBuf) {
        noise.buffer = nBuf;
        const nFilter = ctx.createBiquadFilter();
        nFilter.type = 'lowpass';
        nFilter.frequency.setValueAtTime(900, now);
        nFilter.frequency.exponentialRampToValueAtTime(100, now + 0.12);
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.55, now);
        nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(bulletTimeFilter);
        noise.start(now);
        noise.stop(now + 0.15);
      }

      osc.start(now);
      osc.stop(now + 0.23);

      // Combo tone escalates with combo count
      if (combo >= 1) {
        const pitchMult = 1 + (combo - 1) * 0.05;
        const chime = ctx.createOscillator();
        const chimeGain = ctx.createGain();
        chime.type = 'triangle';
        chime.frequency.setValueAtTime(330 * pitchMult, now + 0.02);
        chime.frequency.exponentialRampToValueAtTime(440 * pitchMult, now + 0.18);
        chimeGain.gain.setValueAtTime(0.4, now + 0.02);
        chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        chime.connect(chimeGain);
        chimeGain.connect(bulletTimeFilter);
        chime.start(now + 0.02);
        chime.stop(now + 0.23);
      }
    },

    // 8a. wallBounce（撞墙反弹）
    // 清脆乒乓弹性声（400Hz -> 550Hz）
    wallBounce() {
      const ctx = this.ensureContext();
      if (!ctx || isMuted) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(550, now + 0.06);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

      osc.connect(gain);
      gain.connect(bulletTimeFilter);
      osc.start(now);
      osc.stop(now + 0.09);
    },

    // 8b. wallExplode（版边爆炸 / 障碍物破损 / 超时爆炸）
    // 长混响低频轰鸣白噪音 + 次低频冲击轰鸣
    wallExplode() {
      const ctx = this.ensureContext();
      if (!ctx || isMuted) return;
      const now = ctx.currentTime;

      // Long reverberant noise boom
      const noise = ctx.createBufferSource();
      const nBuf = this.getNoiseBuffer();
      if (nBuf) {
        noise.buffer = nBuf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, now);
        filter.frequency.exponentialRampToValueAtTime(50, now + 0.6);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.85, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(bulletTimeFilter);
        noise.start(now);
        noise.stop(now + 0.66);
      }

      // Sub-bass thump
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(90, now);
      sub.frequency.exponentialRampToValueAtTime(25, now + 0.5);
      subGain.gain.setValueAtTime(0.7, now);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
      sub.connect(subGain);
      subGain.connect(bulletTimeFilter);

      sub.start(now);
      sub.stop(now + 0.53);
    },

    // 9a. dash（闪避）
    // 轻快高通滤波风声 + 微弱高频上扬正弦
    dash() {
      const ctx = this.ensureContext();
      if (!ctx || isMuted) return;
      const now = ctx.currentTime;

      // High-pass filtered wind rush
      const noise = ctx.createBufferSource();
      const nBuf = this.getNoiseBuffer();
      if (nBuf) {
        noise.buffer = nBuf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.exponentialRampToValueAtTime(400, now + 0.18);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(bulletTimeFilter);
        noise.start(now);
        noise.stop(now + 0.19);
      }

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.1);
      oscGain.gain.setValueAtTime(0.3, now);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(oscGain);
      oscGain.connect(bulletTimeFilter);

      osc.start(now);
      osc.stop(now + 0.13);
    },

    // 9b. playerHurt（玩家受击）
    // 刺耳失真锯齿波下降报警声（260Hz -> 80Hz）+ 噪声断裂击打
    playerHurt() {
      const ctx = this.ensureContext();
      if (!ctx || isMuted) return;
      const now = ctx.currentTime;

      // Harsh distorted sawtooth alarm
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.25);
      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.27);
      osc.connect(gain);
      gain.connect(bulletTimeFilter);

      // Noise crack
      const noise = ctx.createBufferSource();
      const nBuf = this.getNoiseBuffer();
      if (nBuf) {
        noise.buffer = nBuf;
        const nFilter = ctx.createBiquadFilter();
        nFilter.type = 'bandpass';
        nFilter.frequency.setValueAtTime(1500, now);
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.5, now);
        nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(bulletTimeFilter);
        noise.start(now);
        noise.stop(now + 0.11);
      }

      osc.start(now);
      osc.stop(now + 0.28);
    },

    // 10. victoryFanfare（击败 Boss 胜利和弦大琶音）
    // C5-E5-G5-C6 辉煌大三和弦琶音
    victoryFanfare() {
      const ctx = this.ensureContext();
      if (!ctx || isMuted) return;
      const now = ctx.currentTime;

      const notes = [
        { freq: 523.25, time: 0.00, dur: 0.4 },  // C5
        { freq: 659.25, time: 0.12, dur: 0.4 },  // E5
        { freq: 783.99, time: 0.24, dur: 0.4 },  // G5
        { freq: 1046.50, time: 0.36, dur: 0.85 } // C6
      ];

      notes.forEach(note => {
        const t = now + note.time;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, t);
        gain.gain.setValueAtTime(0.55, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + note.dur);
        osc.connect(gain);
        gain.connect(bulletTimeFilter);
        osc.start(t);
        osc.stop(t + note.dur + 0.02);
      });
    },

    // 11. overheatTick（过热临界倒计时急促蜂鸣）
    overheatTick(pitchFactor = 1.0) {
      const ctx = this.ensureContext();
      if (!ctx || isMuted) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(800 * pitchFactor, now);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

      osc.connect(gain);
      gain.connect(bulletTimeFilter);
      osc.start(now);
      osc.stop(now + 0.05);
    }
  };

  // -------------------------------------------------------------
  // Full Aliasing for Seamless Integration with Existing Codebase
  // -------------------------------------------------------------
  SoundManager.playParry = SoundManager.perfectParry;
  SoundManager.playCatch = SoundManager.goodCatch;
  SoundManager.playWhiff = SoundManager.whiff;
  SoundManager.playWhiffRejected = SoundManager.cooldownDeny;
  SoundManager.playThrow = SoundManager.playerThrow;
  SoundManager.playBossHit = SoundManager.bossHit;
  SoundManager.playWallBounce = SoundManager.wallBounce;
  SoundManager.playExplosion = SoundManager.wallExplode;
  SoundManager.playDash = SoundManager.dash;
  SoundManager.playPlayerHit = SoundManager.playerHurt;
  SoundManager.playVictoryFanfare = SoundManager.victoryFanfare;
  SoundManager.playOverheatTick = SoundManager.overheatTick;
  SoundManager.playBulletDrone = SoundManager.bulletTimeEnter;

  window.SoundManager = SoundManager;
  window.SoundFX = SoundManager;
})(window);
