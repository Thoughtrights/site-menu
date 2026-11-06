# Installation

The site menu is static files plus one optional CGI script. There is no
build step, no package to install, and no paid service behind it.

| Path | What it is | Deployed? |
| --- | --- | --- |
| `html/` | The web root: `html/menu/` is served as `/menu/` | Yes |
| `html/menu/proxy/gopher.cgi` | The `BRUN GOPHER` proxy (Python 3, standard library) | Yes, if you want GOPHER |
| `gopher/` | The site index as a gopher hole, for `gopher://thoughtrights.com/` | Yes, if you run a gopher server |
| `tests/` | Offline tests for the proxy | No |
| `tools/dev-server.py` | Local server that also runs the CGI | No |
| `README.md`, `ROADMAP.md`, `INSTALLATION.md` | Notes | No |

## 1. The menu (static files)

Copy `html/menu/` to `menu/` under your site's document root. For example,
with your own user, host and document root:

```bash
rsync -av --exclude '*~' html/menu/ you@your-server:/path/to/docroot/menu/
```

That is everything the Apple IIe needs to boot, `CATALOG`, follow links and
run `BRUN SEARCH`. SEARCH talks to the Wikipedia API straight from the
visitor's browser, so it needs nothing on the server.

The page is `/menu/apple-IIe.html`. `/menu/index.html` is the plain HTML
menu.

## 2. The gopher proxy (`BRUN GOPHER`)

Without this step everything else still works. `BRUN GOPHER` will print
`I/O ERROR` because the page can't reach the proxy.

### What the server needs

- Apache with `mod_cgi`. That's what runs the `.cgi` file.
- `python3`. The script only uses the standard library, so Ubuntu's stock
  `python3` is enough and nothing needs `pip`.
- Outbound TCP port 70 from the server. EC2's default security group allows
  all outbound traffic. If yours is locked down, add an outbound rule for TCP
  70 to 0.0.0.0/0.

### Steps

1. **Copy the script and keep its execute bit.** Git stores it as `100755`.
   `rsync -a` preserves that, but a copy-and-paste does not:

   ```bash
   chmod 755 /path/to/docroot/menu/proxy/gopher.cgi
   ```

2. **Turn on CGI:**

   ```bash
   sudo a2enmod cgi
   ```

3. **Allow CGI for that one directory.** Put this in the site's
   `<VirtualHost>` (for example `/etc/apache2/sites-available/<site>.conf`):

   ```apache
   <Directory /path/to/docroot/menu/proxy>
       Options +ExecCGI
       AddHandler cgi-script .cgi
       SetEnv GOPHER_STATE_DIR /var/cache/site-menu-gopher
   </Directory>
   ```

   You can use an `.htaccess` in `menu/proxy/` with the same three lines
   instead, if the directory allows it (`AllowOverride Options FileInfo`).

4. **Make a place for the cache and rate-limit files.** Apache runs as
   `www-data`, which needs to be able to write there:

   ```bash
   sudo install -d -o www-data -g www-data -m 750 /var/cache/site-menu-gopher
   ```

   This step is optional. Without `GOPHER_STATE_DIR` the files go in
   `/tmp/site-menu-gopher`. On Ubuntu that `/tmp` is private to Apache
   (`PrivateTmp`) and is emptied whenever Apache restarts, which is
   harmless.

5. **Check the config and reload Apache:**

   ```bash
   sudo apache2ctl configtest
   ```

   ```bash
   sudo systemctl reload apache2
   ```

### Settings

Both are environment variables, set with `SetEnv` as above.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GOPHER_ALLOWED_ORIGINS` | `https://www.thoughtrights.com https://thoughtrights.com` | Pages allowed to use the proxy, separated by spaces. Set it if the menu is served from another host name. |
| `GOPHER_STATE_DIR` | `/tmp/site-menu-gopher` | Where the 10-minute page cache and the per-visitor rate counts are kept. |

The limits are constants at the top of `gopher.cgi`:

- 30 requests a minute per visitor;
- a 10-minute cache;
- 512 KB and 15 seconds per fetch;
- gopher port 70 only.

### Check it

First, from the server, make sure gopher is reachable. This should print
Floodgap's menu:

