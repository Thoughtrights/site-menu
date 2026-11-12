"""tools/gopher-server.py, running for real on a spare port on this machine.
No network beyond 127.0.0.1.

    python3 -m unittest discover tests
"""

import importlib.machinery
import importlib.util
import os
import shutil
import socket
import sys
import tempfile
import threading
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(HERE, '..', 'tools', 'gopher-server.py')
HOLE = os.path.join(HERE, '..', 'gopher')

loader = importlib.machinery.SourceFileLoader('gopher_server', SERVER)
spec = importlib.util.spec_from_loader('gopher_server', loader)
gopher_server = importlib.util.module_from_spec(spec)
loader.exec_module(gopher_server)


class Running:
    """A server on 127.0.0.1 and a spare port, serving `root`."""

    def __init__(self, root):
        self.server = gopher_server.Server(('127.0.0.1', 0), gopher_server.Handler)
        self.server.log = False
        self.port = self.server.server_address[1]
        self.server.hole = gopher_server.Hole(root, 'testhost', self.port)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def ask(self, request):
        with socket.create_connection(('127.0.0.1', self.port), timeout=10) as connection:
            connection.sendall(request.encode('utf-8') + b'\r\n')
            data = b''
            while True:
                chunk = connection.recv(65536)
                if not chunk:
                    return data.decode('utf-8')
                data += chunk

    def stop(self):
        self.server.shutdown()
        self.server.server_close()


class SiteHoleTest(unittest.TestCase):
    """The site's own gopher/ hole."""

    @classmethod
    def setUpClass(cls):
        cls.running = Running(HOLE)
        cls.tail = '\ttesthost\t%d' % cls.running.port

    @classmethod
    def tearDownClass(cls):
        cls.running.stop()

    def test_top_menu(self):
        lines = self.running.ask('').split('\r\n')
        self.assertEqual(lines[0], 'ithoughtrights.com\tTITLE' + self.tail)
        self.assertEqual(lines[-2:], ['.', ''])
        self.assertIn('7Search this site\t/cgi-bin/search' + self.tail, lines)
        self.assertIn('iFounded on April 30 1995.\t' + self.tail, lines)
        self.assertFalse([line for line in lines if line.startswith('i#')], 'comments are left out')
        for line in lines[:-2]:
            self.assertEqual(len(line.split('\t')), 4, line)
        self.assertEqual(self.running.ask('/'), self.running.ask(''))

    def test_web_links_keep_their_url(self):
        lines = self.running.ask('').split('\r\n')
        barzy = [line for line in lines if line.startswith('hBarzy')]
        self.assertEqual(barzy, ['hBarzy\tURL:https://www.thoughtrights.com/barzy/' + self.tail])

    def test_search_runs_the_program(self):
        lines = self.running.ask('/cgi-bin/search\tvideo stream').split('\r\n')
        names = [line.split('\t')[0] for line in lines if line[:1] not in ('i', '.', '')]
        self.assertEqual(names, ['hBarzy', 'hLocal VDO WebRTC'])
        self.assertTrue(lines[0].endswith(self.tail), lines[0])

    def test_url_selector_is_a_page_pointing_at_it(self):
        page = self.running.ask('URL:https://www.thoughtrights.com/barzy/')
        self.assertIn('href="https://www.thoughtrights.com/barzy/"', page)


class RulesTest(unittest.TestCase):
    """A hole made for the test: what's served, and what isn't."""

    @classmethod
    def setUpClass(cls):
        cls.work = tempfile.mkdtemp()
        cls.root = os.path.join(cls.work, 'hole')
        os.makedirs(os.path.join(cls.root, 'notes'))
        os.makedirs(os.path.join(cls.root, 'empty'))
        os.makedirs(os.path.join(cls.root, 'cgi-bin'))
        with open(os.path.join(cls.root, 'gophermap'), 'w') as f:
            f.write('!Test hole\n# a comment\nWelcome.\n0Read me\treadme.txt\n'
                    '1Notes\tnotes\n1Elsewhere\t/\texample.org\t70\n.\nafter the end\n')
        with open(os.path.join(cls.root, 'readme.txt'), 'w') as f:
            f.write('First line\n.a line starting with a dot\nLast line\n')
        with open(os.path.join(cls.root, '.secret'), 'w') as f:
            f.write('hidden')
        with open(os.path.join(cls.root, 'notes', 'gophermap'), 'w') as f:
            f.write('0A note\tone.txt\n')
        with open(os.path.join(cls.root, 'cgi-bin', 'not-executable'), 'w') as f:
            f.write('#!/bin/sh\necho no\n')
        with open(os.path.join(cls.work, 'outside.txt'), 'w') as f:
            f.write('outside the hole')
        cls.running = Running(cls.root)
        cls.tail = '\ttesthost\t%d' % cls.running.port

    @classmethod
    def tearDownClass(cls):
        cls.running.stop()
        shutil.rmtree(cls.work)

    def is_error(self, reply):
        return reply.startswith('3') and reply.endswith('.\r\n')

    def test_menu_rules(self):
        lines = self.running.ask('').split('\r\n')
        self.assertEqual(lines[0], 'iTest hole\tTITLE' + self.tail)
        self.assertIn('iWelcome.\t' + self.tail, lines)
        self.assertIn('0Read me\t/readme.txt' + self.tail, lines)       # relative, made absolute
        self.assertIn('1Notes\t/notes' + self.tail, lines)
        self.assertIn('1Elsewhere\t/\texample.org\t70', lines)          # another host, kept
        self.assertNotIn('iafter the end\t' + self.tail, lines)         # a lone dot ends it

    def test_menu_in_a_directory(self):
        self.assertIn('0A note\t/notes/one.txt' + self.tail, self.running.ask('/notes'))

    def test_text_file(self):
        reply = self.running.ask('/readme.txt')
        self.assertEqual(reply, 'First line\r\n..a line starting with a dot\r\nLast line\r\n.\r\n')

    def test_nothing_outside_the_root(self):
        for selector in ('/../outside.txt', '../outside.txt', '/notes/../../outside.txt'):
            reply = self.running.ask(selector)
            self.assertTrue(self.is_error(reply), selector)
            self.assertNotIn('outside the hole', reply)

    def test_no_hidden_files_or_bare_directories(self):
        for selector in ('/.secret', '/empty', '/missing', '/cgi-bin/not-executable'):
            self.assertTrue(self.is_error(self.running.ask(selector)), selector)

    def test_long_requests_refused(self):
        self.assertTrue(self.is_error(self.running.ask('/' + 'x' * 2000)))


if __name__ == '__main__':
    unittest.main()
