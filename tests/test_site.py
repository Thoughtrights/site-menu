"""Tests that the menu's data and files fit together. No browser, no network.

    python3 -m unittest discover tests
"""

import importlib.util
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
MENU = os.path.join(HERE, '..', 'html', 'menu')
MAX_ALIAS_HOPS = 5  # resolveCommand in js/apple-IIe.js gives up after this

# Catalog entries whose disk stays out of the repository, which is public:
# commercial games we have no permission to share. A copy may sit in your
# working tree for testing or deploying; .gitignore keeps it out of git.
DISKS_NOT_SHIPPED = {'assets/disks/karateka.dsk'}
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
            if program == 'gopher':
                hole = args[0]
                addresses = [hole] if isinstance(hole, str) else [hole[env] for env in ('local', 'uat', 'prod')]
                for address in addresses:
                    self.assertTrue(address.startswith('gopher://'), name)

    def test_boot_disks_exist(self):
        for name, entry in self.entries('boot').items():
            disk = entry['payload'][0]
            if disk not in DISKS_NOT_SHIPPED:
                self.assertTrue(exists(disk), '%s needs %s' % (name, disk))

    def test_disks_not_shipped_stay_out_of_git(self):
        # A local copy is fine; a committed one would be public.
        try:
            tracked = subprocess.run(
                ['git', 'ls-files', '--'] + sorted(DISKS_NOT_SHIPPED),
                cwd=MENU, capture_output=True, text=True, check=True).stdout.split()
        except (OSError, subprocess.CalledProcessError):
            self.skipTest('not a git checkout')
        self.assertEqual(tracked, [], 'these disks must not be committed')

    def test_disks_not_shipped_are_ignored(self):
        # So that `git add .` can't pick one up by accident.
        try:
            result = subprocess.run(
                ['git', 'check-ignore', '--no-index', '--'] + sorted(DISKS_NOT_SHIPPED),
                cwd=MENU, capture_output=True, text=True)
        except OSError:
            self.skipTest('git is not installed')
        if result.returncode > 1:  # 1 means "nothing ignored"
            self.skipTest('not a git checkout')
        ignored = result.stdout.split()
        for disk in DISKS_NOT_SHIPPED:
            self.assertIn(disk, ignored, 'add %s to .gitignore' % disk)


class FilesTest(unittest.TestCase):

    # The page is the front page at / too, so its URLs hang off this base,
    # which deploy/deploy.sh rewrites for uat.
    BASE = '<base href="/menu/">'

    def test_page_references_exist(self):
        page = read('apple-IIe.html').replace(self.BASE, '')
        for path in re.findall(r'(?:src|href)="([^"#]+)"', page):
            if not re.match(r'[a-z]+:|//', path):
                self.assertTrue(exists(path), path)

    def test_only_the_base_names_the_mount(self):
        # Prod is /menu/, uat /menu-uat/. Everything but the base is
        # relative, so rewriting that one line moves the whole page.
        page = read('apple-IIe.html')
        self.assertEqual(page.count(self.BASE), 1)
        page = page.replace(self.BASE, '')
        self.assertEqual(re.findall(r'(?:src|href)="(/(?!/)[^"]*)"', page), [])
        for name in ('apple-IIe.js', 'apple-IIe-programs.js', 'apple-IIe-protovision.js'):
            self.assertNotRegex(read('js', name), r"""['"]/menu/""", name)

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


