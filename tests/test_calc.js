// node tests/test_calc.js — kiểm tra các hàm thuần trong khối <upgrade-calc> của index.html
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const block = src.match(/\/\* <upgrade-calc>[\s\S]*?\/\* <\/upgrade-calc> \*\//)[0];
const C = new Function(block + '\nreturn { hkTier, hkLookup, calcPA1, calcThuHK, compareUpgrade, COLOR_MAP };')();

// Số liệu 19/11/2026: 15 Pro Max 256GB lên 16 Pro Max 256GB
const r = C.compareUpgrade({ N: 21900000, O_T: 18400000, feeMin: 300000, feeMax: 500000, O_HK: 20000000, type: 'bh', pin: 83, baoTri: false });
assert.deepStrictEqual(r.pa1.bu, [3800000, 4000000]);
assert.strictEqual(r.hk.thu, 18000000);
assert.strictEqual(r.bu2, 3900000);
assert.deepStrictEqual(r.chenh, [-100000, 100000]);
assert.strictEqual(r.verdict, 'hoa');
assert.deepStrictEqual(r.breakEven, [17900000, 18100000]);

// Hết BH, pin 83% -> 0.85*20tr − 500k
assert.strictEqual(C.calcThuHK(20000000, 'het', 83, false).thu, 16500000);
// Còn BH, O_HK < 10tr -> trừ K = 1tr
assert.strictEqual(C.calcThuHK(9000000, 'bh', 83, false).thu, 7100000);
// Pin bảo trì, máy ngoài, < 15tr -> 600k; trừ hình thức
assert.strictEqual(C.calcThuHK(12000000, 'ngoai', 75, true, 200000).thu, 10200000 - 600000 - 200000);
// Pin > 85% không trừ; còn BH không trừ pin
assert.strictEqual(C.calcThuHK(20000000, 'het', 86, false).Dpin, 0);
assert.strictEqual(C.calcThuHK(20000000, 'bh', 80, true).Dpin, 0);

// Chọn tay trường hợp pin (nút như PA1): đè lên % pin
assert.strictEqual(C.calcThuHK(20000000, 'het', 83, 'ok').Dpin, 0);
assert.strictEqual(C.calcThuHK(20000000, 'het', 95, 'mid').Dpin, 500000);
assert.strictEqual(C.calcThuHK(12000000, 'ngoai', 95, 'mid').Dpin, 300000);
assert.strictEqual(C.calcThuHK(20000000, 'het', 95, 'bt').Dpin, 800000);
assert.strictEqual(C.calcThuHK(20000000, 'het', 95, '').pinCase, 'ok');
assert.strictEqual(C.calcThuHK(20000000, 'bh', 83, 'bt').pinCase, null);

// Kết luận theo dấu khoảng chênh
assert.strictEqual(C.compareUpgrade({ N: 21900000, O_T: 18400000, feeMin: 300000, feeMax: 500000, O_HK: 21100000, type: 'bh', pin: 100 }).verdict, 'pa2');
assert.strictEqual(C.compareUpgrade({ N: 21900000, O_T: 18400000, feeMin: 300000, feeMax: 500000, O_HK: 20000000, type: 'het', pin: 83 }).verdict, 'pa1');

// Tầng pin + map màu
assert.strictEqual(C.hkTier(83), 'Pin Zin 8X');
assert.strictEqual(C.hkTier(95), 'Pin Zin 9X');
assert.strictEqual(C.hkTier(100), 'Pin sạc ít 100%');
assert.strictEqual(C.hkTier(79), null);
const items = [
  { model: 'iPhone 15 Pro Max', cap: '256GB', color: 'Titan Trắng', condition: 'Pin Zin 8X', price: 20000000 },
  { model: 'iPhone 15 Pro Max', cap: '256GB', color: 'Titan tự nhiên', condition: 'Pin sạc ít 100%', price: 21100000 },
];
assert.strictEqual(C.hkLookup(items, 'iPhone 15 Pro Max', '256GB', 'Trắng', 83).price, 20000000);
assert.strictEqual(C.hkLookup(items, 'iPhone 15 Pro Max', '256GB', 'Xám', 100).price, 21100000);
assert.strictEqual(C.hkLookup(items, 'iPhone 15 Pro Max', '512GB', 'Trắng', 83), null);
assert.strictEqual(C.hkLookup(null, 'iPhone 15 Pro Max', '256GB', 'Trắng', 83), null);

console.log('test_calc.js OK');
