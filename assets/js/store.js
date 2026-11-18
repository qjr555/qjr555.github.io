/* 碎页集 — 本地数据层
 * 不登录、不联网，卡片与复习记录都保存在 localStorage。
 */
(function () {
  'use strict';

  const DATA_KEY = 'suiyeji.v1';
  const THEME_KEY = 'suiyeji.theme';
  const VERSION = 1;
  const MAX_TAGS = 8;

  const dataSeed = window.SuiData;
  const md = window.SuiMarkdown;

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function dayKey(date) {
    const d = date || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function uid(prefix) {
    return (prefix || 'c_') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function normalizeTags(input) {
    let list = [];
    if (Array.isArray(input)) {
      list = input;
    } else {
      list = String(input == null ? '' : input).split(/[\s,，、;；#]+/);
    }
    const seen = Object.create(null);
    const tags = [];
    list.forEach(function (item) {
      const tag = String(item == null ? '' : item).replace(/^#+/, '').trim().slice(0, 18);
      if (!tag) return;
      const lower = tag.toLowerCase();
      if (seen[lower]) return;
      seen[lower] = true;
      tags.push(tag);
    });
    return tags.slice(0, MAX_TAGS);
  }

  function normalizeKind(value) {
    const text = String(value == null ? '' : value).trim();
    if (dataSeed.KINDS[text]) return text;
    for (const key in dataSeed.KINDS) {
      if (dataSeed.KINDS[key].label === text) return key;
    }
    return 'note';
  }

  function normalizeSubject(value) {
    const text = String(value == null ? '' : value).trim();
    const match = dataSeed.SUBJECTS.find(function (item) { return item.name === text; });
    if (match) return match.name;
    return '其他';
  }

  function normalizeCard(raw, fallbackDate) {
    if (!raw || typeof raw !== 'object') return null;
    const content = String(raw.content == null ? '' : raw.content).replace(/\r\n?/g, '\n').trim().slice(0, 4000);
    if (!content) return null;
    let title = String(raw.title == null ? '' : raw.title).trim().slice(0, 80);
    if (!title) title = md.firstLine(content) || '未命名碎片';
    const created = raw.createdAt ? new Date(raw.createdAt) : new Date(fallbackDate || Date.now());
    return {
      id: typeof raw.id === 'string' && /^[a-zA-Z0-9_-]{2,48}$/.test(raw.id) ? raw.id : uid(),
      title: title,
      content: content,
      tags: normalizeTags(raw.tags),
      kind: normalizeKind(raw.kind),
      subject: normalizeSubject(raw.subject),
      favorite: Boolean(raw.favorite),
      demo: Boolean(raw.demo),
      createdAt: isNaN(created.getTime()) ? new Date(fallbackDate || Date.now()).toISOString() : created.toISOString(),
      updatedAt: raw.updatedAt && !isNaN(new Date(raw.updatedAt).getTime()) ? new Date(raw.updatedAt).toISOString() : null
    };
  }

  function seedCards() {
    const now = Date.now();
    return dataSeed.SEED.map(function (item, index) {
      const card = normalizeCard({
        id: 'seed-' + pad(index + 1),
        title: item.title,
        content: item.content,
        tags: item.tags,
        kind: item.kind,
        subject: item.subject,
        demo: true,
        favorite: index === 0 || index === 10 || index === 22,
        createdAt: new Date(now - item.ago * 3600 * 1000).toISOString()
      });
      return card;
    }).filter(Boolean);
  }

  function defaultData() {
    return {
      version: VERSION,
      createdAt: new Date().toISOString(),
      cards: seedCards(),
      settings: { layout: 'grid' },
      stats: { daily: {}, reviews: {} }
    };
  }

  function readStorage() {
    try {
      return window.localStorage.getItem(DATA_KEY);
    } catch (error) {
      return null;
    }
  }

  function cleanStats(raw) {
    const stats = { daily: {}, reviews: {} };
    if (!raw || typeof raw !== 'object') return stats;
    if (raw.daily && typeof raw.daily === 'object') {
      Object.keys(raw.daily).slice(-120).forEach(function (key) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
        const item = raw.daily[key] || {};
        stats.daily[key] = {
          drawn: Math.max(0, Number(item.drawn) || 0),
          remembered: Math.max(0, Number(item.remembered) || 0)
        };
      });
    }
    if (raw.reviews && typeof raw.reviews === 'object') {
      Object.keys(raw.reviews).slice(-500).forEach(function (id) {
        const item = raw.reviews[id] || {};
        stats.reviews[id] = {
          seen: Math.max(0, Number(item.seen) || 0),
          remembered: Math.max(0, Number(item.remembered) || 0),
          last: item.last || null
        };
      });
    }
    return stats;
  }

  function load() {
    const raw = readStorage();
    if (raw == null) return defaultData();
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.cards)) return defaultData();
      const cards = [];
      const ids = Object.create(null);
      parsed.cards.forEach(function (item, index) {
        const card = normalizeCard(item, Date.now() - index * 1000);
        if (!card) return;
        if (ids[card.id]) card.id = uid();
        ids[card.id] = true;
        cards.push(card);
      });
      return {
        version: VERSION,
        createdAt: parsed.createdAt || new Date().toISOString(),
        cards: cards,
        settings: Object.assign({ layout: 'grid' }, parsed.settings || {}),
        stats: cleanStats(parsed.stats)
      };
    } catch (error) {
      return defaultData();
    }
  }

  const Store = {
    data: load(),
    storageAvailable: true,
    storageFailedNotified: false,

    persist: function () {
      try {
        window.localStorage.setItem(DATA_KEY, JSON.stringify(this.data));
        this.storageAvailable = true;
        return true;
      } catch (error) {
        this.storageAvailable = false;
        return false;
      }
    },

    cards: function () {
      return this.data.cards;
    },

    find: function (id) {
      return this.data.cards.find(function (card) { return card.id === id; }) || null;
    },

    add: function (raw) {
      const card = normalizeCard(raw);
      if (!card) return null;
      card.id = uid();
      while (this.find(card.id)) card.id = uid();
      card.demo = false;
      this.data.cards.unshift(card);
      this.persist();
      return card;
    },

    update: function (id, patch) {
      const index = this.data.cards.findIndex(function (card) { return card.id === id; });
      if (index < 0) return null;
      const current = this.data.cards[index];
      const next = normalizeCard(Object.assign({}, current, patch, {
        id: current.id,
        createdAt: current.createdAt,
        demo: current.demo
      }));
      if (!next) return null;
      next.updatedAt = new Date().toISOString();
      this.data.cards[index] = next;
      this.persist();
      return next;
    },

    remove: function (id) {
      const index = this.data.cards.findIndex(function (card) { return card.id === id; });
      if (index < 0) return false;
      this.data.cards.splice(index, 1);
      delete this.data.stats.reviews[id];
      this.persist();
      return true;
    },

    toggleFavorite: function (id) {
      const card = this.find(id);
      if (!card) return null;
      card.favorite = !card.favorite;
      this.persist();
      return card.favorite;
    },

    touchSettings: function (patch) {
      this.data.settings = Object.assign({}, this.data.settings, patch);
      this.persist();
    },

    fingerprint: function (card) {
      return (String(card.title || '').trim().toLowerCase() + '\u0000' +
        String(card.content || '').replace(/\s+/g, '').trim().toLowerCase());
    },

    importCards: function (list, mode) {
      const existing = Object.create(null);
      this.data.cards.forEach(function (card) {
        existing[Store.fingerprint(card)] = true;
      });
      const accepted = [];
      let skipped = 0;
      const now = Date.now();
      (list || []).forEach(function (raw, index) {
        const card = normalizeCard(raw, now - index * 1000);
        if (!card) {
          skipped += 1;
          return;
        }
        const fp = Store.fingerprint(card);
        if (existing[fp]) {
          skipped += 1;
          return;
        }
        existing[fp] = true;
        card.demo = false;
        card.id = uid();
        // Markdown 导入没有日期时，按列表顺序给一个轻微递增的时间。
        if (!raw.createdAt) card.createdAt = new Date(now - index * 1000).toISOString();
        accepted.push(card);
      });

      if (mode === 'replace') {
        this.data.cards = accepted;
        this.data.stats.reviews = {};
      } else {
        this.data.cards = accepted.concat(this.data.cards);
      }
      this.persist();
      return { added: accepted.length, skipped: skipped };
    },

    restoreDemo: function () {
      const existing = Object.create(null);
      this.data.cards.forEach(function (card) { existing[Store.fingerprint(card)] = true; });
      let added = 0;
      seedCards().forEach(function (card) {
        if (existing[Store.fingerprint(card)]) return;
        existing[Store.fingerprint(card)] = true;
        this.data.cards.push(card);
        added += 1;
      }, this);
      this.persist();
      return added;
    },

    removeDemo: function () {
      this.data.cards = this.data.cards.filter(function (card) { return !card.demo; });
      this.persist();
    },

    clearAll: function () {
      this.data.cards = [];
      this.data.stats = { daily: {}, reviews: {} };
      this.persist();
    },

    recordDraw: function (id) {
      const key = dayKey();
      if (!this.data.stats.daily[key]) this.data.stats.daily[key] = { drawn: 0, remembered: 0 };
      this.data.stats.daily[key].drawn += 1;
      if (!this.data.stats.reviews[id]) this.data.stats.reviews[id] = { seen: 0, remembered: 0, last: null };
      this.data.stats.reviews[id].seen += 1;
      this.data.stats.reviews[id].last = new Date().toISOString();
      this.persist();
    },

    recordReview: function (id, remembered) {
      const key = dayKey();
      if (!this.data.stats.daily[key]) this.data.stats.daily[key] = { drawn: 0, remembered: 0 };
      if (remembered) this.data.stats.daily[key].remembered += 1;
      if (!this.data.stats.reviews[id]) this.data.stats.reviews[id] = { seen: 0, remembered: 0, last: null };
      if (remembered) this.data.stats.reviews[id].remembered += 1;
      this.data.stats.reviews[id].last = new Date().toISOString();
      this.persist();
    },

    today: function () {
      return this.data.stats.daily[dayKey()] || { drawn: 0, remembered: 0 };
    },

    totalReviews: function () {
      let total = 0;
      Object.keys(this.data.stats.daily).forEach(function (key) {
        total += Store.data.stats.daily[key].drawn || 0;
      });
      return total;
    },

    streak: function () {
      const daily = this.data.stats.daily;
      let cursor = new Date();
      if (!daily[dayKey(cursor)] || !daily[dayKey(cursor)].drawn) {
        cursor.setDate(cursor.getDate() - 1);
      }
      let count = 0;
      while (count < 365) {
        const item = daily[dayKey(cursor)];
        if (!item || !item.drawn) break;
        count += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
      return count;
    },

    history: function (days) {
      const out = [];
      const amount = days || 14;
      for (let i = amount - 1; i >= 0; i -= 1) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = dayKey(d);
        const item = this.data.stats.daily[key] || { drawn: 0, remembered: 0 };
        out.push({ key: key, date: d, drawn: item.drawn, remembered: item.remembered });
      }
      return out;
    },

    tagCounts: function () {
      const map = Object.create(null);
      this.data.cards.forEach(function (card) {
        card.tags.forEach(function (tag) {
          map[tag] = (map[tag] || 0) + 1;
        });
      });
      return Object.keys(map).map(function (tag) {
        return { tag: tag, count: map[tag] };
      }).sort(function (a, b) { return b.count - a.count || a.tag.localeCompare(b.tag, 'zh'); });
    },

    subjectCounts: function () {
      const map = Object.create(null);
      this.data.cards.forEach(function (card) {
        map[card.subject] = (map[card.subject] || 0) + 1;
      });
      return dataSeed.SUBJECTS.map(function (item) {
        return { name: item.name, color: item.color, count: map[item.name] || 0 };
      }).filter(function (item) { return item.count > 0; });
    },

    kindCounts: function () {
      const map = Object.create(null);
      this.data.cards.forEach(function (card) {
        map[card.kind] = (map[card.kind] || 0) + 1;
      });
      return Object.keys(dataSeed.KINDS).map(function (key) {
        return {
          key: key,
          label: dataSeed.KINDS[key].label,
          icon: dataSeed.KINDS[key].icon,
          count: map[key] || 0
        };
      });
    },

    exportJSON: function () {
      return JSON.stringify({
        app: '碎页集',
        version: VERSION,
        exportedAt: new Date().toISOString(),
        cards: this.data.cards,
        stats: this.data.stats
      }, null, 2);
    },

    exportMarkdown: function () {
      const self = this;
      const parts = this.data.cards.map(function (card) {
        const meta = [
          '# ' + card.title,
          '标签：' + card.tags.join('、'),
          '类型：' + dataSeed.KINDS[card.kind].label,
          '科目：' + card.subject,
          '日期：' + card.createdAt
        ];
        return meta.join('\n') + '\n\n' + card.content;
      });
      return '<!-- 碎页集 Markdown 备份 · ' + new Date().toLocaleString('zh-CN') + ' -->\n\n' +
        parts.join('\n\n---\n\n') + '\n';
    },

    storageBytes: function () {
      try {
        return new Blob([JSON.stringify(this.data)]).size;
      } catch (error) {
        return JSON.stringify(this.data).length * 2;
      }
    }
  };

  Store.THEME_KEY = THEME_KEY;
  Store.dayKey = dayKey;

  window.SuiStore = Store;
})();
