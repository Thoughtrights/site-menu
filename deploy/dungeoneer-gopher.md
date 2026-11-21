# Writing Dungeoneer into the thoughtrights.com gopher hole

For the agent working in the `character` repository (dungeoneer.com). The
site-menu repository runs the gopher server on the EC2 host; Dungeoneer
doesn't run a server of its own. It **writes files into a folder of its
own**, and the gopher server shows that folder as the `/dungeoneer` section
of the hole. The gopher server and its rules are in the site-menu
repository: `tools/gopher-server.py`, `INSTALLATION.md` section 3.

## Status

Not live yet. The site-menu side is built, not deployed:

- [x] `tools/gopher-server.py` takes `--mount dungeoneer=<folder>`, so your
  folder appears at `/dungeoneer`, and passes the rest of a selector to a
  program as `PATH_INFO`;
- [x] its systemd units name your folder and the public host name;
- [x] the hole's top menu (`gopher/gophermap`) links to `/dungeoneer`;
- [x] the Apple's DUNGEONEER line (555-0130) dials your section, per
  environment;
- [ ] DNS: `gopher.thoughtrights.com` pointing at the EC2 host;
- [ ] the gopher server deployed and its units installed on the box.

You can do all of your side now, and test it locally (below). Until your
first deploy, `/dungeoneer` answers "Not here."

## Where to write

| Environment | Your folder on the box | Served as |
| --- | --- | --- |
| prod | `/home/ubuntu/build/character/gopher/` | `gopher://gopher.thoughtrights.com/1/dungeoneer` (port 70) |
| uat | `/home/ubuntu/build/character-uat/gopher/` | `gopher://gopher.thoughtrights.com:7070/1/dungeoneer` |

- Keep the content in `gopher/` in your repository and have your
  `deploy/deploy.sh` sync it to `$DEST/gopher/` with the rest of the app
  (`--delete` is fine: it's your folder).
- **Never write into `/home/ubuntu/build/site-menu*/`.** That deploy syncs
  with `--delete` and will remove anything it doesn't own.
- After syncing, make it readable and the programs executable:
  `chmod -R a+rX $DEST/gopher` and `chmod 755 $DEST/gopher/cgi-bin/*`.
  The server runs as a throwaway unprivileged user (systemd `DynamicUser`)
  that can only read: world-readable files, world-searchable folders, and
  `/home/ubuntu` must let others in (`x`), as Ubuntu 20.04 has it.

## What a menu looks like

A folder is a menu when it has a file named `gophermap`. The top of your
folder (`gopher/gophermap`) is what visitors see at `/dungeoneer`. The
format is Gophernicus's:

```
!Dungeoneer
# comments start with #, and aren't sent
Strangers, taverns and names, made up on the spot.

1Strangers	people
7Find a stranger	cgi-bin/seek
0About this hole	about.txt
```

- A line **with a tab** is a link: type and name, tab, selector, and
  optionally tab, host, tab, port. **Leave out host and port**: the server
  fills in its own, so the same file works on prod and uat.
- **Selectors**: a relative one (`people`, `about.txt`, `cgi-bin/seek`) is
  taken relative to the menu's own folder, which is the simplest choice. An
  absolute one must start with your section: `/dungeoneer/...`.
- A line **without a tab** is text. `#` starts a comment. `!` gives the menu
  its title. A line holding only `.` ends the menu.
- Types you'll want: `1` menu, `0` text file, `7` search (the visitor types
  words), `h` a web link (`URL:https://...` as the selector), `i` text.

## Text files

Plain UTF-8 text, any name. Wrap at 70 columns, the gopher habit, which
also reads well on the Apple's 80. **Don't add a closing `.`**: the server
adds CRLF line endings, dot-stuffing and the closing dot itself.

## Programs: the live parts

Anything generated per request (a new stranger, a search, a town's tavern)
is a program in `gopher/cgi-bin/`, run fresh for each request.

- Executable (`chmod 755`), with a shebang. The box has Python 3.8
  (Ubuntu 20.04): no `str.removeprefix`, no `list[int]` annotations.
- **What it's given**, in the environment:
  - `QUERY_STRING`: the words a visitor typed, for a type 7 search item.
    Treat it as hostile;
  - `PATH_INFO`: the rest of the selector after the program's name, so
    `/dungeoneer/cgi-bin/person/Elven/k3j9` runs `person` with
    `PATH_INFO=/Elven/k3j9`. That keeps the permanent seeded links from
    your hole design (`/person/<people>/<seed>`), as program paths;
  - `SERVER_NAME` and `SERVER_PORT`: put these in the host and port of
    every menu line you print, so links work on prod and uat alike;
  - `DOCUMENT_ROOT`: your folder.
- **What it returns**: everything it prints to standard output is the
  reply, either a menu (one link per line, four tab-separated fields,
  ending with a line holding only `.`) or text. Standard error is thrown
  away. It has **10 seconds**; past that the visitor gets an error.
- It runs read-only: it can't write files except in a private `/tmp` that
  doesn't last. Cache in the API, not on disk.
- Errors: print one type 3 line (`3The tables did not answer.` then
  `\terror.host\t1`) and a closing `.`.

## Your API

Programs fetch from the API as deployed, not localhost:8080:

| Environment | API base |
| --- | --- |
| prod | `https://www.dungeoneer.com/character/api/` |
| uat | `https://www.dungeoneer.com/character-uat/api/` |

Tell which one a program is in by its own path (it lives under
`/home/ubuntu/build/character-uat/` on uat), or by `SERVER_PORT` (7070 on
uat). One request at a time, no loops over the API: every stranger is real
work on the site.

## What's public

The hole is open to anyone, with any gopher client. **Leave out the parts
written for the game master**: "Secret (for the DM)" and "DM NOTES". The
Apple's proxy strips them for its visitors, but other clients read the
hole directly.

## Trying it locally

With the site-menu repository checked out beside yours, once `--mount`
exists:

```bash
python3 ../site-menu/tools/gopher-server.py --root ../site-menu/gopher --mount dungeoneer=gopher --host localhost --port 7071
```

```bash
curl -s gopher://localhost:7071/1/dungeoneer
```

```bash
curl -s "gopher://localhost:7071/7/dungeoneer/cgi-bin/seek%09lantern"
```

## After each deploy

```bash
curl -s gopher://gopher.thoughtrights.com/1/dungeoneer
```

```bash
curl -s gopher://gopher.thoughtrights.com:7070/1/dungeoneer
```

Each should print your top menu, with the right host and port in every
link. On the Apple, the line 555-0130 (DUNGEONEER) and `BRUN GOPHER` reach
the same section.
