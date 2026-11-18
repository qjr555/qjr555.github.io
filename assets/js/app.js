/* 碎页集 — 页面与交互 */
(function () {
  'use strict';

  const Store = window.SuiStore;
  const Data = window.SuiData;
  const MD = window.SuiMarkdown;
  const Importer = window.SuiImport;
  const Share = window.SuiShare;

  const app = document.getElementById('app');
  const $ = function (selector, root) { return (root || document).querySelector(selector); };
  const $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  const esc = MD.escapeHtml;

  const ui = {
    query: '',
    tag: '',
    subject: '',
    sort: 'newest',
    layout: Store.data.settings.layout === 'list' ? 'list' : 'grid',
    limit: 30,
    shuffleSeed: Date.now(),
    randomScope: 'all',
    randomSession: null,
    sharedCard: null,
    sharedError: '',
    importText: '',
    importParsed: null,
    importMode: 'merge',
    shareCard: null,
    editorCard: null,
    editorPreview: false,
    focusSearch: false
  };

  let route = { name: 'home' };
  let previousRouteKey = '';
  let confirmResolve = null;
  let toastCount = 0;
  let importTimer = null;

  const fallbackDeckCard = {
    title: '第一条碎片，等你来写。',
    content: '把今天最想记住的一句话，收进这里。',
    tags: ['开始'],
    subject: '其他',
    kind: 'note'
  };

  function icon(name, extra) {
    return '<svg class="icon ' + (extra || '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  function pad(number) {
    return String(number).padStart(2, '0');
  }

  function subjectColor(name) {
    return Data.SUBJECT_COLORS[name] || Data.SUBJECT_COLORS['其他'];
  }

  function kindOf(card) {
    return Data.KINDS[card.kind] || Data.KINDS.note;
  }

  function formatDate(iso, style) {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    if (style === 'full') return y + ' 年 ' + m + ' 月 ' + d + ' 日';
    return y + '.' + pad(m) + '.' + pad(d);
  }

  function relativeDate(iso) {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((today - target) / 86400000);
    if (diff <= 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff < 7) return diff + ' 天前';
    return formatDate(iso);
  }

  function relativeTime(iso) {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    const diff = Date.now() - date.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    return relativeDate(iso);
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function highlight(text, query) {
    const escaped = esc(text);
    if (!query.trim()) return escaped;
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return escaped;
    const pattern = terms.map(function (term) {
      return esc(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('|');
    try {
      return escaped.replace(new RegExp('(' + pattern + ')', 'gi'), '<mark>$1</mark>');
    } catch (error) {
      return escaped;
    }
  }

  function kindStamp(card) {
    const kind = kindOf(card);
    return '<span class="kind-stamp">' + icon(kind.icon) + '<span>' + esc(kind.label) + '</span></span>';
  }

  function tagPills(tags, clickable, limit) {
    const list = (tags || []).slice(0, limit || tags.length);
    return list.map(function (tag) {
      if (clickable) {
        return '<button class="tag-pill" type="button" data-tag="' + esc(tag) + '">#' + esc(tag) + '</button>';
      }
      return '<span class="tag-pill">#' + esc(tag) + '</span>';
    }).join('');
  }

  function filteredCards() {
    const query = ui.query.trim().toLowerCase();
    const terms = query ? query.split(/\s+/).filter(Boolean) : [];
    let cards = Store.cards().filter(function (card) {
      if (ui.tag && card.tags.indexOf(ui.tag) < 0) return false;
      if (ui.subject && card.subject !== ui.subject) return false;
      if (!terms.length) return true;
      const haystack = [
        card.title,
        MD.strip(card.content),
        card.tags.join(' '),
        card.subject,
        kindOf(card).label
      ].join(' ').toLowerCase();
      return terms.every(function (term) { return haystack.indexOf(term) >= 0; });
    });

    if (ui.sort === 'oldest') {
      cards.sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    } else if (ui.sort === 'random') {
      cards.sort(function (a, b) {
        return hashScore(a.id + ':' + ui.shuffleSeed) - hashScore(b.id + ':' + ui.shuffleSeed);
      });
    } else {
      cards.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    }
    return cards;
  }

  function hashScore(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function sortedCards() {
    return Store.cards().slice().sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  function cardIndex(card) {
    const index = Store.cards().findIndex(function (item) { return item.id === card.id; });
    return String(index + 1).padStart(3, '0');
  }

  function cardHTML(card) {
    const color = subjectColor(card.subject);
    const tags = tagPills(card.tags, false, 4);
    const more = card.tags.length > 4 ? '<span class="tag-more">+' + (card.tags.length - 4) + '</span>' : '';
    return [
      '<article class="paper-card" data-card-id="' + esc(card.id) + '" style="--accent:' + color + '">',
      '  <div class="card-head">',
      '    <div class="card-head-left">' + kindStamp(card) + '<span class="card-subject">' + esc(card.subject) + '</span></div>',
      '    <div class="card-head-right">',
      '      <span class="card-number">NO. ' + cardIndex(card) + '</span>',
      '      <button class="icon-btn card-favorite ' + (card.favorite ? 'is-active' : '') + '" type="button" data-action="favorite" data-id="' + esc(card.id) + '" aria-label="' + (card.favorite ? '取消收藏' : '收藏这张卡片') + '" aria-pressed="' + (card.favorite ? 'true' : 'false') + '" title="' + (card.favorite ? '取消收藏' : '收藏') + '">' + icon('star') + '</button>',
      '    </div>',
      '  </div>',
      '  <a class="card-link" href="#/card/' + encodeURIComponent(card.id) + '" aria-label="打开卡片：' + esc(card.title) + '">',
      '    <h3 class="card-title">' + highlight(card.title, ui.query) + '</h3>',
      '    <div class="card-body md">' + MD.render(card.content) + '</div>',
      '  </a>',
      '  <div class="card-tags">' + tags + more + '</div>',
      '  <div class="card-foot">',
      '    <time datetime="' + esc(card.createdAt) + '">' + relativeDate(card.createdAt) + '</time>',
      '    <div class="card-tools">',
      '      <button class="icon-btn" type="button" data-action="share" data-id="' + esc(card.id) + '" aria-label="分享这张卡片" title="公开分享">' + icon('share') + '</button>',
      '      <button class="icon-btn" type="button" data-action="edit" data-id="' + esc(card.id) + '" aria-label="编辑这张卡片" title="编辑">' + icon('edit') + '</button>',
      '      <button class="icon-btn danger-hover" type="button" data-action="delete" data-id="' + esc(card.id) + '" aria-label="删除这张卡片" title="删除">' + icon('trash') + '</button>',
      '    </div>',
      '  </div>',
      '</article>'
    ].join('\n');
  }

  function heroDeckHTML(cards) {
    const front = cards[0] || fallbackDeckCard;
    const mid = cards[1] || fallbackDeckCard;
    const back = cards[2] || fallbackDeckCard;
    return [
      '<div class="hero-deck" aria-hidden="true">',
      '  <div class="deck-shadow deck-shadow-a"></div>',
      '  <div class="deck-shadow deck-shadow-b"></div>',
      '  <div class="deck-tape"></div>',
      '  <div class="deck-card deck-back" style="--accent:' + subjectColor(back.subject) + '">',
      '    <div class="deck-mini-head"><span>' + esc(back.subject) + '</span><span>NO. 03</span></div>',
      '    <h3>' + esc(back.title) + '</h3>',
      '  </div>',
      '  <div class="deck-card deck-mid" style="--accent:' + subjectColor(mid.subject) + '">',
      '    <div class="deck-mini-head"><span>' + esc(kindOf(mid).label) + '</span><span>NO. 02</span></div>',
      '    <h3>' + esc(mid.title) + '</h3>',
      '    <div class="deck-mini-tags">' + tagPills(mid.tags, false, 2) + '</div>',
      '  </div>',
      '  <article class="deck-card deck-front" style="--accent:' + subjectColor(front.subject) + '">',
      '    <div class="deck-front-head">' + kindStamp(front) + '<span class="card-number">NO. 01</span></div>',
      '    <h3>' + esc(front.title) + '</h3>',
      '    <p>' + esc(MD.excerpt(front.content, 76)) + '</p>',
      '    <div class="deck-mini-tags">' + tagPills(front.tags, false, 3) + '</div>',
      '    <div class="deck-seal">碎</div>',
      '  </article>',
      '  <div class="deck-caption"><span class="caption-line"></span>今天也要收一张<span class="caption-line"></span></div>',
      '</div>'
    ].join('\n');
  }

  function homeHTML() {
    const cards = sortedCards();
    const tagCounts = Store.tagCounts();
    const subjectCounts = Store.subjectCounts();
    const today = Store.today();
    const demoCount = cards.filter(function (card) { return card.demo; }).length;
    const allTags = tagCounts.slice(0, 12);
    if (ui.tag && !allTags.some(function (item) { return item.tag === ui.tag; })) {
      const active = tagCounts.find(function (item) { return item.tag === ui.tag; });
      if (active) allTags.unshift(active);
    }

    const tagChips = [
      '<button class="chip ' + (!ui.tag ? 'is-active' : '') + '" type="button" data-tag="">全部<sup>' + cards.length + '</sup></button>'
    ].concat(allTags.map(function (item) {
      return '<button class="chip ' + (ui.tag === item.tag ? 'is-active' : '') + '" type="button" data-tag="' + esc(item.tag) + '">#' + esc(item.tag) + '<sup>' + item.count + '</sup></button>';
    })).join('');

    const subjectOptions = subjectCounts.map(function (item) {
      return '<option value="' + esc(item.name) + '"' + (ui.subject === item.name ? ' selected' : '') + '>' + esc(item.name) + ' · ' + item.count + '</option>';
    }).join('');

    const sortOptions = [
      { value: 'newest', label: '最近收录' },
      { value: 'oldest', label: '最早收录' },
      { value: 'random', label: '随机顺序' }
    ].map(function (item) {
      return '<option value="' + item.value + '"' + (ui.sort === item.value ? ' selected' : '') + '>' + item.label + '</option>';
    }).join('');

    return [
      '<section class="hero page-enter">',
      '  <div class="hero-grid">',
      '    <div class="hero-copy">',
      '      <p class="eyebrow"><span class="eyebrow-dot"></span>碎片化知识卡片站<span class="eyebrow-en">EST. 2026</span></p>',
      '      <h1 class="hero-title">把知识，撕成<br><em>能记住的小块。</em></h1>',
      '      <p class="hero-lede">一条知识，一张卡片。短一点，轻一点，随时抽一张复习。给考点、金句、错题摘要，一个不臃肿的去处。</p>',
      '      <div class="hero-actions">',
      '        <button class="btn btn-accent btn-large" type="button" data-action="new">' + icon('plus') + '<span>随手记一张</span></button>',
      '        <a class="btn btn-ghost btn-large" href="#/random" data-action="start-random">' + icon('shuffle') + '<span>随机翻一张</span></a>',
      '      </div>',
      '      <p class="hero-note">' + icon('check') + ' Markdown 导入<span class="dot-sep">·</span>公开链接分享<span class="dot-sep">·</span>数据只留在本机</p>',
      '    </div>',
      heroDeckHTML(cards),
      '  </div>',
      '  <div class="stats-strip">',
      '    <div class="stat"><strong>' + cards.length + '</strong><span>张碎片</span></div>',
      '    <div class="stat"><strong>' + tagCounts.length + '</strong><span>个标签</span></div>',
      '    <div class="stat"><strong>' + today.drawn + '</strong><span>今日翻卡</span></div>',
      '    <div class="stat"><strong>' + Store.streak() + '</strong><span>天连续记录</span></div>',
      '    <p class="stats-quote">“不积跬步，无以至千里。”</p>',
      '  </div>',
      '</section>',

      '<section class="collection page-enter" id="collection">',
      '  <div class="section-heading">',
      '    <div>',
      '      <p class="kicker">YOUR FRAGMENTS</p>',
      '      <h2>卡片集</h2>',
      '    </div>',
      '    <p class="result-count" id="resultCount" aria-live="polite"></p>',
      '  </div>',
      '  <div class="search-row">',
      '    <label class="search-field">',
      icon('search'),
      '      <input id="searchInput" type="search" value="' + esc(ui.query) + '" placeholder="搜一条知识，或一个标签…" autocomplete="off" spellcheck="false" aria-label="搜索卡片">',
      '      <button class="search-clear" type="button" data-action="clear-search" aria-label="清空搜索" title="清空">' + icon('x') + '</button>',
      '      <kbd class="search-kbd">/</kbd>',
      '    </label>',
      '    <span class="select-wrap compact">',
      '      <select id="subjectFilter" aria-label="按科目筛选">',
      '        <option value="">全部科目</option>',
      subjectOptions,
      '      </select>',
      icon('chevron-down'),
      '    </span>',
      '    <span class="select-wrap compact">',
      '      <select id="sortSelect" aria-label="排序方式">',
      sortOptions,
      '      </select>',
      icon('chevron-down'),
      '    </span>',
      '    <button class="icon-btn square-btn" type="button" data-action="toggle-layout" id="layoutToggle" aria-label="切换列表视图" title="切换视图">' + icon(ui.layout === 'grid' ? 'list' : 'grid') + '</button>',
      '  </div>',
      '  <div class="tag-filters" id="tagFilters">' + tagChips + '<a class="chip chip-link" href="#/tags">全部标签 ' + icon('arrow-right') + '</a></div>',
      '  <div class="filter-summary" id="filterSummary"></div>',
      '  <div class="card-grid layout-' + ui.layout + '" id="cardGrid"></div>',
      '  <div class="load-more-wrap" id="loadMoreWrap"></div>',
      demoCount ? '  <p class="demo-note">' + icon('spark') + '已放入 ' + demoCount + ' 张示例卡，直接编辑、删除，或去「关于」里清空它们。</p>' : '',
      '</section>'
    ].join('\n');
  }

  function refreshCollection() {
    const grid = $('#cardGrid');
    if (!grid) return;
    const results = filteredCards();
    const shown = results.slice(0, ui.limit);
    grid.className = 'card-grid layout-' + ui.layout;
    if (!shown.length) {
      const isFiltered = ui.query || ui.tag || ui.subject;
      grid.innerHTML = [
        '<div class="empty-state">',
        '  <div class="empty-mark">' + (isFiltered ? '?' : '空') + '</div>',
        '  <h3>' + (isFiltered ? '没有找到这张碎片' : '卡片集还是空的') + '</h3>',
        '  <p>' + (isFiltered ? '换个关键词，或者把筛选清掉试试。' : '先写一张，哪怕只有一句话。') + '</p>',
        '  <div class="empty-actions">',
        isFiltered
          ? '<button class="btn btn-ghost" type="button" data-action="clear-filters">清掉筛选</button>'
          : '<button class="btn btn-accent" type="button" data-action="new">' + icon('plus') + '记第一张</button><a class="btn btn-ghost" href="#/import">' + icon('upload') + '导入 Markdown</a>',
        '  </div>',
        '</div>'
      ].join('\n');
    } else {
      grid.innerHTML = shown.map(cardHTML).join('\n');
    }

    const count = $('#resultCount');
    if (count) count.textContent = results.length + ' 张' + (ui.tag || ui.subject || ui.query ? ' 符合条件' : '');

    const summary = $('#filterSummary');
    if (summary) {
      const bits = [];
      if (ui.query) bits.push('关键词「' + esc(ui.query) + '」');
      if (ui.tag) bits.push('#' + esc(ui.tag));
      if (ui.subject) bits.push(esc(ui.subject));
      summary.innerHTML = bits.length
        ? '<span>正在看：' + bits.join(' + ') + '</span><button type="button" class="text-btn" data-action="clear-filters">清除筛选 ' + icon('x') + '</button>'
        : '<span>全部 ' + Store.cards().length + ' 张碎片 · 点击卡片展开全文</span><span class="summary-hint">' + icon('spark') + '按 / 快速搜索</span>';
    }

    const filters = $('#tagFilters');
    if (filters) {
      const activeTag = ui.tag;
      $$('[data-tag]', filters).forEach(function (button) {
        button.classList.toggle('is-active', (button.getAttribute('data-tag') || '') === activeTag);
      });
    }

    const clear = $('.search-clear');
    if (clear) clear.classList.toggle('is-visible', Boolean(ui.query));

    const loadMore = $('#loadMoreWrap');
    if (loadMore) {
      loadMore.innerHTML = results.length > ui.limit
        ? '<button class="btn btn-ghost" type="button" data-action="load-more">再看 ' + Math.min(30, results.length - ui.limit) + ' 张 ' + icon('chevron-down') + '</button>'
        : '';
    }

    const layoutToggle = $('#layoutToggle');
    if (layoutToggle) {
      layoutToggle.innerHTML = icon(ui.layout === 'grid' ? 'list' : 'grid');
      layoutToggle.setAttribute('aria-label', ui.layout === 'grid' ? '切换列表视图' : '切换网格视图');
    }
  }

  function pageHead(kicker, title, description, extra) {
    return [
      '<header class="page-head page-enter">',
      '  <div>',
      '    <p class="kicker">' + esc(kicker) + '</p>',
      '    <h1>' + title + '</h1>',
      '    <p class="page-lede">' + description + '</p>',
      '  </div>',
      extra || '',
      '</header>'
    ].join('\n');
  }

  function tagsHTML() {
    if (!Store.cards().length) {
      return [
        pageHead('TAG INDEX', '标签抽屉', '把碎片按主题收进同一个抽屉。'),
        '<div class="empty-state page-enter"><div class="empty-mark">#</div><h3>还没有标签</h3><p>写下第一张卡片，标签会自动出现在这里。</p><button class="btn btn-accent" type="button" data-action="new">记第一张</button></div>'
      ].join('\n');
    }

    const tags = Store.tagCounts();
    const max = tags.length ? tags[0].count : 1;
    const subjects = Store.subjectCounts();
    const maxSubject = subjects.reduce(function (maxValue, item) { return Math.max(maxValue, item.count); }, 1);
    const history = Store.history(14);
    const maxHeat = history.reduce(function (maxValue, item) { return Math.max(maxValue, item.drawn); }, 1);
    const total = Store.totalReviews();

    const cloud = tags.map(function (item) {
      const weight = 1 + (item.count / max) * 1.35;
      return '<button class="tag-cloud-item" type="button" data-tag="' + esc(item.tag) + '" style="--weight:' + weight.toFixed(2) + '">#' + esc(item.tag) + '<sup>' + item.count + '</sup></button>';
    }).join('');

    const subjectRows = subjects.map(function (item) {
      const width = Math.max(8, Math.round((item.count / maxSubject) * 100));
      return [
        '<button class="subject-row" type="button" data-subject="' + esc(item.name) + '">',
        '  <span class="subject-dot" style="background:' + item.color + '"></span>',
        '  <span class="subject-name">' + esc(item.name) + '</span>',
        '  <span class="subject-bar"><i style="width:' + width + '%;background:' + item.color + '"></i></span>',
        '  <span class="subject-count">' + item.count + '</span>',
        '</button>'
      ].join('');
    }).join('');

    const heat = history.map(function (item) {
      let level = 0;
      if (item.drawn > 0) level = 1;
      if (item.drawn > 2) level = 2;
      if (item.drawn > 5) level = 3;
      if (item.drawn > 9) level = 4;
      const label = item.date.getMonth() + 1 + '月' + item.date.getDate() + '日 · ' + item.drawn + ' 张';
      return '<div class="heat-cell heat-' + level + '" title="' + esc(label) + '"><span>' + item.date.getDate() + '</span></div>';
    }).join('');

    const kinds = Store.kindCounts().map(function (item) {
      const percent = Store.cards().length ? Math.round((item.count / Store.cards().length) * 100) : 0;
      return [
        '<div class="kind-row">',
        '  <span class="kind-name">' + icon(item.icon) + esc(item.label) + '</span>',
        '  <span class="kind-track"><i style="width:' + percent + '%"></i></span>',
        '  <span class="kind-count">' + item.count + '</span>',
        '</div>'
      ].join('');
    }).join('');

    return [
      pageHead('TAG INDEX', '标签抽屉', '把碎片按主题收进同一个抽屉。一个标签，就是一条复习线索。'),
      '<section class="tag-cloud panel page-enter">' + cloud + '</section>',
      '<div class="tags-columns page-enter">',
      '  <section class="panel">',
      '    <div class="panel-head"><div><p class="kicker">BY SUBJECT</p><h2>按科目收一收</h2></div><span class="panel-note">点击筛选</span></div>',
      '    <div class="subject-list">' + subjectRows + '</div>',
      '  </section>',
      '  <section class="panel">',
      '    <div class="panel-head"><div><p class="kicker">REVIEW FOOTPRINT</p><h2>复习足迹</h2></div><span class="panel-note">最近 14 天</span></div>',
      '    <div class="heatmap">' + heat + '</div>',
      '    <div class="heat-foot"><span>累计翻卡 <strong>' + total + '</strong> 次</span><span>连续 <strong>' + Store.streak() + '</strong> 天</span></div>',
      '    <p class="panel-hint">颜色越深，代表那一天翻的卡越多。每天抽 5 张，比考前通宵更划算。</p>',
      '  </section>',
      '</div>',
      '<section class="panel page-enter">',
      '  <div class="panel-head"><div><p class="kicker">BY TYPE</p><h2>碎片的形状</h2></div><span class="panel-note">别人怎么记，不重要</span></div>',
      '  <div class="kind-list">' + kinds + '</div>',
      '</section>'
    ].join('\n');
  }

  function importHTML() {
    const template = Importer.template();
    return [
      pageHead('IMPORT', '把旧笔记倒进来', '一次粘贴，自动拆成一张张卡片。支持 Markdown，也支持恢复 JSON 备份。'),
      '<div class="import-layout page-enter">',
      '  <section class="import-main">',
      '    <div class="drop-zone" id="dropZone">',
      '      <div class="drop-icon">' + icon('upload') + '</div>',
      '      <div><strong>把 .md / .txt / .json 拖到这里</strong><span>或者 <button class="text-btn" type="button" data-action="pick-file">选择文件</button></span></div>',
      '      <input id="importFile" type="file" accept=".md,.markdown,.txt,.json,text/markdown,text/plain,application/json" hidden>',
      '    </div>',
      '    <label class="field import-field">',
      '      <span class="field-label">粘贴 Markdown <em>每张卡片用 --- 分隔，或用 ## 标题分隔</em></span>',
      '      <textarea id="importText" rows="14" spellcheck="false" placeholder="## 卡片标题&#10;标签：数学、函数&#10;&#10;正文写在这里……&#10;&#10;---&#10;&#10;## 下一张卡片">' + esc(ui.importText) + '</textarea>',
      '    </label>',
      '    <div class="import-toolbar">',
      '      <button class="btn btn-ghost btn-small" type="button" data-action="load-template">' + icon('spark') + '载入示例格式</button>',
      '      <button class="btn btn-ghost btn-small" type="button" data-action="download-template">' + icon('download') + '下载模板</button>',
      '      <span class="import-hint">' + icon('info') + '导入前会先给出预览</span>',
      '    </div>',
      '  </section>',
      '  <aside class="import-side">',
      '    <div class="panel format-panel">',
      '      <div class="panel-head"><div><p class="kicker">FORMAT</p><h2>格式很简单</h2></div></div>',
      '      <pre class="code-sample">' + esc(template) + '</pre>',
      '      <p class="panel-hint">标签、类型、科目都可以省略；没有标题时，会把第一行当作标题。</p>',
      '    </div>',
      '    <div class="import-preview" id="importPreview"></div>',
      '  </aside>',
      '</div>'
    ].join('\n');
  }

  function updateImportPreview() {
    const box = $('#importPreview');
    if (!box) return;
    const parsed = ui.importParsed;
    if (!parsed) {
      box.innerHTML = [
        '<div class="panel preview-panel preview-empty">',
        '  <div class="preview-empty-icon">' + icon('grid') + '</div>',
        '  <h3>解析预览</h3>',
        '  <p>粘贴内容后，这里会先告诉你识别出了几张卡片，确认后再导入。</p>',
        '</div>'
      ].join('\n');
      return;
    }
    if (parsed.error) {
      box.innerHTML = '<div class="panel preview-panel error-panel">' + icon('alert') + '<h3>没有读懂</h3><p>' + esc(parsed.error) + '</p></div>';
      return;
    }
    if (!parsed.cards.length) {
      box.innerHTML = '<div class="panel preview-panel error-panel">' + icon('alert') + '<h3>没有识别出卡片</h3><p>检查一下是不是只有空内容，或试用「载入示例格式」。</p></div>';
      return;
    }

    const warnings = (parsed.warnings || []).slice(0, 3).map(function (warning) {
      return '<li>' + esc(warning) + '</li>';
    }).join('');

    box.innerHTML = [
      '<div class="panel preview-panel">',
      '  <div class="preview-head"><div><span class="preview-count">' + parsed.cards.length + '</span><span class="preview-unit">张卡片</span></div><span class="mode-pill">' + (parsed.mode === 'json' ? 'JSON 备份' : 'Markdown') + '</span></div>',
      '  <ol class="preview-list">',
      parsed.cards.slice(0, 5).map(function (card) {
        return '<li><strong>' + esc(card.title || MD.firstLine(card.content)) + '</strong><span>' + esc((card.tags || []).slice(0, 2).join(' · ') || card.subject || '未分类') + '</span></li>';
      }).join(''),
      '  </ol>',
      parsed.cards.length > 5 ? '<p class="preview-more">还有 ' + (parsed.cards.length - 5) + ' 张没有展开</p>' : '',
      warnings ? '<ul class="preview-warnings">' + warnings + '</ul>' : '',
      '  <label class="inline-select">导入方式',
      '    <span class="select-wrap compact"><select id="importMode"><option value="merge"' + (ui.importMode === 'merge' ? ' selected' : '') + '>合并到现有卡片</option><option value="replace"' + (ui.importMode === 'replace' ? ' selected' : '') + '>替换全部卡片</option></select>' + icon('chevron-down') + '</span>',
      '  </label>',
      '  <button class="btn btn-accent btn-full" type="button" data-action="do-import">' + icon('check') + '导入这 ' + parsed.cards.length + ' 张</button>',
      '</div>'
    ].join('\n');
  }

  function parseImportText(text) {
    ui.importText = text;
    ui.importParsed = Importer.parse(text);
    updateImportPreview();
  }

  function randomPool(scope) {
    const cards = Store.cards();
    if (scope === 'favorites') return cards.filter(function (card) { return card.favorite; });
    if (scope.indexOf('subject:') === 0) {
      const subject = scope.slice(8);
      return cards.filter(function (card) { return card.subject === subject; });
    }
    return cards.slice();
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = list[i];
      list[i] = list[j];
      list[j] = temp;
    }
    return list;
  }

  function startRandomSession(scope) {
    const pool = randomPool(scope);
    const queue = shuffle(pool.slice()).slice(0, Math.min(12, pool.length));
    const session = {
      scope: scope,
      queue: queue,
      total: queue.length,
      position: 0,
      remembered: 0,
      missed: [],
      skipped: 0,
      current: null,
      flipped: false
    };
    ui.randomSession = session;
    drawNextCard();
    return session;
  }

  function drawNextCard() {
    const session = ui.randomSession;
    if (!session) return;
    if (!session.queue.length) {
      session.current = null;
      session.flipped = false;
      return;
    }
    session.current = session.queue.shift();
    session.position += 1;
    session.flipped = false;
    Store.recordDraw(session.current.id);
  }

  function randomScopeOptions() {
    const options = [
      { value: 'all', label: '全部卡片' },
      { value: 'favorites', label: '我的收藏' }
    ];
    Store.subjectCounts().forEach(function (item) {
      options.push({ value: 'subject:' + item.name, label: item.name + ' · ' + item.count });
    });
    return options;
  }

  function randomHTML() {
    const cards = Store.cards();
    if (!cards.length) {
      return [
        pageHead('RANDOM DRAW', '随机翻卡', '抽一张，先回想，再翻面。'),
        '<div class="empty-state page-enter"><div class="empty-mark">?</div><h3>牌堆还是空的</h3><p>先收几张卡片，才有得抽。</p><div class="empty-actions"><button class="btn btn-accent" type="button" data-action="new">' + icon('plus') + '记一张</button><a class="btn btn-ghost" href="#/import">导入 Markdown</a></div></div>'
      ].join('\n');
    }

    if (!ui.randomSession) startRandomSession(ui.randomScope || 'all');
    const session = ui.randomSession;
    const options = randomScopeOptions();
    if (!options.some(function (item) { return item.value === session.scope; })) {
      options.push({ value: session.scope, label: '当前范围' });
    }
    const scopeSelect = '<span class="select-wrap compact">' + '<select id="randomScope" aria-label="选择翻卡范围">' +
      options.map(function (item) {
        return '<option value="' + esc(item.value) + '"' + (item.value === session.scope ? ' selected' : '') + '>' + esc(item.label) + '</option>';
      }).join('') + '</select>' + icon('chevron-down') + '</span>';

    const head = [
      '<header class="page-head random-head page-enter">',
      '  <div><p class="kicker">RANDOM DRAW</p><h1>随机翻卡</h1><p class="page-lede">抽一张，先在心里回答，再翻面核对。抽卡不是仪式感，是主动回忆。</p></div>',
      '  <div class="session-box"><span>本轮</span><strong>' + session.position + '</strong><span>/ ' + session.total + '</span><em>记住 ' + session.remembered + '</em></div>',
      '</header>',
      '<div class="random-toolbar page-enter">' + scopeSelect + '<button class="btn btn-ghost btn-small" type="button" data-action="restart-random">' + icon('shuffle') + '换一轮</button><span class="random-tip">' + icon('spark') + '空格翻面 · 1 没记住 · 2 记住了</span></div>'
    ].join('\n');

    if (!session.current) {
      const percent = session.total ? Math.round((session.remembered / session.total) * 100) : 0;
      const missed = session.missed.map(function (item) {
        return '<li><a href="#/card/' + encodeURIComponent(item.id) + '">' + esc(item.title) + '</a></li>';
      }).join('');
      return head + [
        '<section class="session-summary page-enter">',
        '  <div class="summary-seal">' + (session.total ? '完' : '空') + '</div>',
        '  <p class="kicker">SESSION COMPLETE</p>',
        '  <h2>' + (session.total ? '这一轮翻完了' : '这个范围里还没有卡片') + '</h2>',
        session.total ? '<p class="summary-line">共 ' + session.total + ' 张，记住 <strong>' + session.remembered + '</strong> 张' + (session.missed.length ? '，还有 ' + session.missed.length + ' 张没记住。' : '，全记住了。') + '</p>' : '<p class="summary-line">换个范围，或者先记一张新卡片。</p>',
        session.total ? '<div class="score-ring" style="--score:' + percent + '%"><span>' + percent + '%</span><small>记住</small></div>' : '',
        missed ? '<div class="missed-box"><h3>还没记住的</h3><ul class="missed-list">' + missed + '</ul></div>' : '',
        '  <div class="summary-actions"><button class="btn btn-accent" type="button" data-action="restart-random">' + icon('shuffle') + '再来一轮</button><a class="btn btn-ghost" href="#/home">回到卡片集</a></div>',
        '</section>'
      ].join('\n');
    }

    const card = session.current;
    const kind = kindOf(card);
    const color = subjectColor(card.subject);
    const progress = session.total ? Math.round((session.position / session.total) * 100) : 0;
    return head + [
      '<div class="random-progress page-enter"><i style="width:' + progress + '%;background:' + color + '"></i></div>',
      '<section class="flip-stage page-enter" data-card-id="' + esc(card.id) + '">',
      '  <div class="flip-scene">',
      '    <div class="flip-card' + (session.flipped ? ' is-flipped' : '') + '" id="flipCard" tabindex="-1">',
      '      <div class="flip-face flip-front" style="--accent:' + color + '">',
      '        <div class="flip-front-top"><span class="kind-stamp">' + icon(kind.icon) + '<span>' + esc(kind.label) + '</span></span><span class="flip-counter">第 ' + session.position + ' / ' + session.total + ' 张</span></div>',
      '        <p class="recall-label">先回想，再翻面</p>',
      '        <h2 class="flip-title">' + esc(card.title) + '</h2>',
      '        <div class="flip-tags">' + tagPills(card.tags, false, 4) + '<span class="subject-pill" style="--accent:' + color + '">' + esc(card.subject) + '</span></div>',
      '        <p class="flip-hint">' + icon('bulb') + esc(kind.hint) + '</p>',
      '        <div class="flip-front-actions">',
      '          <button class="btn btn-accent" type="button" data-action="flip">翻面看答案 ' + icon('arrow-right') + '</button>',
      '          <button class="text-btn" type="button" data-action="skip">先跳过</button>',
      '        </div>',
      '        <span class="flip-watermark">' + esc(card.subject) + '</span>',
      '      </div>',
      '      <div class="flip-face flip-back" style="--accent:' + color + '">',
      '        <div class="flip-back-top"><span class="kind-stamp">' + icon('check') + '<span>答案</span></span><a class="text-btn" href="#/card/' + encodeURIComponent(card.id) + '">看全文 ' + icon('arrow-right') + '</a></div>',
      '        <div class="flip-content md">' + MD.render(card.content) + '</div>',
      '        <div class="flip-tags">' + tagPills(card.tags, false, 4) + '</div>',
      '        <div class="flip-review-actions">',
      '          <button class="btn btn-ghost review-no" type="button" data-action="review" data-value="0">' + icon('x') + '没记住 <kbd>1</kbd></button>',
      '          <button class="btn btn-accent review-yes" type="button" data-action="review" data-value="1">' + icon('check') + '记住了 <kbd>2</kbd></button>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</section>',
      '<p class="random-footnote">翻面之前，先试着用自己的话讲一遍。想不起来也没关系，这只是在提醒你哪里还没长牢。</p>'
    ].join('\n');
  }

  function detailHTML(card) {
    const all = sortedCards();
    const index = all.findIndex(function (item) { return item.id === card.id; });
    const newer = index > 0 ? all[index - 1] : null;
    const older = index >= 0 && index < all.length - 1 ? all[index + 1] : null;
    const color = subjectColor(card.subject);
    const review = Store.data.stats.reviews[card.id];
    return [
      '<div class="detail-wrap page-enter">',
      '  <a class="back-link" href="#/home">' + icon('arrow-left') + '返回卡片集</a>',
      '  <article class="detail-paper" style="--accent:' + color + '" data-card-id="' + esc(card.id) + '">',
      '    <header class="detail-head">',
      '      <div class="detail-meta">' + kindStamp(card) + '<span class="detail-subject">' + esc(card.subject) + '</span><span class="detail-no">NO. ' + cardIndex(card) + '</span>' + (card.demo ? '<span class="demo-pill">示例</span>' : '') + '</div>',
      '      <button class="icon-btn card-favorite ' + (card.favorite ? 'is-active' : '') + '" type="button" data-action="favorite" data-id="' + esc(card.id) + '" aria-label="收藏" aria-pressed="' + (card.favorite ? 'true' : 'false') + '">' + icon('star') + '</button>',
      '    </header>',
      '    <h1 class="detail-title">' + esc(card.title) + '</h1>',
      '    <div class="detail-info"><span>' + formatDate(card.createdAt, 'full') + '</span><span>' + relativeTime(card.createdAt) + '</span><span>' + MD.strip(card.content).length + ' 字</span>' + (review && review.seen ? '<span>翻过 ' + review.seen + ' 次</span>' : '') + '</div>',
      '    <div class="detail-body md" id="detailBody">' + MD.render(card.content) + '</div>',
      '    <div class="detail-tags">' + tagPills(card.tags, true) + '</div>',
      '    <div class="detail-study"><span>' + icon('eye') + '遮住正文，先自己复述一遍。</span><button class="text-btn" type="button" data-action="mask">' + icon('eye-off') + '遮住正文</button></div>',
      '    <footer class="detail-actions">',
      '      <button class="btn btn-accent" type="button" data-action="share" data-id="' + esc(card.id) + '">' + icon('share') + '公开分享</button>',
      '      <button class="btn btn-ghost" type="button" data-action="copy" data-id="' + esc(card.id) + '">' + icon('copy') + '复制文本</button>',
      '      <button class="btn btn-ghost" type="button" data-action="edit" data-id="' + esc(card.id) + '">' + icon('edit') + '编辑</button>',
      '      <button class="btn btn-ghost danger-hover" type="button" data-action="delete" data-id="' + esc(card.id) + '">' + icon('trash') + '删除</button>',
      '    </footer>',
      '  </article>',
      '  <nav class="detail-nav" aria-label="相邻卡片">',
      newer ? '<a class="detail-nav-link" href="#/card/' + encodeURIComponent(newer.id) + '"><span>更新一张</span><strong>' + esc(newer.title) + '</strong></a>' : '<span></span>',
      older ? '<a class="detail-nav-link next" href="#/card/' + encodeURIComponent(older.id) + '"><span>更早一张</span><strong>' + esc(older.title) + '</strong></a>' : '<span></span>',
      '  </nav>',
      '</div>'
    ].join('\n');
  }

  function sharedHTML() {
    if (ui.sharedError) {
      return [
        '<div class="shared-page page-enter">',
        '  <div class="shared-banner">' + icon('share') + '你正在看一张分享卡片</div>',
        '  <div class="empty-state shared-error"><div class="empty-mark">!</div><h1>这张碎片没有打开</h1><p>' + esc(ui.sharedError) + '</p><div class="empty-actions"><a class="btn btn-accent" href="#/home">去碎页集首页</a><button class="btn btn-ghost" type="button" data-action="close-share-view">留在这里</button></div></div>',
        '</div>'
      ].join('\n');
    }
    const card = ui.sharedCard;
    const color = subjectColor(card.subject);
    return [
      '<div class="shared-page page-enter">',
      '  <div class="shared-banner"><span>' + icon('share') + '来自一张公开分享的卡片</span><button class="text-btn" type="button" data-action="close-share-view">关闭 ' + icon('x') + '</button></div>',
      '  <article class="detail-paper shared-paper" style="--accent:' + color + '">',
      '    <header class="detail-head"><div class="detail-meta">' + kindStamp(card) + '<span class="detail-subject">' + esc(card.subject) + '</span><span class="shared-pill">分享</span></div></header>',
      '    <h1 class="detail-title">' + esc(card.title) + '</h1>',
      '    <div class="detail-info"><span>一张来自「碎页集」的卡片</span><span>' + MD.strip(card.content).length + ' 字</span></div>',
      '    <div class="detail-body md">' + MD.render(card.content) + '</div>',
      '    <div class="detail-tags">' + tagPills(card.tags, false) + '</div>',
      '    <div class="shared-cta">',
      '      <div><strong>想把它留在自己的卡片集里？</strong><span>收进来之后，可以编辑、打标签、加入随机翻卡。</span></div>',
      '      <div class="shared-actions"><button class="btn btn-accent" type="button" data-action="import-shared">' + icon('plus') + '收进我的卡片集</button><button class="btn btn-ghost" type="button" data-action="copy-shared">' + icon('copy') + '复制文本</button></div>',
      '    </div>',
      '  </article>',
      '  <p class="shared-footer">' + icon('spark') + '碎页集 · 一条知识，一张卡片 · <a href="#/home">也做一个自己的卡片盒</a></p>',
      '</div>'
    ].join('\n');
  }

  function aboutHTML() {
    const cards = Store.cards();
    const tags = Store.tagCounts();
    const reviews = Store.totalReviews();
    return [
      pageHead('ABOUT', '轻一点，才记得住。', '碎页集不是另一个 Notion。它是一个只装短笔记、考点、金句和错题摘要的小盒子。'),
      '<div class="about-grid page-enter">',
      '  <section class="about-manifesto panel">',
      '    <p class="kicker">MANIFESTO</p>',
      '    <h2>为什么把知识撕碎？</h2>',
      '    <p>因为一整章的笔记，往往不如一句被反复想起的话有用。碎页集只做一件事：让一条知识占一张卡片，让复习变成抽一张、翻一面、记住一点。</p>',
      '    <p>它刻意不做复杂的博客、不做数据库、不做协作。打开就能写，写完就能抽。适合装考点，也适合装今天看到的一句好话。</p>',
      '    <div class="manifesto-sign">—— 给每个想少背一点、多记住一点的人</div>',
      '  </section>',
      '  <section class="panel about-stats">',
      '    <div class="panel-head"><div><p class="kicker">LOCAL DATA</p><h2>你的数据</h2></div><span class="panel-note">只在本机</span></div>',
      '    <div class="about-stat-grid">',
      '      <div><strong>' + cards.length + '</strong><span>张卡片</span></div>',
      '      <div><strong>' + tags.length + '</strong><span>个标签</span></div>',
      '      <div><strong>' + reviews + '</strong><span>次翻卡</span></div>',
      '      <div><strong>' + formatBytes(Store.storageBytes()) + '</strong><span>浏览器占用</span></div>',
      '    </div>',
      '    <p class="panel-hint">卡片存在浏览器的 localStorage 里，不上传服务器。清除浏览器数据会丢失，建议偶尔导出一份备份。</p>',
      '    <div class="backup-actions">',
      '      <button class="btn btn-ghost btn-small" type="button" data-action="export-json">' + icon('download') + '导出 JSON 备份</button>',
      '      <button class="btn btn-ghost btn-small" type="button" data-action="export-md">' + icon('download') + '导出 Markdown</button>',
      '      <button class="btn btn-ghost btn-small" type="button" data-action="restore-demo">' + icon('spark') + '补回示例卡</button>',
      '    </div>',
      '  </section>',
      '</div>',
      '<section class="about-pillars page-enter">',
      '  <div class="pillar"><span class="pillar-num">01</span><h3>一条一张</h3><p>不写长文，不开无数层级。一张卡片只说清一件事，翻卡时才不会变成重新读课本。</p></div>',
      '  <div class="pillar"><span class="pillar-num">02</span><h3>本地优先</h3><p>没有登录、没有服务器、没有算法推荐。你的卡片属于你，导出后随时能带走。</p></div>',
      '  <div class="pillar"><span class="pillar-num">03</span><h3>链接即分享</h3><p>公开一张卡片，不需要发布、审核或建主页。内容压缩进链接，发给同学就能打开。</p></div>',
      '</section>',
      '<div class="about-columns page-enter">',
      '  <section class="panel">',
      '    <div class="panel-head"><div><p class="kicker">SHORTCUTS</p><h2>键盘快捷键</h2></div></div>',
      '    <dl class="shortcut-list">',
      '      <div><dt><kbd>/</kbd> 或 <kbd>Ctrl</kbd> <kbd>K</kbd></dt><dd>聚焦搜索</dd></div>',
      '      <div><dt><kbd>N</kbd></dt><dd>新记一张</dd></div>',
      '      <div><dt><kbd>Space</kbd></dt><dd>随机翻卡时翻面</dd></div>',
      '      <div><dt><kbd>1</kbd> / <kbd>2</kbd></dt><dd>没记住 / 记住了</dd></div>',
      '      <div><dt><kbd>Ctrl</kbd> <kbd>Enter</kbd></dt><dd>保存正在编辑的卡片</dd></div>',
      '    </dl>',
      '  </section>',
      '  <section class="panel">',
      '    <div class="panel-head"><div><p class="kicker">DANGER ZONE</p><h2>数据整理</h2></div></div>',
      '    <p class="panel-hint">示例卡只是引子，可以全部移除。清空操作不可撤销，先导出备份更稳妥。</p>',
      '    <div class="danger-actions">',
      '      <button class="btn btn-ghost btn-small" type="button" data-action="remove-demo">移除示例卡</button>',
      '      <button class="btn btn-danger btn-small" type="button" data-action="clear-all">清空全部卡片</button>',
      '    </div>',
      '    <p class="about-version">碎页集 v1.0 · 2026 · Made for short notes.</p>',
      '  </section>',
      '</div>',
      '<section class="about-compare page-enter">',
      '  <div class="compare-head"><p class="kicker">NOT ANOTHER NOTION</p><h2>它和「大而全」的工具，不一样。</h2></div>',
      '  <div class="compare-row"><span>Notion / 笔记软件</span><span>碎页集</span></div>',
      '  <div class="compare-row"><span>适合项目、文档、协作</span><span>适合短句、考点、错题、金句</span></div>',
      '  <div class="compare-row"><span>打开后先想「放哪个页面」</span><span>打开后只需要「写一张」</span></div>',
      '  <div class="compare-row"><span>越用越重</span><span>越用越像自己的口袋</span></div>',
      '</section>',
      '<p class="about-footer-note">' + icon('quote') + '你不需要很厉害才能开始，但你需要开始，才会很厉害。</p>'
    ].join('\n');
  }

  function renderRoute(initial) {
    if (ui.sharedCard || ui.sharedError) {
      route = { name: 'shared' };
      setActiveNav('');
      app.innerHTML = sharedHTML();
      document.title = '分享的碎片 · 碎页集';
      if (!initial) window.scrollTo({ top: 0, behavior: 'smooth' });
      previousRouteKey = 'shared';
      return;
    }

    const raw = location.hash.replace(/^#\/?/, '');
    const parts = raw.split('/');
    let nextRoute = { name: 'home' };
    if (parts[0] === 'card' && parts[1]) nextRoute = { name: 'card', id: decodeURIComponent(parts.slice(1).join('/')) };
    else if (['random', 'tags', 'import', 'about'].indexOf(parts[0]) >= 0) nextRoute = { name: parts[0] };
    route = nextRoute;

    const titles = {
      home: '碎页集 · 把知识撕成能记住的小块',
      random: '随机翻卡 · 碎页集',
      tags: '标签抽屉 · 碎页集',
      import: '导入 Markdown · 碎页集',
      about: '关于 · 碎页集'
    };

    setActiveNav(route.name === 'card' ? 'home' : route.name);
    if (route.name === 'home') app.innerHTML = homeHTML();
    else if (route.name === 'random') app.innerHTML = randomHTML();
    else if (route.name === 'tags') app.innerHTML = tagsHTML();
    else if (route.name === 'import') {
      app.innerHTML = importHTML();
      updateImportPreview();
      if (ui.importText) parseImportText(ui.importText);
    } else if (route.name === 'about') app.innerHTML = aboutHTML();
    else if (route.name === 'card') {
      const card = Store.find(route.id);
      if (card) {
        app.innerHTML = detailHTML(card);
        document.title = card.title + ' · 碎页集';
      } else {
        app.innerHTML = [
          '<div class="empty-state page-enter"><div class="empty-mark">404</div><h1>这张碎片不在这里</h1><p>它可能被删除了，或者链接少了一截。</p><div class="empty-actions"><a class="btn btn-accent" href="#/home">回到卡片集</a><button class="btn btn-ghost" type="button" data-action="new">重新写一张</button></div></div>'
        ].join('\n');
        document.title = '找不到卡片 · 碎页集';
      }
    }

    if (route.name === 'home') {
      refreshCollection();
      if (ui.focusSearch) {
        ui.focusSearch = false;
        setTimeout(function () { const input = $('#searchInput'); if (input) input.focus(); }, 40);
      }
    }
    if (titles[route.name]) document.title = titles[route.name];

    const routeKey = route.name + (route.id ? ':' + route.id : '');
    if (!initial && routeKey !== previousRouteKey) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    previousRouteKey = routeKey;

    if (route.name === 'import') bindImportDrop();
  }

  function setActiveNav(name) {
    $$('[data-nav]').forEach(function (link) {
      link.classList.toggle('is-active', link.getAttribute('data-nav') === name);
    });
  }

  function go(hash) {
    if (location.hash === hash) renderRoute();
    else location.hash = hash;
  }

  function clearShareParam() {
    const url = new URL(location.href);
    url.searchParams.delete('s');
    history.replaceState(null, '', url.pathname + url.search + (url.hash || '#/home'));
  }

  function clearSharedState() {
    ui.sharedCard = null;
    ui.sharedError = '';
    clearShareParam();
  }

  function openEditor(card) {
    const dialog = $('#editorDialog');
    const form = $('#cardForm');
    if (!dialog || !form) return;
    ui.editorCard = card || null;
    form.reset();
    $('#cardId').value = card ? card.id : '';
    $('#cardTitle').value = card ? card.title : '';
    $('#cardKind').value = card ? card.kind : 'note';
    $('#cardSubject').value = card ? card.subject : '其他';
    $('#cardTags').value = card ? card.tags.join(' ') : '';
    $('#cardContent').value = card ? card.content : '';
    $('#editorHeading').textContent = card ? '编辑这张碎片' : '记一张碎片';
    $('#editorKicker').textContent = card ? 'EDIT FRAGMENT' : 'NEW FRAGMENT';
    $('#saveCardBtn').innerHTML = icon(card ? 'check' : 'plus') + '<span>' + (card ? '保存修改' : '收进卡片集') + '</span>';
    ui.editorPreview = false;
    $('#cardContent').hidden = false;
    $('#editorPreview').hidden = true;
    $('#previewToggle').innerHTML = icon('eye') + '<span>预览</span>';
    updateEditorCount();
    renderTagSuggestions();
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('has-dialog');
    setTimeout(function () { $('#cardTitle').focus(); }, 80);
  }

  function closeDialog(dialog) {
    if (dialog && dialog.open) dialog.close();
  }

  function updateEditorCount() {
    const content = $('#cardContent');
    const counter = $('#contentCount');
    if (!content || !counter) return;
    counter.textContent = content.value.length + ' / 4000';
    const preview = $('#editorPreview');
    if (preview && !preview.hidden) preview.innerHTML = MD.render(content.value) || '<p class="muted">还没有内容。</p>';
  }

  function renderTagSuggestions() {
    const box = $('#tagSuggestions');
    if (!box) return;
    const tags = Store.tagCounts().slice(0, 8);
    box.innerHTML = tags.length
      ? '<span>常用：</span>' + tags.map(function (item) {
        return '<button type="button" data-suggest-tag="' + esc(item.tag) + '">#' + esc(item.tag) + '</button>';
      }).join('')
      : '';
  }

  function togglePreview() {
    const content = $('#cardContent');
    const preview = $('#editorPreview');
    const button = $('#previewToggle');
    if (!content || !preview) return;
    ui.editorPreview = !ui.editorPreview;
    content.hidden = ui.editorPreview;
    preview.hidden = !ui.editorPreview;
    button.innerHTML = ui.editorPreview ? icon('eye-off') + '<span>继续编辑</span>' : icon('eye') + '<span>预览</span>';
    if (ui.editorPreview) preview.innerHTML = MD.render(content.value) || '<p class="muted">还没有内容。</p>';
  }

  function parseEditorTags(value) {
    return String(value || '').split(/[\s,，、;；#]+/).map(function (tag) {
      return tag.trim();
    }).filter(Boolean);
  }

  function onEditorSubmit(event) {
    event.preventDefault();
    const content = $('#cardContent').value.trim();
    let title = $('#cardTitle').value.trim();
    if (!content) {
      $('#cardContent').classList.add('is-invalid');
      $('#cardContent').focus();
      toast('先写一点内容吧', 'warn');
      return;
    }
    $('#cardContent').classList.remove('is-invalid');
    if (!title) title = MD.firstLine(content).slice(0, 60) || '未命名碎片';
    const payload = {
      title: title,
      content: content,
      tags: parseEditorTags($('#cardTags').value),
      kind: $('#cardKind').value,
      subject: $('#cardSubject').value
    };
    const editingId = $('#cardId').value;
    let saved = null;
    if (editingId) {
      saved = Store.update(editingId, payload);
      toast('修改已保存');
    } else {
      saved = Store.add(payload);
      toast('已收进卡片集');
    }
    closeDialog($('#editorDialog'));
    if (!saved) {
      toast('保存失败，请再试一次', 'warn');
      return;
    }
    if (editingId) {
      if (route.name === 'card') renderRoute();
      else if (route.name === 'home') refreshCollection();
      else renderRoute();
    } else {
      go('#/card/' + encodeURIComponent(saved.id));
    }
  }

  async function openShare(card) {
    if (!card) return;
    ui.shareCard = card;
    const color = subjectColor(card.subject);
    $('#sharePreview').innerHTML = [
      '<div class="share-mini" style="--accent:' + color + '">',
      '  <div class="share-mini-head">' + kindStamp(card) + '<span>' + esc(card.subject) + '</span></div>',
      '  <h3>' + esc(card.title) + '</h3>',
      '  <p>' + esc(MD.excerpt(card.content, 120)) + '</p>',
      '  <div class="share-mini-tags">' + tagPills(card.tags, false, 3) + '</div>',
      '</div>'
    ].join('');
    const urlInput = $('#shareUrl');
    urlInput.value = '正在生成…';
    const dialog = $('#shareDialog');
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('has-dialog');
    try {
      const url = await Share.buildUrl(card);
      if (ui.shareCard && ui.shareCard.id === card.id) urlInput.value = url;
    } catch (error) {
      urlInput.value = '生成失败：' + error.message;
    }
  }

  function cardPlainText(card) {
    return card.title + '\n\n' + MD.strip(card.content) + '\n\n—— 来自「碎页集」';
  }

  function toast(message, tone) {
    const region = $('#toastRegion');
    if (!region) return;
    toastCount += 1;
    const item = document.createElement('div');
    item.className = 'toast' + (tone ? ' toast-' + tone : '');
    item.innerHTML = icon(tone === 'warn' ? 'alert' : 'check') + '<span></span>';
    $('span', item).textContent = message;
    region.appendChild(item);
    if (region.children.length > 3) region.removeChild(region.firstElementChild);
    setTimeout(function () {
      item.classList.add('is-leaving');
      setTimeout(function () { item.remove(); }, 240);
    }, 2800);
    toastCount = Math.min(toastCount, 3);
  }

  function askConfirm(options) {
    return new Promise(function (resolve) {
      if (confirmResolve) {
        confirmResolve(false);
        confirmResolve = null;
      }
      const dialog = $('#confirmDialog');
      $('#confirmHeading').textContent = options.title || '确认操作？';
      $('#confirmText').textContent = options.text || '这个操作不可撤销。';
      const yes = $('[data-confirm="yes"]', dialog);
      yes.textContent = options.confirmText || '确认';
      yes.classList.toggle('btn-danger', options.danger !== false);
      yes.classList.toggle('btn-accent', options.danger === false);
      confirmResolve = resolve;
      if (!dialog.open) dialog.showModal();
      document.body.classList.add('has-dialog');
    });
  }

  function resolveConfirm(value) {
    const resolve = confirmResolve;
    confirmResolve = null;
    const dialog = $('#confirmDialog');
    if (dialog && dialog.open) dialog.close();
    if (resolve) resolve(value);
  }

  function reviewCurrent(remembered) {
    const session = ui.randomSession;
    if (!session || !session.current) return;
    if (!session.flipped) {
      toast('先翻面看看答案，再判断记住没有', 'warn');
      return;
    }
    Store.recordReview(session.current.id, Boolean(remembered));
    if (remembered) session.remembered += 1;
    else session.missed.push({ id: session.current.id, title: session.current.title });
    drawNextCard();
    renderRoute();
  }

  function skipCurrent() {
    const session = ui.randomSession;
    if (!session || !session.current) return;
    session.skipped += 1;
    drawNextCard();
    renderRoute();
  }

  function flipCurrent() {
    const session = ui.randomSession;
    const card = $('#flipCard');
    if (!session || !session.current || !card) return;
    session.flipped = !session.flipped;
    card.classList.toggle('is-flipped', session.flipped);
    if (session.flipped) {
      try { card.focus({ preventScroll: true }); } catch (error) { /* 旧浏览器忽略 */ }
    }
  }

  async function importFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast('文件太大了，先截取需要导入的部分', 'warn');
      return;
    }
    try {
      const text = await file.text();
      const field = $('#importText');
      if (field) field.value = text;
      ui.importText = text;
      parseImportText(text);
      toast('已读取 ' + file.name);
    } catch (error) {
      toast('文件读取失败：' + error.message, 'warn');
    }
  }

  function bindImportDrop() {
    const zone = $('#dropZone');
    if (!zone || zone.dataset.bound) return;
    zone.dataset.bound = '1';
    ['dragenter', 'dragover'].forEach(function (name) {
      zone.addEventListener(name, function (event) {
        event.preventDefault();
        zone.classList.add('is-dragging');
      });
    });
    ['dragleave', 'drop'].forEach(function (name) {
      zone.addEventListener(name, function (event) {
        event.preventDefault();
        zone.classList.remove('is-dragging');
      });
    });
    zone.addEventListener('drop', function (event) {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) importFile(file);
    });
  }

  function doImport() {
    const parsed = ui.importParsed;
    if (!parsed || parsed.error || !parsed.cards || !parsed.cards.length) {
      toast('还没有可以导入的卡片', 'warn');
      return;
    }
    const mode = $('#importMode') ? $('#importMode').value : ui.importMode;
    if (mode === 'replace') {
      askConfirm({
        title: '替换全部卡片？',
        text: '现有的 ' + Store.cards().length + ' 张卡片会被替换成这 ' + parsed.cards.length + ' 张，复习记录也会重置。',
        confirmText: '替换并导入'
      }).then(function (ok) {
        if (!ok) return;
        const result = Store.importCards(parsed.cards, 'replace');
        finishImport(result);
      });
      return;
    }
    const result = Store.importCards(parsed.cards, 'merge');
    finishImport(result);
  }

  function finishImport(result) {
    ui.importText = '';
    ui.importParsed = null;
    const text = '已导入 ' + result.added + ' 张' + (result.skipped ? '，跳过 ' + result.skipped + ' 张重复或空白内容' : '');
    toast(text);
    go('#/home');
    if (location.hash === '#/home') renderRoute();
  }

  function exportJSON() {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    Share.downloadText(Store.exportJSON(), '碎页集-备份-' + stamp + '.json', 'application/json;charset=utf-8');
    toast('JSON 备份已导出');
  }

  function exportMarkdown() {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    Share.downloadText(Store.exportMarkdown(), '碎页集-备份-' + stamp + '.md', 'text/markdown;charset=utf-8');
    toast('Markdown 备份已导出');
  }

  async function handleAction(action, element, event) {
    const cardId = element.dataset.id || (element.closest('[data-card-id]') ? element.closest('[data-card-id]').dataset.cardId : '');
    const card = cardId ? Store.find(cardId) : null;

    switch (action) {
      case 'new':
        event.preventDefault();
        openEditor(null);
        break;
      case 'favorite':
        if (!card) break;
        Store.toggleFavorite(card.id);
        if (route.name === 'home') refreshCollection();
        else if (route.name === 'card') renderRoute();
        break;
      case 'share':
        if (card) await openShare(card);
        break;
      case 'edit':
        if (card) openEditor(card);
        break;
      case 'delete':
        if (!card) break;
        askConfirm({
          title: '删掉这张碎片？',
          text: '「' + card.title + '」将从卡片集里移除，这个操作不可撤销。',
          confirmText: '删除'
        }).then(function (ok) {
          if (!ok) return;
          Store.remove(card.id);
          toast('已删除');
          if (route.name === 'card' && route.id === card.id) go('#/home');
          else renderRoute();
        });
        break;
      case 'copy':
        if (card) {
          const ok = await Share.copyText(cardPlainText(card));
          toast(ok ? '卡片文本已复制' : '复制失败了，请手动选择', ok ? '' : 'warn');
        }
        break;
      case 'mask': {
        const body = $('#detailBody');
        const paper = $('.detail-paper');
        if (!body || !paper) break;
        const masked = paper.classList.toggle('is-masked');
        element.innerHTML = masked ? icon('eye') + '显示正文' : icon('eye-off') + '遮住正文';
        body.setAttribute('aria-hidden', masked ? 'true' : 'false');
        break;
      }
      case 'clear-search':
        ui.query = '';
        ui.limit = 30;
        if ($('#searchInput')) $('#searchInput').value = '';
        refreshCollection();
        break;
      case 'clear-filters':
        ui.query = '';
        ui.tag = '';
        ui.subject = '';
        ui.limit = 30;
        if ($('#searchInput')) $('#searchInput').value = '';
        if ($('#subjectFilter')) $('#subjectFilter').value = '';
        refreshCollection();
        break;
      case 'toggle-layout':
        ui.layout = ui.layout === 'grid' ? 'list' : 'grid';
        Store.touchSettings({ layout: ui.layout });
        refreshCollection();
        break;
      case 'load-more':
        ui.limit += 30;
        refreshCollection();
        break;
      case 'shuffle-order':
        ui.shuffleSeed = Date.now();
        refreshCollection();
        break;
      case 'start-random':
        event.preventDefault();
        ui.randomScope = 'all';
        ui.randomSession = null;
        go('#/random');
        break;
      case 'restart-random':
        ui.randomSession = null;
        startRandomSession(ui.randomScope || 'all');
        renderRoute();
        break;
      case 'flip':
        flipCurrent();
        break;
      case 'review':
        reviewCurrent(element.dataset.value === '1');
        break;
      case 'skip':
        skipCurrent();
        break;
      case 'close-share-view':
        clearSharedState();
        go('#/home');
        break;
      case 'import-shared':
        if (!ui.sharedCard) break;
        {
          const exists = Store.cards().find(function (item) {
            return Store.fingerprint(item) === Store.fingerprint(ui.sharedCard);
          });
          if (exists) {
            toast('这张卡片已经在你的卡片集里了');
            clearSharedState();
            go('#/card/' + encodeURIComponent(exists.id));
            break;
          }
          const added = Store.add(ui.sharedCard);
          clearSharedState();
          if (added) {
            toast('已收进你的卡片集');
            go('#/card/' + encodeURIComponent(added.id));
          }
        }
        break;
      case 'copy-shared':
        if (ui.sharedCard) {
          const ok = await Share.copyText(cardPlainText(ui.sharedCard));
          toast(ok ? '卡片文本已复制' : '复制失败，请手动选择', ok ? '' : 'warn');
        }
        break;
      case 'pick-file':
        if ($('#importFile')) $('#importFile').click();
        break;
      case 'load-template': {
        const text = Importer.template();
        const field = $('#importText');
        if (field) field.value = text;
        parseImportText(text);
        break;
      }
      case 'download-template':
        Share.downloadText(Importer.template(), '碎页集-导入模板.md', 'text/markdown;charset=utf-8');
        toast('模板已下载');
        break;
      case 'do-import':
        doImport();
        break;
      case 'export-json':
        exportJSON();
        break;
      case 'export-md':
        exportMarkdown();
        break;
      case 'restore-demo':
        askConfirm({
          title: '补回示例卡片？',
          text: '只会添加卡片集里缺少的示例卡，不会删除你写的卡片。',
          confirmText: '补回示例',
          danger: false
        }).then(function (ok) {
          if (!ok) return;
          const added = Store.restoreDemo();
          toast(added ? '已补回 ' + added + ' 张示例卡' : '示例卡已经都在了');
          renderRoute();
        });
        break;
      case 'remove-demo':
        askConfirm({
          title: '移除全部示例卡？',
          text: '只会移除预置的示例卡片，你自己写的卡片会保留。之后可以在「关于」里补回来。',
          confirmText: '移除示例'
        }).then(function (ok) {
          if (!ok) return;
          Store.removeDemo();
          toast('示例卡已移除');
          renderRoute();
        });
        break;
      case 'clear-all':
        askConfirm({
          title: '清空全部卡片？',
          text: '所有卡片和复习记录都会被删除，无法恢复。建议先导出一份 JSON 备份。',
          confirmText: '全部清空'
        }).then(function (ok) {
          if (!ok) return;
          Store.clearAll();
          toast('卡片集已清空');
          go('#/home');
          renderRoute();
        });
        break;
      default:
        break;
    }
  }

  function handleAppInput(event) {
    const target = event.target;
    if (target.id === 'searchInput') {
      ui.query = target.value;
      ui.limit = 30;
      refreshCollection();
    } else if (target.id === 'importText') {
      ui.importText = target.value;
      clearTimeout(importTimer);
      importTimer = setTimeout(function () {
        ui.importParsed = Importer.parse(target.value);
        updateImportPreview();
      }, 280);
    } else if (target.id === 'cardContent') {
      updateEditorCount();
    }
  }

  function handleAppChange(event) {
    const target = event.target;
    if (target.id === 'subjectFilter') {
      ui.subject = target.value;
      ui.limit = 30;
      refreshCollection();
    } else if (target.id === 'sortSelect') {
      ui.sort = target.value;
      if (ui.sort === 'random') ui.shuffleSeed = Date.now();
      ui.limit = 30;
      refreshCollection();
    } else if (target.id === 'randomScope') {
      ui.randomScope = target.value;
      ui.randomSession = null;
      startRandomSession(ui.randomScope);
      renderRoute();
    } else if (target.id === 'importMode') {
      ui.importMode = target.value;
    } else if (target.id === 'importFile') {
      const file = target.files && target.files[0];
      if (file) importFile(file);
      target.value = '';
    }
  }

  function isTypingTarget(target) {
    return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
  }

  function handleKeydown(event) {
    const dialogOpen = Boolean(document.querySelector('dialog[open]'));
    const typing = isTypingTarget(event.target);
    if (dialogOpen) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (route.name !== 'home') {
        ui.focusSearch = true;
        go('#/home');
      } else {
        const input = $('#searchInput');
        if (input) input.focus();
      }
      return;
    }

    if (event.key === '/' && !typing && !dialogOpen) {
      event.preventDefault();
      if (route.name !== 'home') {
        ui.focusSearch = true;
        go('#/home');
      } else {
        const input = $('#searchInput');
        if (input) input.focus();
      }
      return;
    }

    if (event.key === 'n' && !typing && !dialogOpen && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      openEditor(null);
      return;
    }

    if (dialogOpen || typing) return;

    if (route.name === 'random') {
      const session = ui.randomSession;
      if (!session || !session.current) return;
      if (event.code === 'Space' || event.key === ' ') {
        if (event.target.closest && event.target.closest('button, a')) return;
        event.preventDefault();
        if (!session.flipped) flipCurrent();
      } else if (session.flipped && event.key === '1') {
        event.preventDefault();
        reviewCurrent(false);
      } else if (session.flipped && event.key === '2') {
        event.preventDefault();
        reviewCurrent(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        go('#/home');
      }
    }
  }

  function bindStaticEvents() {
    document.addEventListener('click', function (event) {
      const closeButton = event.target.closest('[data-close-dialog]');
      if (closeButton) {
        closeDialog(closeButton.closest('dialog'));
        return;
      }

      const confirmButton = event.target.closest('[data-confirm]');
      if (confirmButton) {
        resolveConfirm(confirmButton.getAttribute('data-confirm') === 'yes');
        return;
      }

      const tagButton = event.target.closest('[data-tag]');
      if (tagButton) {
        const tag = tagButton.getAttribute('data-tag') || '';
        ui.tag = tag;
        ui.subject = '';
        ui.limit = 30;
        if (route.name !== 'home') go('#/home');
        else {
          refreshCollection();
          const section = $('#collection');
          if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      const subjectButton = event.target.closest('[data-subject]');
      if (subjectButton) {
        ui.subject = subjectButton.getAttribute('data-subject') || '';
        ui.tag = '';
        ui.limit = 30;
        if (route.name !== 'home') go('#/home');
        else {
          refreshCollection();
          const section = $('#collection');
          if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      const actionElement = event.target.closest('[data-action]');
      if (actionElement) {
        event.preventDefault();
        handleAction(actionElement.getAttribute('data-action'), actionElement, event).catch(function (error) {
          toast(error.message || '操作没有完成', 'warn');
        });
      }
    }, true);

    document.addEventListener('click', function (event) {
      const link = event.target.closest('a[href^="#/"]');
      if (!link) return;
      if (ui.sharedCard || ui.sharedError) {
        event.preventDefault();
        clearSharedState();
        go(link.getAttribute('href'));
      }
    });

    app.addEventListener('input', handleAppInput);
    app.addEventListener('change', handleAppChange);
    app.addEventListener('keydown', function (event) {
      if (event.target.id === 'searchInput') {
        if (event.key === 'Escape') {
          event.target.value = '';
          ui.query = '';
          refreshCollection();
          event.target.blur();
        } else if (event.key === 'Enter') {
          const first = filteredCards()[0];
          if (first) go('#/card/' + encodeURIComponent(first.id));
        }
      }
    });
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('hashchange', function () { renderRoute(); });

    const cardContent = $('#cardContent');
    if (cardContent) cardContent.addEventListener('input', updateEditorCount);

    const themeToggle = $('#themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', function () {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
      });
    }

    const editorForm = $('#cardForm');
    if (editorForm) editorForm.addEventListener('submit', onEditorSubmit);
    const previewToggle = $('#previewToggle');
    if (previewToggle) previewToggle.addEventListener('click', togglePreview);
    const tagSuggestions = $('#tagSuggestions');
    if (tagSuggestions) {
      tagSuggestions.addEventListener('click', function (event) {
        const button = event.target.closest('[data-suggest-tag]');
        if (!button) return;
        const input = $('#cardTags');
        const tag = button.getAttribute('data-suggest-tag');
        const current = parseEditorTags(input.value);
        if (current.indexOf(tag) < 0) current.push(tag);
        input.value = current.slice(0, 8).join(' ');
      });
    }
    const editorDialog = $('#editorDialog');
    if (editorDialog) {
      editorDialog.addEventListener('keydown', function (event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          editorForm.requestSubmit();
        }
      });
    }

    const copyShare = $('#copyShareBtn');
    if (copyShare) {
      copyShare.addEventListener('click', async function () {
        const value = $('#shareUrl').value;
        if (!/^https?:/i.test(value)) {
          toast('链接还在生成，稍等一下', 'warn');
          return;
        }
        const ok = await Share.copyText(value);
        toast(ok ? '分享链接已复制' : '复制失败，请手动复制', ok ? '' : 'warn');
      });
    }

    const imageButton = $('#downloadImageBtn');
    if (imageButton) {
      imageButton.addEventListener('click', async function () {
        if (!ui.shareCard) return;
        const original = imageButton.innerHTML;
        imageButton.disabled = true;
        imageButton.innerHTML = icon('image') + '<span>正在画…</span>';
        try {
          await Share.downloadImage(ui.shareCard);
          toast('卡片图片已下载');
        } catch (error) {
          toast('图片生成失败：' + error.message, 'warn');
        } finally {
          imageButton.disabled = false;
          imageButton.innerHTML = original;
        }
      });
    }

    const nativeButton = $('#nativeShareBtn');
    if (nativeButton) {
      nativeButton.addEventListener('click', async function () {
        if (!ui.shareCard) return;
        const url = $('#shareUrl').value;
        if (!/^https?:/i.test(url)) {
          toast('链接还在生成，稍等一下', 'warn');
          return;
        }
        const shared = await Share.nativeShare(ui.shareCard, url);
        if (!shared) {
          const ok = await Share.copyText(url);
          toast(ok ? '当前浏览器不支持系统分享，已复制链接' : '请手动复制链接', ok ? '' : 'warn');
        }
      });
    }

    const shareUrl = $('#shareUrl');
    if (shareUrl) {
      shareUrl.addEventListener('click', function () { shareUrl.select(); });
    }

    $$('dialog').forEach(function (dialog) {
      dialog.addEventListener('close', function () {
        document.body.classList.toggle('has-dialog', Boolean(document.querySelector('dialog[open]')));
        if (dialog.id === 'confirmDialog' && confirmResolve) {
          const resolve = confirmResolve;
          confirmResolve = null;
          resolve(false);
        }
        if (dialog.id === 'editorDialog') {
          const preview = $('#editorPreview');
          const content = $('#cardContent');
          if (preview && content && !preview.hidden) {
            preview.hidden = true;
            content.hidden = false;
            ui.editorPreview = false;
            $('#previewToggle').innerHTML = icon('eye') + '<span>预览</span>';
          }
        }
      });
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) dialog.close();
      });
    });
  }

  function applyTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(Store.THEME_KEY, next); } catch (error) { /* ignore */ }
    const toggle = $('#themeToggle');
    if (toggle) {
      toggle.setAttribute('aria-label', next === 'dark' ? '切换到日间模式' : '切换夜读模式');
      toggle.setAttribute('title', next === 'dark' ? '切换到日间模式' : '切换夜读模式');
    }
    const meta = document.querySelectorAll('meta[name="theme-color"]');
    meta.forEach(function (item) {
      item.setAttribute('content', next === 'dark' ? '#171512' : '#f4efe4');
    });
  }

  async function init() {
    applyTheme(document.documentElement.dataset.theme || 'light');
    const year = $('#footerYear');
    if (year) year.textContent = new Date().getFullYear();
    bindStaticEvents();

    const token = new URLSearchParams(location.search).get('s');
    if (token) {
      try {
        ui.sharedCard = await Share.decodeCard(token);
      } catch (error) {
        ui.sharedError = error.message || '分享链接无法读取';
      }
    } else if (!location.hash) {
      history.replaceState(null, '', location.pathname + location.search + '#/home');
    }

    if (!Store.storageAvailable) toast('浏览器不允许本地存储，卡片可能无法保存', 'warn');
    renderRoute(true);

    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 离线缓存失败不影响使用 */ });
    }
  }

  init();
})();
