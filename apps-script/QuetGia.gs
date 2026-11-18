// Quét giá tam300.com mỗi ngày — chỉ ghi những món ĐỔI giá. 0 token, không cần API key.
// Mỗi sản phẩm trên trang là <article data-product-card data-offers='[{"capacity","color","price":"20,9 triệu"}]'>,
// nên script đọc thẳng dữ liệu giá đó (lấy giá thấp nhất theo màu, giống cách sheet đang ghi).
// Món mơ hồ / không đọc được được ghi vào Cấu hình!A5 để Gemini xử lý qua chat.md.
// Dán vào Google Sheet: Tiện ích mở rộng → Apps Script. Hướng dẫn: apps-script/HUONG-DAN.md
const TAB_GIA = 'Trang tính1', TAB_LOG = 'Biến động', TAB_CFG = 'Cấu hình', TZ = 'Asia/Ho_Chi_Minh';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Theo dõi giá')
    .addItem('Quét giá tam300.com ngay', 'quetGia')
    .addItem('Bật quét tự động 9:30 sáng mỗi ngày', 'caiDat')
    .addToUi();
}

// Chạy 1 lần: tạo lịch 9:30 sáng (giờ VN) để 10:00 trang web lấy được giá mới.
function caiDat() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'quetGia').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('quetGia').timeBased().everyDays(1).atHour(9).nearMinute(30).inTimezone(TZ).create();
}

function quetGia() {
  const ss = SpreadsheetApp.getActive(), cfg = ss.getSheetByName(TAB_CFG), sh = ss.getSheetByName(TAB_GIA), log = ss.getSheetByName(TAB_LOG);
  if (!cfg || !sh || !log) throw new Error(`Thiếu tab "${TAB_GIA}", "${TAB_LOG}" hoặc "${TAB_CFG}" — chưa ghi gì.`);
  const gio = () => Utilities.formatDate(new Date(), TZ, 'HH:mm dd/MM/yyyy');
  try {
    const [nguon, , nguong] = cfg.getRange('B1:B3').getValues().flat();
    const goc = String(nguon || 'https://tam300.com').trim().replace(/\/+$/, '');
    const tai = u => {
      const r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (r.getResponseCode() !== 200) throw new Error(`${u} trả về HTTP ${r.getResponseCode()}`);
      return r.getContentText();
    };

    // Trang chủ liệt kê các trang /iphone/...-series; mỗi trang có các thẻ sản phẩm.
    const trang = timTrang(tai(goc + '/'), goc), lines = [], loiTai = [];
    trang.forEach(u => { try { docTam300(tai(u)).forEach(l => lines.push(Object.assign(l, { u }))); } catch (e) { loiTai.push(`${u} (${e.message})`); } });

    const rows = sh.getDataRange().getValues(), c = cot(rows[0]);
    const items = rows.slice(1).map((r, i) => ({ i, r, gia: Number(r[c.gia]) })).filter(x => x.r[c.model] && x.gia);
    const g = ghepGia(items, lines, c);

    // Ghi nhật ký trước rồi mới sửa giá: nếu lỗi giữa chừng thì tệ nhất là trùng 1 dòng nhật ký, không mất lịch sử.
    const ngay = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy'); // chuỗi → sheet vi_VN tự hiểu là ngày
    const maxPct = Number(nguong) || 30, doi = locThayDoi(rows, c, g.gia, maxPct);
    if (doi.length) {
      const add = doi.map(d => [ngay, d.r[c.series] || '', d.r[c.model], d.r[c.dl], d.r[c.tt], d.old, d.p, d.p - d.old, d.u]);
      log.getRange(log.getLastRow() + 1, 1, add.length, add[0].length).setValues(add);
    }
    doi.forEach(d => {
      sh.getRange(d.n, c.gia + 1).setValue(d.p);
      if (c.cu >= 0) sh.getRange(d.n, c.cu + 1).setValue(d.old);
      if (c.ngay >= 0) sh.getRange(d.n, c.ngay + 1).setValue(ngay);
    });

    // Báo cáo cho người và Gemini: lần quét cuối + những gì script không tự quyết được.
    const ten = x => `${x.r[c.model]} ${x.r[c.dl]}`;
    const lech = g.gia.filter(x => x.p !== items.find(y => y.i === x.i).gia && !doi.some(d => d.n === x.i + 2));
    const canXem = [
      ...(!trang.length ? ['Trang chủ không còn link /iphone/...-series — có thể tam300.com đã đổi cấu trúc'] : []),
      ...(trang.length > loiTai.length && !lines.length ? ['Trang không còn dữ liệu data-offers — có thể tam300.com đã đổi cấu trúc'] : []),
      ...loiTai.map(u => `Không tải được ${u}`),
      ...g.mo.map(m => `${ten(m.x)}: nhiều giá trên trang (${m.cands.map(l => l.p).join(' / ')})`),
      ...lech.map(x => `${ten(items.find(y => y.i === x.i))}: lệch quá ${maxPct}% (${x.p}), chưa ghi`),
      ...(lines.length ? g.thieu.map(x => `${ten(x)}: không thấy trên trang`) : []), // không đọc được giá nào thì lỗi đã nêu ở trên
    ];
    const kq = `${trang.length} trang · ${lines.length} giá · ${g.gia.length} món khớp · ghi ${doi.length} món đổi giá · ${canXem.length} việc cho Gemini · 0 token`;
    cfg.getRange('A4:C5').setValues([['Lần quét cuối', gio(), kq], ['Cần Gemini xem', canXem.length, canXem.join('\n') || '—']]);
    console.log(kq + (canXem.length ? '\n' + canXem.join('\n') : ''));
  } catch (e) {
    // Không để báo cáo của lần quét trước trông như của hôm nay.
    cfg.getRange('A4:C5').setValues([['Lần quét cuối', gio(), 'LỖI: ' + e.message], ['Cần Gemini xem', 1, 'Quét lỗi: ' + e.message]]);
    throw e;
  }
}

