#!/usr/bin/env python3
"""GOPHER for the Apple IIe menu.

A "remote" program (see js/apple-IIe-programs.js): the page POSTs
{"input", "state", "columns", "rows"} for each line typed and gets back
{"print", "prompt", "state", "exit"}. Nothing is kept between requests
except a short file cache and the rate limiter; where the visitor is in
gopherspace travels in "state".

Standard library only. Runs as a CGI script under Apache
(Options +ExecCGI, AddHandler cgi-script .cgi).

Being a good neighbour: Floodgap and others ban web-to-gopher proxies
that let crawlers through. This only answers POSTs from the menu's own
pages (checked by Origin), limits each visitor's rate, caches what it
fetches, and only talks to public addresses on the gopher port.
"""

import hashlib
import ipaddress
import json
import os
import re
import socket
import sys
import time
import unicodedata

GOPHER_PORTS = {70}
TIMEOUT_SECONDS = 15
MAX_BYTES = 512 * 1024
MAX_BACK = 20
CACHE_SECONDS = 10 * 60
RATE_LIMIT = 30            # requests per visitor...
RATE_WINDOW_SECONDS = 60   # ...per this many seconds
STATE_DIR = os.environ.get('GOPHER_STATE_DIR', '/tmp/site-menu-gopher')
ALLOWED_ORIGINS = os.environ.get(
    'GOPHER_ALLOWED_ORIGINS',
    'https://www.thoughtrights.com https://thoughtrights.com').split()

# Where BRUN GOPHER starts: a menu of its own, of gopher holes that were
# up and worth a visit in November 2026. (type, text, selector, host, port)
HOME = [
    ('i', 'THOUGHTRIGHTS GOPHER', '', '', 0),
    ('i', '', '', '', 0),
    ('i', 'SEARCH', '', '', 0),
    ('7', 'Search all of Gopherspace (Veronica-2)', '/v2/vs', 'gopher.floodgap.com', 70),
    ('7', 'Search Gopherpedia (Wikipedia)', '/lookup', 'gopherpedia.com', 70),
    ('i', '', '', '', 0),
    ('i', 'PLACES', '', '', 0),
    ('1', 'Floodgap Systems', '/', 'gopher.floodgap.com', 70),
    ('1', 'SDF Public Access UNIX, est. 1987', '/', 'sdf.org', 70),
    ('1', 'quux.org: historic archives', '/', 'gopher.quux.org', 70),
    ('1', 'The Gopher Project', '/Software/Gopher', 'gopher.quux.org', 70),
    ('1', 'Gopherpedia', '/', 'gopherpedia.com', 70),
    ('1', 'Bitreich', '/', 'bitreich.org', 70),
    ('1', 'Circumlunar Space', '/', 'circumlunar.space', 70),
    ('1', 'Mare Tranquillitatis People\'s Circumlunar Zaibatsu', '/', 'zaibatsu.circumlunar.space', 70),
    ('1', 'gopher.icu', '/', 'gopher.icu', 70),
    ('i', '', '', '', 0),
    ('i', 'APPLE II', '', '', 0),
    ('1', 'Apple II Documentation Project', '/active/Apple II Documentation Project',
     'mirrors.apple2.org.za', 70),
    ('1', 'Apple II archive mirrors', '/active', 'mirrors.apple2.org.za', 70),
    ('i', '', '', '', 0),
    ('i', 'NEWS', '', '', 0),
    ('1', 'Latest news feeds (Floodgap)', '/feeds/latest', 'gopher.floodgap.com', 70),
    ('1', 'Hacker News', '/', 'hngopher.com', 70),
    ('1', 'MetaFilter', '/', 'gopher.metafilter.com', 70),
    ('i', '', '', '', 0),
    ('i', 'EVERYWHERE ELSE', '', '', 0),
    ('1', 'All the gopher servers in the world', '/world', 'gopher.floodgap.com', 70),
    ('1', 'New gopher servers since 1999', '/new', 'gopher.floodgap.com', 70),
]

HELP = [
    ' ',
    'NUMBER   GO THERE',
    'RETURN   MORE',
    'U        UP (BACK)',
    'M        MAIN MENU',
    'G URL    GO TO gopher://...',
    'Q        QUIT',
    ' ',
]

