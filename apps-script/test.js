// node apps-script/test.js — kiểm tra phần lọc món đổi giá
const assert = require('assert');
const { cot, locThayDoi } = require('./QuetGia.gs');
const rows = [['Dòng máy (Series)', 'Model cụ thể', 'Dung lượng', 'Tình trạng', 'Giá bán (VNĐ)', 'Giá cũ', 'Ngày cập nhật'],
              ['iPhone 16 Series', 'iPhone 16 Pro', '128GB', 'Likenew', 17200000, 17700000, ''],
              ['iPhone 15 Series', 'iPhone 15', '128GB', 'Likenew', 10900000, '', '']];
const c = cot(rows[0]);
assert.deepStrictEqual([c.series, c.model, c.dl, c.tt, c.gia, c.cu, c.ngay], [0, 1, 2, 3, 4, 5, 6]);
const d = locThayDoi(rows, c, [
  { i: 0, p: '16.900.000' },   // đổi giá → ghi, chuỗi có dấu chấm vẫn đọc được
  { i: 0, p: 16000000 },       // trùng món → bỏ
  { i: 1, p: 10900000 },       // giữ nguyên → bỏ
  { i: 1, p: 30000000 },       // lệch > 30% → bỏ
  { i: 9, p: 1 }], 30);        // không có món → bỏ
assert.deepStrictEqual(d.map(x => [x.n, x.old, x.p]), [[2, 17200000, 16900000]]);
console.log('OK');
