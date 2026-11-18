// node apps-script/test.js — kiểm tra phần đọc tam300.com và lọc món đổi giá
const assert = require('assert');
const { quetGia, cot, locThayDoi, timTrang, soTien, docTam300, khoa, loai, ghepGia } = require('./QuetGia.gs');

const head = ['Dòng máy (Series)', 'Model cụ thể', 'Dung lượng', 'Tình trạng', 'Giá bán (VNĐ)', 'Giá cũ', 'Ngày cập nhật'];
const c = cot(head);
assert.deepStrictEqual([c.series, c.model, c.dl, c.tt, c.gia, c.cu, c.ngay], [0, 1, 2, 3, 4, 5, 6]);

assert.deepStrictEqual(['20,9 triệu', '4 triệu', '10 triệu', '950k', '20.900.000đ', '1,5 triệu'].map(soTien),
  [20900000, 4000000, 10000000, 950000, 20900000, 1500000]);
assert.deepStrictEqual(['17tr2', '1 triệu 500k', 'liên hệ'].map(soTien), [null, null, null]); // không đoán giá viết tắt
assert.deepStrictEqual(timTrang('<a href="/iphone/iphone-16-series">a</a><a href="/iphone/iphone-16-series#x">b</a><a href="/thu-mua">c</a>', 'https://tam300.com'),
  ['https://tam300.com/iphone/iphone-16-series']);

// Thẻ sản phẩm giống tam300.com: giá theo màu → lấy giá thấp nhất mỗi dung lượng
const offers = o => JSON.stringify(o).replace(/"/g, '&#34;');
const html =
  `<article class="x" data-product-card data-offers="${offers([{ capacity: '128GB', color: 'Đen', price: '17,2 triệu' }, { capacity: '128GB', color: 'Trắng', price: '18,2 triệu' }, { capacity: '256GB', color: 'Đen', price: '18,2 triệu' }])}"><h3>16 Pro zin nguyên bản, đẹp keng</h3><p>Cấu hình</p></article>` +
  `<article data-product-card data-offers="${offers([{ capacity: '256GB', color: 'Cam', price: '32,9 triệu' }])}"><h3>iPhone 17 Pro Max Newseal VNA</h3></article>`;
const L = docTam300(html).map(l => Object.assign(l, { u: 'https://tam300.com/iphone/x' }));
assert.deepStrictEqual(L.map(l => [l.ten, l.p]), [
  ['iPhone 16 Pro zin nguyên bản, đẹp keng 128GB', 17200000], ['iPhone 16 Pro zin nguyên bản, đẹp keng 256GB', 18200000],
  ['iPhone 17 Pro Max Newseal VNA 256GB', 32900000]]);

assert.strictEqual(khoa('iPhone 15 Pro Max zin nguyên bản 256GB'), '15 pro max|256gb');
assert.strictEqual(khoa('iPhone XS Max 64GB'), 'xs max|64gb');
assert.strictEqual(khoa('iPhone 15 zin 128GB'), '15|128gb');
assert.strictEqual(khoa('iPhone 16e 128GB'), null); // 16e không bị ghép vào iPhone 16
assert.deepStrictEqual(['Likenew', 'Newseal VNA', 'Cũ đẹp', 'Mới 100% chưa kích hoạt', 'zin nguyên bản'].map(loai), ['cu', 'moi', 'cu', 'moi', 'cu']);

const rows = [head,
  ['iPhone 16 Series', 'iPhone 16 Pro', '128GB', 'Likenew', 17200000, 17700000, ''],   // giữ giá
  ['iPhone 16 Series', 'iPhone 16 Pro', '256GB', 'Likenew', 19500000, 20000000, ''],   // đổi giá
  ['iPhone 17 Series', 'iPhone 17 Pro Max', '256GB', 'Newseal VNA', 32900000, '', ''],
  ['iPhone 11 Series', 'iPhone 11', '64GB', 'Likenew', 4000000, '', '']];              // không có trên trang
const items = rows.slice(1).map((r, i) => ({ i, r, gia: r[4] }));
const g = ghepGia(items, L, c);
assert.deepStrictEqual(g.gia.map(x => [x.i, x.p]), [[0, 17200000], [1, 18200000], [2, 32900000]]);
assert.deepStrictEqual(g.thieu.map(x => x.i), [3]);
// 17 Pro Max máy mới không được ăn giá máy cũ
assert.strictEqual(ghepGia([{ i: 0, r: ['', 'iPhone 17 Pro Max', '256GB', 'Likenew', 1], gia: 1 }], L, c).gia.length, 0);
// 2 thẻ cùng model khác giá → mơ hồ, không tự ghi
assert.strictEqual(ghepGia(items.slice(0, 1), [...L, { ten: 'iPhone 16 Pro 128GB', p: 16000000, u: '' }], c).mo.length, 1);

// Chỉ ghi món thật sự đổi giá; bỏ trùng và lệch quá ngưỡng
const d = locThayDoi(rows, c, [...g.gia, { i: 1, p: 1 }, { i: 0, p: 30000000 }], 30);
assert.deepStrictEqual(d.map(x => [x.n, x.old, x.p]), [[3, 19500000, 18200000]]);

// quetGia() với Sheet và mạng giả
let writes, resp;
const tab = (name, data) => ({
  getDataRange: () => ({ getValues: () => data }), getLastRow: () => data.length,
  getRange: (...a) => ({ getValues: () => [['https://tam300.com'], [''], [30]],
    setValue: v => writes.push([name, a.join(','), v]), setValues: v => writes.push([name, a.join(','), v]) }) });
const tabs = { 'Trang tính1': tab('Trang tính1', rows), 'Biến động': tab('Biến động', [['Ngày']]), 'Cấu hình': tab('Cấu hình', []) };
global.SpreadsheetApp = { getActive: () => ({ getSheetByName: n => tabs[n] }) };
global.Utilities = { formatDate: () => '19/11/2026' };
global.UrlFetchApp = { fetch: u => {
  if (resp === 'throw') throw new Error('Address unavailable');
  return { getResponseCode: () => resp, getContentText: () => /series/.test(u) ? html : '<a href="/iphone/iphone-16-series">16</a>' }; } };
const log0 = console.log; console.log = () => {};
// Mạng lỗi hoặc HTTP 503: vẫn ghi LỖI vào Cấu hình!A4:C5 rồi báo lỗi; không sửa giá nào
for (resp of ['throw', 503]) {
  writes = [];
  assert.throws(quetGia);
  assert.deepStrictEqual(writes.map(w => w[0] + ' ' + w[1]), ['Cấu hình A4:C5']);
  assert.match(writes[0][2][0][2], /^LỖI: /);
}
// Bình thường: ghi nhật ký trước, rồi 3 ô của món đổi giá, rồi báo cáo
resp = 200; writes = [];
quetGia();
console.log = log0;
assert.deepStrictEqual(writes.map(w => w[0] + ' ' + w[1]), ['Biến động 2,1,1,9', 'Trang tính1 3,5', 'Trang tính1 3,6', 'Trang tính1 3,7', 'Cấu hình A4:C5']);
assert.deepStrictEqual(writes[0][2][0].slice(5, 8), [19500000, 18200000, -1300000]);
assert.deepStrictEqual(writes[4][2][1].slice(0, 2), ['Cần Gemini xem', 1]); // iPhone 11 64GB không có trên trang
console.log('OK');
