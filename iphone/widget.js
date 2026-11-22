// Widget Scriptable + Phím tắt: so sánh lên đời 15 Pro Max 256GB (Xám) -> 16 Pro Max 256GB (bản rẻ nhất).
// Dùng chung công thức của index.html (khối <upgrade-calc>). Chạy thử trên máy: node iphone/widget.js
const SITE = 'https://hienphuong99.github.io/DoGia/';
const TAM = 'https://tam300.com/iphone/';
const isScriptable = typeof ListWidget !== 'undefined';
const get = u => isScriptable ? new Request(u).loadString() : fetch(u).then(r => r.text());
const bust = u => u + (u.includes('?') ? '&' : '?') + '_=' + Date.now();
const unesc = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const price = s => { const m = String(s).match(/(\d+(?:[.,]\d+)?)\s*tri[eệ]u/i); return m ? Math.round(parseFloat(m[1].replace(',', '.')) * 1e6) : null; };
const tr = v => (v / 1e6).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + 'tr';
const range = ([a, b]) => a === b ? tr(a) : `${tr(a)}–${tr(b)}`;

// Lấy offers của thẻ máy cũ (không phải Newseal) có tiêu đề khớp model
function offers(html, model) {
  for (const a of html.match(/<article[^>]*data-product-card[\s\S]*?<\/article>/g) || []) {
    const t = unesc(((a.match(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/) || [])[1] || '').replace(/<[^>]+>/g, ''));
    if (!model.test(t) || /new|seal/i.test(t)) continue;
    try { return JSON.parse(unesc((a.match(/data-offers="([^"]*)"/) || [])[1] || '[]')); } catch { return []; }
  }
  return [];
}

async function load() {
  const [site, t15, t16, hk] = await Promise.all([
    get(bust(SITE)), get(bust(TAM + 'iphone-15-series')), get(bust(TAM + 'iphone-16-series')), get(bust(SITE + 'data/hoangkien.json')),
  ]);
  const block = site.match(/\/\* <upgrade-calc>[\s\S]*?\/\* <\/upgrade-calc> \*\//)[0];
  const C = new Function(block + '\nreturn { hkLookup, compareUpgrade };')();
  const o15 = offers(t15, /\b15\s*pro\s*max\b/i).filter(o => o.capacity === '256GB');
  const src = o15.find(o => o.color === 'Xám') || o15.find(o => o.color === 'Trắng');
  const N = Math.min(...offers(t16, /\b16\s*pro\s*max\b/i).filter(o => o.capacity === '256GB').map(o => price(o.price)).filter(Boolean));
  if (!src || !isFinite(N)) throw new Error('Thiếu giá TAM300');
  const H = JSON.parse(hk);
  const hkItem = C.hkLookup(H.items, 'iPhone 15 Pro Max', '256GB', src.color, 90);
  if (!hkItem) throw new Error('Thiếu giá Hoàng Kiên');
  const r = C.compareUpgrade({ N, O_T: price(src.price), feeMin: 300000, feeMax: 500000, O_HK: hkItem.price, type: 'bh', pin: 90, baoTri: false });
  const verdict = { pa2: 'Bán HK lợi hơn', pa1: 'Đổi TAM300 lợi hơn', hoa: 'Gần như hòa' }[r.verdict];
  return { N, O_T: price(src.price), color: src.color, O_HK: hkItem.price, r, verdict, hkTime: H.time };
}

function text(d) {
  return `15PM 256 ${d.color} → 16PM 256 (${tr(d.N)})\n`
    + `PA1 đổi TAM300: bù ${range(d.r.pa1.bu)}\n`
    + `PA2 bán HK (${tr(d.r.hk.thu)}): bù ${tr(d.r.bu2)}\n`
    + `→ ${d.verdict}`;
}

async function main() {
  let d, err;
  try { d = await load(); } catch (e) { err = e.message || String(e); }
  const msg = d ? text(d) : 'Lỗi tải giá: ' + err;
  if (!isScriptable) return console.log(msg);
  Script.setShortcutOutput(msg);                       // Phím tắt nhận chữ này
  const w = new ListWidget();
  w.url = SITE;
  w.backgroundColor = Color.dynamic(new Color('#e8edf6'), new Color('#1c1c1e'));
  const line = (s, size, bold, op = 1) => { const t = w.addText(s); t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size); t.textColor = Color.dynamic(Color.black(), Color.white()); t.textOpacity = op; t.minimumScaleFactor = .6; };
  if (d) {
    line(`15PM ${d.color} → 16PM 256`, 12, true, .7);
    w.addSpacer(4);
    line(d.verdict, 17, true);
    w.addSpacer(4);
    line(`TAM300: bù ${range(d.r.pa1.bu)}`, 13);
    line(`HK: bù ${tr(d.r.bu2)}`, 13);
    w.addSpacer();
    line('Cập nhật ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), 10, false, .5);
  } else line(msg, 12);
  w.refreshAfterDate = new Date(Date.now() + 3 * 3600e3);
  if (config.runsInWidget) Script.setWidget(w);
  else if (config.runsInApp) await w.presentSmall();
  Script.complete();
}

if (!isScriptable) main();
