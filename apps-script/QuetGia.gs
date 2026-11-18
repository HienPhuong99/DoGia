// Gemini quét giá mỗi ngày — chỉ ghi những món ĐỔI giá.
// Dán file này vào Google Sheet: Tiện ích mở rộng → Apps Script. Hướng dẫn: apps-script/HUONG-DAN.md
const TAB_GIA = 'Trang tính1', TAB_LOG = 'Biến động', TAB_CFG = 'Cấu hình', TZ = 'Asia/Ho_Chi_Minh';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Theo dõi giá')
    .addItem('Quét giá bằng Gemini ngay', 'quetGia')
    .addItem('Bật quét tự động 9:30 sáng mỗi ngày', 'caiDat')
    .addToUi();
}

// Chạy 1 lần: tạo lịch 9:30 sáng (giờ VN) để 10:00 trang web lấy được giá mới.
function caiDat() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'quetGia').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('quetGia').timeBased().everyDays(1).atHour(9).nearMinute(30).inTimezone(TZ).create();
}

function quetGia() {
  const ss = SpreadsheetApp.getActive();
  const [nguon, model, nguong] = ss.getSheetByName(TAB_CFG).getRange('B1:B3').getValues().flat();
  const urls = String(nguon).trim().split(/\s+/).filter(Boolean);
  if (!urls.length) throw new Error('Chưa điền link nguồn giá ở tab "Cấu hình", ô B1.');
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('Chưa lưu GEMINI_API_KEY trong Cài đặt dự án → Thuộc tính tập lệnh.');

  const sh = ss.getSheetByName(TAB_GIA);
  const rows = sh.getDataRange().getValues();
  const c = cot(rows[0]);
  // Gửi danh sách gọn nhất có thể: "chỉ số|tên|giá" — tiết kiệm token đầu vào.
  const list = rows.slice(1).map((r, i) => r[c.model] && Number(r[c.gia]) ? `${i}|${r[c.model]} ${r[c.dl]} ${r[c.tt]}|${r[c.gia]}` : '').filter(Boolean).join('\n');
  const prompt = `Đọc giá bán hiện tại của từng sản phẩm trên các trang: ${urls.join(' ')}
Danh sách (chỉ số|sản phẩm|giá đang ghi, VNĐ):
${list}
Chỉ trả về JSON là mảng những món có giá trên trang KHÁC giá đang ghi: [{"i":chỉ số,"p":giá mới (số nguyên VNĐ),"u":"link trang có giá"}].
Món giữ nguyên giá hoặc không tìm thấy thì bỏ qua. Không món nào đổi thì trả về []. Không giải thích.`;

  const changes = goiGemini(key, model || 'gemini-3.8-flash', prompt);
  const ngay = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy'); // chuỗi → sheet vi_VN tự hiểu là ngày
  const doi = locThayDoi(rows, c, changes, Number(nguong) || 30);
  doi.forEach(d => {
    sh.getRange(d.n, c.gia + 1).setValue(d.p);
    if (c.cu >= 0) sh.getRange(d.n, c.cu + 1).setValue(d.old);
    if (c.ngay >= 0) sh.getRange(d.n, c.ngay + 1).setValue(ngay);
  });
  if (doi.length) {
    const log = ss.getSheetByName(TAB_LOG);
    const add = doi.map(d => [ngay, d.r[c.series] || '', d.r[c.model], d.r[c.dl], d.r[c.tt], d.old, d.p, d.p - d.old, d.u || urls[0]]);
    log.getRange(log.getLastRow() + 1, 1, add.length, add[0].length).setValues(add);
  }
  console.log(`Gemini báo ${changes.length} món đổi, đã ghi ${doi.length}.`);
}

function cot(head) {
  const f = re => head.findIndex(h => re.test(String(h)));
  return { series: f(/dòng máy|series/i), model: f(/model|sản phẩm/i), dl: f(/dung lượng/i), tt: f(/tình trạng/i),
           gia: f(/giá bán|^giá$/i), cu: f(/giá cũ/i), ngay: f(/ngày/i) };
}

function goiGemini(key, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = { contents: [{ parts: [{ text: prompt }] }], tools: [{ url_context: {} }, { google_search: {} }],
                 generationConfig: { thinkingConfig: { thinkingLevel: 'low' } } };
  const call = b => UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key },
                                             muteHttpExceptions: true, payload: JSON.stringify(b) });
  let res = call(body);
  if (res.getResponseCode() === 400) { delete body.generationConfig; res = call(body); } // model không hỗ trợ thinkingLevel
  if (res.getResponseCode() !== 200) throw new Error(`Gemini lỗi ${res.getResponseCode()}: ${res.getContentText().slice(0, 300)}`);
  const parts = ((JSON.parse(res.getContentText()).candidates || [])[0] || {}).content?.parts || [];
  const m = parts.map(p => p.text || '').join('').match(/\[[\s\S]*\]/);
  return m ? JSON.parse(m[0]) : [];
}

// Giữ lại món thật sự đổi giá; bỏ món lệch quá ngưỡng % (Gemini đọc nhầm).
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

if (typeof module !== 'undefined') module.exports = { cot, locThayDoi };
