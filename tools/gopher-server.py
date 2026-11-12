#!/usr/bin/env python3
"""A small gopher server (RFC 1436) for this site's hole, gopher/.

Ubuntu 20.04 doesn't package Gophernicus, so this does the part of its job
the hole needs, with the standard library alone (Python 3.8 and up):

  - a directory's gophermap, in Gophernicus's format: a line with a tab is
    a link (type and name, selector, then host and port, which are filled
    in when missing); a line without one is text; # starts a comment; !
    gives the menu's title; a line holding only . ends it;
  - URL: selectors (web links) as a small HTML page pointing at the URL;
  - text files, with CRLF line endings, dot-stuffing and a closing dot;
  - programs in cgi-bin/, run with QUERY_STRING (what was typed for a
    type 7 search), PATH_INFO (the rest of the selector after the
    program's name: cgi-bin/person/Elven/k3j9), SERVER_NAME, SERVER_PORT
    and DOCUMENT_ROOT, as Gophernicus runs them;
  - other folders as sections of the hole (--mount dungeoneer=FOLDER is
    /dungeoneer), by the same rules, so another project can write its
    own section (deploy/dungeoneer-gopher.md).

It serves nothing outside the root, no hidden files, and no directory
without a gophermap. Requests are one line, at most 1 KB; programs get
10 seconds.

    python3 tools/gopher-server.py --root gopher --host localhost --port 7071

On the server, systemd runs it (deploy/systemd/): prod on port 70, uat on
7070, as an unprivileged user allowed only to bind the port.
"""

import argparse
import html
import os
import re
import socketserver
import subprocess
import sys

MAX_REQUEST = 1024
PROGRAM_SECONDS = 10
CONNECTION_SECONDS = 15
HERE = os.path.dirname(os.path.abspath(__file__))


def error(message):
    return ('3%s\t\terror.host\t1\r\n.\r\n' % message).encode('utf-8')


def crlf(text):
    return text.replace('\r\n', '\n').replace('\r', '\n').replace('\n', '\r\n')


