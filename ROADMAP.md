# Apple IIe menu: improvements

The guiding rule: it should feel like a special thing you discover. Nobody
tells you how to use it. `HELP` is the only concession.

## 1. Bugs

Fixed (November 2026):

- [x] A line auto-submitted as a command when it reached 80 characters. Input
      now wraps onto the next screen row, like the real machine, up to 239
      characters.
- [x] Keys typed while text was printing were mixed into the output, and
      RETURN during output ran an output line as a command. Input is now ignored
      while the machine is busy.
- [x] Cmd/Ctrl/Alt shortcuts (Cmd-R, Cmd-C, ...) typed a letter on screen.
- [x] Space, arrows, Tab, `'` and `/` also scrolled the page or opened
      Firefox's quick-find.
- [x] Turning the power off mid-output kept printing onto the dark screen, and
      a pending redirect still fired. Turning it back on within half a second
      wiped the new boot text.
- [x] Several redirects could be queued at once.
- [x] The power switch did nothing while the machine was booting.
- [x] The floppy "IN USE" light went out early when two reads overlapped.
- [x] Extra or leading spaces in a command gave `?SYNTAX ERROR`.
- [x] The no-break-space workaround: commands and output can now use plain
      spaces (the existing `command-data.json` still works unchanged).
- [x] The page scrolled sideways and the Disk II drive was cut off on most
      screen shapes. The whole desk is now scaled to fit the window.
- [x] Page title typo ("Thoughrights").
- [x] Leftover globals and `console.clear()` from the CodePen original.

New authentic behaviour added with the fixes:

- [x] `FILE NOT FOUND` for a file that isn't on the disk, and
      `FILE TYPE MISMATCH` for the wrong verb on a file that is (for example
      `RUN RESUME`), instead of `?SYNTAX ERROR` for both. These are the real
      DOS 3.3 messages, so they hint without telling.
- [x] Ctrl-C stops a long listing (`OPEN JOBPOST`) or a pending redirect, and
      prints `BREAK`.

Still open:

- [ ] On-screen keys do nothing when clicked or tapped (see Phone mode and
      Keyboard).
- [ ] Ctrl-S to pause output, as on the real machine.

## 2. Phone mode

Done (November 2026), on any touch-first device (phones and tablets:
`(hover: none) and (pointer: coarse)`):

- [x] It starts on the full desk, scaled to fit.
- [x] Tapping anywhere on the monitor turns it on (the power switch is a few
      pixels wide on a phone).
- [x] The camera zooms into the screen, then only the flickering green
      screen remains, with scan lines, filling what is visible above the
      phone keyboard.
- [x] The phone keyboard comes up at once (iOS only allows that during the
      tap). Tapping the screen brings it back after it is dismissed.
- [x] 40 columns on a narrow screen, as a IIe booted, with `Apple //e`
      centred; 80 columns once the screen is 640px wide (a phone on its
      side). Long lines break mid-word, as on the real thing.
- [x] Caps on by default (`autocapitalize="characters"`), like a IIe with
      CAPS LOCK down. Phone "smart quotes" are turned back into plain ones.
- [x] The back button (or back swipe) turns it off: the picture collapses,
      then the camera zooms back out to the desk.

Still open:

- [ ] There is no Ctrl key on a phone keyboard, so a long listing can't be
      stopped there. Perhaps a long press on the screen.
- [ ] Check on real devices: iPhone Safari, Android Chrome with Gboard
      (which composes whole words before sending them), an iPad with and
      without a keyboard attached.
- [ ] The text is small on a phone held upright (about 10px): 40 columns at
      that width is the limit.

## 3. Keyboard that looks like a IIe

Match a reference photo (the Wikipedia image linked in the README). The
current keyboard is the CodePen original's: a 15-column grid, mixed-case
Verdana small-caps labels, and some keys a IIe didn't have.

- Real IIe rows, key widths and legends: ESC, DELETE, TAB, CONTROL, RETURN,
  SHIFT, CAPS LOCK, the open- and closed-apple keys, and the arrow keys in a
  row at the bottom right.
- Keycap colour and legend font.
- A working CAPS LOCK. Most IIe owners left it down, so DOS commands came out
  in capitals.
- Clicking or tapping a key types it (one shared input function for the
  physical keyboard, on-screen keys and the phone field).

## 4. Dial-up modem

Simulate a Hayes-compatible modem on a serial card in slot 2.

- `PR#2` / `IN#2` to talk to it, then `AT` commands: `ATZ`, `ATDT 555-1212`,
  `ATH`, `+++`.
- Sounds made with Web Audio rather than samples: dial tone, DTMF digits,
  ringing, the handshake screech.
- `CONNECT 300` / `CONNECT 1200`, then output throttled to the baud rate
  (about 30 characters a second at 300 baud).
- `BUSY`, `NO CARRIER`, `NO DIALTONE` for numbers that don't answer.
- A phone book of numbers in a data file like `command-data.json`. Each number
  is a BBS or service. Nobody gives you the numbers: they turn up in files on
  the disk, in the job post, on a BBS.

## 5. Programs and games

### Programs on the disk (done)

