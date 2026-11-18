(function () {
  'use strict';

  const C = window.DoGiaCore;
  const DEFAULT_LINK = 'https://docs.google.com/spreadsheets/d/1pXlE41ArlhpHfkVwq83HpsHe2Y5-L6EhdHxBrqOkNdY/edit?gid=0';
  const TOP = 15;
  const CMP_COLORS = ['#0066dc', '#047857', '#d97706', '#9333ea'];
  const THEMES = [['', '◐', 'tự động theo máy'], ['light', '☀', 'ban ngày'], ['dark', '☾', 'ban đêm']];
  const root = document.documentElement;
  const $ = id => document.getElementById(id);

  const S = {
    link: '',
    id: '',
    gid: '0',
    headers: [],
    rows: [],
    cols: [],
    role: {},
    facets: [],
    log: null,
    q: '',
    group: '',
    facetValues: {},
    pricePreset: '',
    minPrice: '',
    maxPrice: '',
    quick: 'all',
    sortK: 'chg',
    sortDir: 1,
    rawJ: null,
    rawDir: 1,
    range: 30,
    watch: new Set(),
    targets: {},
    compare: [],
    jsonHistory: {},
    localHistory: {},
    items: [],
    open: null,
    dlgTab: 'inst',
    instDown: 20,
    instMonths: 6,
    instRate: 0,
    tradeInKey: '',
    tradeInRet: 80,
    tradeInBonus: 0,
    savedSheets: [],
    notifyEnabled: false,
    lastTime: null,
    notified: new Set(),
  };

  /* ---------- giao diện kính mờ, theme & lưu trữ cục bộ ---------- */
  let wantTheme = root.dataset.theme || '';
  function setTheme(k) {
    const [, icon, name] = THEMES.find(x => x[0] === k) || THEMES[0];
    if (k) root.dataset.theme = k;
    else delete root.dataset.theme;
    const btn = $('themeBtn');
    if (btn) {
      btn.textContent = icon;
      btn.title = 'Giao diện: ' + name;
    }
    try { localStorage.setItem('theme', k); } catch { }
  }

  function loadPrefs() {
    setTheme(wantTheme);
    const tintEl = $('tint');
    if (tintEl) {
      tintEl.value = getComputedStyle(root).getPropertyValue('--tint').trim() || 0.35;
    }
    try { S.savedSheets = JSON.parse(localStorage.getItem('dogia:sheets') || '[]'); } catch { S.savedSheets = []; }
    try { S.notifyEnabled = localStorage.getItem('dogia:notify') === '1'; } catch { }
  }

  const lensAt = {};
  function seg(el) {
    const b = el?.querySelector('[aria-pressed="true"]');
    if (!b) return;
    const oldLens = el.querySelector('.lens');
    if (oldLens) oldLens.remove();
    el.insertAdjacentHTML('afterbegin', '<i class="lens" aria-hidden="true"></i>');
    const l = el.firstChild;
    const to = { x: b.offsetLeft, w: b.offsetWidth };
    const from = lensAt[el.id] || to;
    l.style.transition = 'none';
    l.style.translate = from.x + 'px';
    l.style.width = from.w + 'px';
    l.offsetWidth;
    l.style.transition = '';
    l.style.translate = to.x + 'px';
    l.style.width = to.w + 'px';
    if (from.x !== to.x) l.classList.add('jelly');
    lensAt[el.id] = to;
  }

  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function parseShortPrice(str) {
    const s = String(str ?? '').trim().toLowerCase().replace(/\s+/g, '');
    if (!s) return null;
    const mTr = s.match(/^(\d+(?:[.,]\d+)?)(?:tr|m)$/);
    if (mTr) return Math.round(parseFloat(mTr[1].replace(',', '.')) * 1e6);
    const mK = s.match(/^(\d+(?:[.,]\d+)?)k$/);
    if (mK) return Math.round(parseFloat(mK[1].replace(',', '.')) * 1e3);
    return C.num(s);
  }

  function saveWatchTargets() {
    try { localStorage.setItem(`watch:${S.id}:${S.gid}`, JSON.stringify([...S.watch])); } catch { }
    try { localStorage.setItem(`targets:${S.id}:${S.gid}`, JSON.stringify(S.targets)); } catch { }
  }

  function recordLocalHistory(items, today) {
    const dayStr = C.isoDateStr(today);
    let hist = {};
    try { hist = JSON.parse(localStorage.getItem(`hist:${S.id}:${S.gid}`) || '{}'); } catch { hist = {}; }
    for (const item of items) {
      const arr = Array.isArray(hist[item.key]) ? hist[item.key] : [];
      if (!arr.length || arr[arr.length - 1][1] !== item.v) {
        if (arr.length && arr[arr.length - 1][0] === dayStr) arr[arr.length - 1][1] = item.v;
        else arr.push([dayStr, item.v]);
      }
      hist[item.key] = arr.slice(-90);
    }
    try { localStorage.setItem(`hist:${S.id}:${S.gid}`, JSON.stringify(hist)); } catch { }
    return hist;
  }

  const chgBadge = (c, base) => !c ? '<span class="chg flat">—</span>'
    : `<span class="chg ${c < 0 ? 'down' : 'up'}">${c < 0 ? '↓' : '↑'} ${C.fmtC(Math.abs(c))} · ${C.pct(c / base)}</span>`;

  /* ---------- biểu đồ SVG ---------- */
  function positionTip(el, tip, clientX, clientY) {
    const host = el.closest('dialog') || document.body;
    if (tip.parentNode !== host) host.append(tip);
    tip.style.display = 'block';
    const o = host === document.body ? { left: 0, top: 0 } : host.getBoundingClientRect();
    const scrollX = host === document.body ? 0 : host.scrollLeft;
    const scrollY = host === document.body ? 0 : host.scrollTop;
    const left = Math.max(8, Math.min(clientX + 12, window.innerWidth - tip.offsetWidth - 8)) - o.left + scrollX;
    const top = Math.max(8, clientY - tip.offsetHeight - 10) - o.top + scrollY;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function drawLine(el, s, t0, opts = {}) {
    const today = C.toDayStart();
    const W = el.clientWidth || 600;
    const H = +el.dataset.h || 200;
    const P = { l: 58, r: 14, t: 14, b: 26 };
    const T0 = +t0;
    const T1 = Math.max(+today, T0 + C.DAY);
    const span = T1 - T0;

    const ps = s.map(x => x.p);
    if (opts.targetPrice != null) ps.push(opts.targetPrice);
    let lo = Math.min(...ps);
    let hi = Math.max(...ps);
    if (lo === hi) {
      lo -= Math.abs(lo) * 0.05 || 1;
      hi += Math.abs(hi) * 0.05 || 1;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;

    const X = t => P.l + (t - T0) / span * (W - P.l - P.r);
    const Y = p => P.t + (hi - p) / (hi - lo) * (H - P.t - P.b);

    let d = `M${X(+s[0].t)},${Y(s[0].p)}`;
    for (let i = 1; i < s.length; i++) d += `H${X(+s[i].t)}V${Y(s[i].p)}`;
    d += `H${X(T1)}`;

    const yt = [lo + pad, (lo + hi) / 2, hi - pad];
    const xt = [T0, (T0 + T1) / 2, T1];
    const estEnd = opts.estUntil ? X(+opts.estUntil) : null;
    const targetLine = opts.targetPrice != null
      ? `<line class="target-ln" x1="${P.l}" x2="${W - P.r}" y1="${Y(opts.targetPrice)}" y2="${Y(opts.targetPrice)}"/>
         <text x="${W - P.r}" y="${Math.max(P.t + 10, Y(opts.targetPrice) - 4)}" text-anchor="end" style="fill:var(--down);font-weight:600">Mục tiêu ${C.fmtC(opts.targetPrice)}</text>`
      : '';

    el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="${C.esc(opts.label || 'Biểu đồ giá')}">
      <defs><linearGradient id="g-${el.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.26"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs>
      <path d="${d}V${H - P.b}H${X(+s[0].t)}Z" fill="url(#g-${el.id})"/>
      ${yt.map(v => `<line class="grid-l" x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end">${C.fmtC(v)}</text>`).join('')}
      ${xt.map((t, i) => `<text x="${X(t)}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][i]}">${C.fmtDs(new Date(t))}</text>`).join('')}
      ${targetLine}
      ${estEnd ? `<clipPath id="c-${el.id}"><rect x="0" y="0" width="${estEnd}" height="${H}"/></clipPath>
        <clipPath id="d-${el.id}"><rect x="${estEnd}" y="0" width="${W}" height="${H}"/></clipPath>
        <path class="ln est" d="${d}" clip-path="url(#c-${el.id})"/><path class="ln" d="${d}" clip-path="url(#d-${el.id})"/>`
        : `<path class="ln" d="${d}"/>`}
      ${s.slice(1).map(x => `<circle class="dot" r="4" cx="${X(+x.t)}" cy="${Y(x.p)}"/>`).join('')}
      <circle class="dot" r="4" cx="${X(T1)}" cy="${Y(s[s.length - 1].p)}"/>
      <line class="cross" y1="${P.t}" y2="${H - P.b}" x1="-9" x2="-9"/></svg>`;

    const cross = el.querySelector('.cross');
    const tip = $('tip');
    el.onpointermove = e => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = T0 + (x - P.l) / (W - P.l - P.r) * span;
      if (t < T0 || t > T1 + C.DAY / 2) { el.onpointerleave(); return; }
      let p = s[0].p;
      for (const q of s) if (+q.t <= t) p = q.p;
      cross.setAttribute('x1', x);
      cross.setAttribute('x2', x);
      tip.textContent = `${C.fmtD(new Date(Math.min(t, T1)))}: ${C.fmt(Math.round(p))}`;
      positionTip(el, tip, e.clientX, e.clientY);
    };
    el.onpointerleave = () => {
      tip.style.display = 'none';
      cross.setAttribute('x1', -9);
      cross.setAttribute('x2', -9);
    };
  }

  function drawCompareChart(el, cmpItems, t0) {
    const today = C.toDayStart();
    const W = el.clientWidth || 640;
    const H = +el.dataset.h || 220;
    const P = { l: 58, r: 14, t: 14, b: 26 };
    const T0 = +t0;
    const T1 = Math.max(+today, T0 + C.DAY);
    const span = T1 - T0;

    const allSeries = cmpItems.map((entry, idx) => ({
      item: entry.item,
      color: CMP_COLORS[idx % CMP_COLORS.length],
      pts: C.series(entry.item.pts, t0),
    }));

    const ps = allSeries.flatMap(s => s.pts.map(x => x.p));
    let lo = Math.min(...ps);
    let hi = Math.max(...ps);
    if (lo === hi) {
      lo -= Math.abs(lo) * 0.05 || 1;
      hi += Math.abs(hi) * 0.05 || 1;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;

    const X = t => P.l + (t - T0) / span * (W - P.l - P.r);
    const Y = p => P.t + (hi - p) / (hi - lo) * (H - P.t - P.b);

    const yt = [lo + pad, (lo + hi) / 2, hi - pad];
    const xt = [T0, (T0 + T1) / 2, T1];

    const paths = allSeries.map(s => {
      let d = `M${X(+s.pts[0].t)},${Y(s.pts[0].p)}`;
      for (let i = 1; i < s.pts.length; i++) d += `H${X(+s.pts[i].t)}V${Y(s.pts[i].p)}`;
      d += `H${X(T1)}`;
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round"/>
        <circle r="3.5" cx="${X(T1)}" cy="${Y(s.pts[s.pts.length - 1].p)}" fill="${s.color}"/>`;
    }).join('');

    el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="Biểu đồ so sánh giá">
      ${yt.map(v => `<line class="grid-l" x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end">${C.fmtC(v)}</text>`).join('')}
      ${xt.map((t, i) => `<text x="${X(t)}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][i]}">${C.fmtDs(new Date(t))}</text>`).join('')}
      ${paths}
      <line class="cross" y1="${P.t}" y2="${H - P.b}" x1="-9" x2="-9"/></svg>`;

    const cross = el.querySelector('.cross');
    const tip = $('tip');
    el.onpointermove = e => {
      const x = e.clientX - el.getBoundingClientRect().left;
      const t = T0 + (x - P.l) / (W - P.l - P.r) * span;
      if (t < T0 || t > T1 + C.DAY / 2) { el.onpointerleave(); return; }
      cross.setAttribute('x1', x);
      cross.setAttribute('x2', x);
      const lines = [C.fmtD(new Date(Math.min(t, T1)))];
      for (const s of allSeries) {
        let p = s.pts[0].p;
        for (const q of s.pts) if (+q.t <= t) p = q.p;
        lines.push(`${s.item.label}: ${C.fmt(Math.round(p))}`);
      }
      tip.textContent = lines.join('\n');
      positionTip(el, tip, e.clientX, e.clientY);
    };
    el.onpointerleave = () => {
      tip.style.display = 'none';
      cross.setAttribute('x1', -9);
      cross.setAttribute('x2', -9);
    };
  }

  function spark(i, t0) {
    const today = C.toDayStart();
    const s = C.series(i.pts, t0);
    const W = 90, H = 26;
    const lo = Math.min(...s.map(x => x.p));
    const hi = Math.max(...s.map(x => x.p));
    const span = +today - t0 || C.DAY;
    const X = t => 2 + (t - t0) / span * (W - 4);
    const Y = p => hi === lo ? H / 2 : 3 + (hi - p) / (hi - lo) * (H - 6);
    let d = `M2,${Y(s[0].p)}`;
    for (const x of s.slice(1)) d += `H${X(+x.t)}V${Y(x.p)}`;
    d += `H${W - 2}`;
    return `<svg class="spark ${i.chg < 0 ? 'down' : i.chg > 0 ? 'up' : 'flat'}" width="${W}" height="${H}" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  }

  const rng = (i, big) => i.hi === i.lo ? '<span class="sub">chưa đổi giá</span>'
    : `<span class="rng${big ? ' big' : ''}" title="Thấp nhất ${C.fmt(i.lo)} · Cao nhất ${C.fmt(i.hi)}"><i style="left:${(i.v - i.lo) / (i.hi - i.lo) * 100}%"></i></span>`;

  const bars = (title, data, note = '', sub = '') => `<h3>${C.esc(title)}${sub ? `<small>${C.esc(sub)}</small>` : ''}</h3>${
    data.map(d => `<div class="bar${d.me ? ' me' : ''}" title="${C.esc(d.tip || d.label + ': ' + d.text)}"><span class="bl">${C.esc(d.label)}</span>
      <span class="bt"><i style="width:${d.pct}%"></i></span><span class="bv">${d.html || C.esc(d.text)}</span></div>`).join('')
  }${note ? `<div class="more">${C.esc(note)}</div>` : ''}`;

  const scale = (data, key) => {
    const m = Math.max(...data.map(d => Math.abs(d[key]))) || 1;
    data.forEach(d => { d.pct = Math.abs(d[key]) / m * 100; });
    return data;
  };

  /* ---------- giao diện chính ---------- */
  const colName = j => S.cols.find(c => c.j === j)?.name || '';
  const periodName = () => S.range ? `${S.range} ngày qua` : 'toàn bộ lịch sử';

  function renderSavedSheets() {
    const el = $('savedSheets');
    if (!el) return;
    const curRef = C.sheetRef(S.link);
    const pills = S.savedSheets.map((p, idx) => {
      const active = curRef && curRef.id === p.id && curRef.gid === p.gid;
      return `<span class="preset-pill${active ? ' active' : ''}">
        <button type="button" data-load-preset="${idx}">${C.esc(p.name)}</button>
        <button type="button" data-del-preset="${idx}" aria-label="Xóa ${C.esc(p.name)}">✕</button>
      </span>`;
    }).join('');
    el.innerHTML = `<button type="button" class="btn sm" id="savePresetBtn">＋ Lưu sheet hiện tại</button>${pills}`;
  }

  function renderFacetFilters() {
    const el = $('facetFilters');
    if (!el) return;
    const selects = S.facets.map(c => {
      const cur = S.facetValues[c.j] || '';
      const opts = c.values.slice().sort((a, b) => {
        const ga = C.parseStorageGB(a), gb = C.parseStorageGB(b);
        return ga != null && gb != null ? ga - gb : a.localeCompare(b, 'vi');
      });
      return `<select class="facet-sel" data-facet="${c.j}" aria-label="Lọc theo ${C.esc(c.name)}">
        <option value="">${C.esc(c.name)}: Tất cả</option>
        ${opts.map(v => `<option value="${C.esc(v)}"${cur === v ? ' selected' : ''}>${C.esc(v)}</option>`).join('')}
      </select>`;
    }).join('');

    const priceOpts = C.PRICE_PRESETS.map(p =>
      `<option value="${p.id}"${S.pricePreset === p.id ? ' selected' : ''}>${p.label}</option>`).join('');

    el.innerHTML = `${selects}
      <select class="facet-sel" id="pricePreset" aria-label="Khoảng giá">${priceOpts}</select>
      <span class="price-inputs">
        <input id="minPriceInput" type="text" inputmode="decimal" placeholder="Từ (5tr)" aria-label="Giá tối thiểu" value="${C.esc(S.minPrice)}">
        <span class="sub">–</span>
        <input id="maxPriceInput" type="text" inputmode="decimal" placeholder="Đến (20tr)" aria-label="Giá tối đa" value="${C.esc(S.maxPrice)}">
      </span>`;
  }

  function activePriceBounds() {
    const preset = C.PRICE_PRESETS.find(p => p.id === S.pricePreset);
    const customMin = parseShortPrice(S.minPrice);
    const customMax = parseShortPrice(S.maxPrice);
    return {
      minPrice: customMin != null ? customMin : (preset ? preset.min : null),
      maxPrice: customMax != null ? customMax : (preset ? preset.max : null),
    };
  }

  function hasActiveFilters() {
    return Boolean(S.q || S.group || S.quick !== 'all' || S.pricePreset || S.minPrice || S.maxPrice
      || Object.values(S.facetValues).some(Boolean));
  }

  function render() {
    const today = C.toDayStart();
    const R = S.role;
    const rows = C.filterRows(S.rows, S.cols, R, { q: S.q, group: S.group, facets: S.facetValues });
    const rowSet = new Set(rows);
    const t0 = C.periodStart(S.items, S.range, today);

    const baseItems = C.withPeriod(S.items.filter(i => rowSet.has(i.r)), t0, S.range);
    const bounds = activePriceBounds();
    const items = C.filterItems(baseItems, rowSet, {
      today,
      quick: S.quick,
      watch: S.watch,
      targets: S.targets,
      minPrice: bounds.minPrice,
      maxPrice: bounds.maxPrice,
    });

    $('clearQ').hidden = !S.q;
    $('range').innerHTML = C.RANGES.map(([d, t]) =>
      `<button type="button" data-r="${d}" aria-pressed="${d === S.range}">${t}</button>`).join('');

    const groups = R.group == null ? [] : [...new Set(S.rows.map(r => (r[R.group] || '').trim()).filter(Boolean))];
    const cutoff = +today - C.NEW_DAYS * C.DAY;
    const hitCount = S.items.filter(i => S.targets[i.key] != null && i.v <= S.targets[i.key]).length;
    const dropCount = baseItems.filter(i => i.chg < 0).length;
    const lowCount = baseItems.filter(i => i.changes > 0 && i.v <= i.lo).length;
    const recentCount = baseItems.filter(i => i.changes > 0 && i.lastT && +i.lastT >= cutoff).length;

    const groupChips = [['', 'Tất cả nhóm'], ...groups.map(g => [g, g])].map(([g, t]) =>
      `<button class="chip" type="button" data-g="${C.esc(g)}" aria-pressed="${S.quick === 'all' && g === S.group}">${C.esc(t)}</button>`).join('');

    const quickChips = R.value != null ? [
      ['watch', `★ Theo dõi (${S.watch.size})`],
      ['drop', `↓ Đang giảm (${dropCount})`],
      ['target', `🎯 Đạt mục tiêu (${hitCount})`],
      ['lowest', `🏷️ Đáy lịch sử (${lowCount})`],
      ['recent', `⚡ Mới đổi giá (${recentCount})`],
    ].map(([k, lbl]) =>
      `<button class="chip quick" type="button" data-quick="${k}" aria-pressed="${S.quick === k}">${lbl}</button>`).join('') : '';

    $('chips').innerHTML = groupChips;
    $('quickChips').innerHTML = quickChips;
    $('quickChips').hidden = !quickChips;

    const banner = $('targetBanner');
    if (hitCount > 0) {
      banner.hidden = false;
      $('targetBannerText').textContent = `🎯 Có ${hitCount} sản phẩm đã giảm chạm ngưỡng giá mục tiêu của bạn!`;
    } else {
      banner.hidden = true;
    }

    const totalCount = S.items.length || S.rows.length;
    $('filterMeta').innerHTML = `<span>Hiển thị <b>${S.items.length ? items.length : rows.length}</b> / ${totalCount} mẫu</span>`
      + (hasActiveFilters() ? `<button type="button" class="linkbtn" id="resetFilters">Xóa tất cả bộ lọc</button>` : '');

    $('track-area').hidden = $('range').hidden = !S.items.length;
    $('countCharts').innerHTML = S.items.length ? '' : countCharts(rows);
    $('raw').open = !S.items.length;

    renderKpis(rows, items, today);
    if (S.items.length) renderTracking(items, t0, today);
    renderRaw(rows);
    seg($('range'));
    renderCompareDock();
    if (S.open) openDetail(S.open, true);
    if (S.cmpOpen) openCompareModal(true);
  }

  function renderKpis(rows, items, today) {
    const k = [];
    if (items.length) {
      const now = C.avg(items.map(i => i.v));
      const base = C.avg(items.map(i => i.base));
      const dn = items.filter(i => i.chg < 0);
      const up = items.filter(i => i.chg > 0);
      const lo = items.reduce((a, b) => b.v < a.v ? b : a);
      const hi = items.reduce((a, b) => b.v > a.v ? b : a);
      k.push(
        [`Giá trung bình (${items.length} mẫu)`, C.fmt(Math.round(now)),
          now !== base ? `${now < base ? '↓' : '↑'} ${C.pct((now - base) / base).replace(/^[+−]/, '')} so với đầu kỳ` : 'không đổi trong kỳ'],
        ['Giảm giá trong kỳ', `↓ ${dn.length} mẫu`, dn.length ? `trung bình ${C.pct(C.avg(dn.map(i => i.pc)))}` : periodName()],
        ['Tăng giá trong kỳ', `↑ ${up.length} mẫu`, up.length ? `trung bình ${C.pct(C.avg(up.map(i => i.pc)))}` : periodName()],
        ['Giữ nguyên giá', `${items.length - dn.length - up.length} mẫu`, periodName()],
        ['Rẻ nhất', C.fmt(lo.v), lo.label],
        ['Đắt nhất', C.fmt(hi.v), hi.label],
      );
      if (S.quick === 'watch') {
        const sumV = items.reduce((s, i) => s + i.v, 0);
        const sumSave = items.reduce((s, i) => s + (i.chg < 0 ? -i.chg : 0), 0);
        k.push(['Tổng giá danh sách theo dõi', C.fmt(sumV), sumSave ? `Tiết kiệm ${C.fmtC(sumSave)} trong kỳ` : `${items.length} mẫu`]);
      } else {
        const lastT = items.map(i => i.lastT).filter(Boolean).sort((a, b) => b - a)[0];
        if (lastT) {
          const cnt = items.filter(i => i.lastT && +i.lastT === +lastT).length;
          k.push(['Đổi giá gần nhất', C.fmtD(lastT), `${cnt} mẫu · ${C.ago(lastT, today)}`]);
        }
      }
    } else {
      k.push(['Số dòng khớp lọc', C.fmt(rows.length), S.group || 'không có cột giá hợp lệ']);
    }
    $('kpis').innerHTML = k.map(([t, b, s], n) =>
      `<div class="kpi" style="--i:${n}"><span>${C.esc(t)}</span><b>${C.esc(b)}</b><span>${C.esc(s)}</span></div>`).join('');
  }

  function renderTracking(items, t0, today) {
    const R = S.role;
    const vName = colName(R.value);

    // Biến động gần đây từ tab "Biến động" (Claude Apps Script / Gemini scan)
    $('feedCard').hidden = !S.log;
    if (S.log) {
      const feed = items.flatMap(i => (i.ev || []).map((e, k) => ({
        ...e,
        i,
        prev: k ? i.ev[k - 1].p : e.cu,
      }))).sort((a, b) => b.t - a.t);
      const nToday = feed.filter(e => +e.t === +today).length;
      $('feedNote').textContent = `${feed.length} lần đổi giá đã ghi${nToday ? ` · ${nToday} hôm nay` : ''} · tab “${C.LOG_TAB}”`;
      $('feed').innerHTML = feed.slice(0, 8).map(e => {
        const h = C.hostOf(e.src);
        const src = h ? `<a href="${C.esc(e.src)}" target="_blank" rel="noopener">${C.esc(h)}</a>` : C.esc(e.src);
        return `<div class="mv" data-k="${C.esc(e.i.key)}" tabindex="0" role="button">
          <span class="ml">${C.esc(e.i.label)}<div class="pgrp">${C.fmtD(e.t)} · ${C.ago(e.t, today)}${src ? ' · ' + src : ''}</div></span>
          <span class="n">${e.prev != null ? `<s>${C.fmtC(e.prev)}</s> ` : ''}<b>${C.fmt(e.p)}</b></span>
          ${e.prev != null ? chgBadge(e.p - e.prev, e.prev) : '<span></span>'}
        </div>`;
      }).join('') || '<div class="sub">Chưa có lần đổi giá nào khớp bộ lọc</div>';
    }

    const ds = [...new Set(items.flatMap(i => i.pts.map(x => x.t)).filter(t => t && t > t0).map(Number))].sort((a, b) => a - b);
    const idx = [+t0, ...ds].map(t => ({ t: new Date(t), p: C.avg(items.map(i => C.at(i.pts, new Date(t)))) }));
    $('idxTitle').textContent = `${vName} trung bình — ${periodName()}`;
    $('idxNote').textContent = items.length ? `${items.length} mẫu · rê chuột để xem từng ngày` : '';
    if (items.length) {
      drawLine($('idxChart'), idx, t0, {
        label: 'Chỉ số giá trung bình',
        estUntil: items.some(i => i.est) && ds.length ? new Date(ds[0]) : null,
      });
    } else {
      $('idxChart').innerHTML = '<div class="sub">Không có mẫu phù hợp bộ lọc hiện tại.</div>';
    }

    const mover = i => `<div class="mv" data-k="${C.esc(i.key)}" tabindex="0" role="button"><span class="ml">${C.esc(i.label)}<div class="pgrp">${C.esc(i.group)}</div></span><span class="n">${C.fmt(i.v)}</span>${chgBadge(i.chg, i.base)}</div>`;
    const dn = items.filter(i => i.chg < 0).sort((a, b) => a.pc - b.pc);
    const up = items.filter(i => i.chg > 0).sort((a, b) => b.pc - a.pc);
    $('periodA').textContent = $('periodB').textContent = periodName();
    $('moversDown').innerHTML = dn.slice(0, 6).map(mover).join('') || '<div class="sub">Không có mẫu nào giảm giá trong kỳ</div>';
    $('moversUp').innerHTML = up.slice(0, 6).map(mover).join('') || '<div class="sub">Không có mẫu nào tăng giá trong kỳ</div>';

    if (R.group != null && !S.group) {
      const g = new Map();
      items.forEach(i => (g.get(i.group) || g.set(i.group, []).get(i.group)).push(i));
      $('grpCard').hidden = false;
      $('grpCard').innerHTML = bars(`Giá trung bình theo ${colName(R.group)}`, scale([...g].map(([label, a]) => {
        const now = C.avg(a.map(i => i.v));
        const base = C.avg(a.map(i => i.base));
        return {
          label: label || '(trống)',
          now,
          html: `${C.fmtC(now)} ${chgBadge(Math.round(now - base), base)}`,
          tip: `${label}: ${a.length} mẫu · từ ${C.fmt(Math.min(...a.map(i => i.v)))} đến ${C.fmt(Math.max(...a.map(i => i.v)))}`,
        };
      }), 'now'), '', periodName());
    } else {
      $('grpCard').hidden = true;
    }

    if (items.length > 1) {
      const vs = items.map(i => i.v);
      const mn = Math.min(...vs), mx = Math.max(...vs);
      const st = C.niceStep(mx - mn, 6) || 1;
      const b0 = Math.floor(mn / st) * st;
      const bk = [];
      for (let a = b0; a <= mx; a += st) bk.push({ a, b: a + st, n: vs.filter(v => v >= a && v < a + st).length });
      $('segCard').hidden = false;
      $('segCard').innerHTML = bars('Phân khúc giá', scale(bk.map(x => ({
        label: `${C.fmtC(x.a)} – ${C.fmtC(x.b)}`,
        n: x.n,
        text: `${x.n} mẫu · ${Math.round(x.n / items.length * 100)}%`,
      })), 'n'), '', 'số mẫu theo khoảng giá');
    } else {
      $('segCard').hidden = true;
    }

    const cols = [
      ['star', '', '', false],
      ['cmp', 'So sánh', 'hide-m', false],
      ['label', 'Sản phẩm', '', true],
      ['v', 'Giá hiện tại', 'n', true],
      ['chg', `Thay đổi (${periodName()})`, 'n hide-m', true],
      ['spark', 'Xu hướng', 'hide-m', false],
      ['pos', 'Thấp – Cao đã ghi nhận', 'hide-m', true],
      ['lastT', 'Đổi giá lần cuối', 'hide-m', true],
    ];
    $('tHead').innerHTML = '<tr>' + cols.map(([k, t, c, sortable]) => {
      const sorted = sortable && S.sortK === k;
      const aria = sorted ? ` aria-sort="${S.sortDir > 0 ? 'ascending' : 'descending'}"` : '';
      return `<th data-k="${k}" data-sortable="${sortable ? '1' : '0'}" class="${c}"${aria}>${t}${sorted ? (S.sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    }).join('') + '</tr>';

    const keyFn = {
      label: i => i.label,
      v: i => i.v,
      chg: i => i.pc,
      lastT: i => +(i.lastT || 0),
      pos: i => i.hi === i.lo ? 0.5 : (i.v - i.lo) / (i.hi - i.lo),
    }[S.sortK];

    const list = keyFn ? [...items].sort((a, b) => {
      const x = keyFn(a), y = keyFn(b);
      return S.sortDir * (typeof x === 'string' ? x.localeCompare(y, 'vi') : x - y);
    }) : items;

    const cutoff = +today - C.NEW_DAYS * C.DAY;
    $('tBody').innerHTML = list.map(i => {
      const tgt = S.targets[i.key];
      const hit = tgt != null && i.v <= tgt;
      const isLow = i.changes > 0 && i.v <= i.lo;
      const isNew = i.lastT && +i.lastT >= cutoff && i.changes > 0;
      const inCmp = S.compare.includes(i.key);
      return `<tr data-k="${C.esc(i.key)}" tabindex="0">
        <td><button type="button" class="star" data-star="${C.esc(i.key)}" aria-pressed="${S.watch.has(i.key)}" aria-label="Theo dõi ${C.esc(i.label)}">${S.watch.has(i.key) ? '★' : '☆'}</button></td>
        <td class="hide-m"><input type="checkbox" class="cmp-chk" data-cmp="${C.esc(i.key)}" ${inCmp ? 'checked' : ''} aria-label="So sánh ${C.esc(i.label)}"></td>
        <td class="pcell">
          <div class="pname">${C.esc(i.label)}
            ${hit ? '<span class="badge hit">🎯 Đạt mục tiêu</span>' : ''}
            ${isLow ? '<span class="badge low">Đáy lịch sử</span>' : ''}
            ${isNew ? '<span class="badge new">Mới đổi giá</span>' : ''}
          </div>
          <div class="pgrp">${C.esc(i.group)}${tgt != null ? ` · Mục tiêu: ${C.fmtC(tgt)}` : ''}</div>
        </td>
        <td class="n"><b>${C.fmt(i.v)}</b><div class="show-m">${chgBadge(i.chg, i.base)}</div></td>
        <td class="n hide-m">${chgBadge(i.chg, i.base)}</td>
        <td class="hide-m">${spark(i, t0)}</td>
        <td class="hide-m">${rng(i)}</td>
        <td class="hide-m">${i.lastT ? C.fmtD(i.lastT) : '—'}<div class="pgrp">${i.lastT ? C.ago(i.lastT, today) : ''}</div></td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" class="sub">Không có sản phẩm nào khớp bộ lọc hiện tại.</td></tr>`;
  }

  function countCharts(rows) {
    return S.cols.filter(c => c.type === 'text' && c.distinct > 1 && c.distinct <= 30 && c.distinct < S.rows.length).slice(0, 4).map(c => {
      const cnt = new Map();
      rows.forEach(r => {
        const v = (r[c.j] || '').trim() || '(trống)';
        cnt.set(v, (cnt.get(v) || 0) + 1);
      });
      const data = [...cnt].sort((a, b) => b[1] - a[1]);
      return `<section class="card">${bars(`Số dòng theo ${c.name}`, scale(data.slice(0, TOP).map(([label, n]) => ({
        label,
        n,
        text: `${n} · ${Math.round(n / (rows.length || 1) * 100)}%`,
      })), 'n'), data.length > TOP ? `Hiển thị ${TOP}/${data.length} giá trị` : '')}</section>`;
    }).join('');
  }

  function renderRaw(rows) {
    const cols = S.cols;
    const sc = cols.find(c => c.j === S.rawJ);
    $('rHead').innerHTML = '<tr>' + cols.map(c =>
      `<th data-j="${c.j}" data-sortable="1" class="${c.type === 'number' ? 'n' : ''}">${C.esc(c.name)}${c.j === S.rawJ ? (S.rawDir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('') + '</tr>';
    const keyFn = !sc ? null : sc.type === 'number' ? r => C.num(r[sc.j]) ?? -Infinity : sc.type === 'date' ? r => +(C.date(r[sc.j]) || 0) : r => r[sc.j] || '';
    const list = keyFn ? [...rows].sort((a, b) => {
      const x = keyFn(a), y = keyFn(b);
      return S.rawDir * (typeof x === 'string' ? x.localeCompare(y, 'vi') : x - y);
    }) : rows;
    $('rBody').innerHTML = list.map(r => '<tr>' + cols.map(c => `<td class="${c.type === 'number' ? 'n' : ''}">${C.esc(r[c.j])}</td>`).join('') + '</tr>').join('')
      || `<tr><td colspan="${cols.length}" class="sub">Không có dòng phù hợp</td></tr>`;
  }

  /* ---------- thanh so sánh nổi & modal so sánh ---------- */
  function renderCompareDock() {
    const dock = $('cmpDock');
    const selected = S.compare.map(k => S.items.find(x => x.key === k)).filter(Boolean);
    if (!selected.length) { dock.hidden = true; return; }
    dock.hidden = false;
    $('cmpChips').innerHTML = selected.map((i, idx) =>
      `<span class="cmp-chip"><i style="width:8px;height:8px;border-radius:50%;background:${CMP_COLORS[idx % CMP_COLORS.length]};display:inline-block"></i>${C.esc(i.label)}
        <button type="button" data-rm-cmp="${C.esc(i.key)}" aria-label="Bỏ ${C.esc(i.label)}">✕</button></span>`).join('');
    $('openCmpBtn').disabled = selected.length < 2;
    $('openCmpBtn').textContent = selected.length < 2 ? 'Chọn thêm 1 mẫu để so sánh' : `So sánh (${selected.length}/4)`;
  }

  function openCompareModal(refresh) {
    const t0 = C.periodStart(S.items, S.range);
    C.withPeriod(S.items, t0, S.range);
    const cmp = C.buildComparison(S.compare, S.items, S.cols);
    if (!cmp || cmp.items.length < 2) {
      S.cmpOpen = false;
      $('cmpDlg').close();
      return;
    }
    S.cmpOpen = true;
    const legend = cmp.items.map((e, idx) =>
      `<span><i style="background:${CMP_COLORS[idx % CMP_COLORS.length]}"></i>${C.esc(e.item.label)}</span>`).join('');

    const metricRow = (label, cells) => `<tr><th>${C.esc(label)}</th>${cells.join('')}</tr>`;
    const headers = `<tr><th>Tiêu chí</th>${cmp.items.map(e => `<th>${C.esc(e.item.label)}</th>`).join('')}</tr>`;
    const bodyRows = [
      metricRow('Giá hiện tại', cmp.items.map(e =>
        `<td class="n${e.isCheapest ? ' cmp-best' : ''}">${C.fmt(e.item.v)}đ${e.isCheapest ? ' · Rẻ nhất' : ''}</td>`)),
      metricRow('Chênh so với rẻ nhất', cmp.items.map(e =>
        `<td class="n">${e.diffMin === 0 ? '<span class="chg down">Gốc rẻ nhất</span>' : `+${C.fmt(e.diffMin)}đ (+${C.pct(e.pctMin).replace('+', '')})`}</td>`)),
      metricRow(`Biến động (${periodName()})`, cmp.items.map(e =>
        `<td class="n">${chgBadge(e.item.chg, e.item.base)}</td>`)),
      metricRow('Tín hiệu mua', cmp.items.map(e =>
        `<td><span class="verdict ${e.verdict.tone}">${C.esc(e.verdict.badge)}</span></td>`)),
      metricRow('Thấp / TB / Cao', cmp.items.map(e =>
        `<td class="n">${C.fmtC(e.item.lo)} / ${C.fmtC(Math.round(e.item.mean))} / ${C.fmtC(e.item.hi)}</td>`)),
      ...cmp.specCols.map(c => metricRow(c.name, cmp.items.map(e => `<td>${C.esc(e.item.r[c.j] || '—')}</td>`))),
    ].join('');

    $('cmpBody').innerHTML = `<div class="dlg-h">
      <div><div class="pgrp">Đối chiếu trực tiếp</div><h2>So sánh ${cmp.items.length} sản phẩm</h2></div>
      <button type="button" class="btn icon" id="cmpClose" aria-label="Đóng">✕</button></div>
      <section class="card"><h3>Biểu đồ lịch sử giá chồng lớp <small>${periodName()}</small></h3>
        <div class="cmp-legend">${legend}</div>
        <div class="chart" id="cmpChart" data-h="220"></div>
      </section>
      <div class="tablewrap" style="margin-top:12px"><table><thead>${headers}</thead><tbody>${bodyRows}</tbody></table></div>`;

    if (!refresh || !$('cmpDlg').open) $('cmpDlg').showModal();
    drawCompareChart($('cmpChart'), cmp.items, t0);
  }

  /* ---------- chi tiết sản phẩm + mục tiêu + biến thể + trả góp / thu cũ ---------- */
  function renderCalcResult(item) {
    const box = $('calcOut');
    if (!box) return;
    if (S.dlgTab === 'inst') {
      const res = C.calcInstallment(item.v, S.instDown, S.instMonths, S.instRate);
      box.innerHTML = `<div class="calc-res">
        <div><span>Trả trước (${S.instDown}%)</span><b>${C.fmt(res.downAmount)}đ</b></div>
        <div><span>Góp mỗi tháng (${S.instMonths}T)</span><b style="color:var(--accent)">${C.fmt(res.monthlyPayment)}đ/th</b></div>
        <div><span>Tổng phải trả</span><b>${C.fmt(res.totalPayable)}đ</b></div>
      </div>`;
    } else {
      const oldItem = S.items.find(x => x.key === S.tradeInKey);
      const oldPrice = oldItem ? oldItem.v : 0;
      const res = C.calcTradeIn(item.v, oldPrice, S.tradeInRet, S.tradeInBonus);
      box.innerHTML = `<div class="calc-res">
        <div><span>Giá máy cũ tham chiếu</span><b>${oldItem ? C.fmt(oldPrice) + 'đ' : 'Chưa chọn'}</b></div>
        <div><span>Ước tính thu lại (${S.tradeInRet}%)</span><b style="color:var(--down)">${C.fmt(res.tradeInValue)}đ</b></div>
        <div><span>Cần bù thêm</span><b style="color:var(--accent)">${res.netPay >= 0 ? C.fmt(res.netPay) + 'đ' : 'Dư ' + C.fmt(-res.netPay) + 'đ'}</b></div>
      </div>`;
    }
  }

  function openDetail(key, refresh) {
    const i = S.items.find(x => x.key === key);
    if (!i) { $('dlg').close(); return; }
    S.open = key;
    const today = C.toDayStart();
    const t0 = C.periodStart(S.items, S.range, today);
    C.withPeriod([i], t0, S.range);
    const sameGrp = S.items.filter(x => x.group === i.group);
    const verdict = C.computeVerdict(i);
    const ev = i.pts.map((x, k) => ({ ...x, prev: k ? i.pts[k - 1].p : null })).reverse();
    const tgt = S.targets[i.key];
    const hit = tgt != null && i.v <= tgt;
    const inCmp = S.compare.includes(i.key);
    const variants = C.findVariants(i, S.items, S.cols, S.role);

    if (!S.tradeInKey || !S.items.some(x => x.key === S.tradeInKey)) {
      const cheaper = S.items.find(x => x.v < i.v);
      S.tradeInKey = cheaper ? cheaper.key : (S.items[0]?.key || '');
    }

    const tradeOptions = S.items.filter(x => x.key !== i.key).slice().sort((a, b) => b.v - a.v)
      .map(x => `<option value="${C.esc(x.key)}"${x.key === S.tradeInKey ? ' selected' : ''}>${C.esc(x.label)} (${C.fmtC(x.v)})</option>`).join('');

    $('dlgBody').innerHTML = `<div class="dlg-h">
      <div><div class="pgrp">${C.esc(i.group)}</div><h2>${C.esc(i.label)}</h2></div>
      <div class="row">
        <button type="button" class="btn sm" id="dlgStar" aria-pressed="${S.watch.has(i.key)}">${S.watch.has(i.key) ? '★ Đang theo dõi' : '☆ Theo dõi'}</button>
        <button type="button" class="btn sm" id="dlgCmp" aria-pressed="${inCmp}">${inCmp ? '✓ Trong so sánh' : '⇄ So sánh'}</button>
        <button type="button" class="btn icon" id="dlgClose" aria-label="Đóng">✕</button>
      </div>
    </div>
    <div class="big">${C.fmt(i.v)}đ</div>
    <div class="row">
      ${chgBadge(i.chg, i.base)}
      <span class="verdict ${verdict.tone}">${C.esc(verdict.badge)}</span>
    </div>
    <div class="sub" style="margin-top:4px">${C.esc(verdict.advice)}</div>

    <div class="target-box">
      <label for="tgtInput" class="sub" style="font-weight:600">🎯 Giá mục tiêu:</label>
      <input id="tgtInput" type="text" inputmode="numeric" placeholder="vd: 19.500.000" value="${tgt != null ? C.fmt(tgt) : ''}">
      <button type="button" class="btn tint sm" id="saveTgtBtn">Lưu mục tiêu</button>
      <button type="button" class="btn sm" data-tgt-pct="0.95">−5%</button>
      <button type="button" class="btn sm" data-tgt-pct="0.90">−10%</button>
      <button type="button" class="btn sm" data-tgt-val="${i.lo}">= Thấp nhất</button>
      ${tgt != null ? '<button type="button" class="linkbtn" id="clearTgtBtn">Xóa</button>' : ''}
      ${tgt != null ? `<span class="badge ${hit ? 'hit' : 'new'}">${hit ? 'Đã đạt ngưỡng mục tiêu!' : `Cần giảm thêm ${C.fmtC(i.v - tgt)}`}</span>` : ''}
    </div>

    <div class="stats">
      <div><span>Thấp nhất</span><b>${C.fmt(i.lo)}</b></div>
      <div><span>Cao nhất</span><b>${C.fmt(i.hi)}</b></div>
      <div><span>Trung bình</span><b>${C.fmt(Math.round(i.mean))}</b></div>
      <div><span>Số lần đổi giá</span><b>${i.changes}</b></div>
      <div><span>Đổi giá lần cuối</span><b>${i.lastT && i.changes ? C.fmtD(i.lastT) : '—'}</b></div>
    </div>
    ${i.hi !== i.lo ? `${rng(i, true)}<div class="rng-l"><span>Thấp nhất ${C.fmtC(i.lo)}</span><span>Cao nhất ${C.fmtC(i.hi)}</span></div>` : ''}

    <section class="card" style="margin-top:12px">
      <h3>Lịch sử giá <span class="seg" id="dlgRange">${C.RANGES.map(([d, t]) =>
        `<button type="button" data-r="${d}" aria-pressed="${d === S.range}">${t}</button>`).join('')}</span></h3>
      <div class="chart" id="dlgChart" data-h="200"></div>
      ${i.est ? '<div class="more">Nét đứt: giá trước lần đổi đầu tiên đã ghi nhận (chưa rõ ngày áp dụng ban đầu).</div>' : ''}
    </section>

    ${variants ? `<section class="card" style="margin-top:10px">
      <h3>So sánh các mức ${C.esc(variants.colName)} cùng dòng <small>bấm để chuyển nhanh</small></h3>
      ${variants.rows.map(v => `<div class="variant-row${v.isCurrent ? ' me' : ''}" data-jump="${C.esc(v.key)}" tabindex="0" role="button">
        <span><b>${C.esc(v.spec)}</b>${v.perGb ? ` <span class="sub">(${C.fmtC(v.perGb)}/GB)</span>` : ''}</span>
        <span class="n"><b>${C.fmt(v.v)}đ</b> ${v.delta === 0 ? '<span class="sub">(đang xem)</span>'
          : `<span class="chg ${v.delta < 0 ? 'down' : 'up'}">${v.delta < 0 ? '−' : '+'}${C.fmtC(Math.abs(v.delta))}</span>`}</span>
      </div>`).join('')}
    </section>` : ''}

    <section class="card" style="margin-top:10px">
      <h3>Công cụ ước tính tài chính
        <span class="seg" id="calcSeg">
          <button type="button" data-dlgtab="inst" aria-pressed="${S.dlgTab === 'inst'}">Trả góp</button>
          <button type="button" data-dlgtab="tradein" aria-pressed="${S.dlgTab === 'tradein'}">Thu cũ đổi mới</button>
        </span>
      </h3>
      ${S.dlgTab === 'inst' ? `<div class="calc-grid">
        <label class="sel">Trả trước (%)<select id="instDown">${[0, 10, 20, 30, 40, 50].map(p =>
          `<option value="${p}"${S.instDown === p ? ' selected' : ''}>${p}%</option>`).join('')}</select></label>
        <label class="sel">Kỳ hạn (tháng)<select id="instMonths">${[3, 6, 9, 12, 18].map(m =>
          `<option value="${m}"${S.instMonths === m ? ' selected' : ''}>${m} tháng</option>`).join('')}</select></label>
        <label class="sel">Lãi suất (%/tháng)<input id="instRate" type="number" min="0" max="10" step="0.1" value="${S.instRate}"></label>
      </div>` : `<div class="calc-grid">
        <label class="sel">Máy cũ đang dùng<select id="tradeInSel">${tradeOptions}</select></label>
        <label class="sel">Tỷ lệ thu lại (%)<input id="tradeInRet" type="number" min="10" max="100" step="5" value="${S.tradeInRet}"></label>
        <label class="sel">Trợ giá thêm (đ)<input id="tradeInBonus" type="number" min="0" step="100000" value="${S.tradeInBonus}"></label>
      </div>`}
      <div id="calcOut"></div>
    </section>

    <section class="card" style="margin-top:10px"><h3>Các lần thay đổi giá</h3>${ev.map(x => `<div class="ev"><span>${x.t ? C.fmtD(x.t) : 'Trước đó'}</span>
      <span class="n" style="text-align:left">${x.prev != null ? `${C.fmt(x.prev)} → ` : ''}<b>${C.fmt(x.p)}</b></span>${x.prev != null ? chgBadge(x.p - x.prev, x.prev) : '<span class="sub">giá ban đầu</span>'}</div>`).join('')}</section>
    ${sameGrp.length > 1 ? `<section class="card" style="margin-top:10px">${bars(`Cùng nhóm: ${i.group}`, scale(sameGrp.slice().sort((a, b) => b.v - a.v)
      .map(x => ({ label: x.label, v: x.v, text: C.fmt(x.v), me: x === i })), 'v'))}</section>` : ''}`;

    if (!refresh || !$('dlg').open) $('dlg').showModal();
    const est = i.est ? (i.pts.find(x => x.t)?.t || today) : null;
    drawLine($('dlgChart'), C.series(i.pts, t0), t0, {
      label: 'Lịch sử giá ' + i.label,
      estUntil: est && est > t0 ? est : null,
      targetPrice: tgt != null ? tgt : null,
    });
    seg($('dlgRange'));
    seg($('calcSeg'));
    renderCalcResult(i);
  }

  /* ---------- tải dữ liệu ---------- */
  async function fetchSheet(ref, live) {
    if (!live) {
      try {
        const res = await fetch(`data/${ref.id}_${ref.gid}.json?_=${Date.now()}`);
        if (res.ok) {
          const j = await res.json();
          return { text: j.csv, log: j.log, time: new Date(j.time), auto: true, jsonHistory: j.history || {} };
        }
      } catch { }
    }
    const get = u => fetch(u + '&_=' + Date.now()).then(async r => {
      const t = await r.text();
      if (!r.ok || /^\s*</.test(t)) throw 0;
      return t;
    });
    const [text, log] = await Promise.all([
      get(ref.csv),
      ref.pub ? null : get(`https://docs.google.com/spreadsheets/d/${ref.id}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(C.LOG_TAB)}`).catch(() => null),
    ]);
    return { text, log, time: new Date(), auto: false, jsonHistory: null };
  }

  function checkTargetNotifications() {
    if (!S.notifyEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    for (const i of S.items) {
      const tgt = S.targets[i.key];
      if (tgt != null && i.v <= tgt && !S.notified.has(i.key)) {
        S.notified.add(i.key);
        new Notification('DoGia — Đạt giá mục tiêu!', {
          body: `${i.label}: hiện còn ${C.fmt(i.v)}đ (mục tiêu ${C.fmt(tgt)}đ)`,
        });
      }
    }
  }

  async function load(link, live) {
    const ref = C.sheetRef(link);
    $('err').hidden = true;
    if (!ref) { showErr('Link không đúng dạng Google Sheet.'); return; }
    $('refresh').disabled = true;
    $('refresh').textContent = 'Đang cập nhật…';
    try {
      const { text, log, time, auto, jsonHistory } = await fetchSheet(ref, live);
      const all = C.parseCSV(text);
      if (!all.length) throw 1;
      const same = live && S.link === link;
      S.headers = all[0];
      S.rows = all.slice(1);
      S.link = link;
      S.id = ref.id;
      S.gid = ref.gid;
      S.lastTime = time;
      if (jsonHistory) S.jsonHistory = jsonHistory;

      if (!same) {
        S.group = '';
        S.facetValues = {};
        S.pricePreset = '';
        S.minPrice = '';
        S.maxPrice = '';
        S.quick = 'all';
        S.q = '';
        $('q').value = '';
        S.rawJ = null;
        S.open = null;
        S.compare = [];
        try { S.watch = new Set(JSON.parse(localStorage.getItem(`watch:${ref.id}:${ref.gid}`) || '[]')); } catch { S.watch = new Set(); }
        try { S.targets = JSON.parse(localStorage.getItem(`targets:${ref.id}:${ref.gid}`) || '{}'); } catch { S.targets = {}; }

        const analysis = C.analyzeColumns(S.headers, S.rows);
        S.cols = analysis.cols;
        S.role = analysis.role;
        S.facets = analysis.facets;
        populateRoleSelects();
        renderFacetFilters();
        $('report').classList.add('intro');
        setTimeout(() => $('report').classList.remove('intro'), 1500);
      }

      S.log = C.parseLog(log, text, S.cols);
      const today = C.toDayStart();
      S.items = C.buildItems(S.rows, S.cols, S.role, {
        today,
        jsonHistory: S.jsonHistory,
        localHistory: S.localHistory,
        log: S.log,
      });
      S.localHistory = recordLocalHistory(S.items, today);
      if (live) {
        S.items = C.buildItems(S.rows, S.cols, S.role, {
          today,
          jsonHistory: S.jsonHistory,
          localHistory: S.localHistory,
          log: S.log,
        });
      }

      $('report').hidden = false;
      $('status').innerHTML = `Cập nhật lúc <b>${C.fmtTime(time)}</b> · ${auto ? 'quét tự động lúc 10:00 sáng hằng ngày' : 'lấy trực tiếp từ Google Sheet'}`;
      if (!live) {
        $('scanNote').textContent = auto
          ? 'Sheet này được quét giá tự động lúc 10:00 sáng mỗi ngày. Bấm “Cập nhật ngay” để lấy giá mới nhất bất cứ lúc nào.'
          : 'Sheet này chưa nằm trong danh sách quét tự động (file sheets.txt trong repo) — giá được lấy trực tiếp mỗi lần mở trang.';
      }
      renderSavedSheets();
      render();
      checkTargetNotifications();
    } catch (e) {
      if (!live) $('report').hidden = true;
      showErr(e === 1 ? 'Sheet trống.' : 'Không đọc được sheet. Mở sheet → Chia sẻ → “Bất kỳ ai có đường liên kết” → Người xem, rồi thử lại.');
      $('src').open = true;
    } finally {
      $('refresh').disabled = false;
      $('refresh').textContent = '⟳ Cập nhật ngay';
    }
  }

  function populateRoleSelects() {
    const nums = S.cols.filter(c => c.type === 'number');
    const texts = S.cols.filter(c => c.type === 'text');
    const dates = S.cols.filter(c => c.type === 'date');
    const opts = (list, sel, none) => (none ? `<option value="">${none}</option>` : '') +
      list.map(c => `<option value="${c.j}"${c.j === sel ? ' selected' : ''}>${C.esc(c.name)}</option>`).join('');
    $('r-value').innerHTML = nums.length ? opts(nums, S.role.value) : '<option value="">(không có cột số)</option>';
    $('r-cmp').innerHTML = opts(nums, S.role.cmp, '(không có)');
    $('r-group').innerHTML = opts(texts, S.role.group, '(không nhóm)');
    $('r-date').innerHTML = opts(dates, S.role.date, '(không có)');
  }

  function showErr(msg) {
    $('err').textContent = msg;
    $('err').hidden = false;
  }

  function openSheet(link) {
    $('link').value = link;
    const u = new URL(location.href);
    if (link === DEFAULT_LINK) u.searchParams.delete('sheet');
    else u.searchParams.set('sheet', link);
    history.replaceState(null, '', u);
    return load(link);
  }

  /* ---------- xuất dữ liệu & chia sẻ ---------- */
  function getCurrentFilteredItems() {
    const today = C.toDayStart();
    const rows = C.filterRows(S.rows, S.cols, S.role, { q: S.q, group: S.group, facets: S.facetValues });
    const rowSet = new Set(rows);
    const t0 = C.periodStart(S.items, S.range, today);
    const baseItems = C.withPeriod(S.items.filter(i => rowSet.has(i.r)), t0, S.range);
    const bounds = activePriceBounds();
    return {
      rows,
      items: C.filterItems(baseItems, rowSet, {
        today,
        quick: S.quick,
        watch: S.watch,
        targets: S.targets,
        minPrice: bounds.minPrice,
        maxPrice: bounds.maxPrice,
      }),
    };
  }

  function exportCSV() {
    const { rows, items } = getCurrentFilteredItems();
    const exportRows = S.items.length ? items.map(i => i.r) : rows;
    const csv = '\uFEFF' + C.toCSV(S.headers, exportRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dogia-${C.isoDateStr(new Date())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Đã xuất ${exportRows.length} dòng ra CSV`);
  }

  async function copyQuote() {
    const { items } = getCurrentFilteredItems();
    const text = C.toMarkdownQuote(items.slice(0, 30), {
      title: 'Báo giá DoGia',
      timeStr: S.lastTime ? C.fmtTime(S.lastTime) : '',
    });
    try {
      await navigator.clipboard.writeText(text);
      toast(`Đã sao chép báo giá (${Math.min(items.length, 30)} mẫu)`);
    } catch {
      toast('Trình duyệt chặn clipboard — hãy thử lại sau khi bấm trên trang.');
    }
  }

  async function copyShareLink() {
    const u = new URL(location.href);
    if (S.q) u.searchParams.set('q', S.q); else u.searchParams.delete('q');
    if (S.group) u.searchParams.set('group', S.group); else u.searchParams.delete('group');
    u.searchParams.set('range', String(S.range));
    try {
      await navigator.clipboard.writeText(u.toString());
      toast('Đã sao chép link báo cáo!');
    } catch {
      toast(u.toString());
    }
  }

  /* ---------- sự kiện ---------- */
  $('form').addEventListener('submit', e => { e.preventDefault(); openSheet($('link').value.trim()); });
  $('reset').addEventListener('click', () => openSheet(DEFAULT_LINK));
  $('q').addEventListener('input', e => { S.q = e.target.value; render(); });
  $('clearQ').addEventListener('click', () => { S.q = ''; $('q').value = ''; render(); $('q').focus(); });

  for (const r of ['value', 'cmp', 'group', 'date']) {
    $('r-' + r).addEventListener('change', e => {
      S.role[r] = e.target.value === '' ? null : +e.target.value;
      if (r === 'group') S.group = '';
      S.items = C.buildItems(S.rows, S.cols, S.role, {
        today: C.toDayStart(),
        jsonHistory: S.jsonHistory,
        localHistory: S.localHistory,
        log: S.log,
      });
      render();
    });
  }

  $('facetFilters').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.facet != null) {
      S.facetValues[t.dataset.facet] = t.value;
      render();
    } else if (t.id === 'pricePreset') {
      S.pricePreset = t.value;
      S.minPrice = '';
      S.maxPrice = '';
      $('minPriceInput').value = '';
      $('maxPriceInput').value = '';
      render();
    }
  });

  $('facetFilters').addEventListener('input', e => {
    if (e.target.id === 'minPriceInput') { S.minPrice = e.target.value; S.pricePreset = ''; $('pricePreset').value = ''; render(); }
    if (e.target.id === 'maxPriceInput') { S.maxPrice = e.target.value; S.pricePreset = ''; $('pricePreset').value = ''; render(); }
  });

  $('themeBtn').addEventListener('click', () => {
    wantTheme = THEMES[(THEMES.findIndex(x => x[0] === wantTheme) + 1) % THEMES.length][0];
    const go = () => setTheme(wantTheme);
    document.startViewTransition ? document.startViewTransition(go) : go();
  });

  $('tint')?.addEventListener('input', e => {
    root.style.setProperty('--tint', e.target.value);
    try { localStorage.setItem('tint', e.target.value); } catch { }
  });

  $('exportCsvBtn').addEventListener('click', exportCSV);
  $('copyQuoteBtn').addEventListener('click', copyQuote);
  $('shareBtn').addEventListener('click', copyShareLink);
  $('helpBtn').addEventListener('click', () => $('helpDlg').showModal());
  $('notifyBtn').addEventListener('click', async () => {
    if (!('Notification' in window)) { toast('Trình duyệt không hỗ trợ Notification.'); return; }
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') { toast('Bạn chưa cấp quyền thông báo cho trình duyệt.'); return; }
    S.notifyEnabled = !S.notifyEnabled;
    try { localStorage.setItem('dogia:notify', S.notifyEnabled ? '1' : '0'); } catch { }
    $('notifyBtn').textContent = S.notifyEnabled ? '🔔 Đang bật cảnh báo trình duyệt' : '🔕 Bật cảnh báo trình duyệt';
    if (S.notifyEnabled) checkTargetNotifications();
  });

  document.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('a')) return;

    if (t.id === 'resetFilters') {
      S.q = ''; $('q').value = '';
      S.group = ''; S.quick = 'all'; S.facetValues = {}; S.pricePreset = ''; S.minPrice = ''; S.maxPrice = '';
      renderFacetFilters();
      render();
      return;
    }

    if (t.id === 'viewTargetHits') {
      S.quick = 'target';
      render();
      return;
    }

    if (t.id === 'savePresetBtn') {
      const ref = C.sheetRef(S.link);
      if (!ref) return;
      const name = prompt('Đặt tên cho bảng giá này:', `Bảng giá (${S.items.length || S.rows.length} mẫu)`);
      if (!name) return;
      S.savedSheets = S.savedSheets.filter(p => !(p.id === ref.id && p.gid === ref.gid));
      S.savedSheets.unshift({ name: name.trim(), link: S.link, id: ref.id, gid: ref.gid });
      try { localStorage.setItem('dogia:sheets', JSON.stringify(S.savedSheets.slice(0, 12))); } catch { }
      renderSavedSheets();
      toast('Đã lưu bảng giá!');
      return;
    }

    if (t.dataset.loadPreset != null) {
      const p = S.savedSheets[+t.dataset.loadPreset];
      if (p) openSheet(p.link);
      return;
    }
    if (t.dataset.delPreset != null) {
      S.savedSheets.splice(+t.dataset.delPreset, 1);
      try { localStorage.setItem('dogia:sheets', JSON.stringify(S.savedSheets)); } catch { }
      renderSavedSheets();
      return;
    }

    const rb = t.closest('[data-r]');
    if (rb) { S.range = +rb.dataset.r; render(); return; }

    const st = t.closest('[data-star]');
    if (st) {
      const k = st.dataset.star;
      S.watch.has(k) ? S.watch.delete(k) : S.watch.add(k);
      saveWatchTargets();
      render();
      return;
    }

    const cmpChk = t.closest('[data-cmp]');
    if (cmpChk) {
      const k = cmpChk.dataset.cmp;
      if (cmpChk.checked) {
        if (S.compare.length >= 4) { cmpChk.checked = false; toast('Chỉ so sánh tối đa 4 sản phẩm cùng lúc.'); return; }
        if (!S.compare.includes(k)) S.compare.push(k);
      } else {
        S.compare = S.compare.filter(x => x !== k);
      }
      renderCompareDock();
      return;
    }

    if (t.dataset.rmCmp != null) {
      S.compare = S.compare.filter(x => x !== t.dataset.rmCmp);
      render();
      return;
    }
    if (t.id === 'clearCmpBtn') { S.compare = []; render(); return; }
    if (t.id === 'openCmpBtn') { openCompareModal(); return; }

    const ch = t.closest('.chip');
    if (ch) {
      if (ch.dataset.quick) {
        S.quick = S.quick === ch.dataset.quick ? 'all' : ch.dataset.quick;
      } else {
        S.quick = 'all';
        S.group = ch.dataset.g;
      }
      render();
      return;
    }

    const th = t.closest('#tHead th[data-sortable="1"]');
    if (th) {
      const k = th.dataset.k;
      S.sortDir = S.sortK === k ? -S.sortDir : 1;
      S.sortK = k;
      render();
      return;
    }

    const rh = t.closest('#rHead th');
    if (rh) {
      const j = +rh.dataset.j;
      S.rawDir = S.rawJ === j ? -S.rawDir : 1;
      S.rawJ = j;
      render();
      return;
    }

    if (t.id === 'dlgStar' && S.open) {
      S.watch.has(S.open) ? S.watch.delete(S.open) : S.watch.add(S.open);
      saveWatchTargets();
      render();
      return;
    }

    if (t.id === 'dlgCmp' && S.open) {
      if (S.compare.includes(S.open)) S.compare = S.compare.filter(x => x !== S.open);
      else if (S.compare.length >= 4) { toast('Chỉ so sánh tối đa 4 sản phẩm cùng lúc.'); return; }
      else S.compare.push(S.open);
      render();
      return;
    }

    if (t.id === 'saveTgtBtn' && S.open) {
      const val = parseShortPrice($('tgtInput').value);
      if (val == null || val <= 0) { toast('Nhập giá mục tiêu hợp lệ (vd: 19.500.000 hoặc 19.5tr).'); return; }
      S.targets[S.open] = val;
      saveWatchTargets();
      toast(`Đã đặt mục tiêu ${C.fmt(val)}đ`);
      render();
      checkTargetNotifications();
      return;
    }
    if (t.dataset.tgtPct && S.open) {
      const cur = S.items.find(x => x.key === S.open);
      if (cur) {
        const val = Math.round(cur.v * Number(t.dataset.tgtPct) / 10000) * 10000;
        S.targets[S.open] = val;
        saveWatchTargets();
        render();
      }
      return;
    }
    if (t.dataset.tgtVal && S.open) {
      S.targets[S.open] = Number(t.dataset.tgtVal);
      saveWatchTargets();
      render();
      return;
    }
    if (t.id === 'clearTgtBtn' && S.open) {
      delete S.targets[S.open];
      saveWatchTargets();
      render();
      return;
    }

    if (t.dataset.dlgtab) {
      S.dlgTab = t.dataset.dlgtab;
      if (S.open) {
        openDetail(S.open, true);
        $('calcOut')?.scrollIntoView({ block: 'nearest' });
      }
      return;
    }

    const jmp = t.closest('[data-jump]');
    if (jmp) { openDetail(jmp.dataset.jump); return; }

    const row = t.closest('#tBody tr[data-k], .mv[data-k]');
    if (row && !t.closest('button, input, a')) { openDetail(row.dataset.k); return; }

    if (t.id === 'dlgClose' || t === $('dlg')) $('dlg').close();
    if (t.id === 'cmpClose' || t === $('cmpDlg')) $('cmpDlg').close();
    if (t.id === 'helpClose' || t === $('helpDlg')) $('helpDlg').close();
  });

  $('dlgBody').addEventListener('input', e => {
    const t = e.target;
    const item = S.items.find(x => x.key === S.open);
    if (!item) return;
    if (t.id === 'instDown') { S.instDown = +t.value; renderCalcResult(item); }
    if (t.id === 'instMonths') { S.instMonths = +t.value; renderCalcResult(item); }
    if (t.id === 'instRate') { S.instRate = +t.value; renderCalcResult(item); }
    if (t.id === 'tradeInSel') { S.tradeInKey = t.value; renderCalcResult(item); }
    if (t.id === 'tradeInRet') { S.tradeInRet = +t.value; renderCalcResult(item); }
    if (t.id === 'tradeInBonus') { S.tradeInBonus = +t.value; renderCalcResult(item); }
  });
  $('dlgBody').addEventListener('change', e => {
    const t = e.target;
    const item = S.items.find(x => x.key === S.open);
    if (!item) return;
    if (t.id === 'instDown' || t.id === 'instMonths' || t.id === 'tradeInSel') {
      if (t.id === 'instDown') S.instDown = +t.value;
      if (t.id === 'instMonths') S.instMonths = +t.value;
      if (t.id === 'tradeInSel') S.tradeInKey = t.value;
      renderCalcResult(item);
    }
  });

  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';

    if (e.key === 'Enter' || e.key === ' ') {
      const row = e.target.closest('#tBody tr[data-k], .mv[data-k], [data-jump]');
      if (row && !typing && !e.target.closest('button, a')) {
        e.preventDefault();
        openDetail(row.dataset.jump || row.dataset.k);
        return;
      }
    }

    if (typing) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }

    if (e.key === '/') { e.preventDefault(); $('q').focus(); $('q').select(); }
    else if (e.key === '?') { e.preventDefault(); $('helpDlg').open ? $('helpDlg').close() : $('helpDlg').showModal(); }
    else if (e.key === 'r' && !e.ctrlKey && !e.metaKey) { if (S.link) load(S.link, true); }
    else if (e.key === 't' && !e.ctrlKey && !e.metaKey) { $('themeBtn').click(); }
  });

  window.addEventListener('scroll', () => document.body.classList.toggle('scrolled', window.scrollY > 40), { passive: true });
  window.addEventListener('pointermove', e => {
    const g = e.target.closest?.('.kpi, .card');
    if (!g) return;
    const r = g.getBoundingClientRect();
    g.style.setProperty('--mx', e.clientX - r.left + 'px');
    g.style.setProperty('--my', e.clientY - r.top + 'px');
  }, { passive: true });

  $('dlg').addEventListener('close', () => { S.open = null; $('tip').style.display = 'none'; });
  $('cmpDlg').addEventListener('close', () => { S.cmpOpen = false; $('tip').style.display = 'none'; });

  let rz;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => S.items.length && render(), 150);
  });

  $('refresh').addEventListener('click', () => S.link && load(S.link, true));

  /* ---------- khởi tạo ---------- */
  loadPrefs();
  $('notifyBtn').textContent = S.notifyEnabled ? '🔔 Đang bật cảnh báo trình duyệt' : '🔕 Bật cảnh báo trình duyệt';
  const params = new URLSearchParams(location.search);
  const initRange = parseInt(params.get('range'), 10);
  if (C.RANGES.some(([d]) => d === initRange)) S.range = initRange;

  openSheet(params.get('sheet') || DEFAULT_LINK).then(() => {
    if (params.get('q')) { S.q = params.get('q'); $('q').value = S.q; }
    if (params.get('group')) { S.group = params.get('group'); }
    if (params.get('q') || params.get('group')) render();
  });
}());
