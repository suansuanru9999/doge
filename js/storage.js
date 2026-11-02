/**
 * Project: Dodgeball Boss Rush
 * File: js/storage.js
 * Description: Pure Static Storage & Speedrun Leaderboard Service (StorageService).
 * Features:
 *  - Top 10 Speedrun Leaderboard with automatic culling (strict slice(0, 10)).
 *  - Dual-mode Cloud JSON Sync (GET / PUT REST) + LocalStorage + static ./leaderboard.json fallback.
 *  - File System Access API (showSaveFilePicker) with fallback blob download for config.json and leaderboard.json.
 */

(function(window) {
  'use strict';

  const STORAGE_LEADERBOARD_BIGBOSS_KEY = 'DODGEBALL_LEADERBOARD_BIGBOSS';
  const STORAGE_LEADERBOARD_PHANTOM_KEY = 'DODGEBALL_LEADERBOARD_PHANTOM';
  const STORAGE_LEADERBOARD_LEGACY_KEY = 'DODGEBALL_LEADERBOARD_V1';
  const STORAGE_LAST_NAME_KEY = 'DODGEBALL_LAST_PLAYER_NAME';

  // Default Top 10 Speedrun fallback list for BIGBOSS
  const DEFAULT_LEADERBOARD_BIGBOSS = [
    { id: 'bb_01', name: 'CYBER_ACE', timeMs: 48320, timeFormatted: '00:48.32', date: '2026-10-30', combo: 32 },
    { id: 'bb_02', name: 'PARRY_GOD', timeMs: 54150, timeFormatted: '00:54.15', date: '2026-10-31', combo: 28 },
    { id: 'bb_03', name: 'BULLET_DANCER', timeMs: 62800, timeFormatted: '01:02.80', date: '2026-11-01', combo: 25 },
    { id: 'bb_04', name: 'GLITCH_SLAYER', timeMs: 71450, timeFormatted: '01:11.45', date: '2026-11-01', combo: 22 },
    { id: 'bb_05', name: 'MATRIX_RUNNER', timeMs: 78900, timeFormatted: '01:18.90', date: '2026-11-01', combo: 20 },
    { id: 'bb_06', name: 'ECHO_STRIKE', timeMs: 85200, timeFormatted: '01:25.20', date: '2026-11-02', combo: 19 },
    { id: 'bb_07', name: 'REFLEX_007', timeMs: 94600, timeFormatted: '01:34.60', date: '2026-11-02', combo: 17 },
    { id: 'bb_08', name: 'VIPER_CORE', timeMs: 102100, timeFormatted: '01:42.10', date: '2026-11-02', combo: 15 },
    { id: 'bb_09', name: 'ZERO_LATENCY', timeMs: 113750, timeFormatted: '01:53.75', date: '2026-11-02', combo: 14 },
    { id: 'bb_10', name: 'NEON_SHIELD', timeMs: 128500, timeFormatted: '02:08.50', date: '2026-11-02', combo: 12 }
  ];

  // Default Top 10 Speedrun fallback list for PHANTOM BOSS
  const DEFAULT_LEADERBOARD_PHANTOM = [
    { id: 'ph_01', name: 'GHOST_BUSTER', timeMs: 42150, timeFormatted: '00:42.15', date: '2026-11-01', combo: 35 },
    { id: 'ph_02', name: 'SHADOW_WALKER', timeMs: 49800, timeFormatted: '00:49.80', date: '2026-11-01', combo: 30 },
    { id: 'ph_03', name: 'OVERLOAD_PRO', timeMs: 56300, timeFormatted: '00:56.30', date: '2026-11-02', combo: 27 },
    { id: 'ph_04', name: 'PHANTOM_PARRY', timeMs: 64200, timeFormatted: '01:04.20', date: '2026-11-02', combo: 24 },
    { id: 'ph_05', name: 'WALL_CRASHER', timeMs: 72100, timeFormatted: '01:12.10', date: '2026-11-02', combo: 21 },
    { id: 'ph_06', name: 'STEALTH_KILLER', timeMs: 81400, timeFormatted: '01:21.40', date: '2026-11-02', combo: 19 },
    { id: 'ph_07', name: 'REFLEX_ZERO', timeMs: 89900, timeFormatted: '01:29.90', date: '2026-11-02', combo: 17 },
    { id: 'ph_08', name: 'CYBER_SPECTER', timeMs: 98700, timeFormatted: '01:38.70', date: '2026-11-02', combo: 15 },
    { id: 'ph_09', name: 'BULLET_SURVIVOR', timeMs: 109200, timeFormatted: '01:49.20', date: '2026-11-02', combo: 13 },
    { id: 'ph_10', name: 'VOID_RUNNER', timeMs: 122400, timeFormatted: '02:02.40', date: '2026-11-02', combo: 11 }
  ];

  function normalizeBossId(bossId) {
    if (!bossId) return 'bigboss';
    const s = String(bossId).toLowerCase();
    if (s.includes('phantom') || s === 'boss2') return 'phantom';
    return 'bigboss';
  }

  function getResourceName(bossId) {
    return normalizeBossId(bossId) === 'phantom' ? 'leaderboard_phantom' : 'leaderboard_bigboss';
  }

  function getStorageKey(bossId) {
    return normalizeBossId(bossId) === 'phantom' ? STORAGE_LEADERBOARD_PHANTOM_KEY : STORAGE_LEADERBOARD_BIGBOSS_KEY;
  }

  function getDefaultLeaderboard(bossId) {
    return normalizeBossId(bossId) === 'phantom' ? DEFAULT_LEADERBOARD_PHANTOM : DEFAULT_LEADERBOARD_BIGBOSS;
  }

  function formatTimeMs(ms) {
    const totalSeconds = Math.max(0, ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const centis = Math.floor((totalSeconds * 100) % 100);
    const mStr = String(minutes).padStart(2, '0');
    const sStr = String(seconds).padStart(2, '0');
    const cStr = String(centis).padStart(2, '0');
    return `${mStr}:${sStr}.${cStr}`;
  }

  // Smart endpoint resolver: handles Firebase Realtime Database and generic REST base URLs
  function resolveCloudEndpoint(rawUrl, resource = 'leaderboard') {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    let url = rawUrl.trim();
    if (!url) return '';

    // If url contains .json
    if (url.endsWith('.json')) {
      const parts = url.split('/');
      parts[parts.length - 1] = `${resource}.json`;
      return parts.join('/');
    }

    // Strip trailing slashes
    url = url.replace(/\/+$/, '');

    // For Firebase RTDB or base URLs, append resource.json
    return `${url}/${resource}.json`;
  }

  function downloadBlob(content, filename, mimeType = 'application/json') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  const StorageService = {
    formatTimeMs,

    normalizeBossId,
    getResourceName,

    getLastPlayerName() {
      try {
        return localStorage.getItem(STORAGE_LAST_NAME_KEY) || 'CYBER_PLAYER';
      } catch (e) {
        return 'CYBER_PLAYER';
      }
    },

    setLastPlayerName(name) {
      try {
        localStorage.setItem(STORAGE_LAST_NAME_KEY, name);
      } catch (e) {}
    },

    // Load leaderboard with Cloud -> LocalStorage -> ./leaderboard.json fallback
    async loadLeaderboard(bossId = 'bigboss') {
      const normBoss = normalizeBossId(bossId);
      const resource = getResourceName(normBoss);
      const storageKey = getStorageKey(normBoss);
      const defaultList = getDefaultLeaderboard(normBoss);

      const storageCfg = (window.GameConfig && window.GameConfig.storage) ? window.GameConfig.storage : {};
      const cloudUrl = storageCfg.cloudSyncUrl;
      const apiKey = storageCfg.apiKey;

      // 1. Try Cloud REST GET if configured
      if (cloudUrl && cloudUrl.trim().length > 0) {
        try {
          const endpoint = resolveCloudEndpoint(cloudUrl, resource);
          let requestUrl = endpoint;
          const headers = {};
          if (apiKey && apiKey.trim().length > 0) {
            if (endpoint.includes('firebaseio.com')) {
              requestUrl += (requestUrl.includes('?') ? '&' : '?') + 'auth=' + encodeURIComponent(apiKey.trim());
            } else {
              headers['X-Master-Key'] = apiKey.trim();
              headers['Authorization'] = 'Bearer ' + apiKey.trim();
            }
          }
          const res = await fetch(requestUrl, { headers });
          if (res.ok) {
            const data = await res.json();
            let list = [];
            if (Array.isArray(data)) {
              list = data;
            } else if (data && typeof data === 'object') {
              if (Array.isArray(data.record)) list = data.record;
              else if (Array.isArray(data.leaderboard)) list = data.leaderboard;
              else if (Array.isArray(data.data)) list = data.data;
              else {
                list = Object.values(data);
              }
            }
            if (list.length > 0) {
              const clean = this.sanitizeAndSort(list);
              this.saveLocalLeaderboard(clean, normBoss);
              return clean;
            }
          }
        } catch (err) {
          console.warn(`[StorageService] Cloud leaderboard fetch for ${resource} failed, falling back to local:`, err);
        }
      }

      // 2. Try LocalStorage
      try {
        let localRaw = localStorage.getItem(storageKey);
        if (!localRaw && normBoss === 'bigboss') {
          localRaw = localStorage.getItem(STORAGE_LEADERBOARD_LEGACY_KEY);
        }
        if (localRaw) {
          const parsed = JSON.parse(localRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return this.sanitizeAndSort(parsed);
          }
        }
      } catch (e) {
        console.warn(`[StorageService] LocalStorage read for ${storageKey} failed:`, e);
      }

      // 3. Try fetching static ./leaderboard_*.json from root
      try {
        const fileNames = normBoss === 'phantom' 
          ? ['./leaderboard_phantom.json'] 
          : ['./leaderboard_bigboss.json', './leaderboard.json'];
        for (const fn of fileNames) {
          try {
            const res = await fetch(fn + '?t=' + Date.now());
            if (res.ok) {
              const json = await res.json();
              if (Array.isArray(json) && json.length > 0) {
                const clean = this.sanitizeAndSort(json);
                this.saveLocalLeaderboard(clean, normBoss);
                return clean;
              }
            }
          } catch (_) {}
        }
      } catch (e) {
        console.warn(`[StorageService] Static leaderboard fetch failed for ${resource}:`, e);
      }

      // 4. Return built-in default list
      const cleanDefaults = this.sanitizeAndSort(defaultList);
      this.saveLocalLeaderboard(cleanDefaults, normBoss);
      return cleanDefaults;
    },

    // Sanitize, sort ascending by timeMs, and strictly slice top 10
    sanitizeAndSort(list) {
      if (!Array.isArray(list)) return [];
      const valid = list.filter(item => item && typeof item.timeMs === 'number' && !isNaN(item.timeMs));
      valid.sort((a, b) => a.timeMs - b.timeMs);
      return valid.slice(0, 10).map((item, idx) => ({
        id: item.id || `rec_${idx + 1}`,
        name: (String(item.name || 'ANONYMOUS')).trim().slice(0, 12) || 'ANONYMOUS',
        timeMs: Math.round(item.timeMs),
        timeFormatted: item.timeFormatted || formatTimeMs(item.timeMs),
        date: item.date || new Date().toISOString().slice(0, 10),
        combo: item.combo || 0
      }));
    },

    saveLocalLeaderboard(list, bossId = 'bigboss') {
      try {
        const storageKey = getStorageKey(bossId);
        localStorage.setItem(storageKey, JSON.stringify(list));
      } catch (e) {
        console.warn('[StorageService] Failed to save to LocalStorage:', e);
      }
    },

    // Add new speedrun record, sort, cull to Top 10, and sync
    async addRecord(entry, bossId = 'bigboss') {
      const normBoss = normalizeBossId(bossId);
      const resource = getResourceName(normBoss);
      const name = (String(entry.name || 'CYBER_PLAYER')).trim().slice(0, 12) || 'CYBER_PLAYER';
      this.setLastPlayerName(name);

      const timeMs = Math.round(entry.timeMs);
      const timeFormatted = entry.timeFormatted || formatTimeMs(timeMs);
      const date = entry.date || new Date().toISOString().slice(0, 10);
      const combo = entry.combo || 0;
      const newId = 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

      const newRecord = {
        id: newId,
        name,
        timeMs,
        timeFormatted,
        date,
        combo
      };

      // Load existing records for this specific boss
      let currentList = await this.loadLeaderboard(normBoss);
      currentList.push(newRecord);

      // Sort ascending by timeMs
      currentList.sort((a, b) => a.timeMs - b.timeMs);

      const rankIndex = currentList.findIndex(r => r.id === newId);
      const isTop10 = rankIndex >= 0 && rankIndex < 10;

      // Strict Top 10 Culling: automatically evict beyond 10th
      currentList = currentList.slice(0, 10);

      // Save locally to specific boss key
      this.saveLocalLeaderboard(currentList, normBoss);

      // Sync to cloud at resource endpoint (e.g. leaderboard_bigboss.json / leaderboard_phantom.json)
      const storageCfg = (window.GameConfig && window.GameConfig.storage) ? window.GameConfig.storage : {};
      const cloudUrl = storageCfg.cloudSyncUrl;
      const apiKey = storageCfg.apiKey;

      if (cloudUrl && cloudUrl.trim().length > 0) {
        try {
          const endpoint = resolveCloudEndpoint(cloudUrl, resource);
          let requestUrl = endpoint;
          const headers = { 'Content-Type': 'application/json' };
          if (apiKey && apiKey.trim().length > 0) {
            if (endpoint.includes('firebaseio.com')) {
              requestUrl += (requestUrl.includes('?') ? '&' : '?') + 'auth=' + encodeURIComponent(apiKey.trim());
            } else {
              headers['X-Master-Key'] = apiKey.trim();
              headers['Authorization'] = 'Bearer ' + apiKey.trim();
            }
          }
          await fetch(requestUrl, {
            method: 'PUT',
            headers,
            body: JSON.stringify(currentList)
          });
          console.log(`[StorageService] Leaderboard (${resource}) synced to cloud successfully:`, requestUrl);
        } catch (e) {
          console.warn('[StorageService] Cloud sync PUT failed:', e);
        }
      }

      return {
        list: currentList,
        newRecordId: newId,
        rank: rankIndex + 1, // 1-based rank
        isTop10,
        bossId: normBoss
      };
    },

    // Export leaderboard file to disk
    async exportLeaderboardFile(bossId = 'bigboss') {
      const normBoss = normalizeBossId(bossId);
      const resource = getResourceName(normBoss);
      const list = await this.loadLeaderboard(normBoss);
      const jsonStr = JSON.stringify(list, null, 2);
      const fileName = `${resource}.json`;

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: 'leaderboard.json',
            types: [{
              description: 'JSON Leaderboard File',
              accept: { 'application/json': ['.json'] }
            }]
          });
          const writable = await handle.createWritable();
          await writable.write(jsonStr);
          await writable.close();
          return { success: true, method: 'picker' };
        } catch (err) {
          if (err.name === 'AbortError') return { cancelled: true };
          console.warn('showSaveFilePicker failed, falling back to download:', err);
        }
      }

      downloadBlob(jsonStr, 'leaderboard.json', 'application/json');
      return { success: true, method: 'download' };
    },

    // Export config.json to disk
    async exportConfigFile() {
      const jsonStr = window.GameConfig ? window.GameConfig.exportJSON() : '{}';

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: 'config.json',
            types: [{
              description: 'JSON Configuration File',
              accept: { 'application/json': ['.json'] }
            }]
          });
          const writable = await handle.createWritable();
          await writable.write(jsonStr);
          await writable.close();
          return { success: true, method: 'picker' };
        } catch (err) {
          if (err.name === 'AbortError') return { cancelled: true };
          console.warn('showSaveFilePicker failed, falling back to download:', err);
        }
      }

      downloadBlob(jsonStr, 'config.json', 'application/json');
      return { success: true, method: 'download' };
    },

    // Load GameConfig from Firebase / Cloud Storage
    async loadConfigFromCloud() {
      const storageCfg = (window.GameConfig && window.GameConfig.storage) ? window.GameConfig.storage : {};
      const cloudUrl = storageCfg.cloudSyncUrl || (window.DEFAULT_GAME_CONFIG && window.DEFAULT_GAME_CONFIG.storage && window.DEFAULT_GAME_CONFIG.storage.cloudSyncUrl);
      const apiKey = storageCfg.apiKey;

      if (!cloudUrl || !cloudUrl.trim()) return null;

      try {
        const endpoint = resolveCloudEndpoint(cloudUrl, 'config');
        let requestUrl = endpoint;
        const headers = {};
        if (apiKey && apiKey.trim().length > 0) {
          if (endpoint.includes('firebaseio.com')) {
            requestUrl += (requestUrl.includes('?') ? '&' : '?') + 'auth=' + encodeURIComponent(apiKey.trim());
          } else {
            headers['X-Master-Key'] = apiKey.trim();
            headers['Authorization'] = 'Bearer ' + apiKey.trim();
          }
        }
        const res = await fetch(requestUrl, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === 'object' && Object.keys(data).length > 0) {
            console.log('[StorageService] Successfully loaded config from cloud:', requestUrl);
            return data;
          }
        }
      } catch (err) {
        console.warn('[StorageService] Failed to load config from cloud:', err);
      }
      return null;
    },

    // Save GameConfig to Firebase / Cloud Storage
    async saveConfigToCloud(configObj) {
      const cfgToSave = configObj || (window.GameConfig ? window.GameConfig.raw : null);
      if (!cfgToSave) return { success: false, error: '未获取到配置数据' };

      const storageCfg = (window.GameConfig && window.GameConfig.storage) ? window.GameConfig.storage : {};
      const cloudUrl = storageCfg.cloudSyncUrl || (window.DEFAULT_GAME_CONFIG && window.DEFAULT_GAME_CONFIG.storage && window.DEFAULT_GAME_CONFIG.storage.cloudSyncUrl);
      const apiKey = storageCfg.apiKey;

      if (!cloudUrl || !cloudUrl.trim()) {
        return { success: false, error: '未配置云端数据库地址 (cloudSyncUrl 为空)' };
      }

      try {
        const endpoint = resolveCloudEndpoint(cloudUrl, 'config');
        let requestUrl = endpoint;
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey && apiKey.trim().length > 0) {
          if (endpoint.includes('firebaseio.com')) {
            requestUrl += (requestUrl.includes('?') ? '&' : '?') + 'auth=' + encodeURIComponent(apiKey.trim());
          } else {
            headers['X-Master-Key'] = apiKey.trim();
            headers['Authorization'] = 'Bearer ' + apiKey.trim();
          }
        }

        const res = await fetch(requestUrl, {
          method: 'PUT',
          headers,
          body: JSON.stringify(cfgToSave)
        });

        if (res.ok) {
          console.log('[StorageService] Config successfully synced to cloud:', requestUrl);
          return { success: true, url: requestUrl };
        } else {
          const errText = await res.text();
          console.error('[StorageService] Cloud sync PUT failed:', res.status, errText);
          return { success: false, error: `HTTP ${res.status}: ${errText}` };
        }
      } catch (err) {
        console.error('[StorageService] Cloud sync PUT network error:', err);
        return { success: false, error: err.message };
      }
    },

    // Copy config JSON to clipboard
    async copyConfigToClipboard() {
      const jsonStr = window.GameConfig ? window.GameConfig.exportJSON() : '{}';
      console.log('[GameConfig Export JSON]\n', jsonStr);

      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(jsonStr);
          return true;
        } catch (e) {
          console.warn('Clipboard writeText failed, trying fallback:', e);
        }
      }

      // Textarea fallback
      const ta = document.createElement('textarea');
      ta.value = jsonStr;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
      } catch (err) {
        document.body.removeChild(ta);
        return false;
      }
    }
  };

  window.StorageService = StorageService;
})(window);