- [x] `CATALOG` is generated from `command-data.json`: any entry with a
      `"type"` (and optional `"sectors"`, `"locked"`) is a file on the disk,
      in file order. An entry without a type still works but doesn't show,
      so hidden files are possible.
- [x] `"action": "program"` runs a program that takes over the prompt until
      it exits. Programs live in `js/apple-IIe-programs.js`. Ctrl-C or power
      off breaks them; a network failure prints DOS's `I/O ERROR`.
- [x] `BRUN SEARCH`: Wikipedia search and articles as text, word-wrapped to
      40/80 columns and paged with `MORE?`. Runs in the browser, no proxy.
- [x] `"payload": ["remote", "<url>"]`: a program that runs on a server,
      such as the thoughtrights.com proxy. Adding one needs only a catalog
      entry. Tested against a local mock; no real proxy exists yet.

The remote protocol (one POST of JSON per line typed; the server keeps no
session):

```
request:  { "input": null | "typed line", "state": <last reply's state>,
            "columns": 40 | 80, "rows": 23 }
reply:    { "print": ["lines", ...], "prompt": "SEARCH? ",
            "state": { ... }, "exit": false }
```

The server must send CORS headers allowing `https://www.thoughtrights.com`
(and answer the `OPTIONS` preflight), unless it is served from the same
origin as the page.


Options, roughly from least to most work:

1. Small original programs written in JS that run inside the terminal: text
   adventures, number games, a fake word processor. Each one is a "program"
   that takes over input and output until it exits.
2. An Applesoft BASIC interpreter, so `LIST`, `RUN` and typing in your own
   program work. Open-source JS interpreters exist; check the licence before
   using one. Needs line editing and cursor movement.
3. A full Apple II emulator in the screen running real disk images. Only use
   software you have the rights to share: public domain, homebrew, or titles
   whose authors have released them.

### Discord-style tools from `~/src/character`

The character system's APIs already return generated content as JSON for the
Discord bot's slash commands. Each could be a program on the disk, asking its
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
  thoughtrights.com can call them directly. `character.api`, `tavern.api`
  and the rest would need `www.thoughtrights.com` allowed. Not checked
  against the live servers.
- Output needs wrapping to 40/80 columns, ASCII only, and printing at
  listing speed.

### Alpha Complex

`BRUN ALPHACOMPLEX` redirects to drow@bin.sh's version, which no longer
works: `alpha.cgi` refuses requests (403), and the game text isn't in any
page still reachable. It is a solo Paranoia adventure by Sam Shirley from
Space Gamer/Fantasy Gamer No. 77, which bin.sh describes as public domain and
not to be sold or used for profit. (The Paranoia artwork is West End Games'
and shouldn't come along.)

To bring it back inside the terminal:

- Get the source text: the magazine issue, or ask Doug Rau whether the CGI's
  data survives.
- Store the sections and choices as data (like `command-data.json`) and play
  them with one small program: numbered choices, six clones, "not selecting
  an option is treason".
- Keep the non-commercial terms and the credits that `OPEN INDIGOBRIEF`
  already shows.

## 6. The internet, through the terminal

Instead of redirects, show a small allowed set of sites as text inside the
screen, like Lynx on a shell account in 1995.

- Best reached through the modem: dial a number, get a login, then a text
  browser. That ties sections 4 and 6 together.
- Pages reduced to text, wrapped to 40 or 80 columns, ASCII only (the IIe
  character set), links numbered `[1]`, `[2]` and followed by typing the
  number. Images become `[IMAGE]`.
- Text arrives at modem speed.
- Your own pages (resume, Barzy, spoken word) are same-origin and need no
  proxy. Wikipedia's API allows cross-origin requests and returns plain text.
- Anything else needs a small server-side proxy, because the site is static
  and browsers block cross-origin fetches. A serverless function (for example
  a Cloudflare Worker) that fetches only allowlisted URLs, strips them to text
  and caches them. It must stay allowlisted so it can't be used as an open
  proxy.

### Google

A text interface to google.com itself isn't workable: Google's terms forbid
automated access to its search pages, it answers scrapers with CAPTCHAs, and
its Custom Search JSON API is closed to new customers and shuts down on
January 1, 2027. Options for a remote `SEARCH`-style program on the proxy:

- Brave Search API: whole-web results as JSON; paid per query (check
  current pricing). The key stays on the proxy.
- Google's Programmable Search Element: free, but only for up to 50 chosen
  domains, and it is an embedded widget, not JSON.
- Wikipedia: what `BRUN SEARCH` already does, free.

## 7. Making it feel special

- Sounds: the power-on beep, drive whir and clunk while the IN USE light is
  on, the bell (Ctrl-G) on errors, key clicks.
- Boot in 40 columns and switch to 80 with `PR#3`.
- Ctrl-Reset.
- More files to find on the disk, and files that only appear after you've
  found something else.

## 8. Groundwork for the above

The current code grew from a 3D model into a UI. Before the bigger features:

- One input function that every source (physical keys, on-screen keys, phone
  field) feeds into.
- A "current program" that owns input and output: the DOS prompt, the modem,
  a BBS, the browser, a game. Each one exits back to the one before.
- One output queue with a speed setting (normal, 300 baud, 1200 baud) and
  cancellation. Partly done in the bug-fix pass.
