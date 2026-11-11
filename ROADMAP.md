# Apple IIe menu: roadmap

What's left to do. The guiding rule: it should feel like a special thing you
discover. Nobody tells you how to use it. `HELP` is the only concession.

Finished work is in the git history, [INSTALLATION.md](INSTALLATION.md) covers
running and deploying what exists, and [CI-CD-PLAN.md](CI-CD-PLAN.md) is the
plan for deploying automatically.

## Direction: a BBS and a gopher hole

Both stay. They suit different things:

- **The BBS** is where the site's own content goes. A BBS can lay a screen
  out any way it likes: menus, doors, file areas, bulletins, a sysop. It is
  archaic and flexible, but isolated: nothing outside it links in or out.
- **The gopher hole** (`gopher://thoughtrights.com/`) connects. It's part of
  the gopherspace other servers still run, so it can link to them and they to
  it. Putting interfaces in a gopher hole (searches, small applications) is
  archaic enough to fit right in.

The Apple reaches both: the BBS by dialling in with the modem, and gopher
through `BRUN GOPHER` today and, later, as one of the BBS's doors.

## The front door (design A)

The Apple is the front page: `CATALOG` lists every project as a file on the
disk, a screenful at a time, and one quiet line under the desk links the plain
menu. Built; what's left:

- [ ] Turn it on for the live site: one `DirectoryIndex` line in Apache, in
      "The Apple as the front page" in INSTALLATION.md. Needs your go-ahead.
- [ ] Add `gopher://thoughtrights.com` to the line under the desk once the
      gopher server is live. (Browsers don't open gopher links themselves, so
      it's there to be seen and copied.)
- [ ] Not on the disk yet, on purpose: the D&DBeyond integration (abandoned),
      and projects that are only a GitHub repository (Characteristics, the
      live-streaming subtitles). Add them if they should be.
- [ ] Mockups for the next steps are in the proposals from 2026-11-11: design
      B (a disk box, one floppy per section) is "Managing the disks" below,
      and design D (dial in, land on the gopher hole) needs the modem.
      Design C (a menu program with a key line) breaks the discovery rule
      and isn't planned as the front door.

## Projects on the Apple

Four projects need very different amounts of work to come into the Apple
rather than just being redirected to. Heaviest first:

### Baseball cards: heavy, and first

`RUN BASEBALL` is a browser inside the Apple: the list with a highlight bar
(arrow keys, RETURN for the card, or type a number), a name to find, a team
or set to pick, three sorts; and a card screen with the card's whole photo
dithered into green dots, and "also in the box" counts. What's left:

- [ ] Decide: show the key line at the bottom (period programs did), and show
      dollar values and the collection's total (already public on the web
      page)?
- [ ] Phones: no arrow keys on a phone keyboard (type a number instead), and
      no picture at 40 columns, where the card's text fills the screen.
- [ ] A way to the web page, which `RUN BASEBALL` used to open.
- [ ] Data error, in the baseball-cards repository: the two "Art Houtteman"
      records point at different scans, and `1954081-398918245-front.jpg`
      is Jim Hegan. There may be others like it.
- Data: `/baseball-cards/baseballCards.json` and the scans beside it, same
  origin as the Apple, so no proxy. On the dev server they come from the
  public baseball-cards repository the first time they're asked for.

### Barzy: heavy, but later

An audio/video sync test: the mascot bounces, beeping at each edge, so an
engineer can see whether sound and picture land together.

- [ ] Needs all of the groundwork: the screen and keys, the graphics layer,
      and Web Audio, with the beep and the edge flash on the same frame.
- [ ] The mascot doesn't read once dithered in the mockup. Try again (a
      bigger figure, fewer tones) before building.
- [ ] Decide whether to keep the bounce counter, which Barzy's web page
      doesn't have.

### Resume: light, mostly writing

- [ ] Write `RESUME.TXT`: the resume as wrapped plain text. It only exists as
      a web page, PDF and DOCX today. Yours to write.
- [ ] `OPEN RESUME` prints it instead of redirecting, with the web page and
      PDFs still a command away.
- [ ] Later, in the BBS's file area: "downloading" the PDF runs a fake XMODEM
      transfer, then the browser really downloads it.

### Dungeoneer: light on the Apple

DUNGEONEER.com is its own site, so on the Apple it stays a link plus doors:

- [ ] The generators as programs or BBS doors, asking their questions at the
      prompt. See "Discord-style tools" below.
- [ ] Armoria, the fantasy maps and the gaming interstitials stay links:
      they're graphical.

## Bugs

- [ ] On-screen keys do nothing when clicked or tapped (see Keyboard).
- [ ] Ctrl-S to pause output, as on the real machine.

