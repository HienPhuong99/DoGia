import importlib.util
import json
import os
import tempfile
import unittest

SCAN_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.github', 'scan.py'))
spec = importlib.util.spec_from_file_location('scan', SCAN_PATH)
scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)

SAMPLE_CSV = '''"Dòng máy (Series)","Model cụ thể","Dung lượng","Tình trạng","Giá bán (VNĐ)","Giá cũ","Ngày cập nhật"
"iPhone 16 Series","iPhone 16 Pro Max","256GB","Likenew","20.900.000","21.400.000","18/11/2026"
"iPhone 15 Series","iPhone 15","128GB","Likenew","10.900.000","",""
'''


class ScanTest(unittest.TestCase):
    def test_parse_num(self):
        self.assertEqual(scan.parse_num('32.900.000'), 32900000)
        self.assertEqual(scan.parse_num('500.000đ'), 500000)
        self.assertIsNone(scan.parse_num('256GB'))
        self.assertIsNone(scan.parse_num(''))

    def test_parse_date_iso(self):
        self.assertEqual(scan.parse_date_iso('18/11/2026'), '2026-11-18')
        self.assertEqual(scan.parse_date_iso('2026-11-05'), '2026-11-05')
        self.assertIsNone(scan.parse_date_iso('31/02/2026'))

    def test_update_history_seeds_and_tracks_changes(self):
        h1 = scan.update_history({}, SAMPLE_CSV, '2026-11-18')
        k1 = 'iPhone 16 Series | iPhone 16 Pro Max | 256GB | Likenew'
        k2 = 'iPhone 15 Series | iPhone 15 | 128GB | Likenew'
        self.assertEqual(h1[k1], [['', 21400000], ['2026-11-18', 20900000]])
        self.assertEqual(h1[k2], [['2026-11-18', 10900000]])

        # Ngày tiếp theo giá không đổi -> không tạo điểm thừa
        h2 = scan.update_history(h1, SAMPLE_CSV, '2026-11-19')
        self.assertEqual(h2[k1], h1[k1])

        # Ngày tiếp theo nữa giá đổi -> ghi thêm điểm mới
        changed_csv = SAMPLE_CSV.replace('20.900.000', '20.400.000')
        h3 = scan.update_history(h2, changed_csv, '2026-11-20')
        self.assertEqual(h3[k1][-1], ['2026-11-20', 20400000])

    def test_scan_sheet_file_preserves_and_updates(self):
        log_csv = '"Ngày","Dòng máy (Series)","Model cụ thể","Dung lượng","Tình trạng","Giá cũ","Giá mới","Nguồn"\n"18/11/2026","iPhone 16 Series","iPhone 16 Pro Max","256GB","Likenew","21.400.000","20.900.000","https://example.com"\n'
        with tempfile.TemporaryDirectory() as tmp:
            path, lines, log_lines, count = scan.scan_sheet_file('abc', '0', SAMPLE_CSV, '2026-11-18T10:00:00+07:00', tmp, log_text=log_csv)
            self.assertTrue(os.path.exists(path))
            self.assertEqual(lines, 3)
            self.assertEqual(log_lines, 2)
            self.assertEqual(count, 2)
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
            self.assertEqual(data['time'], '2026-11-18T10:00:00+07:00')
            self.assertIn('history', data)
            self.assertIn('log', data)


if __name__ == '__main__':
    unittest.main()
