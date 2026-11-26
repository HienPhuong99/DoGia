// Báo email khi tab "Trao đổi" có tin mới từ Muse hoặc Claude (5 phút kiểm tra 1 lần).
// Dán vào Apps Script của chính Google Sheet "Theo dõi bài đăng Facebook" (Tiện ích mở rộng → Apps Script),
// chạy caiDatTraoDoi 1 lần. Muse/Claude ghi qua API nên onEdit/onChange không bắt được → phải hẹn giờ.
const TAB_TRAO_DOI = 'Trao đổi';

function caiDatTraoDoi() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'kiemTraTraoDoi').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('kiemTraTraoDoi').timeBased().everyMinutes(5).create();
  // Lần đầu: coi như đã báo hết tin đang có, chỉ báo tin thêm sau lúc cài.
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('DA_BAO_DEN_DONG')) p.setProperty('DA_BAO_DEN_DONG', String(SpreadsheetApp.getActive().getSheetByName(TAB_TRAO_DOI).getLastRow()));
}

function kiemTraTraoDoi() {
  const ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(TAB_TRAO_DOI), p = PropertiesService.getScriptProperties();
  const tu = Number(p.getProperty('DA_BAO_DEN_DONG')) || 1, cuoi = sh.getLastRow();
  if (cuoi <= tu) return;
  const tin = tinCanBao(sh.getRange(tu + 1, 1, cuoi - tu, 8).getDisplayValues());
  if (tin.length) {
    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: `[Trao đổi] ${tin.length} tin mới từ ${[...new Set(tin.map(t => t.tu))].join(', ')}`,
      htmlBody: tin.map(t => `<p><b>#${esc(t.id)} ${esc(t.tu)} → ${esc(t.toi)}</b> · ${esc(t.gio)}<br>${esc(t.noiDung).replace(/\n/g, '<br>')}</p>`).join('<hr>') +
        `<p><a href="${ss.getUrl()}#gid=${sh.getSheetId()}">Mở tab Trao đổi</a></p>`,
    });
  }
  p.setProperty('DA_BAO_DEN_DONG', String(cuoi)); // chỉ dời mốc sau khi gửi mail được
}

// Dòng nào là tin của Muse/Claude (không phải chính bạn) thì báo.
function tinCanBao(rows) {
  return rows.filter(r => String(r[4]).trim() && !/^bạn$/i.test(String(r[2]).trim()))
    .map(r => ({ id: r[0], gio: r[1], tu: String(r[2]).trim() || '?', toi: String(r[3]).trim() || '?', noiDung: String(r[4]) }));
}

function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

if (typeof module !== 'undefined') module.exports = { tinCanBao };