## Phone mode

- [ ] There is no Ctrl key on a phone keyboard, so a long listing can't be
      stopped there. Perhaps a long press on the screen.
- [ ] Check on real devices: iPhone Safari, Android Chrome with Gboard (which
      composes whole words before sending them), an iPad with and without a
      keyboard attached. This includes typing into the //e, and going on with
      a paused `CATALOG`, both only tested in an emulated phone viewport or
      not at all.
- [ ] The text is small on a phone held upright (about 10px): 40 columns at
      that width is the limit.

## Keyboard that looks like a IIe

Match a reference photo (the Wikipedia image linked in the README). The current
keyboard is the CodePen original's: a 15-column grid, mixed-case Verdana
small-caps labels, and some keys a IIe didn't have.

- [ ] Real IIe rows, key widths and legends: ESC, DELETE, TAB, CONTROL, RETURN,
      SHIFT, CAPS LOCK, the open- and closed-apple keys, and the arrow keys in
      a row at the bottom right.
- [ ] Keycap colour and legend font.
- [ ] A working CAPS LOCK. Most IIe owners left it down, so DOS commands came
      out in capitals.
- [ ] Clicking or tapping a key types it, in the menu and on the //e.

## Managing the disks

Everything is one flat list in `command-data.json` today, and `CATALOG` shows
it as a single disk. That disk couldn't exist: Zork alone is 340 sectors, and a
real one holds 560. Some entries aren't really disks at all.

- [ ] Decide what each entry is:
  - **A file** on the menu's disk (`RESUME`, `JOBPOST`).
  - **A disk** you insert and boot (`EAMON`, `PRODOS`, `ZORK`).
  - **A place you connect to** (`GOPHER`, `SEARCH`, the character tools,
    Alpha Complex). These belong on the BBS or the gopher hole, reached
    through the modem instead of `BRUN`.
- [ ] A disk box (design B): one data file listing every disk with its title,
      image file, format, source and licence, so what we may share is
      recorded next to it. In the mockup the box rests on the Disk II;
      floppies must never hang in the air.
- [ ] Inserting disks: click the Disk II drive to choose one, with the door and
      the IN USE light responding. A second drive for `CATALOG,D2` and
      two-disk programs.
- [ ] Each disk has its own `CATALOG` and volume number.
- [ ] More Eamon adventures in drive 2 (`#master|adventure`).
- [ ] Image the Apple II floppies at home and add the Eamon adventures written
      on them. See the tools listed under "Getting disks" in INSTALLATION.md.
- [ ] The ProDOS 2.4.3 disk also carries third-party utilities, including Copy
      II Plus 8.4, a commercial program. Consider a disk with just ProDOS and
      BASIC.SYSTEM.

## The gopher hole

`gopher/` holds the site index as a gopher menu and a search, served by
Gophernicus (INSTALLATION.md section 3). Tested locally, not deployed.

- [ ] Deploy it, twice: prod on port 70 and UAT on port 7070, each a
      Gophernicus serving its build's `gopher/` (CI-CD-PLAN.md). Needs your
      go-ahead.
- [ ] Let `BRUN GOPHER` reach and list each environment's own hole: the
      proxy only talks to port 70 today.
- [ ] `BRUN GOPHER`: choosing a web link (type `h`) prints `FILE TYPE
      MISMATCH`. It should show the address and offer to open it (`http` and
      `https` only). The remote program protocol needs a way to ask the page
      to open a URL.
- [ ] Check whether the gophermap's `!` title line prints twice through the
      proxy, as the proposals report. Needs Gophernicus running.
- [ ] Add our own hole to `BRUN GOPHER`'s home menu once it's live.
- [ ] More interfaces in the hole, as gopher applications: the weather
      forecast as text, the baseball cards as a searchable list, the
      generators as type 7 searches.
- [ ] Link out to other gopher holes worth visiting, so ours is part of
      gopherspace rather than a dead end.

## Dial-up modem and the BBS

Simulate a Hayes-compatible modem on a serial card in slot 2. This is how you
reach the BBS and the other "places you connect to".

- [ ] `PR#2` / `IN#2` to talk to it, then `AT` commands: `ATZ`,
      `ATDT 555-1212`, `ATH`, `+++`.
- [ ] Sounds made with Web Audio rather than samples: dial tone, DTMF digits,
      ringing, the handshake screech.
- [ ] `CONNECT 300` / `CONNECT 1200`, then output throttled to the baud rate
      (about 30 characters a second at 300 baud).