# What a classic UNIX gopher client put after each kind of item.
SUFFIX = {'1': '/', '7': ' <?>', '0': '', '2': ' <CSO>', '8': ' <TEL>', 'T': ' <TEL>',
          'h': ' <HTML>', 'I': ' <PICT>', 'g': ' <PICT>', 'p': ' <PICT>', 's': ' <SND>'}
VIEWABLE = {'0', '1', '7'}


class GopherError(Exception):
    """Something to tell the visitor, in the machine's words."""


# --- Fetching -----------------------------------------------------------

def public_address(host, port):
    """The address to connect to, only if host is a public internet host
    and port is the gopher port. Connecting to the address that was
    checked (not the name again) stops DNS tricks."""
    if port not in GOPHER_PORTS or not re.fullmatch(r'[A-Za-z0-9.-]{1,253}', host or ''):
        raise GopherError('NO ANSWER FROM ' + (host or '?'))
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError:
        raise GopherError('NO SUCH HOST ' + host)
    for family, _, _, _, address in infos:
        if ipaddress.ip_address(address[0]).is_global:
            return family, address
    raise GopherError('NO ANSWER FROM ' + host)


def cache_path(*parts):
    key = hashlib.sha256('\t'.join(str(p) for p in parts).encode()).hexdigest()
    return os.path.join(STATE_DIR, 'cache', key)


def fetch(host, port, selector, query=None):
    """The text of a gopher item, from the cache if it is fresh."""
    path = cache_path(host, port, selector, query)
    try:
        if time.time() - os.path.getmtime(path) < CACHE_SECONDS:
            with open(path, encoding='utf-8') as cached:
                return cached.read()
    except OSError:
        pass

    family, address = public_address(host, port)
    request = selector + ('\t' + query if query is not None else '') + '\r\n'
    data = b''
    try:
        with socket.socket(family, socket.SOCK_STREAM) as connection:
            connection.settimeout(TIMEOUT_SECONDS)
            connection.connect(address)
            connection.sendall(request.encode('utf-8'))
            while len(data) < MAX_BYTES:
                chunk = connection.recv(16384)
                if not chunk:
                    break
                data += chunk
    except OSError:
        raise GopherError('NO ANSWER FROM ' + host)
    text = data[:MAX_BYTES].decode('utf-8', 'replace')

    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as cached:
            cached.write(text)
    except OSError:
        pass
    return text


def rate_limited(visitor):
    """True once a visitor goes over RATE_LIMIT requests per window."""
    path = os.path.join(STATE_DIR, 'rate', hashlib.sha256(visitor.encode()).hexdigest())
    now = time.time()
    try:
        with open(path) as stamps:
            recent = [float(t) for t in stamps.read().split() if now - float(t) < RATE_WINDOW_SECONDS]
    except (OSError, ValueError):
        recent = []
    recent.append(now)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w') as stamps:
            stamps.write(' '.join('%.3f' % t for t in recent[-RATE_LIMIT - 1:]))
    except OSError:
        pass
    return len(recent) > RATE_LIMIT


# --- Reading gopher -----------------------------------------------------

def strip_terminator(lines):
    while lines and lines[-1].strip() in ('', '.'):
        lines.pop()
    return lines


def parse_menu(text):
    """Gopher menu lines -> (type, text, selector, host, port)."""
    items = []
    for raw in strip_terminator(text.replace('\r\n', '\n').split('\n')):
        if not raw:
            continue
        fields = raw[1:].split('\t')
        if len(fields) < 4:
            items.append(('i', raw[1:] if raw[0] == 'i' else raw, '', '', 0))
            continue
        try:
            port = int(fields[3].strip() or 70)
        except ValueError:
            port = 70
        items.append((raw[0], fields[0], fields[1], fields[2].strip(), port))
    return items


def parse_url(text):
    """gopher://host[:port]/[type][selector] -> a place, or None."""
    match = re.fullmatch(r'(?:gopher://)?([A-Za-z0-9.-]+)(?::(\d+))?(?:/(.)(.*))?', text.strip())
    if not match:
        return None
    host, port, kind, selector = match.groups()
    return {'t': kind or '1', 's': selector or '', 'h': host, 'p': int(port or 70),
            'n': 'gopher://' + host}


PUNCTUATION = str.maketrans({
    '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u2013': '-',
    '\u2014': '-', '\u2026': '...', '\u00a0': ' ', '\u2500': '-', '\u2501': '-',
    '\u2502': '|', '\u2503': '|'})


