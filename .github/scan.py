"""Quét các sheet trong sheets.txt, lưu bản mới nhất, tab Biến động (nếu có) và lịch sử đổi giá gọn vào data/<id>_<gid>.json."""
import csv as csv_mod
import datetime
import io
import json
import os
import re
import urllib.parse
import urllib.request

VN_TZ = datetime.timezone(datetime.timedelta(hours=7))
NUM_RE = re.compile(r'^[-+]?\s*[$€₫]?\s*\d[\d.,\s]*\s*(?:đ|₫|vnđ|vnd|\$|€|%)?$', re.IGNORECASE)
OLD_COL_RE = re.compile(r'cũ|old|trước|prev', re.IGNORECASE)
MAIN_COL_RE = re.compile(r'giá|price|doanh|tiền|amount|total|tổng', re.IGNORECASE)
MAX_HISTORY_POINTS = 365


def parse_num(value):
    s = str(value or '').strip()
    if not s or not NUM_RE.match(s):
        return None
    t = re.sub(r'[^\d.,-]', '', s)
    if re.match(r'^-?\d{1,3}([.,])\d{3}(\1\d{3})*$', t):
        t = re.sub(r'[.,]', '', t)
    elif '.' in t and ',' in t:
        t = t.replace('.', '').replace(',', '.') if t.rfind(',') > t.rfind('.') else t.replace(',', '')
    else:
        t = t.replace(',', '.')
    try:
        n = float(t)
        return int(n) if n.is_integer() else n
    except ValueError:
        return None


def parse_date_iso(value):
    s = str(value or '').strip()
    m = re.match(r'^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})', s)
    if m:
        d, mo, y = int(m[1]), int(m[2]), int(m[3])
        try:
            return datetime.date(y, mo, d).isoformat()
        except ValueError:
            return None
    m = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})', s)
    if m:
        y, mo, d = int(m[1]), int(m[2]), int(m[3])
        try:
            return datetime.date(y, mo, d).isoformat()
        except ValueError:
            return None
    return None


def detect_columns(headers, rows):
    col_count = max([len(headers)] + [len(r) for r in rows], default=0)
    cols = []
    for j in range(col_count):
        h = (headers[j] if j < len(headers) else '').strip()
        vals = [(r[j] if j < len(r) else '').strip() for r in rows]
        non_empty = [v for v in vals if v]
        if not h and not non_empty:
            continue
        n = len(non_empty) or 1
        if sum(1 for v in non_empty if parse_date_iso(v)) / n >= 0.8:
            ctype = 'date'
        elif sum(1 for v in non_empty if parse_num(v) is not None) / n >= 0.8:
            ctype = 'number'
        else:
            ctype = 'text'
        cols.append({'j': j, 'name': h or f'Cột {j + 1}', 'type': ctype})

    nums = [c for c in cols if c['type'] == 'number']
    texts = [c for c in cols if c['type'] == 'text']
    dates = [c for c in cols if c['type'] == 'date']

    value_col = (
        next((c for c in nums if MAIN_COL_RE.search(c['name']) and not OLD_COL_RE.search(c['name'])), None)
        or next((c for c in nums if not OLD_COL_RE.search(c['name'])), None)
        or (nums[0] if nums else None)
    )
    cmp_col = next((c for c in nums if c is not value_col and OLD_COL_RE.search(c['name'])), None)
    return {
        'value': value_col['j'] if value_col else None,
        'cmp': cmp_col['j'] if cmp_col else None,
        'date': dates[0]['j'] if dates else None,
        'text_indices': [c['j'] for c in texts],
    }


def update_history(prev_history, csv_text, scan_date_iso):
    rows = [r for r in csv_mod.reader(io.StringIO(csv_text)) if any(c.strip() for c in r)]
    if len(rows) < 2:
        return prev_history or {}
    headers, data_rows = rows[0], rows[1:]
    roles = detect_columns(headers, data_rows)
    v_idx = roles['value']
    if v_idx is None:
        return prev_history or {}

    history = {k: [list(pt) for pt in pts] for k, pts in (prev_history or {}).items() if isinstance(pts, list)}
    for r in data_rows:
        if v_idx >= len(r):
            continue
        val = parse_num(r[v_idx])
        if val is None:
            continue
        key = ' | '.join((r[j] if j < len(r) else '').strip() for j in roles['text_indices'])
        if not key:
            continue
        pts = history.setdefault(key, [])
        if not pts:
            old_val = parse_num(r[roles['cmp']]) if roles['cmp'] is not None and roles['cmp'] < len(r) else None
            row_date = parse_date_iso(r[roles['date']]) if roles['date'] is not None and roles['date'] < len(r) else None
            if old_val is not None and old_val != val:
                pts.append(['', old_val])
            pts.append([row_date or scan_date_iso, val])
        elif pts[-1][0] == scan_date_iso:
            pts[-1][1] = val
            if len(pts) >= 2 and pts[-2][1] == val:
                pts.pop()
        elif pts[-1][1] != val:
            pts.append([scan_date_iso, val])

        if len(pts) > MAX_HISTORY_POINTS:
            history[key] = pts[-MAX_HISTORY_POINTS:]

    return history


def scan_sheet_file(sheet_id, gid, csv_text, now_iso, out_dir='data', log_text=None):
    out_path = os.path.join(out_dir, f'{sheet_id}_{gid}.json')
    prev_history = {}
    if os.path.exists(out_path):
        try:
            with open(out_path, encoding='utf-8') as f:
                prev_history = json.load(f).get('history') or {}
        except (OSError, ValueError):
            prev_history = {}

    scan_date_iso = now_iso[:10]
    history = update_history(prev_history, csv_text, scan_date_iso)
    payload = {'time': now_iso, 'csv': csv_text, 'history': history}
    if log_text and 'Giá mới' in log_text.split('\n', 1)[0] and log_text != csv_text:
        payload['log'] = log_text
    os.makedirs(out_dir, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(payload, f, ensure_ascii=False)
    return out_path, len(csv_text.splitlines()), len(payload.get('log', '').splitlines()), len(history)


def main():
    now_iso = datetime.datetime.now(VN_TZ).isoformat(timespec='seconds')
    with open('sheets.txt', encoding='utf-8') as f:
        links = list(f)
    for link in links:
        link = link.strip()
        m = re.search(r'/spreadsheets/d/([\w-]+)', link)
        if not m or link.startswith('#'):
            continue
        gid = (re.search(r'gid=(\d+)', link) or [None, '0'])[1]
        base = f'https://docs.google.com/spreadsheets/d/{m[1]}/gviz/tq?tqx=out:csv&headers=1'
        csv_text = urllib.request.urlopen(f'{base}&gid={gid}').read().decode('utf-8')
        if csv_text.lstrip().startswith('<'):
            raise SystemExit(f'Sheet {m[1]} chưa chia sẻ công khai')
        log_text = urllib.request.urlopen(f"{base}&sheet={urllib.parse.quote('Biến động')}").read().decode('utf-8')
        _, line_count, log_count, item_count = scan_sheet_file(m[1], gid, csv_text, now_iso, log_text=log_text)
        print(m[1], gid, line_count, 'lines', log_count, 'log lines', item_count, 'tracked items')


if __name__ == '__main__':
    main()
