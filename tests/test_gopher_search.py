"""Offline tests for gopher/cgi-bin/search, run the way Gophernicus runs it."""

import os
import subprocess
import sys
import unittest

SCRIPT = os.path.join(os.path.dirname(__file__), '..', 'gopher', 'cgi-bin', 'search')
GOPHERMAP = os.path.join(os.path.dirname(__file__), '..', 'gopher', 'gophermap')


def search(words):
    env = {'QUERY_STRING': words, 'SERVER_NAME': 'thoughtrights.com', 'SERVER_PORT': '70',
           'PATH': os.environ.get('PATH', '')}
    out = subprocess.run([sys.executable, SCRIPT], env=env, capture_output=True, text=True, check=True)
    return out.stdout.splitlines()


class SearchTest(unittest.TestCase):
    def test_matches_name_and_description(self):
        lines = search('video stream')
        names = [line.split('\t')[0] for line in lines if not line.startswith(('i', '.'))]
        self.assertEqual(names, ['hBarzy', 'hLocal VDO WebRTC'])

    def test_every_line_is_a_gopher_menu_line(self):
        lines = search('resume')
        self.assertEqual(lines[-1], '.')
        for line in lines[:-1]:
            self.assertEqual(len(line.split('\t')), 4, line)
            self.assertTrue(line.endswith('\tthoughtrights.com\t70'), line)

    def test_no_match_and_no_words(self):
        self.assertIn('iNothing here matches.\t\tthoughtrights.com\t70', search('zzzz'))
        self.assertIn('iNothing here matches.\t\tthoughtrights.com\t70', search(''))


class GophermapTest(unittest.TestCase):
    def test_links_have_two_or_four_fields(self):
        with open(GOPHERMAP, encoding='utf-8') as gophermap:
            for line in gophermap.read().splitlines():
                if '\t' in line and not line.startswith('#'):
                    self.assertIn(len(line.split('\t')), (2, 4), line)


if __name__ == '__main__':
    unittest.main()