function cot(head) {
  const f = re => head.findIndex(h => re.test(String(h)));
  return { series: f(/dòng máy|series/i), model: f(/model|sản phẩm/i), dl: f(/dung lượng/i), tt: f(/tình trạng/i),
           gia: f(/giá bán|^giá$/i), cu: f(/giá cũ/i), ngay: f(/ngày/i) };
}

/* ---------- đọc tam300.com ---------- */
const giaiMa = s => String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

// Link các trang dòng máy từ trang chủ: /iphone/iphone-16-series ...
function timTrang(html, goc) {
  const out = [];
  (String(html).match(/href="(\/iphone\/[^"#?]+)"/g) || []).forEach(h => { const u = goc + h.slice(6, -1); if (out.indexOf(u) < 0) out.push(u); });
  return out;
}

// "20,9 triệu" → 20900000 · "950k" → 950000 · "4 triệu" → 4000000 · "20.900.000đ" → 20900000
function soTien(s) {
  s = String(s).toLowerCase().replace(/\s/g, '');
  if (/^\d[\d.,]*(đ|₫|vnđ|vnd)?$/.test(s)) return Number(s.replace(/\D/g, '')) || null;
  const m = s.match(/^(\d+(?:[.,]\d+)?)(triệu|tr|k|nghìn|ngàn)$/); if (!m) return null; // "17tr2" → null, để Gemini xem chứ không đoán
  return Math.round(Number(m[1].replace(',', '.')) * (/^(k|nghìn|ngàn)$/.test(m[2]) ? 1e3 : 1e6));
}

// HTML một trang dòng máy → [{ten:"iPhone 16 Pro Max zin… 256GB", p: giá thấp nhất theo màu}]
function docTam300(html) {
  const out = [], re = /<article[^>]*data-offers="([^"]*)"[^>]*>([\s\S]*?)<\/article>/g;
  let m;
  while ((m = re.exec(html))) {
    let title = giaiMa(m[2].replace(/<[^>]+>/g, '|')).split('|').map(s => s.trim()).filter(Boolean)[0] || '';
    if (!/iphone/i.test(title)) title = 'iPhone ' + title;
    const min = {};
    JSON.parse(giaiMa(m[1])).forEach(o => { const p = soTien(o.price); if (p && (!min[o.capacity] || p < min[o.capacity])) min[o.capacity] = p; });
    Object.keys(min).forEach(cap => out.push({ ten: `${title} ${cap}`, p: min[cap] }));
  }
  return out;
}

/* ---------- ghép tên với sheet ---------- */
const boDau = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
// "iPhone 15 Pro Max zin nguyên bản 256GB" → "15 pro max|256gb"
function khoa(s) {
  s = boDau(s).replace(/\s+/g, ' ');
  const m = s.match(/iphone ?(\d{1,2}|xs max|xs|xr|x)\b(?: (pro max|pro|plus|mini)\b)?/), d = s.match(/(\d+) ?(gb|tb)/);
  return m && d ? `${m[1]}${m[2] ? ' ' + m[2] : ''}|${d[1]}${d[2]}` : null;
}
// Máy mới (newseal, chưa kích hoạt) không được ghép với giá máy cũ và ngược lại.
const loai = s => { s = boDau(s); return /like|\bcu\b|99|2nd|da kich hoat|qua su dung|doi tra/.test(s) ? 'cu' : /new|seal|\bmoi\b|chua kich hoat/.test(s) ? 'moi' : 'cu'; };

// → gia: [{i,p,u}] khớp chắc · mo: [{x,cands}] một món có nhiều giá · thieu: món không có trên trang
function ghepGia(items, lines, c) {
  const by = {};
  lines.forEach(l => { const k = khoa(l.ten); if (k) { const kk = k + '|' + loai(l.ten); (by[kk] = by[kk] || []).push(l); } });
  const gia = [], mo = [], thieu = [];
  items.forEach(x => {
    const k = khoa(`${x.r[c.model]} ${x.r[c.dl]}`); if (!k) return thieu.push(x);
    const cands = by[k + '|' + loai(x.r[c.tt])] || [], ps = cands.map(l => l.p).filter((p, j, a) => a.indexOf(p) === j);
    if (ps.length === 1) gia.push({ i: x.i, p: ps[0], u: cands[0].u });
    else if (ps.length > 1) mo.push({ x, cands });
    else thieu.push(x);
  });
  return { gia, mo, thieu };
}

// Giữ lại món thật sự đổi giá; bỏ món lệch quá ngưỡng % (đọc nhầm / ghép nhầm).
function locThayDoi(rows, c, changes, maxPct) {
  const out = [], seen = {};
  (changes || []).forEach(({ i, p, u }) => {
    const r = rows[Number(i) + 1], old = r && Number(r[c.gia]);
    p = Math.round(Number(String(p).replace(/[^\d]/g, '')));
    if (!old || !p || p === old || seen[i] || Math.abs(p - old) / old * 100 > maxPct) return;
    seen[i] = 1;
    out.push({ n: Number(i) + 2, r, old, p, u });
  });
  return out;
}

if (typeof module !== 'undefined') module.exports = { quetGia, cot, locThayDoi, timTrang, soTien, docTam300, khoa, loai, ghepGia };
