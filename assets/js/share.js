/* 碎页集 — 分享链接与卡片图片
 * 分享内容压缩后放进 URL，不经过任何服务器。
 */
(function () {
  'use strict';

  const md = window.SuiMarkdown;

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function toUrlSafe(base64) {
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromUrlSafe(value) {
    let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return base64;
  }

  async function compress(bytes) {
    if (typeof CompressionStream !== 'function') return null;
    const formats = [
      { name: 'deflate-raw', prefix: 'z' },
      { name: 'deflate', prefix: 'y' }
    ];
    for (let i = 0; i < formats.length; i += 1) {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream(formats[i].name));
        const buffer = await new Response(stream).arrayBuffer();
        return { prefix: formats[i].prefix, bytes: new Uint8Array(buffer) };
      } catch (error) {
        // 换下一种格式
      }
    }
    return null;
  }

  async function decompress(bytes, format) {
    if (typeof DecompressionStream !== 'function') throw new Error('当前浏览器不支持解压分享内容');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  }

  function payload(card) {
    return {
      v: 1,
      t: card.title,
      c: card.content,
      g: card.tags,
      k: card.kind,
      s: card.subject,
      d: card.createdAt
    };
  }

  async function encodeCard(card) {
    const raw = new TextEncoder().encode(JSON.stringify(payload(card)));
    let prefix = 'j';
    let bytes = raw;
    const packed = await compress(raw);
    if (packed) {
      prefix = packed.prefix;
      bytes = packed.bytes;
    }
    return prefix + toUrlSafe(bytesToBase64(bytes));
  }

  async function decodeCard(token) {
    if (!token || typeof token !== 'string') throw new Error('分享链接里没有内容');
    if (token.length > 30000) throw new Error('分享内容过长');
    const prefix = token.charAt(0);
    const body = token.slice(1);
    if (prefix !== 'j' && prefix !== 'z' && prefix !== 'y') throw new Error('无法识别分享链接');
    let bytes = base64ToBytes(fromUrlSafe(body));
    if (prefix !== 'j') {
      const format = prefix === 'z' ? 'deflate-raw' : 'deflate';
      bytes = await decompress(bytes, format);
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data.c !== 'string' || !data.c.trim()) throw new Error('分享卡片没有正文');
    if (data.c.length > 8000) throw new Error('分享内容过长');
    return {
      id: 'shared',
      title: String(data.t || '一张分享的碎片').slice(0, 80),
      content: data.c.slice(0, 8000),
      tags: Array.isArray(data.g) ? data.g.slice(0, 8).map(String) : [],
      kind: window.SuiData.KINDS[data.k] ? data.k : 'note',
      subject: data.s || '其他',
      favorite: false,
      demo: false,
      createdAt: data.d || new Date().toISOString(),
      shared: true
    };
  }

  async function buildUrl(card) {
    const token = await encodeCard(card);
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('s', token);
    return url.toString();
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // 回退到 execCommand
      }
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-9999px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (error) {
      ok = false;
    }
    area.remove();
    return ok;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function downloadText(text, filename, type) {
    downloadBlob(new Blob([text], { type: type || 'text/plain;charset=utf-8' }), filename);
  }

  function safeFilename(title) {
    return String(title || '碎片').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 48) || '碎片';
  }

  function wrapText(ctx, text, maxWidth) {
    const lines = [];
    String(text).split('\n').forEach(function (paragraph) {
      if (!paragraph.trim()) {
        lines.push('');
        return;
      }
      const chars = Array.from(paragraph);
      let line = '';
      chars.forEach(function (char) {
        const test = line + char;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = char;
        } else {
          line = test;
        }
      });
      if (line) lines.push(line);
    });
    return lines;
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  async function makeImage(card) {
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (error) { /* ignore */ }
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器无法生成图片');

    const seed = window.SuiData;
    const accent = (seed.SUBJECT_COLORS && seed.SUBJECT_COLORS[card.subject]) || '#c8472b';
    const ink = '#25221c';
    const muted = '#756e61';
    const paper = '#f4efe4';
    const cardPaper = '#fbf7ee';

    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, 1080, 1350);

    // 纸张颗粒
    for (let i = 0; i < 1300; i += 1) {
      const x = Math.random() * 1080;
      const y = Math.random() * 1350;
      ctx.fillStyle = 'rgba(70,55,35,' + (Math.random() * 0.045).toFixed(3) + ')';
      ctx.fillRect(x, y, Math.random() * 2 + 0.5, Math.random() * 2 + 0.5);
    }

    // 主纸面
    ctx.save();
    ctx.shadowColor = 'rgba(55,40,20,0.16)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 18;
    roundedRect(ctx, 58, 58, 964, 1234, 8);
    ctx.fillStyle = cardPaper;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(70,55,35,0.20)';
    ctx.lineWidth = 2;
    roundedRect(ctx, 58, 58, 964, 1234, 8);
    ctx.stroke();

    // 左侧科目色条
    ctx.fillStyle = accent;
    ctx.fillRect(58, 58, 12, 1234);

    // 顶部品牌与印章
    ctx.fillStyle = '#bd432a';
    roundedRect(ctx, 112, 104, 96, 96, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    roundedRect(ctx, 119, 111, 82, 82, 2);
    ctx.stroke();
    ctx.fillStyle = '#f8f2e6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 60px "Songti SC","Noto Serif CJK SC","SimSun",serif';
    ctx.fillText('碎', 160, 154);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ink;
    ctx.font = '700 50px "Songti SC","Noto Serif CJK SC","SimSun",serif';
    ctx.fillText('碎页集', 238, 150);
    ctx.fillStyle = muted;
    ctx.font = '400 22px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('SUIYEJI  ·  一条知识，一张卡片', 240, 184);

    ctx.strokeStyle = 'rgba(70,55,35,0.22)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(112, 244);
    ctx.lineTo(968, 244);
    ctx.stroke();
    ctx.setLineDash([]);

    // 标签
    let y = 312;
    ctx.font = '500 23px "PingFang SC","Microsoft YaHei",sans-serif';
    let tagX = 112;
    const kindLabel = seed.KINDS[card.kind] ? seed.KINDS[card.kind].label : '笔记';
    const tags = [kindLabel].concat(card.tags || []).slice(0, 4);
    tags.forEach(function (tag) {
      const label = '#' + tag;
      const width = ctx.measureText(label).width + 30;
      if (tagX + width > 960) return;
      ctx.fillStyle = 'rgba(70,55,35,0.07)';
      roundedRect(ctx, tagX, y - 26, width, 40, 20);
      ctx.fill();
      ctx.fillStyle = tagX === 112 ? accent : muted;
      ctx.fillText(label, tagX + 15, y + 1);
      tagX += width + 10;
    });

    // 标题
    ctx.fillStyle = ink;
    ctx.font = '700 54px "Songti SC","Noto Serif CJK SC","SimSun",serif';
    const titleLines = wrapText(ctx, card.title, 840).slice(0, 2);
    let titleY = 430;
    titleLines.forEach(function (line) {
      ctx.fillText(line, 112, titleY);
      titleY += 74;
    });

    // 正文
    const bodyText = md.strip(card.content);
    ctx.fillStyle = '#3c382f';
    ctx.font = '400 33px "PingFang SC","Microsoft YaHei",sans-serif';
    const bodyLines = wrapText(ctx, bodyText, 840);
    const maxLines = 10;
    const clipped = bodyLines.length > maxLines;
    let bodyY = Math.max(580, titleY + 50);
    bodyLines.slice(0, maxLines).forEach(function (line, index) {
      if (index === maxLines - 1 && clipped) line = line.replace(/[，。；,;]$/, '') + ' …';
      ctx.fillText(line, 112, bodyY);
      bodyY += 54;
    });

    if (bodyY < 1060) {
      ctx.strokeStyle = 'rgba(70,55,35,0.18)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(112, 1108);
      ctx.lineTo(500, 1108);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(117,110,97,0.72)';
      ctx.font = '400 23px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText('合上卡片，试着复述一遍。', 112, 1152);
    }

    // 页脚
    if (bodyY < 1160) {
      ctx.fillStyle = 'rgba(70,55,35,0.10)';
      ctx.fillRect(112, 1186, 56, 4);
    }
    ctx.fillStyle = muted;
    ctx.font = '400 24px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('qjr555.github.io', 112, 1240);
    ctx.textAlign = 'right';
    ctx.fillText('把知识撕成能记住的小块', 948, 1240);
    ctx.textAlign = 'left';

    // 右下角小印章
    ctx.save();
    ctx.translate(900, 1160);
    ctx.rotate(-0.06);
    ctx.strokeStyle = 'rgba(189,67,42,0.55)';
    ctx.lineWidth = 3;
    roundedRect(ctx, -34, -34, 68, 68, 3);
    ctx.stroke();
    ctx.fillStyle = 'rgba(189,67,42,0.7)';
    ctx.font = '700 28px "Songti SC","SimSun",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('记', 0, 2);
    ctx.restore();

    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('图片生成失败'));
      }, 'image/png');
    });
  }

  async function downloadImage(card) {
    const blob = await makeImage(card);
    downloadBlob(blob, '碎页集-' + safeFilename(card.title) + '.png');
  }

  async function nativeShare(card, url) {
    if (!navigator.share) return false;
    try {
      await navigator.share({
        title: card.title + ' · 碎页集',
        text: md.excerpt(card.content, 70),
        url: url
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  window.SuiShare = {
    encodeCard: encodeCard,
    decodeCard: decodeCard,
    buildUrl: buildUrl,
    copyText: copyText,
    downloadText: downloadText,
    downloadBlob: downloadBlob,
    downloadImage: downloadImage,
    makeImage: makeImage,
    nativeShare: nativeShare,
    safeFilename: safeFilename
  };
})();
