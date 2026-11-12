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

    def __init__(self, root, mounts=None):
        self.server = gopher_server.Server(('127.0.0.1', 0), gopher_server.Handler)
        self.server.log = False
        self.port = self.server.server_address[1]
        self.server.hole = gopher_server.Hole(root, 'testhost', self.port, mounts)
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
        self.assertIn('1Dungeoneer\t/dungeoneer' + self.tail, lines)
        self.assertIn('1Floodgap Systems\t/\tgopher.floodgap.com\t70', lines)
        self.assertIn('iFounded on April 30 1995.\t' + self.tail, lines)
        self.assertFalse([line for line in lines if line.startswith('i#')], 'comments are left out')
        for line in lines[:-2]:
            self.assertEqual(len(line.split('\t')), 4, line)
        self.assertEqual(self.running.ask('/'), self.running.ask(''))

    def test_no_web_links(self):
        # The web pages are on the web server; the hole keeps to gopher.
        lines = self.running.ask('').split('\r\n')
        self.assertFalse([line for line in lines if line.startswith('h')])

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


PROGRAM = '''#!%s
import os
print("i" + "|".join([os.environ["QUERY_STRING"], os.environ["PATH_INFO"],
                      os.environ["SERVER_NAME"], os.environ["SERVER_PORT"],
                      os.path.basename(os.environ["DOCUMENT_ROOT"])]) + "\\t\\terror.host\\t1")
print(".")
'''


class MountTest(unittest.TestCase):
    """Another project's folder, shown as a section of the hole: how
    Dungeoneer writes its part (deploy/dungeoneer-gopher.md)."""

    @classmethod
    def setUpClass(cls):
        cls.work = tempfile.mkdtemp()
        cls.root = os.path.join(cls.work, 'hole')
        cls.section = os.path.join(cls.work, 'dungeoneer')
        os.makedirs(cls.root)
        os.makedirs(os.path.join(cls.section, 'people'))
        os.makedirs(os.path.join(cls.section, 'cgi-bin'))
        with open(os.path.join(cls.root, 'gophermap'), 'w') as f:
            f.write('1Dungeoneer\t/dungeoneer\n')
        with open(os.path.join(cls.section, 'gophermap'), 'w') as f:
            f.write('!Dungeoneer\n1Strangers\tpeople\n7Find a stranger\tcgi-bin/seek\n'
                    '0About\t/dungeoneer/about.txt\n')
        with open(os.path.join(cls.section, 'about.txt'), 'w') as f:
            f.write('Made up on the spot.\n')
        with open(os.path.join(cls.section, 'people', 'gophermap'), 'w') as f:
            f.write('0Someone\tsomeone.txt\n')
        with open(os.path.join(cls.section, '.private'), 'w') as f:
            f.write('hidden')
        for name in ('seek', 'person'):
            script = os.path.join(cls.section, 'cgi-bin', name)
            with open(script, 'w') as f:
                f.write(PROGRAM % sys.executable)
            os.chmod(script, 0o755)
        with open(os.path.join(cls.work, 'secret.txt'), 'w') as f:
            f.write('outside every folder')
        cls.running = Running(cls.root, {'dungeoneer': cls.section})
        cls.tail = '\ttesthost\t%d' % cls.running.port

    @classmethod
    def tearDownClass(cls):
        cls.running.stop()
        shutil.rmtree(cls.work)

    def test_section_menu_with_relative_links(self):
        lines = self.running.ask('/dungeoneer').split('\r\n')
        self.assertEqual(lines[0], 'iDungeoneer\tTITLE' + self.tail)
        self.assertIn('1Strangers\t/dungeoneer/people' + self.tail, lines)
        self.assertIn('7Find a stranger\t/dungeoneer/cgi-bin/seek' + self.tail, lines)
        self.assertIn('0About\t/dungeoneer/about.txt' + self.tail, lines)
        self.assertEqual(self.running.ask('/dungeoneer/'), self.running.ask('/dungeoneer'))

    def test_menus_and_files_inside_the_section(self):
        self.assertIn('0Someone\t/dungeoneer/people/someone.txt' + self.tail,
                      self.running.ask('/dungeoneer/people'))
        self.assertEqual(self.running.ask('/dungeoneer/about.txt'), 'Made up on the spot.\r\n.\r\n')

    def test_search_gets_the_words(self):
        reply = self.running.ask('/dungeoneer/cgi-bin/seek\tlantern')
        self.assertTrue(reply.startswith('ilantern||testhost|%d|dungeoneer\t' % self.running.port), reply)

    def test_program_gets_the_rest_of_the_path(self):
        reply = self.running.ask('/dungeoneer/cgi-bin/person/Elven/k3j9')
        self.assertTrue(reply.startswith('i|/Elven/k3j9|testhost|'), reply)

    def test_the_rest_of_a_path_only_for_programs(self):
        reply = self.running.ask('/dungeoneer/about.txt/more')
        self.assertTrue(reply.startswith('3'), reply)

    def test_nothing_outside_the_section(self):
        for selector in ('/dungeoneer/../secret.txt', '/dungeoneer/.private',
                         '/dungeoneer/cgi-bin/../../secret.txt', '/dungeoneerx'):
            reply = self.running.ask(selector)
            self.assertTrue(reply.startswith('3'), selector)
            self.assertNotIn('outside every folder', reply)

    def test_a_missing_section_is_just_not_here(self):
        # Before the other project's first deploy, its folder may not exist.
        missing = Running(self.root, {'dungeoneer': os.path.join(self.work, 'not-yet')})
        try:
            self.assertTrue(missing.ask('/dungeoneer').startswith('3Not here.'))
            self.assertIn('1Dungeoneer\t/dungeoneer', missing.ask(''))
        finally:
            missing.stop()


if __name__ == '__main__':
    unittest.main()
