"""Quét giá máy cũ trên hoangkien.com (trang này không có CORS nên phải quét phía server) -> data/hoangkien.json."""
import datetime
import html
import json
import os
import re
import sys
import unicodedata
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scan import VN_TZ, parse_num  # noqa: E402

HK_URLS = [
    'https://www.hoangkien.com/iphone-15-pro-max-256gb',
    'https://www.hoangkien.com/iphone-15-pro-max-512gb',
    'https://www.hoangkien.com/iphone-16-pro-max-256gb',
]
OUT_PATH = os.path.join('data', 'hoangkien.json')
SELECT_RE = re.compile(r'<select[^>]*\bid="product-selectors"[^>]*>(.*?)</select>', re.S | re.I)
OPTION_RE = re.compile(r'<option\b[^>]*>(.*?)</option>', re.S | re.I)


def model_from_url(url):
    """.../iphone-15-pro-max-256gb -> ('iPhone 15 Pro Max', '256GB')"""
    slug = url.rstrip('/').rsplit('/', 1)[-1]
    m = re.match(r'iphone-(.+?)-(\d+(?:gb|tb))$', slug, re.I)
    if not m:
        return '', ''
    words = [w.capitalize() for w in m[1].split('-')]
    return 'iPhone ' + ' '.join(words), m[2].upper()


def parse_options(page_html):
    """Các option "Titan tự nhiên / Pin Zin 8X - 20.000.000₫" -> [{color, condition, price}]."""
    sel = SELECT_RE.search(page_html)
    if not sel:
        return []
    out = []
    for raw in OPTION_RE.findall(sel[1]):
        text = unicodedata.normalize('NFC', html.unescape(re.sub(r'<[^>]+>', '', raw))).strip()
        head, sep, price_txt = text.rpartition(' - ')
        color, sep2, condition = head.partition(' / ')
        price = parse_num(price_txt)
        if not sep or not sep2 or price is None:
            continue
        out.append({'color': color.strip(), 'condition': condition.strip(), 'price': price})
    return out


def scan(urls, fetch, now_iso, prev_items=()):
    items, errors = [], []
    for url in urls:
        model, cap = model_from_url(url)
        try:
            opts = parse_options(fetch(url))
            if not opts:
                raise ValueError('không thấy select#product-selectors')
            items += [{'url': url, 'model': model, 'cap': cap, **o} for o in opts]
        except Exception as e:  # trang lỗi: ghi lỗi, giữ giá cũ của trang đó nếu có
            errors.append({'url': url, 'error': str(e)[:200]})
            items += [it for it in prev_items if it.get('url') == url]
    payload = {'time': now_iso, 'items': items}
    if errors:
        payload['errors'] = errors
    return payload


def fetch_url(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (DoGia price scan)'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')


def main():
    now_iso = datetime.datetime.now(VN_TZ).isoformat(timespec='seconds')
    prev = []
    try:
        with open(OUT_PATH, encoding='utf-8') as f:
            prev = json.load(f).get('items') or []
    except (OSError, ValueError):
        pass
    payload = scan(HK_URLS, fetch_url, now_iso, prev)
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print('hoangkien:', len(payload['items']), 'items,', len(payload.get('errors', [])), 'errors')


if __name__ == '__main__':
    main()