```bash
printf '\r\n' | nc -w 10 gopher.floodgap.com 70 | head
```

Then ask the proxy for the home menu. Use your own host name in both the
URL and `Origin`:

```bash
curl -s -X POST https://www.thoughtrights.com/menu/proxy/gopher.cgi -H 'Origin: https://www.thoughtrights.com' -H 'Content-Type: application/json' -d '{"input":null,"state":null,"columns":40,"rows":24}'
```

You should get JSON whose `print` list starts with `THOUGHTRIGHTS GOPHER`.
Any other answer points to a specific problem:

- **The Python source comes back as text:** CGI isn't on for that
  directory (step 3).
- **`403` with `not from this site`:** `Origin` isn't in
  `GOPHER_ALLOWED_ORIGINS`.
- **`405`:** the request was a GET. The proxy only answers POSTs, which also
  keeps crawlers out.
- **`500`:** check the execute bit and the `#!/usr/bin/env python3` line,
  then look in `/var/log/apache2/error.log`.

Last, boot the IIe, type `BRUN GOPHER`, and pick an item.

### Caveats

- **Behind CloudFront or a load balancer,** `REMOTE_ADDR` is the proxy's
  address, so every visitor shares one rate limit. Serve `menu/proxy/`
  directly, or have Apache restore the visitor's address with
  `mod_remoteip`.
- **Floodgap bans web-to-gopher proxies that let crawlers through.** It
  already blocks `*.amazonaws.*` hosts from its weather pages, which is why
  weather isn't on the home menu. This proxy keeps crawlers out with
  POST-only requests, the Origin check, the rate limit and the cache. If the
  server's address gets blocked anyway, Floodgap asks for an email to
  gopher@floodgap.com explaining what the proxy is.
- **It never connects to private addresses.** That includes `127.0.0.1`,
  `10.x`, `192.168.x` and the EC2 metadata address `169.254.169.254`, so a
  visitor can't use it to reach anything on your network.

## 3. Your own gopher server (`gopher://thoughtrights.com/`)

`gopher/` is the site index as a gopher hole: a `gophermap` with every
link from the HTML menu, and `cgi-bin/search`, a type 7 search over it.
It is served by Gophernicus, which Ubuntu packages. This is separate from
the proxy in step 2: the proxy lets the IIe *visit* gopher, this *is* a
gopher server, reachable from any gopher client (Lagrange, Lynx,
`BRUN GOPHER`).

### What the server needs

- Ubuntu's `gophernicus` package (in `universe`, 3.1.1 on 24.04).
- `python3` for the search script.
- **Inbound** TCP port 70 in the EC2 security group, from 0.0.0.0/0
  (and `::/0` for IPv6).

### Steps

1. **Install it.** The package turns on `gophernicus.socket`, which
   listens on port 70 straight away and starts one `gophernicus` per
   connection as the `_gophernicus` user:

   ```bash
   sudo apt install gophernicus
   ```

2. **Copy the hole to `/srv/gopher`,** Ubuntu's document root for it.
   Gophernicus skips scripts that aren't world-readable and executable:

   ```bash
   sudo rsync -av --exclude '*~' gopher/ /srv/gopher/
   sudo chmod -R a+rX /srv/gopher
   sudo chmod 755 /srv/gopher/cgi-bin/search
   ```

3. **Give it the public host name.** Without `-h`, every menu line
   carries the machine's own name, which on EC2 is something like
   `ip-172-31-0-1.ec2.internal`, and clients can't follow those links.
   In `/etc/default/gophernicus`:

   ```bash
   OPTIONS=-r /srv/gopher -h thoughtrights.com -nf -nt
   ```

   `-nf` drops the "Gophered by Gophernicus" footer and `-nt` turns off
   `/server-status`. Then:

   ```bash
   sudo systemctl restart gophernicus.socket
   ```

4. **Open port 70** inbound in the instance's security group.

### Check it

From anywhere:

```bash
printf '\r\n' | nc thoughtrights.com 70 | head
```

```bash
printf '/cgi-bin/search\tvideo\r\n' | nc thoughtrights.com 70
```

The first should print the menu, starting with the line for the title
(`ithoughtrights.com`, a tab, `TITLE`). The second should list Barzy and
the other video links. Then try `BRUN GOPHER` and
`G gopher://thoughtrights.com`.

