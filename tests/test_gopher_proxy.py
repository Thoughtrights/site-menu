"""Tests for html/menu/proxy/gopher.cgi. No network: fetch is faked.

    python3 -m unittest discover tests
"""

import importlib.machinery
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True  # no __pycache__ next to the CGI in the web root

HERE = os.path.dirname(os.path.abspath(__file__))
CGI = os.path.join(HERE, '..', 'html', 'menu', 'proxy', 'gopher.cgi')

loader = importlib.machinery.SourceFileLoader('gopher_cgi', CGI)
spec = importlib.util.spec_from_loader('gopher_cgi', loader)
gopher = importlib.util.module_from_spec(spec)
loader.exec_module(gopher)

MENU = ('iWelcome!\t\terror.host\t1\r\n'
        '1A directory\t/dir\texample.org\t70\r\n'
        '0A text file\t/file.txt\texample.org\t70\r\n'
        '7A search\t/search\texample.org\t70\r\n'
        '9A binary\t/file.zip\texample.org\t70\r\n'
        '.\r\n')
TEXT = 'Line one\r\nLine two\r\n.\r\n'


def fake_fetch(host, port, selector, query=None):
    if selector == '/file.txt':
        return TEXT
    if selector == '/search':
        return 'iResults for %s\t\terror.host\t1\r\n0Hit\t/file.txt\texample.org\t70\r\n.\r\n' % query
    return MENU


def step(text, state, columns=40):
    return gopher.step({'input': text, 'state': state, 'columns': columns, 'rows': 23})


class ParsingTest(unittest.TestCase):

    def test_menu(self):
        items = gopher.parse_menu(MENU)
        self.assertEqual([item[0] for item in items], ['i', '1', '0', '7', '9'])
        self.assertEqual(items[1], ('1', 'A directory', '/dir', 'example.org', 70))

    def test_url(self):
        self.assertEqual(gopher.parse_url('gopher://sdf.org/1/users'),
                         {'t': '1', 's': '/users', 'h': 'sdf.org', 'p': 70, 'n': 'gopher://sdf.org'})
        self.assertEqual(gopher.parse_url('sdf.org:7070')['p'], 7070)
        self.assertIsNone(gopher.parse_url('http://evil/'))

    def test_ascii(self):
        self.assertEqual(gopher.ascii('café “quoted” — ☃'), 'cafe "quoted" - ?')

    def test_reflow_only_when_too_wide(self):
        narrow = ['short line', '  indented']
        self.assertEqual(gopher.text_rows(narrow, 40), narrow)
        wide = ['This paragraph was wrapped for a much wider screen than the', 'one we have here.']
        rows = gopher.text_rows(wide, 40)
        self.assertTrue(all(len(row) <= 40 for row in rows))
        self.assertEqual(' '.join(rows), ' '.join(wide))

    def test_rules_are_cut(self):
        self.assertEqual(gopher.text_rows(['=' * 70], 40), ['=' * 40])


class SafetyTest(unittest.TestCase):

    def check_refused(self, host, port=70, addresses=('93.184.216.34',)):
        infos = [(2, 1, 6, '', (a, port)) for a in addresses]
        with mock.patch.object(gopher.socket, 'getaddrinfo', return_value=infos):
            with self.assertRaises(gopher.GopherError):
                gopher.public_address(host, port)

    def test_private_and_metadata_addresses_refused(self):
        for address in ('127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.169.254', '::1'):
            self.check_refused('example.org', addresses=(address,))

    def test_other_ports_refused(self):
        for port in (22, 80, 443, 3306, 7070):
            self.check_refused('example.org', port=port)

    def test_odd_host_names_refused(self):
        self.check_refused('exa mple.org')
        self.check_refused('')

    def test_public_address_allowed(self):
        infos = [(2, 1, 6, '', ('93.184.216.34', 70))]
        with mock.patch.object(gopher.socket, 'getaddrinfo', return_value=infos):
            self.assertEqual(gopher.public_address('example.org', 70)[1], ('93.184.216.34', 70))


