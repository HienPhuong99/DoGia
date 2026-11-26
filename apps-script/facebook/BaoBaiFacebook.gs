// Báo bài mới trên Facebook của tam300 qua email: Apps Script + Apify (actor apify/facebook-posts-scraper).
// Bài nào mới cũng gửi mail, không lọc nội dung (bài thường không ghi model).
// Mỗi lần chạy (10 phút/lần): đọc kết quả lượt quét trước → gửi mail bài mới → khởi động lượt quét kế tiếp.
// Lượt quét chỉ lấy bài mới hơn bài cuối đã thấy (bộ lọc ngày), nên Apify chỉ tính tiền bài mới, không tính theo số lần quét.
// Hướng dẫn cài: apps-script/facebook/HUONG-DAN.md
const TRANG = ['https://www.facebook.com/tam300', 'https://www.facebook.com/profile.php?id=61575673269886'];
const ACTOR = 'apify~facebook-posts-scraper', API = 'https://api.apify.com/v2', TZ = 'Asia/Ho_Chi_Minh';
const PHUT = 10;             // chu kỳ kiểm tra (Apps Script chỉ cho 1, 5, 10, 15, 30)
const TRAN_THANG = 600;      // tối đa số bài/tháng ≈ 4,2 USD (7 USD/1.000 bài có bộ lọc ngày) — dưới 5 USD miễn phí
const MAX_USD_LUOT = 0.2;    // một lượt quét không được tốn quá số này
const QUA_LAU = 30 * 60e3;   // lượt quét chạy quá 30 phút thì dừng nó
const BAO_LOI_SAU = 3;       // lỗi liên tiếp bao nhiêu lần thì gửi mail cảnh báo

// Chạy 1 lần sau khi đã điền APIFY_TOKEN trong Cài đặt dự án → Thuộc tính tập lệnh.
function caiDat() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('APIFY_TOKEN')) throw new Error('Chưa có APIFY_TOKEN: vào Cài đặt dự án (bánh răng) → Thuộc tính tập lệnh → thêm APIFY_TOKEN.');
  dungLai();
  ScriptApp.newTrigger('kiemTra').timeBased().everyMinutes(PHUT).create();
  const s = trangThai(p);
  if (!s.tuLuc) s.tuLuc = isoUtc(Date.now()); // chỉ báo bài đăng từ lúc cài, không gửi lại bài cũ
  p.setProperty('TRANG_THAI', JSON.stringify(s));
  kiemTra();
}

function dungLai() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'kiemTra').forEach(t => ScriptApp.deleteTrigger(t));
}

function thuGuiMail() {
  MailApp.sendEmail({ to: nguoiNhan(), subject: '[tam300] Thử gửi mail', htmlBody: 'Mail báo bài mới của tam300 sẽ về hộp thư này.' });
}

function xemTrangThai() { console.log(PropertiesService.getScriptProperties().getProperty('TRANG_THAI')); }

function kiemTra() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // lần trước chưa xong
  try {
    const p = PropertiesService.getScriptProperties(), s = trangThai(p);
    const thu = buoc(s, Date.now(), api(p.getProperty('APIFY_TOKEN')));
    const to = nguoiNhan();
    thu.forEach(m => MailApp.sendEmail(Object.assign({ to }, m)));
    // Lưu sau khi gửi: nếu gửi mail lỗi thì lần sau đọc lại lượt quét đó và gửi lại, không mất bài.
    p.setProperty('TRANG_THAI', JSON.stringify(s));
    console.log(`${thu.length} mail · ${s.soBai}/${TRAN_THANG} bài tháng ${s.thang} · lượt đang chạy ${s.run || '—'} · ${s.loiCuoi || 'không lỗi'}`);
  } finally { lock.releaseLock(); }
}

// Phần lõi, không gọi dịch vụ Google nào (để test được bằng node). Sửa s tại chỗ, trả về các mail cần gửi.
function buoc(s, now, goi) {
  const thu = [], thang = new Date(now).toISOString().slice(0, 7);
  if (s.thang !== thang) Object.assign(s, { thang, soBai: 0, hetTran: false });
  try {
    if (s.run) {
      const r = goi('get', `/actor-runs/${s.run}`).data;
      if (r.status === 'READY' || r.status === 'RUNNING') {
        if (now - Date.parse(r.startedAt || r.createdAt) < QUA_LAU) return thu; // còn chạy, chờ lần sau
        try { goi('post', `/actor-runs/${s.run}/abort`); } catch (e) { /* dừng không được thì thôi */ }
        s.run = null;
        throw new Error('Lượt quét chạy quá 30 phút, đã dừng');
      }
      s.run = null;
      if (r.status !== 'SUCCEEDED') throw new Error(`Lượt quét Apify kết thúc với trạng thái ${r.status}`);
      docKetQua(s, goi('get', `/datasets/${r.defaultDatasetId}/items?clean=true&format=json`), now, thu);
    }
    if (s.soBai >= TRAN_THANG) {
      if (!s.hetTran) {
        s.hetTran = true;
        thu.push({ subject: '[tam300] Tạm dừng quét: đã hết hạn mức tháng này',
          htmlBody: `Tháng ${thang} đã nhận ${s.soBai} bài (tối đa ${TRAN_THANG}) nên script tạm dừng để không vượt gói miễn phí Apify. Sang tháng sau sẽ tự chạy lại.` });
      }
      return thu;
    }
    const input = { startUrls: TRANG.map(url => ({ url })), resultsLimit: 10, onlyPostsNewerThan: s.tuLuc };
    s.run = goi('post', `/acts/${ACTOR}/runs?maxTotalChargeUsd=${MAX_USD_LUOT}`, input).data.id;
  } catch (e) {
    s.loiLienTiep = (s.loiLienTiep || 0) + 1;
    s.loiCuoi = e.message;
    if (s.loiLienTiep >= BAO_LOI_SAU && !s.daBaoLoi) {
      s.daBaoLoi = true;
      thu.push({ subject: '[tam300] Quét Facebook đang bị lỗi',
        htmlBody: `Đã lỗi ${s.loiLienTiep} lần liên tiếp, nên có thể đang sót bài.<br>Lỗi gần nhất: ${esc(e.message)}<br>Khi chạy lại được sẽ có mail báo.` });
    }
  }
  return thu;
}

