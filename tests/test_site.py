"""Tests that the menu's data and files fit together. No browser, no network.

    python3 -m unittest discover tests
"""

import json
import os
import re
import stat
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
MENU = os.path.join(HERE, '..', 'html', 'menu')
MAX_ALIAS_HOPS = 5  # resolveCommand in js/apple-IIe.js gives up after this

# Catalog entries whose disk we've chosen not to ship. See ROADMAP.md.
DISKS_NOT_SHIPPED = {'assets/disks/castle-wolfenstein.dsk'}
ACTIONS = {'print', 'redirect', 'catalog', 'program', 'boot', 'alias', 'reserved'}


def read(*path):
    with open(os.path.join(MENU, *path), encoding='utf-8') as f:
        return f.read()


def normalize(name):
    # As normalizeCommand does in js/apple-IIe.js.
    return ' '.join(name.replace(' ', ' ').split()).upper()


def exists(path):
    return os.path.isfile(os.path.join(MENU, path))


class CommandDataTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        raw = json.loads(read('assets', 'command-data.json'))
        cls.commands = {normalize(name): entry for name, entry in raw.items()}

    def entries(self, action):
        return {name: entry for name, entry in self.commands.items()
                if entry.get('action') == action}

    def test_every_action_is_known(self):
        for name, entry in self.commands.items():
            self.assertIn(entry.get('action'), ACTIONS, name)

    def test_aliases_reach_a_real_command(self):
        for name in self.entries('alias'):
            at, hops = name, 0
            while self.commands[at]['action'] == 'alias':
                at = normalize(self.commands[at]['payload'][0])
                hops += 1
                self.assertIn(at, self.commands, 'alias %s leads nowhere' % name)
                self.assertLessEqual(hops, MAX_ALIAS_HOPS, 'alias %s goes too far' % name)

    def test_catalog_entries_have_a_valid_type(self):
        for name, entry in self.commands.items():
            if 'type' in entry:
                self.assertIn(entry['type'], ('T', 'I', 'A', 'B', 'S', 'R'), name)

    def test_programs_exist(self):
        code = read('js', 'apple-IIe-programs.js')
        defined = set(re.findall(r'^PROGRAMS\.(\w+) =', code, re.M))
        for name, entry in self.entries('program').items():
            self.assertIn(entry['payload'][0], defined, name)

    def test_files_programs_load_exist(self):
        for name, entry in self.entries('program').items():
            program, *args = entry['payload']
            if program == 'zork':
                self.assertTrue(exists('assets/zork/%s.z3' % args[0]), name)
            if program == 'remote':
                self.assertTrue(exists(args[0]), name)

    def test_boot_disks_exist(self):
        for name, entry in self.entries('boot').items():
            disk = entry['payload'][0]
            if disk not in DISKS_NOT_SHIPPED:
                self.assertTrue(exists(disk), '%s needs %s' % (name, disk))

    def test_disks_not_shipped_are_really_absent(self):
        # Once a disk is added, it should get the same check as the others.
        for disk in DISKS_NOT_SHIPPED:
            self.assertFalse(exists(disk), 'remove %s from DISKS_NOT_SHIPPED' % disk)


class FilesTest(unittest.TestCase):

    def test_page_references_exist(self):
        page = read('apple-IIe.html')
        for path in re.findall(r'(?:src|href)="([^"#]+)"', page):
            if not re.match(r'[a-z]+:|//', path):
                self.assertTrue(exists(path), path)

    def test_emulator_files_exist(self):
        for path in ('LICENSE', 'apple2jse.html', 'css/apple2.css', 'json/disks/index.js',
                     'dist/main2e.bundle.js', 'dist/format_worker.bundle.js',
                     'dist/audio_worker.bundle.js',
                     'dist/524.bundle.js',    # the enhanced //e's ROM
                     'dist/685.bundle.js'):   # and its character set
            self.assertTrue(exists('apple2js/' + path), path)

    def test_zork_licence_is_shipped(self):
        self.assertIn('MIT License', read('assets', 'zork', 'LICENSE'))

    def test_proxy_is_executable(self):
        # Apache won't run a CGI without this, and a careless copy loses it.
        mode = os.stat(os.path.join(MENU, 'proxy', 'gopher.cgi')).st_mode
        self.assertTrue(mode & stat.S_IXUSR)


if __name__ == '__main__':
    unittest.main()