- [ ] `BUSY`, `NO CARRIER`, `NO DIALTONE` for numbers that don't answer.
- [ ] A phone book of numbers in a data file. Each number is a BBS or service.
      Nobody gives you the numbers: they turn up in files on the disk, in the
      job post, on a BBS.
- [ ] `RUN WARDIAL`: scans the 555 exchange and reports which numbers answer.
      It's how visitors find the one-offs (WOPR, say) without being told.
- [ ] Reaching the modem from inside the //e: a simulated serial card in
      apple2js, so a BASIC program can dial out too.
- [ ] Maybe real telnet BBSes that still run. That needs a long-lived
      connection, which the stateless CGI proxy can't hold.

### The Thoughtrights BBS

A main menu after the login banner and the new-caller agreement (the site's
copyright notice, which already mentions bulletin boards):

```
THOUGHTRIGHTS BBS    EST. 1995    NODE 1

 [F] FILE AREA        [D] DOORS
 [B] BULLETINS        [W] WEATHER
 [P] POETRY CORNER    [C] TRAFFIC CAMS
 [O] ONE-LINERS       [G] GOODBYE

45 MINUTES LEFT.  COMMAND?
```

- [ ] The shell: login banner (Daemous's skull as hi-res art), menus,
      time left, a sysop.
- [ ] **File area:** each project's README as plain text, `RESUME.TXT`, the
      Selfeyes essay.
- [ ] **Bulletins** from the git history (a phlog on the gopher side).
- [ ] **Doors:** the generators, gopher, search, Zork.
- [ ] **Weather:** the forecast from `/weather/weather.api` as text, and its
      MP3 announcer.
- [ ] **Traffic cams:** browse `/cam/config.json` by borough or street.
      Whether the city's camera server lets a page read its images wasn't
      checked; drawing a frame may need a proxy.
- [ ] **Poetry corner:** the spoken-word pieces as a tape deck. Their texts
      are needed; they only exist as audio.
- [ ] `FINGER WIZ` prints a `.plan` of current projects.
- [ ] The 1995 job post (`OPEN JOBPOST`) in a `tin`-style newsreader.
- [ ] One-liners: visitors' writing, so it needs moderation. Left out unless
      that's worth it.
- Suggested order: WOPR (no new content), weather, then the baseball door.

## Emulated programs

Programs written for the menu that behave like 1980s software, as opposed to
real disks running on the //e. They need no ROMs and no licences, run on phones
without an emulator, and can be anything. All original work, in the style of
the period: real titles stay copyrighted.

- [ ] A word processor and a small spreadsheet, using the line editing and
      cursor movement the terminal doesn't have yet.
- [ ] Applesoft BASIC in the menu, so `LIST`, `RUN` and typing in your own
      program work. Check the licence of any interpreter used.
- [ ] Small original games: text adventures, number games.
- [ ] Zork's status line (room, score, moves) isn't shown.

### Discord-style tools from `~/src/character`

The character system's APIs already return generated content as JSON for the
Discord bot's slash commands. Each could be a program or BBS door, asking its
questions at the prompt the way a 1983 program would:

```
]RUN TAVERN
HERITAGE (ELF, DWARF, HUMAN...)? DWARF
QUALITY (1-5)? 3
```

- Candidates: `character.api`, `tavern.api`, `name.api`, `story.api`,
  `potion.api`, `heraldry.api` (a blazon reads well as text), `rumors.api`,
  `traps.api`.
- Cross-origin: `traps`, `rumors`, `story`, `describe` and `heraldry` send
  `Access-Control-Allow-Origin: *` in the CGI code, so the Apple page on
  thoughtrights.com can call them directly. `character.api`, `tavern.api` and
  the rest would need `www.thoughtrights.com` allowed. Not checked against the
  live servers.
- Output needs wrapping to 40/80 columns, ASCII only, and printing at listing
  speed.

### Alpha Complex

`BRUN ALPHACOMPLEX` redirects to drow@bin.sh's version, which no longer works:
`alpha.cgi` refuses requests (403), and the game text isn't in any page still
reachable. It is a solo Paranoia adventure by Sam Shirley from Space
Gamer/Fantasy Gamer No. 77, which bin.sh describes as public domain and not to
be sold or used for profit. (The Paranoia artwork is West End Games' and
shouldn't come along.)

To bring it back inside the terminal:

- [ ] Get the source text: the magazine issue, or ask Doug Rau whether the
      CGI's data survives.
- [ ] Store the sections and choices as data and play them with one small
      program: numbered choices, six clones, "not selecting an option is
      treason".
- [ ] Keep the non-commercial terms and the credits that `OPEN INDIGOBRIEF`
      already shows.

## The real //e

- [ ] Decide whether to keep shipping Apple's //e ROMs. They are inside
      apple2js's chunks (`dist/524.bundle.js`, `685.bundle.js`), as on every
      Apple II emulator site: tolerated by Apple, never licensed.
- [ ] Mirror the //e's drive light on the menu's floppy drive (apple2js exports
      `driveLights`).
- [ ] Apply the screen flicker to the //e. It only runs on the menu's text.
- [ ] apple2js has no Mockingboard card, so programs that need one are silent
      or won't run.
- [ ] Desktop emulators to compare against: MAME (`apple2e`) and microM8 on
      Ubuntu and macOS; MII and AppleWin's Linux port on Ubuntu; Virtual ][,
      Mariani and Clock Signal on macOS.

## The internet, through the terminal

Instead of redirects, show a small allowed set of sites as text inside the
screen, like Lynx on a shell account in 1995.

- [ ] Best reached through the modem: dial a number, get a login, then a text
      browser.
- [ ] Pages reduced to text, wrapped to 40 or 80 columns, ASCII only (the IIe
      character set), links numbered `[1]`, `[2]` and followed by typing the
      number. Images become `[IMAGE]`.
- [ ] Text arrives at modem speed.
- [ ] Your own pages (resume, Barzy, spoken word) are same-origin and need no
      proxy.
- [ ] Anything else goes through a proxy on the EC2 server (like `gopher.cgi`),
      because browsers block cross-origin fetches: fetch only allowlisted URLs,
      strip them to text and cache them, so it can't be used as an open proxy.

Decided against, so nobody has to research these again:

- **Google:** its terms forbid automated access to search pages, it answers
  scrapers with CAPTCHAs, and its Custom Search JSON API is closed to new
  customers and shuts down on January 1, 2027. Paid search APIs are ruled out
  (no fees beyond the EC2 hosting). Search is Wikipedia (`BRUN SEARCH`) and
  gopher's own searches (`BRUN GOPHER`).
- **WAIS:** no public servers are known to be running.

## Making it feel special

- [ ] A backdrop to replace the grey gradient. Rejected: desk-and-wall rooms.
      Proposed, no decision: Studio sweep (warm off-white, close to today),
      Phosphor (near-black with a green glow, like the rest of the site), and
      Sage (muted green). The CSS for each is in the proposals'
      `mockup-scripts/backdrops.json`.
- [ ] Sounds: the power-on beep, drive whir and clunk while the IN USE light is
      on, the bell (Ctrl-G) on errors, key clicks.
- [ ] Boot in 40 columns and switch to 80 with `PR#3`.
- [ ] Ctrl-Reset.
- [ ] More files to find on the disk, and files that only appear after you've
      found something else.

## Groundwork

The code grew from a 3D model into a UI. Before the bigger features (the
baseball browser and Barzy need the first three):

- [ ] A "current program" that owns the screen and the keys: the DOS
      prompt, the modem, the BBS, the browser, a game, each exiting back to
      the one before. Started: a program can take the arrow and page keys
      (`key()`), redraw the screen at once, and show inverse lines.
- [ ] The graphics layer: built as a canvas over the text, lined up with its
      cells (7x8 dots each; on 80 columns a hi-res dot is two canvas pixels
      wide), with `machine.graphics.picture()` for dithered photos. Still to
      come: drawing dots and lines for Barzy, and mixed mode (graphics over
      four rows of text).
- [ ] Sound with Web Audio: Barzy's beep, the modem, the drive.
- [ ] One input function that every source (physical keys, on-screen keys,
      phone field) feeds into.
- [ ] One output queue with a speed setting (normal, 300 baud, 1200 baud) and
      cancellation. `CATALOG`'s pause would move into it.
- [ ] Remove the stray `html/menu/assets/command-data.json~` from the repository.

## Deployment (CI/CD)

Pull requests are checked by GitHub Actions (`.github/workflows/checks.yml`);
deploys are by hand, and the live site has none of this year's work. The plan
is in [CI-CD-PLAN.md](CI-CD-PLAN.md): deploy from your machine with
`./deploy/deploy.sh uat|prod`, like the character app, rsyncing to a build
directory on the EC2 host that Apache serves at `/menu-uat/` or `/menu/`,
each with its own gopher hole (ports 7070 and 70). Uncommitted changes may
go to prod, stamped `-dirty`.

- [ ] Write `deploy/deploy.sh`, with its README and a test that runs it
      against a temporary directory.
- [ ] First-time server setup, by hand, once: the two `Alias` blocks, the
      proxy's cache directories and the two gopher holes. Needs your
      go-ahead.
- [ ] Require the checks to pass before merging to `master`.
- [ ] A browser smoke test in CI.
