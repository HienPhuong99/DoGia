import os
import shutil
import subprocess
import unittest

JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'test_calc.js')


@unittest.skipUnless(shutil.which('node'), 'cần node để chạy test JS')
class CalcJsTest(unittest.TestCase):
    def test_upgrade_calc(self):
        r = subprocess.run(['node', JS], capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(r.returncode, 0, r.stderr)


if __name__ == '__main__':
    unittest.main()
