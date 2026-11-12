# Deploying the site menu

From your own machine, the way the character app deploys
(`~/src/character/deploy/deploy.sh`). The whole plan, including the server's
one-time setup, is in [CI-CD-PLAN.md](../CI-CD-PLAN.md).

| Environment | Web | Gopher hole | Build dir |
| --- | --- | --- | --- |
| local | http://localhost:8765/ | (none) | the repository (`python3 tools/dev-server.py`) |
| uat | https://www.thoughtrights.com/menu-uat/ | `gopher://thoughtrights.com:7070/` | `/home/ubuntu/build/site-menu-uat` |
| prod | https://www.thoughtrights.com/menu/, and `/` | `gopher://thoughtrights.com/` | `/home/ubuntu/build/site-menu` |

## Deploying

```bash
./deploy/deploy.sh uat            # push to ubuntu@thoughtrights.com (default)
./deploy/deploy.sh prod
./deploy/deploy.sh prod user@host # another host
./deploy/deploy.sh prod local     # deploy on the box itself
# or set it once for the shell:  export DEPLOY_HOST=user@host
```

Each run:

1. runs the tests, and stops if they fail;
2. writes `html/menu/version.json`: the environment, the commit, the date.
   rsync ships the working tree, so uncommitted changes mark it `-dirty`;
3. syncs `html/` and `gopher/` to the build dir with `--delete`, leaving out
   editor backups (`*~`), the dev server's copies of other projects
   (`html/baseball-cards/`, `html/barzy/`), and the disks kept out of git;
4. copies the disks kept out of git (`DISKS_NOT_SHIPPED` in
   `tests/test_site.py`, today the Karateka disk) from your machine if you
   have them, and never deletes the server's copy;
5. on uat, points the page's `<base href>` at `/menu-uat/`;
6. sets the execute bits on `proxy/gopher.cgi` and the gopher hole's
   scripts;
7. smoke-tests the public addresses: `version.json` shows the new commit,
   the page, catalog, scripts and every boot disk load, the gopher proxy
   answers, and the environment's gopher hole answers on its port.

A failed smoke test exits 1 after deploying. On a first deploy, that's
usually the vhost or the gopher hole not being set up yet.

**Rolling back:** deploy the last good commit.

```bash
git switch --detach <commit>
```

```bash
./deploy/deploy.sh prod
```

```bash
git switch -
```

## Files only on the server

`--delete` removes anything in the build dir that isn't in the repository,
except the disks kept out of git. Before the first deploy to a build dir
that already has files, compare:

```bash
rsync -an --delete --exclude '*~' html gopher ubuntu@thoughtrights.com:/home/ubuntu/build/site-menu/
```

Each file it would delete either moves into the repository, joins
`DISKS_NOT_SHIPPED`, or goes.

## Testing the script

`tests/test_deploy.py` runs it with `local` into a temporary folder, with
these, which are also handy for a dry run:

- `DEPLOY_DEST=dir`: deploy there instead of the build dir;
- `SKIP_TESTS=1`: don't run the tests first;
- `SKIP_SMOKE=1`: don't check the public addresses afterwards.
