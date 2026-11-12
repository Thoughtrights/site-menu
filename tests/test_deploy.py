"""deploy/deploy.sh, run in "local" mode into a temporary folder standing in
for the server. No network, no ssh. Needs bash, rsync, perl and git.

    python3 -m unittest discover tests
"""

import json
import os
import shutil
import stat
import subprocess
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..'))


def read(*path):
    with open(os.path.join(*path), encoding='utf-8') as f:
        return f.read()


def tools_missing():
    return [tool for tool in ('bash', 'rsync', 'perl', 'git') if not shutil.which(tool)]


@unittest.skipIf(tools_missing(), 'needs bash, rsync, perl and git')
class DeployTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # A copy of the repository's tracked files only: what a fresh clone
        # has, so no Karateka disk, no dev copies of other projects.
        cls.work = tempfile.mkdtemp()
        cls.repo = os.path.join(cls.work, 'repo')
        listed = subprocess.run(['git', 'ls-files', '-z'], cwd=REPO, check=True,
                                capture_output=True).stdout.decode().split('\0')
        for path in filter(None, listed):
            source = os.path.join(REPO, path)
            if os.path.isfile(source):
                target = os.path.join(cls.repo, path)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                shutil.copy2(source, target)  # keeps execute bits
        # A stray editor backup, which must not ship.
        open(os.path.join(cls.repo, 'html', 'menu', 'notes.txt~'), 'w').close()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.work)

    def deploy(self, environment):
        dest = os.path.join(self.work, environment)
        disks = os.path.join(dest, 'html', 'menu', 'assets', 'disks')
        os.makedirs(disks, exist_ok=True)
        # On the "server" already: a file that's gone from the repository,
        # and the Karateka disk, which a fresh clone doesn't have.
        with open(os.path.join(dest, 'html', 'menu', 'stale.txt'), 'w') as f:
            f.write('old')
        with open(os.path.join(disks, 'karateka.dsk'), 'w') as f:
            f.write('server copy')
        env = dict(os.environ, DEPLOY_DEST=dest, SKIP_TESTS='1', SKIP_SMOKE='1')
        result = subprocess.run(['bash', os.path.join(self.repo, 'deploy', 'deploy.sh'),
                                 environment, 'local'],
                                env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return os.path.join(dest, 'html', 'menu'), dest

    def test_uat(self):
        menu, dest = self.deploy('uat')
        page = read(menu, 'apple-IIe.html')
        self.assertIn('<base href="/menu-uat/">', page)
        self.assertNotIn('<base href="/menu/">', page)
        stamp = json.loads(read(menu, 'version.json'))
        self.assertEqual(stamp['env'], 'uat')
        # Files removed from the repository leave the server...
        self.assertFalse(os.path.exists(os.path.join(menu, 'stale.txt')))
        # ...but a disk kept out of git stays, from a machine without it.
        self.assertEqual(read(menu, 'assets', 'disks', 'karateka.dsk'), 'server copy')
        # Shipped: the disks in git, the gopher hole. Not: backups, .git.
        self.assertTrue(os.path.isfile(os.path.join(menu, 'assets', 'disks', 'prodos-2.4.3.po')))
        self.assertTrue(os.path.isfile(os.path.join(dest, 'gopher', 'gophermap')))
        self.assertFalse(os.path.exists(os.path.join(menu, 'notes.txt~')))
        self.assertFalse(os.path.exists(os.path.join(menu, 'assets', 'command-data.json~')))
        self.assertFalse(os.path.exists(os.path.join(dest, '.git')))
        for script in (os.path.join(menu, 'proxy', 'gopher.cgi'),
                       os.path.join(dest, 'gopher', 'cgi-bin', 'search')):
            self.assertTrue(os.stat(script).st_mode & stat.S_IXOTH, script)

    def test_prod_keeps_the_menu_mount(self):
        menu, _ = self.deploy('prod')
        page = read(menu, 'apple-IIe.html')
        self.assertIn('<base href="/menu/">', page)
        self.assertEqual(json.loads(read(menu, 'version.json'))['env'], 'prod')

    def test_unknown_environment_is_refused(self):
        result = subprocess.run(['bash', os.path.join(self.repo, 'deploy', 'deploy.sh'), 'staging'],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('usage', result.stderr)


if __name__ == '__main__':
    unittest.main()
