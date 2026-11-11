"""Tests that the menu's data and files fit together. No browser, no network.

    python3 -m unittest discover tests
"""

import json
import os
import re
import stat
import subprocess
import unittest

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
        for name in ('apple-IIe.js', 'apple-IIe-programs.js'):
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


if __name__ == '__main__':
    unittest.main()