class Hole:
    """Answers one selector with the bytes to send back.

    mounts: other folders shown as sections of the hole, {name: folder},
    so /name/... is served from that folder by the same rules. Another
    project can write its own section without touching this one."""

    def __init__(self, root, host, port, mounts=None):
        self.root = os.path.realpath(root)
        self.host = host
        self.port = str(port)
        self.mounts = {name: os.path.realpath(folder) for name, folder in (mounts or {}).items()}

    def info(self, text, selector=''):
        return 'i%s\t%s\t%s\t%s' % (text, selector, self.host, self.port)

    def resolve(self, selector):
        """What a selector names, or None if it isn't something we serve
        (outside its folder, hidden, or missing): a dict with the path,
        the folder it's in (the root or a mount), that folder's selector,
        and for a program, what follows its name (PATH_INFO)."""
        parts = [part for part in selector.split('/') if part]
        if any(part.startswith('.') for part in parts):
            return None
        base, prefix = self.root, ''
        if parts and parts[0] in self.mounts:
            base, prefix = self.mounts[parts[0]], '/' + parts[0]
            parts = parts[1:]
        extra = []
        if len(parts) > 2 and parts[0] == 'cgi-bin':
            parts, extra = parts[:2], parts[2:]  # cgi-bin/person/Elven/k3j9
        path = os.path.realpath(os.path.join(base, *parts))
        if path != base and not path.startswith(base + os.sep):
            return None
        if not os.path.exists(path):
            return None
        return {'path': path, 'base': base, 'prefix': prefix,
                'path_info': '/' + '/'.join(extra) if extra else ''}

    def menu(self, gophermap, directory):
        """A gophermap as a gopher menu."""
        lines = []
        with open(gophermap, encoding='utf-8', errors='replace') as source:
            for raw in source.read().splitlines():
                if raw.strip() == '.':
                    break
                if raw.startswith('#'):
                    continue
                if raw.startswith('!'):
                    lines.append(self.info(raw[1:].strip(), 'TITLE'))
                    continue
                if '\t' not in raw:
                    lines.append(self.info(raw))
                    continue
                fields = raw.split('\t')
                fields += [''] * (4 - len(fields))
                kind_and_name, selector, host, port = fields[:4]
                if not selector:
                    selector = kind_and_name[1:]
                if not (selector.startswith(('/', 'URL:')) or host):
                    selector = (directory.rstrip('/') + '/' + selector)  # relative to this menu
                lines.append('\t'.join([kind_and_name, selector, host or self.host, port or self.port]))
        return ('\r\n'.join(lines) + '\r\n.\r\n').encode('utf-8')

    def text(self, path):
        with open(path, encoding='utf-8', errors='replace') as source:
            lines = crlf(source.read()).split('\r\n')
        if lines and lines[-1] == '':
            lines.pop()
        stuffed = ['.' + line if line.startswith('.') else line for line in lines]
        return ('\r\n'.join(stuffed) + '\r\n.\r\n').encode('utf-8')

    def program(self, path, query, base, path_info):
        env = {
            'PATH': os.environ.get('PATH', '/usr/bin:/bin'),
            'QUERY_STRING': query,
            'PATH_INFO': path_info,
            'SERVER_NAME': self.host,
            'SERVER_PORT': self.port,
            'DOCUMENT_ROOT': base,
        }
        try:
            result = subprocess.run([path], env=env, cwd=os.path.dirname(path), timeout=PROGRAM_SECONDS,
                                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        except (OSError, subprocess.TimeoutExpired):
            return error('That program did not answer.')
        return crlf(result.stdout.decode('utf-8', 'replace')).encode('utf-8')

    def web_link(self, selector):
        url = html.escape(selector[4:], quote=True)
        page = ('<!DOCTYPE html><html><head><meta charset="utf-8">'
                '<meta http-equiv="refresh" content="1;url=%s"><title>A web link</title></head>'
                '<body><p>This gopher link goes to the web: <a href="%s">%s</a></p></body></html>\r\n'
                % (url, url, url))
        return page.encode('utf-8')

    def answer(self, request):
        """The reply to one request line: selector, then a tab and the
        search words for a type 7 item."""
        selector, _, query = request.partition('\t')
        if selector.startswith('URL:'):
            return self.web_link(selector)
        found = self.resolve(selector)
        if found is None:
            return error('Not here.')
        path, base, prefix = found['path'], found['base'], found['prefix']
        inside = os.path.relpath(path, base).replace(os.sep, '/')
        if os.path.isdir(path):
            gophermap = os.path.join(path, 'gophermap')
            if not os.path.isfile(gophermap):
                return error('Not here.')
            return self.menu(gophermap, (prefix + ('' if inside == '.' else '/' + inside)) or '/')
        if inside.split('/')[0] == 'cgi-bin':
            if not os.access(path, os.X_OK):
                return error('Not here.')
            return self.program(path, query, base, found['path_info'])
        if found['path_info']:
            return error('Not here.')
        return self.text(path)


class Handler(socketserver.StreamRequestHandler):
    timeout = CONNECTION_SECONDS

    def handle(self):
        try:
            line = self.rfile.readline(MAX_REQUEST + 1)
        except OSError:
            return
        if len(line) > MAX_REQUEST:
            self.wfile.write(error('That request is too long.'))
            return
        request = line.decode('utf-8', 'replace').rstrip('\r\n')
        try:
            reply = self.server.hole.answer(request)
        except OSError:
            reply = error('Something went wrong here.')
        try:
            self.wfile.write(reply)
        except OSError:
            pass
        if self.server.log:  # one line per request, for the journal
            print('%s %s' % (self.client_address[0], request.split('\t')[0] or '/'), flush=True)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    log = True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--root', default=os.path.join(HERE, '..', 'gopher'),
                        help='the hole: a directory with a gophermap')
    parser.add_argument('--host', default='localhost', help='the name in menu links')
    parser.add_argument('--port', type=int, default=7070)
    parser.add_argument('--bind', default='', help='the address to listen on (default: all)')
    parser.add_argument('--mount', action='append', default=[], metavar='NAME=FOLDER',
                        help='show FOLDER as the /NAME section (repeatable); it may not exist yet')
    args = parser.parse_args(argv)
    if not os.path.isfile(os.path.join(args.root, 'gophermap')):
        parser.error('no gophermap in ' + args.root)
    mounts = {}
    for mount in args.mount:
        name, _, folder = mount.partition('=')
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', name) or not folder:
            parser.error('--mount wants NAME=FOLDER, NAME in lowercase letters, digits and -')
        mounts[name] = folder
    with Server((args.bind, args.port), Handler) as server:
        server.hole = Hole(args.root, args.host, args.port, mounts)
        for name, folder in sorted(server.hole.mounts.items()):
            print('/%s from %s' % (name, folder), flush=True)
        print('gopher://%s:%d/ from %s' % (args.host, args.port, server.hole.root), flush=True)
        server.serve_forever()


if __name__ == '__main__':
    sys.exit(main())
