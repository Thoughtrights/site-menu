#!/bin/bash
# deploy.sh — rsync the Apple IIe site menu to a build directory, from your
# machine, the way ~/src/character/deploy/deploy.sh deploys that app.
#
#   ./deploy/deploy.sh uat                  # → ubuntu@thoughtrights.com (default)
#   ./deploy/deploy.sh prod
#   ./deploy/deploy.sh prod user@host       # another host
#   ./deploy/deploy.sh prod local           # deploy on the box itself
#   DEPLOY_HOST=user@host ./deploy/deploy.sh uat
#
# Apache serves each build dir with an Alias (CI-CD-PLAN.md):
#   prod  /home/ubuntu/build/site-menu      → /menu/ (and / as the front page)
#   uat   /home/ubuntu/build/site-menu-uat  → /menu-uat/
# and each one's gopher/ is a gopher hole: prod on port 70, uat on 7070.
#
# What it does:
#   1. runs the tests, and stops if they fail;
#   2. stamps the build: html/menu/version.json, with "-dirty" when what's
#      shipped has uncommitted changes (rsync ships the working tree);
#   3. syncs html/ and gopher/ to the build dir with --delete, leaving out
#      editor backups, other projects' dev copies, and the disks kept out
#      of git (DISKS_NOT_SHIPPED in tests/test_site.py);
#   4. copies those disks from here if you have them, never deleting the
#      server's copy (as the character script does its coffer art);
#   5. uat only: points the page's <base href> at /menu-uat/;
#   6. sets execute bits for the gopher proxy and the gopher hole;
#   7. smoke-tests the environment's public addresses.
#
# For the tests (tests/test_deploy.py) and dry runs:
#   DEPLOY_DEST=dir    deploy there instead of the build dir
#   SKIP_TESTS=1       don't run the tests first
#   SKIP_SMOKE=1       don't check the public addresses afterwards
set -euo pipefail

ENVIRONMENT="${1:-}"
HOST="${2:-${DEPLOY_HOST:-ubuntu@thoughtrights.com}}"
[ "$HOST" = "local" ] && HOST=""

case "$ENVIRONMENT" in
  prod) DEST="/home/ubuntu/build/site-menu";     MOUNT="/menu/";     GOPHER_PORT=70 ;;
  uat)  DEST="/home/ubuntu/build/site-menu-uat"; MOUNT="/menu-uat/"; GOPHER_PORT=7070 ;;
  *) echo "usage: $0 {prod|uat} [user@host|local]  (default host: ubuntu@thoughtrights.com)" >&2; exit 2 ;;
esac
DEST="${DEPLOY_DEST:-$DEST}"
SITE="https://www.thoughtrights.com"
GOPHER_HOST="thoughtrights.com"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MENU="$REPO_ROOT/html/menu"

run() { if [ -n "$HOST" ]; then ssh "$HOST" "$@"; else bash -c "$*"; fi; }

echo "==> Deploying '$ENVIRONMENT' -> ${HOST:+$HOST:}$DEST"

# 1. the tests: the catalog, the files it needs, the proxy, the mount.
if [ -z "${SKIP_TESTS:-}" ]; then
  echo "==> Tests"
  (cd "$REPO_ROOT" && python3 -m unittest discover -s tests -q) || {
    echo "    tests failed: nothing deployed" >&2; exit 1; }
fi

# 2. the build stamp. The build dir carries no .git, so this is the only
#    record of what's running there.
GIT_HASH="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
if ! git -C "$REPO_ROOT" diff --quiet HEAD -- html gopher 2>/dev/null; then
  GIT_HASH="${GIT_HASH}-dirty"
fi
printf '{"env": "%s", "hash": "%s", "date": "%s"}\n' \
  "$ENVIRONMENT" "$GIT_HASH" "$(date -u +%Y-%m-%d)" > "$MENU/version.json"
echo "    build stamp: $GIT_HASH"

# The disks kept out of git, as paths under html/menu/.
NOT_SHIPPED="$(cd "$REPO_ROOT" && python3 -c \
  'import sys; sys.path.insert(0, "tests"); import test_site; print("\n".join(sorted(test_site.DISKS_NOT_SHIPPED)))')"

# 3. html/ and gopher/, landing as $DEST/html and $DEST/gopher. Excluded
#    files are also protected from --delete, so the server's copies of the
#    disks kept out of git survive a deploy from a machine without them.
RSYNC_OPTS=(-a --delete
  --exclude '.git/'
  --exclude '*~'                  # editor backups, like assets/command-data.json~
  --exclude '.DS_Store'
  --exclude '__pycache__/'
  --exclude '/html/baseball-cards/'   # the dev server's copies of other projects
  --exclude '/html/barzy/')