class PhoneBookTest(unittest.TestCase):
    """What answers the modem: assets/phone-book.json and the systems behind
    its numbers."""

    @classmethod
    def setUpClass(cls):
        cls.book = {number: entry for number, entry in json.loads(read('assets', 'phone-book.json')).items()
                    if not number.startswith('_')}

    def test_numbers_are_in_the_block_for_fiction(self):
        for number in self.book:
            self.assertRegex(number, r'^555-01\d\d$')

    def test_every_system_exists(self):
        code = read('js', 'apple-IIe-programs.js') + read('js', 'apple-IIe-protovision.js')
        defined = set(re.findall(r'^\s*SYSTEMS\.(\w+) =', code, re.M))
        for number, entry in self.book.items():
            if entry['answers'] == 'computer':
                self.assertIn(entry['system'], defined, number)

    def test_protovision_loads_after_the_systems(self):
        page = read('apple-IIe.html')
        self.assertLess(page.index('js/apple-IIe-programs.js'), page.index('js/apple-IIe-protovision.js'))

    @unittest.skipUnless(shutil.which('node'), 'needs node')
    def test_protovision_plays(self):
        # The logon, the talk and every game, played with no browser.
        result = subprocess.run(['node', os.path.join(HERE, 'play_protovision.js')],
                                capture_output=True, text=True, timeout=240)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


class LinkTest(unittest.TestCase):
    """Links straight to a program: /run/baseball, /brun/debt, /open/jobpost.
    The same rule is written three times: in the page, the dev server and
    the Apache config in INSTALLATION.md."""

    RULE = '(run|brun|open)/[A-Za-z0-9 .-]{1,30}'  # as Apache has it
    NAME = re.compile(r'[A-Za-z0-9 .-]{1,30}')

    @classmethod
    def setUpClass(cls):
        raw = json.loads(read('assets', 'command-data.json'))
        cls.commands = {normalize(name): entry for name, entry in raw.items()}
        spec = importlib.util.spec_from_file_location(
            'dev_server', os.path.join(HERE, '..', 'tools', 'dev-server.py'))
        cls.dev_server = importlib.util.module_from_spec(spec)
        with mock.patch.object(sys, 'argv', ['dev-server.py']):  # it reads its port
            spec.loader.exec_module(cls.dev_server)

    def serves_the_apple(self, path):
        handler = object.__new__(self.dev_server.Handler)
        handler.directory = self.dev_server.ROOT
        return handler.translate_path(path) == os.path.join(self.dev_server.ROOT, 'menu', 'apple-IIe.html')

    def test_the_rule_is_the_same_everywhere(self):
        with open(os.path.join(HERE, '..', 'tools', 'dev-server.py'), encoding='utf-8') as f:
            server = f.read()
        with open(os.path.join(HERE, '..', 'INSTALLATION.md'), encoding='utf-8') as f:
            install = f.read()
        # The same verbs and names, in each one's own spelling.
        self.assertTrue(r'\/(run|brun|open)\/([A-Za-z0-9 .-]{1,30})\/?$/i' in read('js', 'apple-IIe.js'))
        self.assertTrue("r'/(?:run|brun|open)/[A-Za-z0-9 .-]{1,30}/?', re.IGNORECASE" in server)
        self.assertEqual(install.count(self.RULE + '/?$" '), 2)  # prod and uat
        self.assertEqual(install.count('apple-IIe.html [NC,L]'), 2)

    def test_every_file_on_the_disk_can_be_linked(self):
        for name, entry in self.commands.items():
            verb, _, rest = name.partition(' ')
            if 'type' in entry and verb in ('RUN', 'BRUN', 'OPEN'):
                self.assertTrue(self.NAME.fullmatch(rest.replace(' ', '-')), name)

    def test_dev_server_serves_links_in_any_case(self):
        for path in ('/brun/debt', '/BRUN/Debt', '/Run/Baseball/', '/open/jobpost',
                     '/brun/zork-iii', '/run/zork%20iii', '/brun/debt?x=1'):
            self.assertTrue(self.serves_the_apple(path), path)

    def test_dev_server_leaves_other_paths_alone(self):
        for path in ('/menu/index.html', '/run', '/run/', '/load/debt', '/run/a/b',
                     '/run/../menu/index.html', '/run/%3Cscript%3E'):
            self.assertFalse(self.serves_the_apple(path), path)


if __name__ == '__main__':
    unittest.main()
