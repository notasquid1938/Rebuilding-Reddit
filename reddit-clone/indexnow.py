"""
Tells search engines about pages through IndexNow, so they crawl them without
waiting to find them in the sitemaps. One submission reaches every engine
taking part (Bing, which DuckDuckGo, Yahoo and Ecosia use, plus Yandex, Seznam
and Naver).

Reads site paths (/r/AskReddit, /Thread/abc12) or full URLs on this site, one
per line, from stdin and submits them in batches of up to 10,000, the
protocol's limit. The engines confirm a submission by fetching the key from
/indexnow.txt (pages/indexnow.txt.js), so the website must be running with the
same INDEXNOW_KEY.

Usage: python3 indexnow.py < paths.txt
Environment: INDEXNOW_KEY (8-128 letters, digits or dashes), SITE_URL
(default https://redditrebuilt.com), INDEXNOW_ENDPOINT (default
https://api.indexnow.org/indexnow).
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

BATCH_SIZE = 10000
KEY_RE = re.compile(r'^[A-Za-z0-9-]{8,128}$')


def site_url():
    return os.getenv('SITE_URL', 'https://redditrebuilt.com').rstrip('/')


def to_urls(lines, site):
    """Absolute URLs on `site` for each non-blank line, in order, without repeats.
    Paths are joined to the site; URLs on other hosts are refused, since the
    engines reject a whole batch over one."""
    seen = set()
    urls = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith('/'):
            url = site + line
        elif line == site or line.startswith(site + '/'):
            url = line
        else:
            raise ValueError(f'not a path or a URL on {site}: {line}')
        if url not in seen:
            seen.add(url)
            urls.append(url)
    return urls


def payloads(urls, key, site):
    host = site.split('://', 1)[-1]
    for i in range(0, len(urls), BATCH_SIZE):
        yield {
            'host': host,
            'key': key,
            'keyLocation': f'{site}/indexnow.txt',
            'urlList': urls[i:i + BATCH_SIZE],
        }


def submit(payload, endpoint, opener=urllib.request.urlopen):
    """Posts one batch and returns the HTTP status: 200 or 202 means accepted
    (202 while the engine is still checking the key)."""
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json; charset=utf-8'},
        method='POST',
    )
    try:
        with opener(request, timeout=60) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def main():
    key = os.getenv('INDEXNOW_KEY', '')
    if not KEY_RE.match(key):
        sys.exit('INDEXNOW_KEY must be 8-128 letters, digits or dashes')
    site = site_url()
    endpoint = os.getenv('INDEXNOW_ENDPOINT', 'https://api.indexnow.org/indexnow')
    urls = to_urls(sys.stdin, site)
    failed = 0
    for n, payload in enumerate(payloads(urls, key, site)):
        if n:
            time.sleep(1)
        status = submit(payload, endpoint)
        ok = status in (200, 202)
        failed += not ok
        print(f'{len(payload["urlList"])} URLs: HTTP {status}{"" if ok else " (rejected)"}', flush=True)
    print(f'submitted {len(urls)} URLs')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