while IFS= read -r disk; do
  [ -n "$disk" ] && RSYNC_OPTS+=(--exclude "/html/menu/$disk")
done <<< "$NOT_SHIPPED"

echo "==> Syncing html/, gopher/ and the gopher server"
run "mkdir -p '$DEST'"
# tools/gopher-server.py lands beside the hole as $DEST/gopher-server.py, not
# inside it, so its source isn't served (deploy/systemd/ runs it).
if [ -n "$HOST" ]; then
  rsync "${RSYNC_OPTS[@]}" "$REPO_ROOT/html" "$REPO_ROOT/gopher" "$REPO_ROOT/tools/gopher-server.py" "$HOST:$DEST/"
else
  rsync "${RSYNC_OPTS[@]}" "$REPO_ROOT/html" "$REPO_ROOT/gopher" "$REPO_ROOT/tools/gopher-server.py" "$DEST/"
fi

# 4. the disks kept out of git, additively: never --delete here.
while IFS= read -r disk; do
  [ -z "$disk" ] && continue
  if [ -f "$MENU/$disk" ]; then
    echo "==> Copying $disk (kept out of git)"
    target="$DEST/html/menu/$(dirname "$disk")/"
    run "mkdir -p '$target'"
    if [ -n "$HOST" ]; then
      rsync -a "$MENU/$disk" "$HOST:$target"
    else
      rsync -a "$MENU/$disk" "$target"
    fi
  else
    echo "    (no local $disk: the server's copy, if any, is left alone)"
  fi
done <<< "$NOT_SHIPPED"

# 5. uat lives at /menu-uat/. The page names its mount in one place, the
#    <base href>, and the tests make sure nothing else does.
if [ "$MOUNT" != "/menu/" ]; then
  echo "==> Pointing the page at $MOUNT"
  run "perl -pi -e 's#<base href=\"/menu/\">#<base href=\"$MOUNT\">#' '$DEST/html/menu/apple-IIe.html'"
fi

# 6. execute bits. rsync -a keeps them, but a copy that lost one breaks the
#    proxy or the gopher hole quietly. Gophernicus skips any script that
#    isn't world-readable and executable.
run "chmod 755 '$DEST/html/menu/proxy/gopher.cgi' '$DEST/gopher-server.py' && chmod -R a+rX '$DEST/gopher' && if [ -d '$DEST/gopher/cgi-bin' ]; then find '$DEST/gopher/cgi-bin' -type f -exec chmod 755 {} +; fi"

# 7. smoke test: the environment as visitors reach it.
if [ -n "${SKIP_SMOKE:-}" ]; then
  echo "==> Done (smoke test skipped)."
  exit 0
fi
BASE="$SITE$MOUNT"
FAILED=0
check() {  # check "what" command...
  local what="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "    ok    $what"; else echo "    FAIL  $what"; FAILED=1; fi
}
echo "==> Smoke test: $BASE"
check "version.json says $GIT_HASH" sh -c "curl -fsS '${BASE}version.json' | grep -q '\"$GIT_HASH\"'"
check "the Apple page"                curl -fsSI "${BASE}apple-IIe.html"
check "the catalog"                   curl -fsSI "${BASE}assets/command-data.json"
check "a script"                      curl -fsSI "${BASE}js/apple-IIe.js"
while IFS= read -r disk; do
  [ -n "$disk" ] && check "disk $disk" curl -fsSI "${BASE}$disk"
done <<< "$(cd "$REPO_ROOT" && python3 -c \
  'import json; d = json.load(open("html/menu/assets/command-data.json")); print("\n".join(sorted({v["payload"][0] for v in d.values() if v.get("action") == "boot"})))')"
check "the gopher proxy answers" sh -c "curl -fsS -X POST '${BASE}proxy/gopher.cgi' \
  -H 'Origin: $SITE' -H 'Content-Type: application/json' \
  -d '{\"input\":null,\"state\":null,\"columns\":40,\"rows\":24}' | grep -q 'THOUGHTRIGHTS GOPHER'"
check "the gopher hole on port $GOPHER_PORT" sh -c "printf '\r\n' | nc -w 10 $GOPHER_HOST $GOPHER_PORT | grep -q ."

if [ "$FAILED" -ne 0 ]; then
  echo "==> Deployed, but the smoke test failed. On a first deploy that can be"
  echo "    the vhost or the gopher hole not being set up yet (CI-CD-PLAN.md)." >&2
  exit 1
fi
echo "==> Done. If the vhost changed:  sudo systemctl reload apache2"
