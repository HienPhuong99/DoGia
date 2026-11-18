"""Quét các sheet trong sheets.txt, lưu bản mới nhất vào data/<id>_<gid>.json (ghi đè)."""
import datetime, json, os, re, urllib.request

now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat(timespec='seconds')  # giờ Việt Nam
os.makedirs('data', exist_ok=True)

for link in open('sheets.txt', encoding='utf-8'):
    link = link.strip()
    m = re.search(r'/spreadsheets/d/([\w-]+)', link)
    if not m or link.startswith('#'):
        continue
    gid = (re.search(r'gid=(\d+)', link) or [None, '0'])[1]
    url = f'https://docs.google.com/spreadsheets/d/{m[1]}/gviz/tq?tqx=out:csv&headers=1&gid={gid}'
    csv = urllib.request.urlopen(url).read().decode('utf-8')
    if csv.lstrip().startswith('<'):
        raise SystemExit(f'Sheet {m[1]} chưa chia sẻ công khai')
    with open(f'data/{m[1]}_{gid}.json', 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'time': now, 'csv': csv}, f, ensure_ascii=False)
    print(m[1], gid, len(csv.splitlines()), 'lines')
