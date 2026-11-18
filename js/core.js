(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DoGiaCore = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DAY = 864e5;
  const NEW_DAYS = 3;
  const LOG_TAB = 'Biến động';
  const RANGES = [[7, '7 ngày'], [30, '30 ngày'], [90, '90 ngày'], [0, 'Tất cả']];
  const PRICE_PRESETS = [
    { id: '', label: 'Mọi mức giá', min: null, max: null },
    { id: 'lt5', label: '< 5 tr', min: null, max: 5e6 },
    { id: '5-10', label: '5 – 10 tr', min: 5e6, max: 10e6 },
    { id: '10-15', label: '10 – 15 tr', min: 10e6, max: 15e6 },
    { id: '15-20', label: '15 – 20 tr', min: 15e6, max: 20e6 },
    { id: 'gt20', label: '> 20 tr', min: 20e6, max: null },
  ];

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const fmt = n => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  const fmtC = n => Math.abs(n) >= 1e6 ? fmt(+(n / 1e6).toFixed(1)) + ' tr'
    : Math.abs(n) >= 1e4 ? fmt(Math.round(n / 1e3)) + 'k' : fmt(n);
  const fmtD = d => d ? d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Trước đó';
  const fmtDs = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const fmtTime = d => `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ngày ${fmtD(d)}`;
  const pct = x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x * 100).toFixed(1).replace('.', ',') + '%';
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;

  function toDayStart(d) {
    const c = new Date(d || Date.now());
    c.setHours(0, 0, 0, 0);
    return c;
  }

  function isoDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function ago(d, refToday) {
    if (!d) return '—';
    const base = toDayStart(refToday);
    const n = Math.round((base - d) / DAY);
    return n <= 0 ? 'hôm nay' : n === 1 ? 'hôm qua' : `${n} ngày trước`;
  }

  function num(s) {
    s = String(s ?? '').trim();
    if (!/^[-+]?\s*[$€₫]?\s*\d[\d.,\s]*\s*(đ|₫|vnđ|vnd|\$|€|%)?$/i.test(s)) return null;
    let t = s.replace(/[^\d.,-]/g, '');
    if (/^-?\d{1,3}([.,])\d{3}(\1\d{3})*$/.test(t)) t = t.replace(/[.,]/g, '');
    else if (t.includes('.') && t.includes(',')) {
      t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    } else {
      t = t.replace(',', '.');
    }
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
  }

  function date(s) {
    s = String(s ?? '').trim();
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (m) {
      const dd = +m[1], mm = +m[2], yy = +m[3];
      const d = new Date(yy, mm - 1, dd);
      return d.getFullYear() === yy && d.getMonth() === mm - 1 && d.getDate() === dd ? d : null;
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      const yy = +m[1], mm = +m[2], dd = +m[3];
      const d = new Date(yy, mm - 1, dd);
      return d.getFullYear() === yy && d.getMonth() === mm - 1 && d.getDate() === dd ? d : null;
    }
    return null;
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') {
        q = true;
      } else if (c === ',') {
        row.push(cell); cell = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else {
        cell += c;
      }
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim()));
  }

  function hostOf(s) {
    try { return new URL(s).hostname.replace(/^www\./, ''); } catch { return ''; }
  }

  function sheetRef(link) {
    link = String(link ?? '').trim();
    const gid = (link.match(/[#&?]gid=(\d+)/) || [])[1] || '0';
    let m = link.match(/\/spreadsheets\/d\/e\/([\w-]+)/);
    if (m) return { id: m[1], gid, pub: true, csv: `https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?output=csv&gid=${gid}` };
    m = link.match(/\/spreadsheets\/d\/([\w-]+)/) || link.match(/^([\w-]{25,})$/);
    return m ? { id: m[1], gid, csv: `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&headers=1&gid=${gid}` } : null;
  }

  function parseLog(text, mainText, cols) {
    if (!text || text === mainText) return null;
    const all = parseCSV(text);
    const h = (all[0] || []).map(s => s.trim());
    const f = re => h.findIndex(x => re.test(x));
    const L = { t: f(/^ngày/i), cu: f(/giá cũ/i), p: f(/giá mới/i), src: f(/nguồn/i) };
    if (L.t < 0 || L.p < 0) return null;
    const pairs = h
      .map((n, j) => [cols.find(c => c.type === 'text' && norm(c.name) === norm(n))?.j, j])
      .filter(([m, j]) => m != null && !Object.values(L).includes(j));
    if (!pairs.length) return null;
    const map = new Map();
    for (const r of all.slice(1)) {
      const t = date(r[L.t]);
      const p = num(r[L.p]);
      if (!t || p == null) continue;
      const k = pairs.map(([, j]) => norm((r[j] || '').trim())).join('|');
      const entry = { t, p, cu: L.cu >= 0 ? num(r[L.cu]) : null, src: L.src >= 0 ? (r[L.src] || '').trim() : '' };
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(entry);
    }
    map.forEach(a => a.sort((x, y) => x.t - y.t));
    return { pairs, map };
  }

  function analyzeColumns(headers, rows) {
    const colCount = Math.max(headers.length, ...rows.map(r => r.length));
    const keep = [];
    for (let j = 0; j < colCount; j++) {
      if ((headers[j] || '').trim() || rows.some(r => (r[j] || '').trim())) keep.push(j);
    }
    const cols = keep.map(j => {
      const vals = rows.map(r => (r[j] || '').trim()).filter(Boolean);
      const n = vals.length || 1;
      const type = vals.filter(date).length / n >= 0.8 ? 'date'
        : vals.filter(v => num(v) != null).length / n >= 0.8 ? 'number' : 'text';
      const uniq = [...new Set(vals)];
      return { j, name: (headers[j] || '').trim() || `Cột ${j + 1}`, type, distinct: uniq.length, values: uniq };
    });

    const nums = cols.filter(c => c.type === 'number');
    const texts = cols.filter(c => c.type === 'text');
    const dates = cols.filter(c => c.type === 'date');
    const OLD = /cũ|old|trước|prev/i;
    const MAIN = /giá|price|doanh|tiền|amount|total|tổng/i;

    const value = nums.find(c => MAIN.test(c.name) && !OLD.test(c.name))
      || nums.find(c => !OLD.test(c.name)) || nums[0];
    const cmp = nums.find(c => c !== value && OLD.test(c.name));
    const group = texts.find(c => c.distinct > 1 && c.distinct <= 30 && c.distinct < rows.length);
    const facets = texts.filter(c => c !== group && c.distinct > 1 && c.distinct <= 20 && c.distinct < rows.length);

    return {
      cols,
      role: {
        value: value ? value.j : null,
        cmp: cmp ? cmp.j : null,
        group: group ? group.j : null,
        date: dates[0] ? dates[0].j : null,
      },
      facets,
    };
  }

  const textKey = (cols, r) => cols.filter(c => c.type === 'text').map(c => (r[c.j] || '').trim()).join(' | ');
  const rowLabel = (cols, role, r) => cols
    .filter(c => c.type === 'text' && c.j !== role.group)
    .map(c => (r[c.j] || '').trim()).filter(Boolean).join(' · ') || textKey(cols, r) || '—';

  const at = (pts, D) => {
    let p = pts[0].p;
    for (const x of pts) {
      if (!x.t || x.t <= D) p = x.p;
      else break;
    }
    return p;
  };

  function buildItems(rows, cols, role, opts) {
    if (role.value == null) return [];
    const today = toDayStart(opts?.today);
    const jsonHist = opts?.jsonHistory || {};
    const localHist = opts?.localHistory || {};
    const logObj = opts?.log || null;

    return rows.map(r => {
      const v = num(r[role.value]);
      if (v == null) return null;
      const o = role.cmp != null ? num(r[role.cmp]) : null;
      const d = role.date != null ? date(r[role.date]) : null;
      const key = textKey(cols, r);
      const ev = logObj ? (logObj.map.get(logObj.pairs.map(([m]) => norm((r[m] || '').trim())).join('|')) || []) : [];

      const datedMap = new Map();
      let undatedOld = null;

      const ingestHistory = arr => {
        if (!Array.isArray(arr)) return;
        for (const entry of arr) {
          if (!Array.isArray(entry) || entry.length < 2) continue;
          const p = typeof entry[1] === 'number' ? entry[1] : num(entry[1]);
          if (p == null) continue;
          const dt = entry[0] ? date(entry[0]) : null;
          if (dt) datedMap.set(+dt, { t: dt, p });
          else if (undatedOld == null) undatedOld = p;
        }
      };

      ingestHistory(jsonHist[key]);
      ingestHistory(localHist[key]);

      if (ev.length) {
        if (ev[0].cu != null && undatedOld == null) undatedOld = ev[0].cu;
        for (const e of ev) datedMap.set(+e.t, { t: e.t, p: e.p });
      }
      if (o != null && o !== v && undatedOld == null) undatedOld = o;
      if (d) {
        if (!datedMap.has(+d)) datedMap.set(+d, { t: d, p: v });
      }
      const sortedDated = [...datedMap.values()].sort((a, b) => a.t - b.t);
      if (!sortedDated.length) {
        sortedDated.push({ t: d || today, p: v });
      } else if (sortedDated[sortedDated.length - 1].p !== v) {
        sortedDated.push({ t: d && d > sortedDated[sortedDated.length - 1].t ? d : today, p: v });
      }

      const raw = [];
      if (undatedOld != null && undatedOld !== sortedDated[0].p) {
        raw.push({ t: null, p: undatedOld });
      }
      for (const pt of sortedDated) raw.push(pt);

      const pts = raw.filter((x, idx) => idx === 0 || x.p !== raw[idx - 1].p);
      const ps = pts.map(x => x.p);
      const lastT = pts.length > 1 ? pts[pts.length - 1].t : (d || pts[0].t);

      return {
        r,
        key,
        label: rowLabel(cols, role, r),
        group: role.group != null ? (r[role.group] || '').trim() : '',
        v,
        pts,
        lo: Math.min(...ps),
        hi: Math.max(...ps),
        mean: avg(ps),
        changes: pts.length - 1,
        lastT,
        est: pts[0].t === null,
        ev,
      };
    }).filter(Boolean);
  }

  function periodStart(items, rangeDays, refToday) {
    const today = toDayStart(refToday);
    if (rangeDays) return new Date(+today - rangeDays * DAY);
    const ts = items.flatMap(i => i.pts.map(x => x.t)).filter(Boolean);
    return new Date(Math.min(+today - 7 * DAY, ts.length ? Math.min(...ts) - 3 * DAY : +today));
  }

  function withPeriod(items, t0, rangeDays) {
    for (const i of items) {
      i.base = rangeDays ? at(i.pts, t0) : i.pts[0].p;
      i.chg = i.v - i.base;
      i.pc = i.base ? i.chg / i.base : 0;
    }
    return items;
  }

  const series = (pts, t0) => [{ t: t0, p: at(pts, t0) }, ...pts.filter(x => x.t && x.t > t0)];

  function computeVerdict(item) {
    if (item.hi === item.lo) {
      return { tone: '', badge: 'Ổn định — chưa đổi giá', advice: 'Chưa ghi nhận biến động giá trong lịch sử.', signal: 'neutral' };
    }
    if (item.v <= item.lo) {
      return { tone: 'down', badge: 'Đáy lịch sử — Nên mua ngay', advice: 'Giá hiện tại đang bằng mức thấp nhất từng ghi nhận.', signal: 'buy' };
    }
    if (item.v >= item.hi) {
      return { tone: 'up', badge: 'Đỉnh lịch sử — Cân nhắc chờ', advice: 'Giá đang ở mức cao nhất từng ghi nhận.', signal: 'wait' };
    }
    const diffMean = (item.v - item.mean) / item.mean;
    if (item.v < item.mean) {
      return {
        tone: 'down',
        badge: `Giá tốt · thấp hơn TB ${pct(diffMean)}`,
        advice: item.chg < 0 ? 'Giá đang trên đà giảm và thấp hơn mức trung bình.' : 'Giá thấp hơn trung bình lịch sử.',
        signal: 'buy',
      };
    }
    return {
      tone: 'up',
      badge: `Cao hơn TB ${pct(diffMean)} — Nên theo dõi`,
      advice: 'Có thể đặt ngưỡng giá mục tiêu để nhận báo khi giảm thêm.',
      signal: 'wait',
    };
  }

  function parseStorageGB(text) {
    const m = String(text ?? '').match(/(\d+(?:[.,]\d+)?)\s*(TB|GB)/i);
    if (!m) return null;
    const n = parseFloat(m[1].replace(',', '.'));
    return m[2].toUpperCase() === 'TB' ? n * 1024 : n;
  }

  function findVariants(item, allItems, cols, role) {
    if (!item || !allItems.length) return null;
    const textCols = cols.filter(c => c.type === 'text');
    if (textCols.length < 2) return null;

    // Ưu tiên cột có tên chứa dung lượng/storage/ram/màu hoặc có nhiều giá trị GB/TB
    const storageCol = textCols.find(c => /dung lượng|storage|capacity|bộ nhớ|ram/i.test(c.name))
      || textCols.find(c => c.values.some(v => parseStorageGB(v) != null));
    if (!storageCol) return null;

    const otherCols = textCols.filter(c => c !== storageCol);
    const siblings = allItems.filter(x => otherCols.every(c => (x.r[c.j] || '').trim() === (item.r[c.j] || '').trim()));
    if (siblings.length < 2) return null;

    const rows = siblings.map(x => {
      const specVal = (x.r[storageCol.j] || '').trim();
      const gb = parseStorageGB(specVal);
      return {
        key: x.key,
        spec: specVal || '—',
        gb,
        v: x.v,
        delta: x.v - item.v,
        perGb: gb ? Math.round(x.v / gb) : null,
        isCurrent: x.key === item.key,
      };
    }).sort((a, b) => (a.gb != null && b.gb != null ? a.gb - b.gb : a.v - b.v));

    return { colName: storageCol.name, rows };
  }

  function calcInstallment(price, downPct, months, monthlyRatePct) {
    const p = Math.max(0, Number(price) || 0);
    const dPct = Math.min(90, Math.max(0, Number(downPct) || 0));
    const m = Math.max(1, Math.round(Number(months) || 1));
    const r = Math.max(0, Number(monthlyRatePct) || 0) / 100;

    const downAmount = Math.round(p * dPct / 100);
    const loanAmount = p - downAmount;
    const totalInterest = Math.round(loanAmount * r * m);
    const totalPayable = downAmount + loanAmount + totalInterest;
    const monthlyPayment = Math.round((loanAmount + totalInterest) / m);

    return { downAmount, loanAmount, monthlyPayment, totalInterest, totalPayable };
  }

  function calcTradeIn(newPrice, oldMarketPrice, retentionPct, bonusAmount) {
    const np = Math.max(0, Number(newPrice) || 0);
    const op = Math.max(0, Number(oldMarketPrice) || 0);
    const ret = Math.min(100, Math.max(0, Number(retentionPct) ?? 80)) / 100;
    const bonus = Math.max(0, Number(bonusAmount) || 0);

    const tradeInValue = Math.round(op * ret) + bonus;
    const netPay = np - tradeInValue;
    return { tradeInValue, netPay };
  }

  function filterRows(rows, cols, role, state) {
    const words = norm(state.q || '').split(/\s+/).filter(Boolean);
    const facets = state.facets || {};
    const facetEntries = Object.entries(facets).filter(([, val]) => val !== '' && val != null);

    return rows.filter(r => {
      if (state.group && role.group != null && (r[role.group] || '').trim() !== state.group) return false;
      for (const [jStr, val] of facetEntries) {
        if ((r[+jStr] || '').trim() !== val) return false;
      }
      if (words.length) {
        const hay = norm(r.join(' '));
        if (!words.every(w => hay.includes(w))) return false;
      }
      return true;
    });
  }

  function filterItems(items, rowSet, state) {
    const today = toDayStart(state.today);
    const cutoff = +today - NEW_DAYS * DAY;
    const minP = state.minPrice != null && state.minPrice !== '' ? Number(state.minPrice) : null;
    const maxP = state.maxPrice != null && state.maxPrice !== '' ? Number(state.maxPrice) : null;
    const targets = state.targets || {};
    const quick = state.quick || 'all';

    return items.filter(i => {
      if (rowSet && !rowSet.has(i.r)) return false;
      if (minP != null && Number.isFinite(minP) && i.v < minP) return false;
      if (maxP != null && Number.isFinite(maxP) && i.v > maxP) return false;

      if (quick === 'watch' && !(state.watch && state.watch.has(i.key))) return false;
      if (quick === 'drop' && !(i.chg < 0)) return false;
      if (quick === 'target') {
        const tgt = targets[i.key];
        if (!(tgt != null && i.v <= tgt)) return false;
      }
      if (quick === 'lowest' && !(i.changes > 0 && i.v <= i.lo)) return false;
      if (quick === 'recent' && !(i.changes > 0 && i.lastT && +i.lastT >= cutoff)) return false;
      return true;
    });
  }

  function buildComparison(keys, items, cols) {
    const selected = keys.map(k => items.find(x => x.key === k)).filter(Boolean);
    if (!selected.length) return null;
    const cheapest = selected.reduce((a, b) => b.v < a.v ? b : a);
    const specCols = cols.filter(c => c.type === 'text');
    return {
      items: selected.map(i => ({
        item: i,
        diffMin: i.v - cheapest.v,
        pctMin: cheapest.v ? (i.v - cheapest.v) / cheapest.v : 0,
        verdict: computeVerdict(i),
        isCheapest: i.v === cheapest.v,
      })),
      cheapest,
      specCols,
    };
  }

  function toCSV(headers, rows) {
    const q = v => {
      const s = String(v ?? '');
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [headers.map(q).join(','), ...rows.map(r => r.map(q).join(','))].join('\n');
  }

  function toMarkdownQuote(items, opts) {
    const title = opts?.title || 'Báo giá theo dõi';
    const timeStr = opts?.timeStr || '';
    const lines = [`**${title}**${timeStr ? ` (${timeStr})` : ''}`];
    for (const i of items) {
      const chgTxt = i.chg ? ` (${i.chg < 0 ? '↓' : '↑'} ${fmtC(Math.abs(i.chg))}, ${pct(i.pc)})` : '';
      lines.push(`- ${i.label}${i.group ? ` [${i.group}]` : ''}: **${fmt(i.v)}đ**${chgTxt}`);
    }
    return lines.join('\n');
  }

  function niceStep(range, n) {
    const raw = range / n;
    const p = 10 ** Math.floor(Math.log10(raw || 1));
    return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw);
  }

  return {
    DAY,
    NEW_DAYS,
    LOG_TAB,
    RANGES,
    PRICE_PRESETS,
    esc,
    norm,
    fmt,
    fmtC,
    fmtD,
    fmtDs,
    fmtTime,
    pct,
    avg,
    ago,
    toDayStart,
    isoDateStr,
    hostOf,
    num,
    date,
    parseCSV,
    sheetRef,
    parseLog,
    analyzeColumns,
    textKey,
    rowLabel,
    at,
    buildItems,
    periodStart,
    withPeriod,
    series,
    computeVerdict,
    parseStorageGB,
    findVariants,
    calcInstallment,
    calcTradeIn,
    filterRows,
    filterItems,
    buildComparison,
    toCSV,
    toMarkdownQuote,
    niceStep,
  };
}));
