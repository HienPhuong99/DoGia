const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');

const SAMPLE_CSV = [
  '"Dòng máy (Series)","Model cụ thể","Dung lượng","Tình trạng","Giá bán (VNĐ)","Giá cũ","Ngày cập nhật"',
  '"iPhone 16 Series","iPhone 16 Pro Max","256GB","Likenew","20.900.000","21.400.000","18/11/2026"',
  '"iPhone 16 Series","iPhone 16 Pro Max","512GB","Likenew","24.300.000","25.000.000","24/10/2026"',
  '"iPhone 15 Series","iPhone 15","128GB","Likenew","10.900.000","",""',
  '"iPhone 15 Series","iPhone 15","256GB","Likenew","12.100.000","",""',
].join('\n');

test('num parses Vietnamese prices and ignores storage specs', () => {
  assert.equal(Core.num('32.900.000'), 32900000);
  assert.equal(Core.num('500.000đ'), 500000);
  assert.equal(Core.num('1,234.5'), 1234.5);
  assert.equal(Core.num('256GB'), null);
  assert.equal(Core.num('18/11/2026'), null);
});

test('date validates calendar dates strictly', () => {
  const d = Core.date('18/11/2026');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 10);
  assert.equal(d.getDate(), 18);
  assert.equal(Core.date('31/02/2026'), null);
  assert.ok(Core.date('2026-11-05'));
});

test('sheetRef parses standard, published, and raw sheet links', () => {
  const r1 = Core.sheetRef('https://docs.google.com/spreadsheets/d/1pXlE41ArlhpHfkVwq83HpsHe2Y5-L6EhdHxBrqOkNdY/edit?gid=123#gid=123');
  assert.equal(r1.id, '1pXlE41ArlhpHfkVwq83HpsHe2Y5-L6EhdHxBrqOkNdY');
  assert.equal(r1.gid, '123');
  const r2 = Core.sheetRef('https://docs.google.com/spreadsheets/d/e/2PACX-1vTestSheetId/pubhtml?gid=0');
  assert.match(r2.csv, /\/pub\?output=csv&gid=0$/);
  assert.equal(Core.sheetRef('https://example.com'), null);
});

test('analyzeColumns detects roles and facet columns', () => {
  const parsed = Core.parseCSV(SAMPLE_CSV);
  const { cols, role, facets } = Core.analyzeColumns(parsed[0], parsed.slice(1));
  assert.equal(role.value, 4);
  assert.equal(role.cmp, 5);
  assert.equal(role.group, 0);
  assert.equal(role.date, 6);
  assert.ok(facets.some(f => f.name === 'Dung lượng'));
  assert.equal(cols.length, 7);
});

test('buildItems merges jsonHistory and calculates verdicts', () => {
  const parsed = Core.parseCSV(SAMPLE_CSV);
  const headers = parsed[0];
  const rows = parsed.slice(1);
  const { cols, role } = Core.analyzeColumns(headers, rows);
  const today = new Date(2026, 10, 18);
  const items = Core.buildItems(rows, cols, role, {
    today,
    jsonHistory: {
      'iPhone 16 Series | iPhone 16 Pro Max | 256GB | Likenew': [['2026-11-01', 21800000], ['2026-11-18', 20900000]],
    },
  });
  const ip16 = items[0];
  assert.equal(ip16.v, 20900000);
  assert.equal(ip16.lo, 20900000);
  assert.equal(ip16.hi, 21800000);
  assert.equal(Core.computeVerdict(ip16).signal, 'buy');
});