function docKetQua(s, items, now, thu) {
  const bai = items.filter(i => i && i.postId);
  s.soBai = (s.soBai || 0) + bai.length; // Apify tính tiền theo bài trả về
  const daThay = new Set(s.daThay || []);
  const moi = bai.filter(i => !daThay.has(String(i.postId))).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  if (moi.length) thu.push(thuBaiMoi(moi));
  s.daThay = [...daThay, ...moi.map(i => String(i.postId))].slice(-300);
  const cuoi = Math.max(0, ...bai.map(i => Number(i.timestamp) || 0));
  if (cuoi) s.tuLuc = [s.tuLuc, isoUtc(cuoi * 1000 + 1000)].filter(Boolean).sort().pop(); // lượt sau chỉ lấy bài mới hơn
  if (s.daBaoLoi) thu.push({ subject: '[tam300] Quét Facebook chạy lại bình thường', htmlBody: `Lỗi trước đó: ${esc(s.loiCuoi || '')}` });
  Object.assign(s, { lanOkCuoi: new Date(now).toISOString(), loiLienTiep: 0, daBaoLoi: false, loiCuoi: '' });
  // Trang không đọc được (vd. link là trang cá nhân): báo 1 lần mỗi ngày, không gửi dồn mỗi 10 phút.
  const loiTrang = items.filter(i => i && !i.postId).map(i => i.error || i.errorDescription || JSON.stringify(i).slice(0, 200));
  const ngay = new Date(now).toISOString().slice(0, 10);
  if (loiTrang.length && s.ngayBaoTrangLoi !== ngay) {
    s.ngayBaoTrangLoi = ngay;
    thu.push({ subject: '[tam300] Có trang Facebook không đọc được', htmlBody: loiTrang.map(esc).join('<br>') });
  }
}

function thuBaiMoi(moi) {
  const gio = i => i.timestamp ? new Date(i.timestamp * 1000).toLocaleString('vi-VN', { timeZone: TZ }) : (i.time || '');
  const anh = i => { const m = (i.media || []).find(x => x && (x.thumbnail || (x.photo_image && x.photo_image.uri)));
    return m ? `<img src="${esc(m.thumbnail || m.photo_image.uri)}" style="max-width:100%;max-height:360px;border-radius:8px">` : ''; };
  const ten = i => (i.user && i.user.name) || i.pageName || 'tam300';
  const doan = i => esc(String(i.text || '(bài không có chữ)').slice(0, 1500)).replace(/\n/g, '<br>');
  return {
    subject: `[tam300] ${moi.length > 1 ? moi.length + ' bài mới' : 'Bài mới'}: ${String(moi[moi.length - 1].text || '').replace(/\s+/g, ' ').slice(0, 60)}`,
    htmlBody: moi.slice().reverse().map(i =>
      `<div style="margin:0 0 24px;font-family:sans-serif"><b>${esc(ten(i))}</b> · ${esc(gio(i))}<p>${doan(i)}</p>${anh(i)}` +
      `<p><a href="${esc(i.url || i.facebookUrl || '')}">Mở bài trên Facebook</a></p></div>`).join('<hr>'),
  };
}

function api(token) {
  if (!token) throw new Error('Chưa có APIFY_TOKEN trong Thuộc tính tập lệnh');
  return (method, path, body) => {
    const opt = { method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token } };
    if (body) Object.assign(opt, { contentType: 'application/json', payload: JSON.stringify(body) });
    const r = UrlFetchApp.fetch(API + path, opt), code = r.getResponseCode(), t = r.getContentText();
    if (code >= 300) throw new Error(`Apify trả về HTTP ${code}: ${t.slice(0, 200)}`);
    return JSON.parse(t);
  };
}

function trangThai(p) { try { return JSON.parse(p.getProperty('TRANG_THAI')) || {}; } catch (e) { return {}; } }
function nguoiNhan() { return PropertiesService.getScriptProperties().getProperty('EMAIL') || Session.getEffectiveUser().getEmail(); }
function isoUtc(ms) { return new Date(ms).toISOString().slice(0, 19); } // Apify hiểu "2026-11-26T11:00:06" là giờ UTC
function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

if (typeof module !== 'undefined') module.exports = { buoc, thuBaiMoi, isoUtc, TRAN_THANG };
