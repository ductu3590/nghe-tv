#!/usr/bin/env python3
"""Check podcast/news audio feeds for a Tizen TV audio app (standard library only).

For each source it reports: whether the feed loads, how many items carry an audio
enclosure, audio types, the newest episode date, cover art, and for the newest audio
file whether the server supports Range requests (needed to seek) and sends CORS headers.

Usage:
  python3 -I check_feeds.py --json app/sources.json  # every RSS source the app uses
  python3 -I check_feeds.py sources.txt            # one feed URL per line, '# name' comments allowed
  python3 -I check_feeds.py --search "VnExpress"   # look up feed URLs in Apple's public podcast index
  python3 -I check_feeds.py --file sample.xml      # parse a local feed file (no network)
"""
import argparse
import email.utils
import json
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

UA = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) CleanYourTizen-feedcheck/0.1'
ITUNES = '{http://www.itunes.com/dtds/podcast-1.0.dtd}'
AUDIO_EXT = ('.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.m3u8')


def fetch(url, method='GET', headers=None, limit=60_000_000, timeout=20):
    request = urllib.request.Request(url, method=method, headers=dict({'User-Agent': UA}, **(headers or {})))
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read(limit) if method == 'GET' else b''
        return response.status, dict(response.headers), body


def parse_feed(data):
    root = ET.fromstring(data)
    channel = root.find('channel')
    if channel is None:
        raise ValueError('not an RSS 2.0 feed (no <channel>)')
    image = channel.find(ITUNES + 'image')
    cover = image.get('href') if image is not None else (channel.findtext('image/url') or None)
    items, newest = [], None
    for item in channel.findall('item'):
        enclosure = item.find('enclosure')
        url = enclosure.get('url') if enclosure is not None else None
        kind = enclosure.get('type', '') if enclosure is not None else ''
        audio = bool(url) and (kind.startswith('audio') or urllib.parse.urlparse(url).path.lower().endswith(AUDIO_EXT))
        date = None
        if item.findtext('pubDate'):
            try:
                date = email.utils.parsedate_to_datetime(item.findtext('pubDate'))
            except (TypeError, ValueError):
                date = None
        if date and (newest is None or date > newest):
            newest = date
        items.append({'title': (item.findtext('title') or '').strip(), 'audio': audio, 'url': url, 'type': kind,
                      'date': date, 'duration': item.findtext(ITUNES + 'duration')})
    return {'title': (channel.findtext('title') or '').strip(), 'cover': cover, 'items': items, 'newest': newest}


def audio_probe(url):
    """Range support lets the TV seek; CORS matters only if the app reads the file via XHR/fetch."""
    try:
        status, headers, _ = fetch(url, headers={'Range': 'bytes=0-1'}, limit=2)
        lower = {k.lower(): v for k, v in headers.items()}
        return {'status': status, 'range': status == 206 or lower.get('accept-ranges') == 'bytes',
                'type': lower.get('content-type'), 'cors': lower.get('access-control-allow-origin')}
    except Exception as error:  # report, never crash the whole run
        return {'error': str(error)[:120]}


def report(name, url, data, probe=True):
    try:
        feed = parse_feed(data)
    except Exception as error:
        print(f'✗ {name}: cannot parse ({str(error)[:100]})')
        return
    audio = [item for item in feed['items'] if item['audio']]
    kinds = sorted({item['type'] or 'unknown' for item in audio})
    newest = feed['newest'].date().isoformat() if feed['newest'] else '?'
    mark = '✓' if audio else '✗'
    print(f'{mark} {name or feed["title"]}: {len(audio)}/{len(feed["items"])} items with audio · types {kinds} · newest {newest}'
          f' · cover {"yes" if feed["cover"] else "no"}')
    if url:
        print(f'    feed: {url}')
    if audio:
        first = audio[0]
        print(f'    latest: {first["title"][:80]} ({first["duration"] or "?"})')
        if probe:
            print(f'    audio file: {audio_probe(first["url"])}')


def rss_sources(path):
    with open(path, encoding='utf-8') as handle:
        data = json.load(handle)
    return [(source['title'], source['url']) for tab in data.get('tabs', []) for source in tab.get('sources', [])
            if source.get('type') == 'rss']


def check_url(name, url):
    try:
        status, headers, body = fetch(url)
        cors = {k.lower(): v for k, v in headers.items()}.get('access-control-allow-origin')
        report(name, url, body)
        print(f'    feed HTTP {status}, CORS: {cors or "none"}')
    except Exception as error:
        print(f'✗ {name or url}: {str(error)[:120]}')


def search_itunes(term):
    query = urllib.parse.urlencode({'term': term, 'media': 'podcast', 'country': 'vn', 'limit': 15})
    _, _, body = fetch('https://itunes.apple.com/search?' + query)
    for result in json.loads(body).get('results', []):
        print(f'{result.get("collectionName")} — {result.get("artistName")}\n    {result.get("feedUrl")}')


def main():
    # Windows consoles and pipes often use cp1252, which cannot print ✓ or Vietnamese: print UTF-8, never crash.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except (AttributeError, ValueError):
            pass
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('sources', nargs='?', help='text file with one feed URL per line')
    parser.add_argument('--search', help='search term for the Apple podcast index (Vietnam store)')
    parser.add_argument('--file', help='local RSS file to parse, no network')
    parser.add_argument('--json', help="the app's sources.json: check every rss source in it")
    args = parser.parse_args()
    if args.file:
        with open(args.file, 'rb') as handle:
            report(args.file, None, handle.read(), probe=False)
    elif args.json:
        for name, url in rss_sources(args.json):
            check_url(name, url)
    elif args.search:
        search_itunes(args.search)
    elif args.sources:
        name = ''
        with open(args.sources, encoding='utf-8') as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                if line.startswith('#'):
                    name = line.lstrip('# ')
                    continue
                check_url(name, line)
                name = ''
    else:
        parser.print_help()
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