def ascii(text):
    """The IIe's character set. Accents come off; anything else becomes
    one "?" so ASCII art keeps its columns."""
    text = unicodedata.normalize('NFKD', text.translate(PUNCTUATION))
    return ''.join(c if c < '\x7f' and (c >= ' ' or c == '\t') else
                   '' if unicodedata.combining(c) else '?' for c in text)


def wrap(text, width):
    """Wrap one line of a text document at spaces, keeping its indent."""
    text = text.rstrip().expandtabs(8)
    if len(text) <= width:
        return [text or ' ']
    indent = re.match(r' *', text).group(0)
    if len(indent) > width // 2:
        indent = ''
    rows, row = [], indent
    for word in text.split():
        while len(word) > width - len(indent):
            if row.strip():
                rows.append(row)
            rows.append(indent + word[:width - len(indent)])
            word, row = word[width - len(indent):], indent
        if len(row) + len(word) + (1 if row.strip() else 0) > width:
            rows.append(row)
            row = indent
        row = row + (' ' if row.strip() else '') + word
    if row.strip():
        rows.append(row)
    return rows


def text_rows(lines, columns):
    """A text document on the screen. Most gopher text is wrapped at 70
    or so columns; on a 40 column screen, rejoin its paragraphs and wrap
    them again, cut ruled lines short, and leave tables and art alone."""
    if all(len(line.expandtabs(8)) <= columns for line in lines):
        return [line.expandtabs(8).rstrip() or ' ' for line in lines]
    rows, paragraph = [], []

    def flush():
        if paragraph:
            rows.extend(wrap(' '.join(paragraph), columns))
            paragraph.clear()

    for line in lines:
        line = line.expandtabs(8).rstrip()
        bare = line.strip()
        if not bare:
            flush()
            rows.append(' ')
        elif re.fullmatch(r'(.)\1{3,}', bare):       # ======== and the like
            flush()
            rows.append(bare[:columns])
        elif '  ' in bare:                            # a table, art, or spaced-out heading
            flush()
            rows.append(line[:columns] if len(line) <= columns or not line.startswith(' ')
                        else bare[:columns])
        elif line.startswith(' ') and not paragraph:  # indented on its own
            flush()
            rows.extend(wrap(line, columns))
        elif re.match(r'[*#]+|[-+] |\d+[.)] ', bare):  # a list item starts a new line
            flush()
            paragraph.append(bare)
        else:
            paragraph.append(bare)
    flush()
    return rows


def screen_rows(place, columns):
    """Everything at a place as screen rows, and its numbered links."""
    if place is None:
        items = HOME
    else:
        text = fetch(place['h'], place['p'], place['s'], place.get('q'))
        if place['t'] == '0':
            lines = [ascii(line) for line in strip_terminator(text.replace('\r\n', '\n').split('\n'))]
            return [' ', place['n'][:columns], ' '] + text_rows(lines, columns), []
        items = parse_menu(text)

    links = [item for item in items if item[0] not in ('i', '3')]
    width = len(str(len(links)))
    rows = [' '] if place is None else [' ', place['n'][:columns], ' ']
    number = 0
    for kind, display, *_ in items:
        display = ascii(display.expandtabs(8)).rstrip()
        if kind in ('i', '3'):
            rows.append((display or ' ')[:columns])  # keep ASCII art lined up
        else:
            number += 1
            rows.append(('%*d. %s%s' % (width, number, display, SUFFIX.get(kind, ' <BIN>')))[:columns])
    return rows, links


def place_from(item):
    kind, display, selector, host, port = item
    return {'t': kind, 's': selector, 'h': host, 'p': port, 'n': ascii(display)}


# --- The program --------------------------------------------------------

def show(state, columns, rows, lead=None):
    """The next screenful at the current place."""
    lines, _ = screen_rows(state['at'], columns)
    size = max(4, rows - 2)
    top = state.get('top', 0)
    state['top'] = top + size
    more = state['top'] < len(lines)
    return {'print': (lead or []) + lines[top:top + size],
            'prompt': 'MORE? ' if more else 'CHOICE? ', 'state': state}


def go(state, place, columns, rows):
    back = state.get('back', []) + [state.get('at')]
    new = {'at': place, 'back': back[-MAX_BACK:], 'top': 0}
    try:
        return show(new, columns, rows)
    except GopherError:
        raise
    except Exception:
        raise GopherError('CAN\'T READ ' + place['h'])