### Adding to it

- **Links** are lines of `type`, name, tab, selector (and optionally
  tab, host, tab, port). Lines with no tab are plain text. Web pages are
  type `h` with a `URL:https://...` selector. See
  `/usr/share/doc/gophernicus/README.gophermap` on the server.
- **Text** goes in as files (`0About this site`, a tab, `/about.txt`), which
  suits the resume, the job post and anything else that is already text.
- **Programs** go in `cgi-bin/`. A type 7 item sends what the visitor
  typed in `QUERY_STRING`; whatever the script prints is the reply,
  either a menu (lines with tabs, ending in `.`) or plain text for a
  type 0 item. Treat that input as hostile.
- To be added to Floodgap's list of new servers once it's up, write to
  gopher@floodgap.com.

The files are offline-tested with `python3 -m unittest discover tests`.

## 4. Local development

You need Python 3 and nothing else.

```bash
python3 tools/dev-server.py 8765
```

Then open http://localhost:8765/menu/apple-IIe.html. The dev server serves
`html/` and runs `*.cgi` on POST the way Apache would. It also tells the
proxy to accept `localhost` as an origin, so `BRUN GOPHER` works against the
real gopher servers. In the Claude desktop app, a `site` entry in
`.claude/launch.json` starts the same server.

The proxy tests don't use the network:

```bash
python3 -m unittest discover tests
```

To try phone mode, open the page in a phone-sized window with touch
emulation, such as a browser's device toolbar. Phone mode only switches on
for touch screens without a mouse.

## 5. Changing what's on the disk

Commands, files and programs come from `html/menu/assets/command-data.json`.
There's nothing to build after editing it; just deploy the file again.

- **Keys** are what the visitor types, in capitals, and use a no-break space
  (U+00A0) between words, as in `"RUN RESUME"`. The page also accepts
  ordinary spaces.
- **Catalog entries:** an entry with `"type"` (`T`, `B`, `A` or `I`) and
  `"sectors"` appears in `CATALOG`.
- **Actions:** `"action"` is one of `print`, `redirect`, `catalog`,
  `program`, `boot` or `alias`. An alias's payload names the command it stands
  for.
  The two `reserved` entries hold the boot text and can't be typed.
- **Remote programs:** a `program` entry with payload
  `["remote", "<url>"]` runs a program on a server. The page sends one
  JSON POST per line typed, and the server keeps no session:

  ```
  request:  { "input": null | "typed line", "state": <last reply's state>,
              "columns": 40 | 80, "rows": 23 }
  reply:    { "print": ["lines", ...], "prompt": "SEARCH? ",
              "state": { ... }, "exit": false }
  ```

  If the server isn't the same origin as the page, it must also send CORS
  headers allowing the page's origin and answer the `OPTIONS` preflight.

### Real //e disks

`"action": "boot"` entries boot a disk image in a real Apple //e
(apple2js, in `html/menu/apple2js/`) that takes over the monitor. Images
live in `html/menu/assets/disks/` and are plain files, so deploying them is
the same `rsync` as the rest of the menu. `.dsk`, `.do` and `.po` work.

`BRUN CASTLE WOLFENSTEIN` expects `assets/disks/castle-wolfenstein.dsk`,
which isn't in the repository; until it's there, the command prints
`I/O ERROR`. To add another disk, copy the file in and add an entry like:

```json
"BRUN MY GAME" : {
	"action": "boot",
	"type": "B",
	"sectors": 140,
	"payload": ["assets/disks/my-game.dsk"]
}
```

### Getting disks

Only add disks you may share: your own work, public-domain software, or
programs whose owners have released them. To turn your own floppies into disk
images:

- **With a working Apple II:** ADTPro sends disks to a modern computer over a
  serial cable, an audio cable or Ethernet. It only copies disks without copy
  protection.
- **With a PC 5.25" drive:** Greaseweazle or FluxEngine, open hardware that
  records the raw signal. FluxEngine reads ordinary DOS 3.3 and ProDOS disks
  only.
- **For copy-protected disks:** Applesauce, which makes `.woz` images.

Image each disk once and keep the file; old disks only get worse. Don't run a
disk with visible mould through a drive.
