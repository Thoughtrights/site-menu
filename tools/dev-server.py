#!/usr/bin/env python3
"""Serve html/ locally, running *.cgi files the way Apache does.

    python3 tools/dev-server.py [port]     (default 8765)

Then open http://localhost:8765/menu/apple-IIe.html, or from a phone on
the same network, http://<this machine's address>:8765/menu/apple-IIe.html.
The gopher proxy is told to accept whichever of these the page came
from and keeps its cache in /tmp.
"""

import http.server
import os
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'html')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Always revalidate, so a reload picks up edited JS and CSS.
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_POST(self):
        path = os.path.normpath(os.path.join(ROOT, self.path.split('?')[0].lstrip('/')))
        if not path.startswith(os.path.normpath(ROOT)) or not path.endswith('.cgi') or not os.path.isfile(path):
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0))
        # Accept the page wherever it was loaded from: localhost, or this
        # machine's LAN address when testing from a phone.
        origins = {'http://localhost:%d' % PORT, 'http://127.0.0.1:%d' % PORT}
        if self.headers.get('Host'):
            origins.add('http://' + self.headers['Host'])
        env = dict(os.environ,
                   REQUEST_METHOD='POST',
                   CONTENT_LENGTH=str(len(body)),
                   CONTENT_TYPE=self.headers.get('Content-Type', ''),
                   HTTP_ORIGIN=self.headers.get('Origin', ''),
                   REMOTE_ADDR=self.client_address[0],
                   GOPHER_ALLOWED_ORIGINS=' '.join(sorted(origins)))
        result = subprocess.run([sys.executable, path], input=body, env=env,
                                capture_output=True, timeout=60)
        head, _, payload = result.stdout.partition(b'\r\n\r\n')
        status = 200
        headers = []
        for line in head.decode().split('\r\n'):
            name, _, value = line.partition(':')
            if name.lower() == 'status':
                status = int(value.split()[0])
            elif name:
                headers.append((name, value.strip()))
        self.send_response(status)
        for name, value in headers:
            self.send_header(name, value)
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
        if result.stderr:
            sys.stderr.write(result.stderr.decode())


if __name__ == '__main__':
    print('Serving %s on http://localhost:%d/' % (os.path.normpath(ROOT), PORT))
    http.server.ThreadingHTTPServer(('', PORT), Handler).serve_forever()
