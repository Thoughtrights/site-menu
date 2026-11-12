# CI/CD plan

How changes get from this repository to www.thoughtrights.com. Deploys run
from your own machine with one script, the same way the character app
deploys (`~/src/character/deploy/deploy.sh`). Nothing to pay for beyond the
EC2 hosting. Written 2026-11-11; only the checks exist so far.

## In one picture

```
localhost                         GitHub                  EC2 (ubuntu@thoughtrights.com)
tools/dev-server.py  ── PR ──▶  Actions: checks
      │
      └── ./deploy/deploy.sh uat ──── rsync ────▶  /home/ubuntu/build/site-menu-uat  →  /menu-uat/, gopher port 7070
      └── ./deploy/deploy.sh prod ─── rsync ────▶  /home/ubuntu/build/site-menu      →  /menu/ and /, gopher port 70
```

| Environment | Web | Gopher hole | Build dir |
| --- | --- | --- | --- |
| local | http://localhost:8765/ | (none) | the repository (`python3 tools/dev-server.py`) |
| uat | https://www.thoughtrights.com/menu-uat/ | `gopher://thoughtrights.com:7070/` | `/home/ubuntu/build/site-menu-uat` |
| prod | https://www.thoughtrights.com/menu/, and `/` as the front page | `gopher://thoughtrights.com/` (port 70) | `/home/ubuntu/build/site-menu` |

Apache serves each build directory with an `Alias`, as it does for
`/character/` and `/character-uat/`. Each environment's gopher hole is a
tools/gopher-server.py serving that build's `gopher/` folder, on its own port.

## Decided (2026-11-11)

- **UAT is at `/menu-uat/`**, matching `/character-uat/`.
- **UAT gets its own gopher hole**, on port 7070, so gopher changes can be
  tried before prod too.
- **`deploy.sh prod` allows uncommitted changes.** As with the character
  app, the build stamp then reads `<hash>-dirty`, so what's live is never
  mistaken for a clean commit.
- **Every disk is deployed.** Disks we may share (Eamon, ProDOS) are in git
  and go up with everything else. Disks we may not (Karateka, listed in
  `DISKS_NOT_SHIPPED`) stay out of git but still go up, from your machine,
  in their own step.

## Continuous integration (built)

`.github/workflows/checks.yml` runs on every pull request and every push to
`master`: the proxy and site tests and a syntax check of every script. They
catch broken catalog entries, missing files, a lost execute bit, a URL that
assumes `/menu/`, and a commercial disk about to be committed.

Worth adding, both free:

- **Require the checks before merging** (branch protection on `master`).
- **A browser smoke test** later: Playwright on the runner against
  `tools/dev-server.py`, turning the Apple on, running `CATALOG`, booting a
  disk. It would catch the kind of bug the current checks can't see, like the
  Backspace and colour bugs.

## `deploy/deploy.sh`

```bash
./deploy/deploy.sh uat                  # → ubuntu@thoughtrights.com (default)
./deploy/deploy.sh prod
./deploy/deploy.sh prod user@host       # another host
./deploy/deploy.sh prod local           # on the box itself
DEPLOY_HOST=user@host ./deploy/deploy.sh uat
```

Same arguments, defaults and `local` option as the character app's script.
Each run:

1. **Run the tests locally** (`python3 -m unittest discover tests`) and stop
   if they fail. The character script doesn't do this; it's cheap here, with
   no dependencies.
2. **Stamp the build.** Write `html/menu/version.json` with the environment,
   the short commit hash and the date. rsync ships the working tree, not a
   commit, so uncommitted changes mark the hash `-dirty`. The file is
   gitignored.
3. **Sync** `html/` and `gopher/` to the build dir with
   `rsync -av --delete`, so files removed here also leave the server.
   The disks in git (Eamon, ProDOS) go up in this step. Excluded:
   `.git/`, `*~` (including the tracked `assets/command-data.json~`),
   `.DS_Store`, `__pycache__/`, and the disks kept out of git. rsync protects
   excluded files from `--delete`, so the server's Karateka disk survives a
   deploy from a machine without it.
4. **Sync the disks kept out of git, additively, never with `--delete`**:
   each file listed in `DISKS_NOT_SHIPPED` (`tests/test_site.py`) that exists
   locally goes to `html/menu/assets/disks/`. A machine without them leaves
   the server's copies alone and says so. This is the character script's
   coffer-art step.
5. **uat only: point the page at `/menu-uat/`.** The Apple page names its
   mount in one place, `<base href="/menu/">`, and the tests make sure
   nothing else does. The script rewrites that line in the build dir with
   `sed`, as the character script rewrites its shebangs.
6. **Permissions:** `chmod +x` on `html/menu/proxy/gopher.cgi`, and
   `chmod -R a+rX` on `gopher/` with `chmod 755` on `gopher/cgi-bin/search`.
   rsync `-a` keeps modes, but a gopher server skips any script that isn't
   world-readable and executable, and a copy that lost a bit breaks things
   quietly.
