"""Quét các sheet trong sheets.txt, lưu bản mới nhất vào data/<id>_<gid>.json (ghi đè)."""
import datetime, json, os, re, urllib.parse, urllib.request

now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat(timespec='seconds')  # giờ Việt Nam
os.makedirs('data', exist_ok=True)

for link in open('sheets.txt', encoding='utf-8'):
    link = link.strip()
    m = re.search(r'/spreadsheets/d/([\w-]+)', link)
    if not m or link.startswith('#'):
        continue
    gid = (re.search(r'gid=(\d+)', link) or [None, '0'])[1]
    base = f'https://docs.google.com/spreadsheets/d/{m[1]}/gviz/tq?tqx=out:csv&headers=1'
    csv = urllib.request.urlopen(f'{base}&gid={gid}').read().decode('utf-8')
    if csv.lstrip().startswith('<'):
        raise SystemExit(f'Sheet {m[1]} chưa chia sẻ công khai')
    data = {'time': now, 'csv': csv}
    # Tab "Biến động" (Gemini ghi mỗi sáng). Sheet không có tab này thì Google trả về tab đầu -> bỏ qua.
    log = urllib.request.urlopen(f"{base}&sheet={urllib.parse.quote('Biến động')}").read().decode('utf-8')
    if 'Giá mới' in log.split('\n', 1)[0] and log != csv:
        data['log'] = log
    with open(f'data/{m[1]}_{gid}.json', 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False)
    print(m[1], gid, len(csv.splitlines()), 'lines', len(data.get('log', '').splitlines()), 'log lines')
