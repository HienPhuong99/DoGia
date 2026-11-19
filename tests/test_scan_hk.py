import importlib.util
import os
import sys
import unittest

GH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.github'))
sys.path.insert(0, GH)
spec = importlib.util.spec_from_file_location('scan_hk', os.path.join(GH, 'scan_hk.py'))
hk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hk)

SAMPLE = '''<html><body>
<select id="product-selectors" class="form-control" name="variantId" style="display:none">
  <option selected="selected" value="1">Titan Đen / Pin Zin 8X - 19.500.000₫</option>
  <option value="2">Titan Đen / Pin sạc &#237;t 100% - 20.600.000₫</option>
  <option value="3">Titan tự nhi&#234;n / Pin Zin 8X - 20.000.000₫</option>
  <option value="4">Titan tự nhi&#234;n / M&#225;y New Trần 100% - 23.400.000₫</option>
  <option value="5">Hết hàng</option>
</select>
<select id="other"><option>Không lấy / X - 1.000.000₫</option></select>
</body></html>'''

U1 = 'https://www.hoangkien.com/iphone-15-pro-max-256gb'
U2 = 'https://www.hoangkien.com/iphone-16-pro-max-256gb'


class ScanHKTest(unittest.TestCase):
    def test_model_from_url(self):
        self.assertEqual(hk.model_from_url(U1), ('iPhone 15 Pro Max', '256GB'))
        self.assertEqual(hk.model_from_url('https://x/iphone-16-pro-max-1tb'), ('iPhone 16 Pro Max', '1TB'))

    def test_parse_options_decodes_entities(self):
        opts = hk.parse_options(SAMPLE)
        self.assertEqual(len(opts), 4)
        self.assertEqual(opts[0], {'color': 'Titan Đen', 'condition': 'Pin Zin 8X', 'price': 19500000})
        self.assertEqual(opts[1]['condition'], 'Pin sạc ít 100%')
        self.assertEqual(opts[2], {'color': 'Titan tự nhiên', 'condition': 'Pin Zin 8X', 'price': 20000000})
        self.assertEqual(hk.parse_options('<html></html>'), [])

    def test_scan_keeps_good_pages_and_records_errors(self):
        def fetch(url):
            if url == U2:
                raise OSError('HTTP 503')
            return SAMPLE
        prev = [{'url': U2, 'model': 'iPhone 16 Pro Max', 'cap': '256GB', 'color': 'Titan Đen', 'condition': 'Pin Zin 9X', 'price': 25000000}]
        out = hk.scan([U1, U2], fetch, '2026-11-19T10:00:00+07:00', prev)
        self.assertEqual(out['time'], '2026-11-19T10:00:00+07:00')
        u1_items = [i for i in out['items'] if i['url'] == U1]
        self.assertEqual(len(u1_items), 4)
        self.assertEqual(u1_items[0]['model'], 'iPhone 15 Pro Max')
        self.assertEqual(u1_items[0]['cap'], '256GB')
        self.assertEqual(out['errors'][0]['url'], U2)
        self.assertIn(prev[0], out['items'])  # giữ giá cũ của trang lỗi

    def test_scan_no_errors_key_when_ok(self):
        out = hk.scan([U1], lambda u: SAMPLE, 'now')
        self.assertNotIn('errors', out)


if __name__ == '__main__':
    unittest.main()