@mock.patch.object(gopher, 'fetch', side_effect=fake_fetch)
class ProgramTest(unittest.TestCase):

    def test_starts_at_home(self, _):
        reply = step(None, None)
        self.assertIn('THOUGHTRIGHTS GOPHER', reply['print'])
        self.assertTrue(all(len(row) <= 40 for row in reply['print']))
        self.assertEqual(reply['prompt'], 'MORE? ')

    def test_paging_then_choice(self, _):
        state = step(None, None)['state']
        reply = step('', state)
        self.assertEqual(reply['prompt'], 'CHOICE? ')

    def test_follow_up_and_back(self, _):
        state = step('g gopher://example.org/1/', step(None, None)['state'])['state']
        reply = step('1', state)
        self.assertEqual(reply['state']['at']['s'], '/dir')
        reply = step('u', reply['state'])
        self.assertEqual(reply['state']['at']['s'], '/')
        reply = step('u', reply['state'])
        self.assertIsNone(reply['state']['at'])

    def test_text_file(self, _):
        state = step('g gopher://example.org/1/', None)['state']
        reply = step('2', state)
        self.assertIn('Line one', reply['print'])

    def test_search(self, _):
        state = step('g gopher://example.org/1/', None)['state']
        reply = step('3', state)
        self.assertEqual(reply['prompt'], 'SEARCH FOR? ')
        reply = step('apple', reply['state'])
        self.assertIn('Results for apple', reply['print'])

    def test_binary_is_a_type_mismatch(self, _):
        state = step('g gopher://example.org/1/', None)['state']
        self.assertIn('FILE TYPE MISMATCH', step('4', state)['print'])

    def test_bad_number_and_syntax(self, _):
        state = step(None, None)['state']
        self.assertIn('?NO SUCH ITEM', step('99', state)['print'])
        self.assertIn('?SYNTAX ERROR', step('xyzzy', state)['print'])

    def test_quit(self, _):
        reply = step('q', step(None, None)['state'])
        self.assertTrue(reply['exit'])

    def test_back_stack_is_capped(self, _):
        state = step('g gopher://example.org/1/', None)['state']
        for _ in range(gopher.MAX_BACK + 5):
            state = step('1', state)['state']
        self.assertEqual(len(state['back']), gopher.MAX_BACK)


class CgiTest(unittest.TestCase):

    def run_cgi(self, environ, body=''):
        out = io.StringIO()
        env = {'REQUEST_METHOD': 'POST', 'HTTP_ORIGIN': 'https://www.thoughtrights.com',
               'REMOTE_ADDR': '203.0.113.9', 'CONTENT_LENGTH': str(len(body))}
        env.update(environ)
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.dict(os.environ, env, clear=True), \
                mock.patch.object(gopher, 'STATE_DIR', tmp), \
                mock.patch.object(sys, 'stdin', io.StringIO(body)), \
                mock.patch.object(sys, 'stdout', out):
            gopher.main()
        head, _, payload = out.getvalue().partition('\r\n\r\n')
        return head.split('\r\n')[0], json.loads(payload)

    def test_get_refused(self):
        status, _ = self.run_cgi({'REQUEST_METHOD': 'GET'})
        self.assertTrue(status.startswith('Status: 405'))

    def test_other_sites_refused(self):
        status, _ = self.run_cgi({'HTTP_ORIGIN': 'https://elsewhere.example'}, '{}')
        self.assertTrue(status.startswith('Status: 403'))

    def test_start(self):
        status, reply = self.run_cgi({}, json.dumps({'input': None, 'state': None, 'columns': 40}))
        self.assertTrue(status.startswith('Status: 200'))
        self.assertIn('THOUGHTRIGHTS GOPHER', reply['print'])

    def test_garbage_state_starts_over(self):
        body = json.dumps({'input': '1', 'state': {'at': 'nonsense'}, 'columns': 40})
        status, reply = self.run_cgi({}, body)
        self.assertTrue(status.startswith('Status: 200'))
        self.assertIn('I/O ERROR', reply['print'])

    def test_rate_limit(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(gopher, 'STATE_DIR', tmp):
            results = [gopher.rate_limited('203.0.113.9') for _ in range(gopher.RATE_LIMIT + 1)]
        self.assertFalse(any(results[:-1]))
        self.assertTrue(results[-1])


if __name__ == '__main__':
    unittest.main()
