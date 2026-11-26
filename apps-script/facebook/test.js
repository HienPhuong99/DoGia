// node apps-script/facebook/test.js — giả lập Apify để kiểm tra luồng báo bài mới
const assert = require('assert');
const { buoc, isoUtc, gioNghi, TRAN_THANG } = require('./BaoBaiFacebook.gs');

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
const NOW = Date.parse('2026-11-26T12:00:00Z'); // 19:00 giờ VN
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

// 5. Trang không đọc được → chỉ ghi lại, không gửi mail
run = s.run;
f = giaLap({ [run]: { status: 'SUCCEEDED', defaultDatasetId: 'ds3' } },
  { ds3: [{ url: 'https://www.facebook.com/profile.php?id=61575673269886', error: 'Not a page' }] });
assert.deepStrictEqual(buoc(s, NOW, f), []);
assert.deepStrictEqual(s.loiTrang, ['Not a page']);

// 6. Lỗi liên tiếp → không gửi mail, chỉ đếm; chạy lại được thì xóa lỗi
const hong = (m, p) => { if (p.startsWith('/acts')) throw new Error('Apify trả về HTTP 401: token sai'); return { data: { status: 'FAILED' } }; };
s.run = null;
for (let i = 0; i < 5; i++) assert.deepStrictEqual(buoc(s, NOW, hong), []);
assert.strictEqual(s.loiLienTiep, 5);
assert.match(s.loiCuoi, /401/);
s.run = 'rOk';
f = giaLap({ rOk: { status: 'SUCCEEDED', defaultDatasetId: 'ds4' } }, { ds4: [] });
assert.deepStrictEqual(buoc(s, NOW, f), []);
assert.strictEqual(s.loiLienTiep, 0);

// 7. Lượt treo quá 30 phút → dừng nó, tính là lỗi
run = s.run;
f = giaLap({ [run]: { status: 'RUNNING', startedAt: '2026-11-26T11:00:00Z' } }, {});
assert.deepStrictEqual(buoc(s, NOW, f), []);
assert.ok(f.goi.some(g => /abort$/.test(g[1])));
assert.strictEqual(s.run, null);
assert.strictEqual(s.loiLienTiep, 1);

// 8. Hết hạn mức tháng → không mail, không khởi động lượt mới; sang tháng mới thì chạy lại
s = { tuLuc: '2026-11-26T11:50:00', thang: '2026-11', soBai: TRAN_THANG };
f = giaLap({}, {});
assert.deepStrictEqual(buoc(s, NOW, f), []);
assert.strictEqual(f.goi.length, 0);
buoc(s, Date.parse('2026-12-01T03:10:00Z'), f); // 10:10 giờ VN
assert.strictEqual(s.soBai, 0);
assert.strictEqual(f.goi.length, 1);

// 9. Giờ nghỉ 22:00–08:00 (giờ VN): không khởi động lượt mới, nhưng vẫn đọc và báo lượt đã chạy xong
const vn = (gio) => Date.parse(`2026-11-27T${gio}:00+07:00`);
assert.deepStrictEqual(['07:59', '08:00', '21:59', '22:00', '23:30', '02:00'].map(g => gioNghi(vn(g))), [true, false, false, true, true, true]);
s = { tuLuc: '2026-11-27T14:00:00', run: 'rToi' };
f = giaLap({ rToi: { status: 'SUCCEEDED', defaultDatasetId: 'ds5' } }, { ds5: [bai('p9', vn('21:58') / 1000, 'Bài cuối ngày')] });
thu = buoc(s, vn('22:05'), f);
assert.strictEqual(thu.length, 1);       // bài đăng lúc 21:58 vẫn được báo
assert.strictEqual(s.run, null);         // nhưng không quét tiếp ban đêm
assert.ok(!f.goi.some(g => g[1].startsWith('/acts')));
f = giaLap({}, {});
buoc(s, vn('08:00'), f);                 // 8:00 quét lại, lấy bù từ sau bài cuối đã thấy
assert.strictEqual(f.goi.length, 1);
assert.strictEqual(f.goi[0][2].onlyPostsNewerThan, isoUtc(vn('21:58') + 1000));

console.log('OK — tất cả kiểm tra đều qua');
