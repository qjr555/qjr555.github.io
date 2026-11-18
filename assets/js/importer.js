/* 碎页集 — Markdown / JSON 导入解析
 * Markdown 约定：
 *   ## 标题
 *   标签：数学、函数
 *   正文……
 *   ---
 *   也可以省略标签行，用 #数学 #函数 单独占一行。
 */
(function () {
  'use strict';

  const SUBJECTS = window.SuiData.SUBJECTS.map(function (item) { return item.name; });
  const KIND_LABELS = window.SuiData.KINDS;

  function stripBom(text) {
    return String(text || '').replace(/^\uFEFF/, '');
  }

  function splitTags(value) {
    return String(value || '')
      .split(/[\s,，、;；#]+/)
      .map(function (item) { return item.trim().replace(/^#+/, ''); })
      .filter(Boolean);
  }

  function normKind(value) {
    const text = String(value || '').trim();
    if (KIND_LABELS[text]) return text;
    for (const key in KIND_LABELS) {
      if (KIND_LABELS[key].label === text) return key;
    }
    if (/错/.test(text)) return 'mistake';
    if (/方法|技巧/.test(text)) return 'method';
    if (/金句|句子/.test(text)) return 'quote';
    if (/概念|定义/.test(text)) return 'concept';
    return 'note';
  }

  function normSubject(value) {
    const text = String(value || '').trim();
    if (SUBJECTS.indexOf(text) >= 0) return text;
    if (/数学|数/.test(text)) return '数学';
    if (/语文|作文/.test(text)) return '语文';
    if (/英语|英文/.test(text)) return '英语';
    if (/物理/.test(text)) return '物理';
    if (/化学/.test(text)) return '化学';
    if (/生物/.test(text)) return '生物';
    if (/历史/.test(text)) return '历史';
    if (/地理/.test(text)) return '地理';
    if (/政治|哲学/.test(text)) return '政治';
    if (/方法|学习/.test(text)) return '方法';
    if (/心态|情绪/.test(text)) return '心态';
    return '其他';
  }

  function parseJSON(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { error: 'JSON 格式有误：' + error.message };
    }
    let list = null;
    if (Array.isArray(parsed)) list = parsed;
    else if (parsed && Array.isArray(parsed.cards)) list = parsed.cards;
    if (!list) return { error: '没有找到 cards 数组，请确认这是碎页集导出的备份文件。' };

    const cards = [];
    const warnings = [];
    list.forEach(function (item, index) {
      if (!item || typeof item !== 'object' || !String(item.content || '').trim()) {
        warnings.push('第 ' + (index + 1) + ' 条缺少正文，已跳过。');
        return;
      }
      cards.push({
        title: String(item.title || '').trim(),
        content: String(item.content || '').trim(),
        tags: Array.isArray(item.tags) ? item.tags : [],
        kind: normKind(item.kind),
        subject: normSubject(item.subject),
        createdAt: item.createdAt,
        favorite: Boolean(item.favorite)
      });
    });
    return {
      mode: 'json',
      cards: cards,
      warnings: warnings,
      skipped: list.length - cards.length
    };
  }

  function splitMarkdown(text) {
    const separator = /^[ \t]*---[ \t]*$/m;
    if (separator.test(text)) {
      return text.split(separator);
    }

    const h2 = text.match(/^##\s+.+$/gm) || [];
    if (h2.length > 1) {
      return text.split(/^(?=##\s+)/m);
    }

    const h1 = text.match(/^#\s+.+$/gm) || [];
    if (h1.length > 1) {
      return text.split(/^(?=#\s+)/m);
    }

    return [text];
  }

  function parseBlock(raw, index) {
    let lines = String(raw || '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\r\n?/g, '\n')
      .split('\n');

    let title = '';
    let tags = [];
    let kind = '';
    let subject = '';
    let date = '';
    const body = [];

    lines.forEach(function (line) {
      const trimmed = line.trim();
      const titleMeta = trimmed.match(/^(?:标题|title)\s*[:：]\s*(.+)$/i);
      if (titleMeta) {
        title = title || titleMeta[1].trim();
        return;
      }
      const tagMeta = trimmed.match(/^(?:标签|tags?|#标签)\s*[:：]\s*(.+)$/i);
      if (tagMeta) {
        tags = tags.concat(splitTags(tagMeta[1]));
        return;
      }
      const kindMeta = trimmed.match(/^(?:类型|kind|卡片类型)\s*[:：]\s*(.+)$/i);
      if (kindMeta) {
        kind = kindMeta[1].trim();
        return;
      }
      const subjectMeta = trimmed.match(/^(?:科目|学科|subject)\s*[:：]\s*(.+)$/i);
      if (subjectMeta) {
        subject = subjectMeta[1].trim();
        return;
      }
      const dateMeta = trimmed.match(/^(?:日期|date|创建时间)\s*[:：]\s*(.+)$/i);
      if (dateMeta) {
        date = dateMeta[1].trim();
        return;
      }
      const heading = line.match(/^#{1,4}\s+(.+)$/);
      if (heading) {
        if (!title) {
          title = heading[1].trim();
          return;
        }
        body.push(line);
        return;
      }
      if (/^(?:#[\w\u4e00-\u9fa5-]+\s*)+$/.test(trimmed) && tags.length === 0) {
        tags = tags.concat(splitTags(trimmed));
        return;
      }
      body.push(line);
    });

    let content = body.join('\n').trim();
    if (!title) {
      const first = body.find(function (line) { return line.trim(); });
      if (first) {
        title = first.trim().replace(/^[-*>]\s*/, '').replace(/^\d+\.\s*/, '').slice(0, 80);
        const indexOfFirst = body.indexOf(first);
        if (body.filter(function (line) { return line.trim(); }).length > 1) {
          body.splice(indexOfFirst, 1);
          content = body.join('\n').trim();
        }
      }
    }

    if (!content) {
      return { error: '第 ' + (index + 1) + ' 块只有标题，没有正文。' };
    }

    const uniqueTags = [];
    const seen = Object.create(null);
    tags.forEach(function (tag) {
      const clean = String(tag).replace(/^#+/, '').slice(0, 18);
      if (!clean || seen[clean.toLowerCase()]) return;
      seen[clean.toLowerCase()] = true;
      uniqueTags.push(clean);
    });

    return {
      card: {
        title: title.slice(0, 80),
        content: content,
        tags: uniqueTags.slice(0, 8),
        kind: normKind(kind),
        subject: normSubject(subject),
        createdAt: date && !isNaN(new Date(date).getTime()) ? new Date(date).toISOString() : undefined
      }
    };
  }

  function parseMarkdown(text) {
    const blocks = splitMarkdown(text)
      .map(function (block) { return block.trim(); })
      .filter(Boolean);
    const cards = [];
    const warnings = [];
    blocks.slice(0, 300).forEach(function (block, index) {
      const parsed = parseBlock(block, index);
      if (parsed.error) warnings.push(parsed.error);
      else cards.push(parsed.card);
    });
    return {
      mode: 'markdown',
      cards: cards,
      warnings: warnings,
      skipped: Math.max(0, blocks.length - cards.length)
    };
  }

  function parse(text) {
    const clean = stripBom(text).trim();
    if (!clean) return { error: '还没有内容。粘贴 Markdown，或选择一个 .md / .json 文件。' };
    if (clean.charAt(0) === '{' || clean.charAt(0) === '[') {
      return parseJSON(clean);
    }
    return parseMarkdown(clean);
  }

  function template() {
    return [
      '## 复合函数的定义域',
      '标签：数学、函数、易错',
      '类型：笔记',
      '科目：数学',
      '',
      '求 `f(g(x))` 的定义域：先看内层，再看外层，最后取交集。',
      '',
      '---',
      '',
      '## 楞次定律怎么快速判断？',
      '标签：物理 电磁学',
      '类型：概念',
      '科目：物理',
      '',
      '**增反减同，来拒去留。**',
      '',
      '---',
      '',
      '## 今天记住的一句话',
      '标签：金句 心态',
      '',
      '焦虑的反义词是具体。'
    ].join('\n');
  }

  window.SuiImport = {
    parse: parse,
    template: template
  };
})();
