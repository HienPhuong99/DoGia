// node apps-script/facebook/test.js — giả lập Apify để kiểm tra luồng báo bài mới
const assert = require('assert');
const { buoc, isoUtc, TRAN_THANG } = require('./BaoBaiFacebook.gs');

// Apify giả: ghi lại các lệnh gọi, trả lời theo bảng
function giaLap(runs, datasets) {
  const goi = [];
  const f = (method, path, body) => {
    goi.push([method, path, body]);
    let m;
    if ((m = path.match(/^\/actor-runs\/(\w+)$/))) return { data: runs[m[1]] };
    if (path.match(/\/abort$/)) return { data: {} };
    if ((m = path.match(/^\/datasets\/(\w+)\/items/))) return datasets[m[1]];
    if (path.startsWith('/acts/apify~facebook-posts-scraper/runs')) return { data: { id: 'run' + goi.length } };
    throw new Error('Apify trả về HTTP 401: token sai');
  };
  f.goi = goi;
  return f;
}
const NOW = Date.parse('2026-11-26T12:00:00Z');
const bai = (id, giay, text) => ({ postId: id, timestamp: giay, text, url: 'https://www.facebook.com/tam300/posts/' + id, user: { name: 'Tâm 300' } });

// 1. Lần đầu: chưa có lượt nào → chỉ khởi động lượt quét với bộ lọc ngày
let s = { tuLuc: '2026-11-26T11:50:00' };
let f = giaLap({}, {});
assert.deepStrictEqual(buoc(s, NOW, f), []);
assert.strictEqual(f.goi.length, 1);
assert.match(f.goi[0][1], /maxTotalChargeUsd=0\.2/);
assert.deepStrictEqual(f.goi[0][2].onlyPostsNewerThan, '2026-11-26T11:50:00');
assert.strictEqual(f.goi[0][2].startUrls.length, 2);
const run1 = s.run;
assert.ok(run1);

// 2. Lượt còn đang chạy → không làm gì
f = giaLap({ [run1]: { status: 'RUNNING', startedAt: '2026-11-26T11:55:00Z' } }, {});
assert.deepStrictEqual(buoc(s, NOW, f), []);
assert.strictEqual(f.goi.length, 1);
assert.strictEqual(s.run, run1);

// 3. Lượt xong, có 2 bài mới → 1 mail gồm 2 bài (bài mới nhất ở đầu), dời mốc ngày, khởi động lượt mới
const t1 = Date.parse('2026-11-26T11:52:00Z') / 1000, t2 = t1 + 120;
f = giaLap({ [run1]: { status: 'SUCCEEDED', defaultDatasetId: 'ds1' } },
  { ds1: [bai('p2', t2, 'Bảo hành 12 tháng <1 đổi 1>'), bai('p1', t1, 'Máy mới về')] });
let thu = buoc(s, NOW, f);
assert.strictEqual(thu.length, 1);
assert.match(thu[0].subject, /2 bài mới/);
assert.ok(thu[0].htmlBody.indexOf('Bảo hành') < thu[0].htmlBody.indexOf('Máy mới về'));
assert.match(thu[0].htmlBody, /&lt;1 đổi 1&gt;/); // chữ trong bài được thoát HTML
assert.strictEqual(s.tuLuc, isoUtc((t2 + 1) * 1000));
assert.strictEqual(s.soBai, 2);
assert.deepStrictEqual(s.daThay, ['p1', 'p2']);
assert.strictEqual(f.goi[f.goi.length - 1][2].onlyPostsNewerThan, s.tuLuc);
assert.notStrictEqual(s.run, run1);

// 4. Apify trả lại bài đã báo → không gửi lại
let run = s.run;
f = giaLap({ [run]: { status: 'SUCCEEDED', defaultDatasetId: 'ds2' } }, { ds2: [bai('p2', t2, 'Bảo hành')] });
assert.deepStrictEqual(buoc(s, NOW, f), []);

// 5. Trang không đọc được → báo 1 lần trong ngày
run = s.run;
const loiTrang = { ds3: [{ url: 'https://www.facebook.com/profile.php?id=61575673269886', error: 'Not a page' }] };
f = giaLap({ [run]: { status: 'SUCCEEDED', defaultDatasetId: 'ds3' } }, loiTrang);
thu = buoc(s, NOW, f);
assert.strictEqual(thu.length, 1);
assert.match(thu[0].subject, /không đọc được/);
run = s.run;
f = giaLap({ [run]: { status: 'SUCCEEDED', defaultDatasetId: 'ds3' } }, loiTrang);
assert.deepStrictEqual(buoc(s, NOW + 600e3, f), []);

// 6. Lỗi liên tiếp → mail cảnh báo đúng 1 lần ở lần thứ 3; chạy lại được → mail báo đã ổn
const hong = (m, p) => { if (p.startsWith('/acts')) throw new Error('Apify trả về HTTP 401: token sai'); return { data: { status: 'FAILED' } }; };
s.run = null;
assert.deepStrictEqual(buoc(s, NOW, hong), []);
assert.deepStrictEqual(buoc(s, NOW, hong), []);
thu = buoc(s, NOW, hong);
assert.strictEqual(thu.length, 1);
assert.match(thu[0].subject, /lỗi/);
assert.deepStrictEqual(buoc(s, NOW, hong), []);
s.run = 'rOk';
f = giaLap({ rOk: { status: 'SUCCEEDED', defaultDatasetId: 'ds4' } }, { ds4: [] });
thu = buoc(s, NOW, f);
assert.strictEqual(thu.length, 1);
assert.match(thu[0].subject, /bình thường/);
assert.strictEqual(s.loiLienTiep, 0);

// 7. Lượt treo quá 30 phút → dừng nó, tính là lỗi, khởi động lượt mới ở lần sau
run = s.run;
f = giaLap({ [run]: { status: 'RUNNING', startedAt: '2026-11-26T11:00:00Z' } }, {});
buoc(s, NOW, f);
assert.ok(f.goi.some(g => /abort$/.test(g[1])));
assert.strictEqual(s.run, null);
assert.strictEqual(s.loiLienTiep, 1);

// 8. Hết hạn mức tháng → mail 1 lần, không khởi động lượt mới; sang tháng mới thì chạy lại
s = { tuLuc: '2026-11-26T11:50:00', thang: '2026-11', soBai: TRAN_THANG };
f = giaLap({}, {});
thu = buoc(s, NOW, f);
assert.strictEqual(thu.length, 1);
assert.strictEqual(f.goi.length, 0);
assert.deepStrictEqual(buoc(s, NOW, f), []);
buoc(s, Date.parse('2026-12-01T00:10:00Z'), f);
assert.strictEqual(s.soBai, 0);
assert.strictEqual(f.goi.length, 1);

console.log('OK — tất cả kiểm tra đều qua');

// Tab Trao đổi: báo tin của Muse/Claude, bỏ tin của chính bạn và dòng trống
const { tinCanBao } = require('./TraoDoi.gs');
const tin = tinCanBao([
  ['2', '26/11/2026 23:10', 'Muse', 'Claude', 'Muse chạy theo lịch 1 giờ/lần', 'Mới', '1', ''],
  ['3', '26/11/2026 23:12', 'Bạn', 'Muse', 'ok', 'Mới', '', ''],
  ['', '', '', '', '', '', '', ''],
  ['4', '26/11/2026 23:15', 'Claude', 'Bạn', 'Đã đọc', 'Mới', '2', '']]);
assert.deepStrictEqual(tin.map(t => [t.id, t.tu]), [['2', 'Muse'], ['4', 'Claude']]);
console.log('OK — Trao đổi');
