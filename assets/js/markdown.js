/* 碎页集 — 一个够用、安全的轻量 Markdown 渲染器
 * 只支持短笔记常用的语法：标题、列表、引用、代码、粗体、斜体、高亮、链接、公式。
 * 所有原始 HTML 都会被转义，分享链接里的内容也不能注入脚本。
 */
(function () {
  'use strict';

  const BLOCK_TOKEN = '\uE000CODE';
  const INLINE_TOKEN = '\uE002INLINE';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(url) {
    const trimmed = String(url || '').trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return '';
  }

  function inline(source, tokens) {
    let text = source;

    // 行内代码
    text = text.replace(/`([^`\n]+)`/g, function (_, code) {
      const key = INLINE_TOKEN + tokens.length + '\uE003';
      tokens.push('<code>' + code + '</code>');
      return key;
    });

    // 公式：$$...$$ / $...$
    text = text.replace(/\$\$([^$]+)\$\$/g, function (_, math) {
      const key = INLINE_TOKEN + tokens.length + '\uE003';
      tokens.push('<span class="math math-block">' + math.trim() + '</span>');
      return key;
    });
    text = text.replace(/\$([^$\n]+?)\$/g, function (_, math) {
      const key = INLINE_TOKEN + tokens.length + '\uE003';
      tokens.push('<span class="math">' + math.trim() + '</span>');
      return key;
    });

    // 链接
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (match, label, url) {
      const safe = safeUrl(url.replace(/&amp;/g, '&'));
      if (!safe) return label;
      return '<a href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });

    // 粗体、删除线、高亮、斜体
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    text = text.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    text = text.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

    // 还原行内代码 / 公式
    text = text.replace(new RegExp(INLINE_TOKEN + '(\\d+)\\uE003', 'g'), function (_, index) {
      return tokens[Number(index)];
    });

    return text;
  }

  function isBlockStart(line) {
    return /^(#{1,6}\s|>\s?|```|\s*([-*+]|\d+\.)\s+|\s*([-*_])\3{2,}\s*$)/.test(line);
  }

  function render(source) {
    let text = String(source == null ? '' : source).replace(/\r\n?/g, '\n').trim();
    if (!text) return '';

    const codeBlocks = [];
    // 先抽出围栏代码块，避免里面的 Markdown 被解析。
    text = text.replace(/```([\w-]*)\n([\s\S]*?)```/g, function (_, lang, code) {
      const key = BLOCK_TOKEN + codeBlocks.length + '\uE001';
      const cls = lang ? ' class="language-' + escapeHtml(lang) + '"' : '';
      codeBlocks.push('<pre class="md-code"><code' + cls + '>' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre>');
      return '\n' + key + '\n';
    });

    text = escapeHtml(text);
    const lines = text.split('\n');
    const output = [];
    const inlineTokens = [];
    let paragraph = [];
    let list = null;

    function flushParagraph() {
      if (!paragraph.length) return;
      const body = paragraph.map(function (line) { return line; }).join('<br>');
      output.push('<p>' + inline(body, inlineTokens) + '</p>');
      paragraph = [];
    }

    function closeList() {
      if (!list) return;
      output.push('</' + list + '>');
      list = null;
    }

    function block(type) {
      flushParagraph();
      closeList();
      output.push(type);
    }

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];

      if (!line.trim()) {
        flushParagraph();
        closeList();
        continue;
      }

      const codeMatch = line.match(/^\uE000CODE(\d+)\uE001$/);
      if (codeMatch) {
        block(codeBlocks[Number(codeMatch[1])]);
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = Math.min(6, heading[1].length + 2);
        block('<h' + level + ' class="md-h">' + inline(heading[2], inlineTokens) + '</h' + level + '>');
        continue;
      }

      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        block('<hr>');
        continue;
      }

      if (/^&gt;\s?/.test(line)) {
        flushParagraph();
        closeList();
        const quote = [];
        while (i < lines.length && /^&gt;\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^&gt;\s?/, ''));
          i += 1;
        }
        i -= 1;
        output.push('<blockquote>' + inline(quote.join('<br>'), inlineTokens) + '</blockquote>');
        continue;
      }

      const listItem = line.match(/^\s*([-*+]|\d+\.)\s+(.+)$/);
      if (listItem) {
        flushParagraph();
        const type = /\d+\./.test(listItem[1]) ? 'ol' : 'ul';
        if (list !== type) {
          closeList();
          list = type;
          output.push('<' + type + '>');
        }
        output.push('<li>' + inline(listItem[2], inlineTokens) + '</li>');
        continue;
      }

      if (isBlockStart(line)) {
        flushParagraph();
        closeList();
      }

      paragraph.push(line);
    }

    flushParagraph();
    closeList();
    return output.join('\n');
  }

  function strip(source) {
    let text = String(source == null ? '' : source);
    text = text.replace(/```[\s\S]*?```/g, function (block) {
      return block.replace(/```[\w-]*\n?/g, '');
    });
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
    text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    text = text.replace(/<[^>]+>/g, '');
    text = text.replace(/^\s{0,3}(#{1,6}|>)\s?/gm, '');
    text = text.replace(/^\s*[-*+]\s+/gm, '· ');
    text = text.replace(/^\s*(\d+)\.\s+/gm, '$1. ');
    text = text.replace(/`([^`]+)`/g, '$1');
    text = text.replace(/\$\$?([^$]+)\$\$?/g, '$1');
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');
    text = text.replace(/~~([^~]+)~~/g, '$1');
    text = text.replace(/==([^=]+)==/g, '$1');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2');
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    return text.replace(/\n{3,}/g, '\n\n').trim();
  }

  function excerpt(source, max) {
    const plain = strip(source).replace(/\s+/g, ' ').trim();
    const limit = max || 110;
    return plain.length > limit ? plain.slice(0, limit).replace(/[，、；,;]\s*$/, '') + '…' : plain;
  }

  function firstLine(source) {
    const plain = strip(source);
    const line = plain.split('\n').map(function (item) { return item.trim(); }).filter(Boolean)[0] || '';
    return line.length > 34 ? line.slice(0, 34) + '…' : line;
  }

  window.SuiMarkdown = {
    render: render,
    strip: strip,
    excerpt: excerpt,
    firstLine: firstLine,
    escapeHtml: escapeHtml
  };
})();