7. **Smoke test** the environment's public addresses, from your machine:
   - `version.json` reports the hash just deployed;
   - the Apple page, `assets/command-data.json`, a script and every boot
     disk return 200 (so a disk missing on the server shows up here, not
     as `I/O ERROR` for a visitor);
   - a POST to the gopher proxy returns JSON starting
     `THOUGHTRIGHTS GOPHER`;
   - the environment's gopher hole answers on its port (70 or 7070) with
     the gophermap's title;
   - prod only: `/` returns the Apple page, once the front page is switched
     on.
8. Print `If the vhost changed: sudo systemctl reload apache2`, as the
   character script does.

## Day to day

1. Work on a branch; check it at http://localhost:8765/.
2. Open a pull request; the checks run.
3. `./deploy/deploy.sh uat`, then try it at `/menu-uat/`. Real phones too.
4. Merge, then `./deploy/deploy.sh prod` from `master`.

**Rollback:** deploy the last good commit. `git switch --detach <commit>`,
`./deploy/deploy.sh prod`, then `git switch master`. The Karateka disk is
untouched either way.

## First-time server setup (by hand, once, with your go-ahead)

1. **The vhost**, in the `www.thoughtrights.com` SSL vhost. The menu files
   are static except the proxy, which is CGI:

   ```apache
   # prod: /menu/ from the build dir. Remove these lines to fall back to
   # the old copy in the document root.
   Alias /menu /home/ubuntu/build/site-menu/html/menu
   <Directory /home/ubuntu/build/site-menu/html/menu>
       Require all granted
   </Directory>
   <Directory /home/ubuntu/build/site-menu/html/menu/proxy>
       Options +ExecCGI
       AddHandler cgi-script .cgi
       SetEnv GOPHER_STATE_DIR /var/cache/site-menu-gopher
       # Dungeoneer's hole, once it runs on this host (or gopher.thoughtrights.com)
       # SetEnv GOPHER_EXTRA_HOLES localhost:7071=Dungeoneer
   </Directory>

   # uat: the same, at /menu-uat/, kept out of search engines.
   Alias /menu-uat /home/ubuntu/build/site-menu-uat/html/menu
   <Directory /home/ubuntu/build/site-menu-uat/html/menu>
       Require all granted
       Header set X-Robots-Tag "noindex, nofollow"
   </Directory>
   <Directory /home/ubuntu/build/site-menu-uat/html/menu/proxy>
       Options +ExecCGI
       AddHandler cgi-script .cgi
       SetEnv GOPHER_STATE_DIR /var/cache/site-menu-gopher-uat
   </Directory>
   ```

   `a2enmod cgi headers`, then `apache2ctl configtest` and
   `systemctl reload apache2`.
2. **The proxy's cache directories**, one per environment, writable by
   `www-data` (INSTALLATION.md section 2, step 4).
3. **Deploy uat and check it.** Then deploy prod, which creates its build
   dir, before adding the prod `Alias`, so `/menu/` switches straight to a
   complete copy. (That first prod smoke test fails, because `/menu/` is
   still the old copy; run it again after the reload.)
4. **The Karateka disk** goes up with the first deploy from your machine.
   The copy in the old document root can stay until you remove it.
5. **The two gopher holes.** Ubuntu 20.04 doesn't package Gophernicus, so
   `tools/gopher-server.py` serves them; `deploy.sh` puts it beside each
   build's `gopher/`. Install its two systemd units (INSTALLATION.md
   section 3):

   ```bash
   sudo cp deploy/systemd/site-menu-gopher.service deploy/systemd/site-menu-gopher-uat.service /etc/systemd/system/
   ```

   ```bash
   sudo systemctl daemon-reload
   ```

   ```bash
   sudo systemctl enable --now site-menu-gopher site-menu-gopher-uat
   ```

   Prod listens on 70 and UAT on 7070, each giving its menus the public
   host name and its own port. They run as a throwaway unprivileged user
   that may bind the port and read the build dir. Open inbound TCP 70 and
   7070 in the security group.
6. **The front page,** when wanted: the `DirectoryIndex` line in
   INSTALLATION.md.

## Order of work

1. **In the repository, no server needed:**
   - [x] `deploy/deploy.sh` and `deploy/README.md`, and
     `tests/test_deploy.py`, which runs the script with `local` into a
     temporary directory: the uat rewrite, the excludes, `--delete`, and the
     server's Karateka disk surviving a deploy from a machine without it;
   - [ ] the proxy: today it only talks to port 70 (`GOPHER_PORTS` in
     `gopher.cgi`). Let the vhost add ports and name the environment's own
     hole (say `GOPHER_EXTRA_PORTS=7070` and `GOPHER_HOME=thoughtrights.com:7070`
     for UAT), so `BRUN GOPHER` on UAT lists and can reach UAT's hole.
   Reviewed as a pull request.
2. **On the server, with you:** the first-time setup above.
3. **Later:** branch protection and the browser smoke test.
