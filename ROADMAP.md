# Apple IIe menu: roadmap

What's left to do. The guiding rule: it should feel like a special thing you
discover. Nobody tells you how to use it. `HELP` is the only concession.

Finished work is in the git history, and [INSTALLATION.md](INSTALLATION.md)
covers running and deploying what exists.

## Bugs

- [ ] On-screen keys do nothing when clicked or tapped (see Keyboard).
- [ ] Ctrl-S to pause output, as on the real machine.

## Phone mode

- [ ] There is no Ctrl key on a phone keyboard, so a long listing can't be
      stopped there. Perhaps a long press on the screen.
- [ ] Check on real devices: iPhone Safari, Android Chrome with Gboard (which
      composes whole words before sending them), an iPad with and without a
      keyboard attached. This includes typing into the //e, which has only
      been tested in an emulated phone viewport.
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
  - **A place you connect to**, like a BBS (`GOPHER`, `SEARCH`, the character
    tools, Alpha Complex). These need a server or the network, and would feel
    right reached through the modem instead of `BRUN`.
- [ ] A disk box: one data file listing every disk with its title, image file,
      format, source and licence, so what we may share is recorded next to it.
- [ ] Inserting disks: click the Disk II drive to choose one, with the door and
      the IN USE light responding. A second drive for `CATALOG,D2` and
      two-disk programs.
- [ ] Each disk has its own `CATALOG` and volume number.
- [ ] More Eamon adventures in drive 2 (`#master|adventure`).
- [ ] Image the Apple II floppies at home and add the Eamon adventures written
      on them. See the tools listed under "Getting disks" in INSTALLATION.md.
- [ ] Decide on `BRUN CASTLE WOLFENSTEIN`: it is wired up, but it prints
      `I/O ERROR` until a `.dsk` is at
      `assets/disks/castle-wolfenstein.dsk`. Its owner is unknown, so nobody
      can grant permission to host it. Either add a disk or remove the entry.
- [ ] The ProDOS 2.4.3 disk also carries third-party utilities, including Copy
      II Plus 8.4, a commercial program. Consider a disk with just ProDOS and
      BASIC.SYSTEM.

## Dial-up modem and BBSes

Simulate a Hayes-compatible modem on a serial card in slot 2. This is how you
reach the "place you connect to" entries above.

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
- [ ] A BBS shell for those services: a login banner, a main menu, a sysop,
      and things left behind by earlier callers. Gopher, search and the
      character tools become its doors.
- [ ] Reaching the modem from inside the //e: a simulated serial card in
      apple2js, so a BASIC program can dial out too.
- [ ] Maybe real telnet BBSes that still run. That needs a long-lived
      connection, which the stateless CGI proxy can't hold.

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

- [ ] Sounds: the power-on beep, drive whir and clunk while the IN USE light is
      on, the bell (Ctrl-G) on errors, key clicks.
- [ ] Boot in 40 columns and switch to 80 with `PR#3`.
- [ ] Ctrl-Reset.
- [ ] More files to find on the disk, and files that only appear after you've
      found something else.

## Groundwork

The code grew from a 3D model into a UI. Before the bigger features:

- [ ] One input function that every source (physical keys, on-screen keys,
      phone field) feeds into.
- [ ] A "current program" that owns input and output: the DOS prompt, the
      modem, a BBS, the browser, a game. Each one exits back to the one before.
- [ ] One output queue with a speed setting (normal, 300 baud, 1200 baud) and
      cancellation.
- [ ] Remove the stray `html/menu/assets/command-data.json~` from the repository.

## Deployment (CI/CD)

Deploys are by hand today, and the live site doesn't have the programs, the
gopher proxy, Zork or the //e yet. A path from merge to the live site, with no
fees beyond the EC2 hosting:

- [ ] **Checks on every pull request** with GitHub Actions: the proxy tests
      (`python3 -m unittest discover tests`), `node --check` on the JS, and
      `command-data.json` parses, with every `boot` disk and Zork story file it
      names present (except a disk we've chosen not to ship).
- [ ] **Deploy on merge to `master`:** rsync `html/menu/` to the server, keeping
      the execute bit on `gopher.cgi` and skipping editor backups.
- [ ] **Decide how it reaches the server.** Either:
  - GitHub Actions connects over SSH with a deploy-only key, stored as a GitHub
    secret, whose user can only write to the menu's directory. GitHub's runners
    use wide address ranges, so this may mean opening SSH more than you'd like.
  - Or the server pulls: a systemd timer on the EC2 instance fetches `master`
    and rsyncs. No inbound access and no secrets at GitHub, but the deploy
    isn't reported back to the pull request.
- [ ] **First-time server setup** by hand, once: Apache's CGI settings and the
      cache directory from INSTALLATION.md. Needs your go-ahead, since it
      touches the production server.
- [ ] **Smoke test after each deploy:** the page loads, and a POST to the proxy
      returns the gopher menu.
- [ ] **Rollback:** keep the last few releases in dated directories behind a
      symlink, so going back is one command.