def step(request):
    """One line typed (or the start, when input is null)."""
    columns = 40 if request.get('columns') == 40 else 80
    rows = max(8, min(int(request.get('rows') or 23), 48))
    state = request.get('state') or {}
    text = request.get('input')
    stay = dict(state, top=0)  # redraw from the top of where we are

    if text is None:
        return show({'at': None, 'back': [], 'top': 0}, columns, rows)

    text = text.strip()
    command = text.upper()
    try:
        if state.get('ask'):  # a search item is waiting for words
            item = state.pop('ask')
            if not text:
                return show(stay, columns, rows)
            place = place_from(item)
            place['q'] = text
            place['n'] = place['n'] + ': ' + ascii(text)
            return go(state, place, columns, rows)
        if text == '':
            if state.get('top', 0) < len(screen_rows(state.get('at'), columns)[0]):
                return show(state, columns, rows)
            return {'print': [], 'prompt': 'CHOICE? ', 'state': state}
        if command in ('Q', 'QUIT', 'BYE'):
            return {'print': [' ', 'CONNECTION CLOSED.', ' '], 'exit': True}
        if command in ('?', 'H', 'HELP'):
            return {'print': HELP, 'prompt': 'CHOICE? ', 'state': state}
        if command in ('M', 'MAIN', 'HOME'):
            return go(state, None, columns, rows)
        if command in ('U', 'UP', 'B', 'BACK'):
            back = state.get('back', [])
            if not back:
                return {'print': [' ', 'ALREADY AT THE TOP.', ' '], 'prompt': 'CHOICE? ', 'state': state}
            return show({'at': back[-1], 'back': back[:-1], 'top': 0}, columns, rows)
        if command.startswith('G ') or command.startswith('GOPHER://'):
            place = parse_url(text[2:] if command.startswith('G ') else text)
            if not place:
                return {'print': [' ', '?BAD ADDRESS', ' '], 'prompt': 'CHOICE? ', 'state': state}
            return go(state, place, columns, rows)
        if text.isdigit():
            _, links = screen_rows(state.get('at'), columns)
            number = int(text)
            if not 1 <= number <= len(links):
                return {'print': [' ', '?NO SUCH ITEM', ' '], 'prompt': 'CHOICE? ', 'state': state}
            item = links[number - 1]
            if item[0] not in VIEWABLE:
                return {'print': [' ', 'FILE TYPE MISMATCH', ' '], 'prompt': 'CHOICE? ', 'state': state}
            if item[0] == '7':
                state['ask'] = item
                return {'print': [' ', ascii(item[1])[:columns]], 'prompt': 'SEARCH FOR? ', 'state': state}
            return go(state, place_from(item), columns, rows)
        return {'print': [' ', '?SYNTAX ERROR', ' '], 'prompt': 'CHOICE? ', 'state': state}
    except GopherError as error:
        return {'print': [' ', 'I/O ERROR', str(error)[:columns], ' '], 'prompt': 'CHOICE? ',
                'state': state}


# --- CGI ----------------------------------------------------------------

def respond(status, body):
    sys.stdout.write('Status: %s\r\nContent-Type: application/json\r\n'
                     'Cache-Control: no-store\r\nX-Robots-Tag: noindex\r\n\r\n' % status)
    sys.stdout.write(json.dumps(body))


def main():
    if os.environ.get('REQUEST_METHOD') != 'POST':
        return respond('405 Method Not Allowed', {'error': 'POST only'})
    if os.environ.get('HTTP_ORIGIN') not in ALLOWED_ORIGINS:
        return respond('403 Forbidden', {'error': 'not from this site'})
    if rate_limited(os.environ.get('REMOTE_ADDR', '?')):
        return respond('200 OK', {'print': [' ', 'SYSTEM BUSY. TRY AGAIN SOON.', ' '],
                                  'prompt': 'CHOICE? ', 'state': None})
    try:
        length = min(int(os.environ.get('CONTENT_LENGTH') or 0), 64 * 1024)
        request = json.loads(sys.stdin.read(length) or '{}')
        if not isinstance(request, dict):
            raise ValueError
    except ValueError:
        return respond('400 Bad Request', {'error': 'bad request'})
    try:
        reply = step(request)
    except Exception:  # a hand-made or stale "state"; start over
        reply = {'print': [' ', 'I/O ERROR', ' '], 'prompt': 'CHOICE? ', 'state': None}
    respond('200 OK', reply)


if __name__ == '__main__':
    main()