test('findVariants sorts storage tiers and calculates price delta', () => {
  const parsed = Core.parseCSV(SAMPLE_CSV);
  const rows = parsed.slice(1);
  const { cols, role } = Core.analyzeColumns(parsed[0], rows);
  const items = Core.buildItems(rows, cols, role, { today: new Date(2026, 10, 18) });
  const variants = Core.findVariants(items[2], items, cols, role);
  assert.ok(variants);
  assert.equal(variants.colName, 'Dung lượng');
  assert.equal(variants.rows.length, 2);
  assert.equal(variants.rows[0].spec, '128GB');
  assert.equal(variants.rows[1].spec, '256GB');
  assert.equal(variants.rows[1].delta, 1200000);
});

test('calcInstallment and calcTradeIn compute exact numbers', () => {
  const inst0 = Core.calcInstallment(20000000, 20, 6, 0);
  assert.equal(inst0.downAmount, 4000000);
  assert.equal(inst0.loanAmount, 16000000);
  assert.equal(inst0.totalInterest, 0);
  assert.equal(inst0.monthlyPayment, 2666667);

  const instRate = Core.calcInstallment(10000000, 0, 10, 1.5);
  assert.equal(instRate.totalInterest, 1500000);
  assert.equal(instRate.monthlyPayment, 1150000);

  const ti = Core.calcTradeIn(20900000, 10900000, 80, 1000000);
  assert.equal(ti.tradeInValue, 9720000);
  assert.equal(ti.netPay, 11180000);
});

test('filterRows, filterItems, buildComparison, and exports work together', () => {
  const parsed = Core.parseCSV(SAMPLE_CSV);
  const rows = parsed.slice(1);
  const { cols, role } = Core.analyzeColumns(parsed[0], rows);
  const today = new Date(2026, 10, 18);
  const items = Core.buildItems(rows, cols, role, { today });
  Core.withPeriod(items, Core.periodStart(items, 30, today), 30);

  const matchedRows = Core.filterRows(rows, cols, role, { q: '16 pro', facets: { 2: '256GB' } });
  assert.equal(matchedRows.length, 1);

  const targets = { [items[0].key]: 21000000 };
  const hitItems = Core.filterItems(items, new Set(rows), { today, quick: 'target', targets });
  assert.equal(hitItems.length, 1);
  assert.equal(hitItems[0].key, items[0].key);

  const cmp = Core.buildComparison([items[0].key, items[1].key], items, cols);
  assert.equal(cmp.cheapest.key, items[0].key);
  assert.equal(cmp.items[1].diffMin, 3400000);

  const csvOut = Core.toCSV(['Tên', 'Giá'], [['iPhone "16"', 20900000]]);
  assert.equal(csvOut, 'Tên,Giá\n"iPhone ""16""",20900000');

  const md = Core.toMarkdownQuote([items[0]], { title: 'Test' });
  assert.match(md, /\*\*Test\*\*/);
  assert.match(md, /20\.900\.000đ/);
});

test('parseLog parses Bien dong tab and attaches events to items', () => {
  const logCSV = [
    '"Ngày","Dòng máy (Series)","Model cụ thể","Dung lượng","Tình trạng","Giá cũ","Giá mới","Chênh lệch","Nguồn"',
    '"24/10/2026","iPhone 16 Series","iPhone 16 Pro Max","256GB","Likenew","21.400.000","21.100.000","-300.000","https://example.com/shop"',
    '"18/11/2026","iPhone 16 Series","iPhone 16 Pro Max","256GB","Likenew","21.100.000","20.900.000","-200.000","Sheet gốc"',
  ].join('\n');
  const parsed = Core.parseCSV(SAMPLE_CSV);
  const rows = parsed.slice(1);
  const { cols, role } = Core.analyzeColumns(parsed[0], rows);
  const log = Core.parseLog(logCSV, SAMPLE_CSV, cols);
  assert.ok(log);
  const items = Core.buildItems(rows, cols, role, { today: new Date(2026, 10, 18), log });
  assert.equal(items[0].ev.length, 2);
  assert.equal(items[0].hi, 21400000);
  assert.equal(items[0].lo, 20900000);
  assert.equal(Core.hostOf(items[0].ev[0].src), 'example.com');
});
