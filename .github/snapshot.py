"""Chụp các sheet trong sheets.txt vào history/<id>_<gid>.csv (một bản/ngày, chỉ thêm khi có thay đổi)."""
import csv, datetime, io, os, re, urllib.request

today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).date().isoformat()  # giờ Việt Nam
os.makedirs('history', exist_ok=True)

for link in open('sheets.txt', encoding='utf-8'):
    link = link.strip()
    m = re.search(r'/spreadsheets/d/([\w-]+)', link)
    if not m or link.startswith('#'):
        continue
    gid = (re.search(r'gid=(\d+)', link) or [None, '0'])[1]
    url = f'https://docs.google.com/spreadsheets/d/{m[1]}/gviz/tq?tqx=out:csv&headers=1&gid={gid}'
    rows = [r for r in csv.reader(io.StringIO(urllib.request.urlopen(url).read().decode('utf-8'))) if any(c.strip() for c in r)]
    head, body = rows[0], rows[1:]
    keep = [j for j, h in enumerate(head) if h.strip() or any(j < len(r) and r[j].strip() for r in body)]
    names = [head[j].strip() or f'Cột {j + 1}' for j in keep]
    body = [[r[j] if j < len(r) else '' for j in keep] for r in body]

    path = f'history/{m[1]}_{gid}.csv'
    old = list(csv.DictReader(open(path, encoding='utf-8'))) if os.path.exists(path) else []
    old = [r for r in old if r['Ngày chụp'] != today]  # chạy nhiều lần/ngày: giữ bản mới nhất
    last = max((r['Ngày chụp'] for r in old), default=None)
    prev = [[r.get(n, '') for n in names] for r in old if r['Ngày chụp'] == last]
    new = [] if prev == body else [dict(zip(['Ngày chụp'] + names, [today] + r)) for r in body]
    fields = ['Ngày chụp'] + names + [k for k in (old[0] if old else {}) if k not in names and k != 'Ngày chụp']
    with open(path, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fields, restval='', extrasaction='ignore')
        w.writeheader()
        w.writerows(old + new)
    print(path, 'added' if new else 'unchanged', len(new))
