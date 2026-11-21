/* Programs on the Apple IIe disk.
 *
 * A program is listed in assets/command-data.json with
 * "action": "program" and a "type", so it shows up in CATALOG:
 *
 *   "BRUN SEARCH" : {
 *	"action": "program",
 *	"type": "B",
 *	"sectors": 34,
 *	"payload": ["search"]
 *   }
 *
 * payload[0] names a function below; any further payload entries are
 * passed to it after the machine. The function returns
 * { start(), input(text) }: start() runs once, then input() gets each
 * line typed at the program's prompt until it calls machine.exit().
 * Either may return a promise. If one throws, DOS prints I/O ERROR.
 * A program may also have key(name): it then gets the arrow keys and
 * PageUp/PageDown as they're pressed ("ArrowUp" ...), for a highlight bar.
 * With allKeys: true as well, it gets every key that way ("q", " ",
 * "Enter"), for something that runs in real time.
 *
 *   machine.print(lines)     print lines, then the current prompt
 *   machine.show(lines)      clear the screen, draw lines quickly, then the prompt
 *   machine.redraw(lines)    replace the screen at once, keeping what's typed
 *   machine.inverse(text)    a line in inverse video, dark on green
 *   machine.graphics.clear()               wipe the hi-res dots
 *   machine.graphics.picture(url, box)     a photo, dithered to dots, in a box
 *                            of text cells { column, row, columns, rows }
 *   machine.graphics.screen(rows)          280 dots across, rows*8 down: set
 *                            .dots[y * 280 + x] = 1, then .show(), each frame
 *   machine.graphics.bitmap(url, w, h)     an image as brightness and coverage
 *   machine.sound.load(url) / .play(sound, volume 0-1)
 *   machine.running()        false once the program is broken off
 *   machine.saveFile(name, lines)          a text file on the disk (CATALOG, OPEN)
 *   machine.readFile(name)   a text file's lines, or null
 *   machine.setPrompt(text)  the prompt to type at ("SEARCH? ", "?" ...)
 *   machine.work(promise)    wait for the network, drive light on
 *   machine.exit()           back to the DOS "]" prompt
 *   machine.columns()        40 or 80
 *   machine.rows()           rows on the screen
 */

const PROGRAMS = {};


function toAscii(text) {
    // The IIe character set: plain ASCII only.
    return String(text)
	.normalize('NFKD').replace(/[̀-ͯ]/g, '') // é -> e
	.replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
	.replace(/[–—―−]/g, '-').replace(/…/g, '...')
	.replace(/[ \t]/g, ' ')
	.replace(/[^\x20-\x7e\n]/g, '');
}

function wordWrap(text, width) {
    // Break at spaces to fit the screen; one blank row between paragraphs.
    const rows = [];
    for (const paragraph of text.split('\n')) {
	let row = '';
	for (let word of paragraph.split(' ').filter(Boolean)) {
	    if (row && row.length + 1 + word.length > width) {
		rows.push(row);
		row = '';
	    }
	    while (word.length > width) { // longer than the screen: cut it
		rows.push(word.slice(0, width));
		word = word.slice(width);
	    }
	    row = row ? row + ' ' + word : word;
	}
	if (row || rows[rows.length - 1] !== ' ') {
	    rows.push(row || ' ');
	}
    }
    return rows;
}

function screens(rows, size) {
    const pages = [];
    for (let i = 0; i < rows.length; i += size) {
	pages.push(rows.slice(i, i + size));
    }
    return pages;
}


/* SEARCH: look things up in Wikipedia and read the articles as text.
 * Wikipedia's API allows cross-origin requests, so this needs no proxy. */
PROGRAMS.search = (machine) => {
    const API = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2&origin=*&';
    let results = [];  // titles from the last search
    let pages = [];    // the rest of the article being read

    function get(params) {
	return machine.work(fetch(API + new URLSearchParams(params)).then((response) => {
	    if (!response.ok) {
		throw new Error('HTTP ' + response.status);
	    }
	    return response.json();
	}));
    }

    function choicePrompt() {
	machine.setPrompt(results.length ? 'NUMBER OR SEARCH? ' : 'SEARCH? ');
    }

    async function search(query) {
	const data = await get({ action: 'query', list: 'search', srsearch: query,
				 srlimit: 9, srprop: '' });
	results = data.query.search.map((result) => result.title);
	choicePrompt();
	if (!results.length) {
	    return machine.print([' ', 'NOTHING FOUND', ' ']);
	}
	return machine.print([' ', ...results.map((title, i) => (i + 1) + ' ' + toAscii(title)), ' ']);
    }

    async function read(title) {
	const data = await get({ action: 'query', prop: 'extracts', explaintext: 1,
				 redirects: 1, titles: title });
	const page = data.query.pages[0];
	const heading = toAscii(page.title);
	const rows = [' ', heading, '-'.repeat(Math.min(heading.length, machine.columns())), ' ',
		      ...wordWrap(toAscii(page.extract || 'NOTHING HERE.'), machine.columns())];
	pages = screens(rows, machine.rows() - 2);
	return nextScreen();
    }

    function nextScreen() {
	const screen = pages.shift();
	if (pages.length) {
	    machine.setPrompt('MORE? ');
	} else {
	    choicePrompt();
	}
	return machine.print(screen);
    }

    return {
	start() {
	    machine.setPrompt('SEARCH? ');
	    return machine.print([' ', 'WIKIPEDIA SEARCH', 'BLANK LINE TO QUIT', ' ']);
	},
	input(text) {
	    text = text.trim();
	    if (pages.length && text === '') {
		return nextScreen();
	    }
	    pages = [];
	    if (text === '') {
		machine.exit();
		return machine.print([' ']);
	    }
	    const number = Number(text);
	    if (Number.isInteger(number) && number >= 1 && number <= results.length) {
		return read(results[number - 1]);
	    }
	    return search(text);
	},
    };
};


/* RUN BASEBALL: Dad's baseball cards, browsed the way a 1983 database
 * program would be: a screen of the list with a highlight bar moved by the
 * arrow keys, or a command typed at the prompt. A card's screen shows its
 * scan in hi-res dots.
 * payload: ["baseball", "<url of baseballCards.json>"], the web page's own
 * data, on the same site, so it needs no proxy; so are the scans. */
PROGRAMS.baseball = (machine, url) => {
    const TITLE = "DAD'S BASEBALL CARDS";
    // The 12 blank records in the data go last, not first.
    const blankLast = (a, b) => a.startsWith('(no ') - b.startsWith('(no ') || a.localeCompare(b);
    const byName = (a, b) => blankLast(a.name, b.name);
    const bySet = (a, b) => blankLast(a.set, b.set) ||
	  (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0);
    const SORTS = [
	['VALUE', (a, b) => b.value - a.value || byName(a, b)],
	['PLAYER', (a, b) => byName(a, b) || b.value - a.value],
	['SET', (a, b) => bySet(a, b) || byName(a, b)],
    ];

    let cards = [];     // the whole box
    let shown = [];     // the cards the selection and sort leave, in order
    let team = null;    // selection: one team, one set, part of a name
    let set = null;
    let find = null;
    let sort = 0;
    let top = 0;        // index in `shown` of the first row on the list screen
    let cursor = 0;     // index in `shown` of the highlighted row
    let open = null;    // index in `shown` of the card on screen, if any
    let choices = null; // { kind: 'TEAM' | 'SET', names: [...] } while picking

    const width = () => machine.columns();
    const narrow = () => width() < 80;
    const money = (value) => '$' + value.toLocaleString('en-US',
	{ minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cut = (text, size) => toAscii(text).slice(0, size).padEnd(size);
    const rule = (character = '=') => character.repeat(width());
    const twoSided = (left, right) =>
	  cut(left, Math.max(0, width() - right.length - 1)) + ' ' + right;
    const listRows = () => machine.rows() - 8; // title, selection, rules, footer, keys, prompt

    function shortSet(name) {
	return name.replace(/ Potato Chips$/, '');
    }

    function load(data) {
	cards = data.map((card) => ({
	    name: toAscii(card.playerName || '') || '(no name)',
	    searchName: toAscii(card.playerName || '').toLowerCase(), // not the placeholder
	    team: toAscii(card.team || '') || '(no team)',
	    set: toAscii(card.setName || '') || '(no set)',
	    number: toAscii(card.cardNumber || '') || '-',
	    year: card.year || '',
	    condition: toAscii(card.condition || ''),
	    value: Number(card.marketValue) || 0,
	    // The data names the scans on www.thoughtrights.com; ask this
	    // site for them, so they're same-origin wherever the page is.
	    image: card.image ? '/baseball-cards/' + card.image.split('/').pop() : null,
	}));
    }

    function select() {
	const word = find && find.toLowerCase();
	shown = cards.filter((card) =>
	    (!team || card.team === team) && (!set || card.set === set) &&
		(!word || card.searchName.includes(word)));
	shown.sort(SORTS[sort][1]);
	top = 0;
	cursor = 0;
	open = null;
    }

    function moveCursor(to) {
	// The highlight bar; the list turns a page when the bar runs off it.
	cursor = Math.max(0, Math.min(shown.length - 1, to));
	top = Math.floor(cursor / listRows()) * listRows();
    }

    function selectionText() {
	const parts = [team || 'ALL TEAMS', set || 'ALL SETS'];
	if (find) {
	    parts.push('NAMES WITH "' + find + '"');
	}
	return parts.join(', ').toUpperCase();
    }

    function years() {
	const all = cards.map((card) => card.year).filter(Boolean);
	return Math.min(...all) + '-' + Math.max(...all);
    }

    function row(number, set, cardNumber, name, team, value) {
	// One line of the list, or its headings: 40 or 80 columns wide.
	if (narrow()) {
	    return number.padStart(3) + ' ' + cut(name, 19) + ' ' + cut(cardNumber, 4) + ' ' +
		value.padStart(10);
	}
	return number.padStart(3) + ' ' + cut(set, 12) + ' ' + cut(cardNumber, 4) + ' ' +
	    cut(name, 23) + ' ' + cut(team, 22) + ' ' + value.padStart(10);
    }

    function listRow(card, index) {
	return row(String(index + 1), shortSet(card.set), card.number, card.name, card.team,
		   money(card.value));
    }

    function listScreen(instant = false) {
	// instant: redraw at once, for the arrow keys.
	open = null;
	choices = null;
	machine.setPrompt('COMMAND? ');
	machine.graphics.clear();
	const heading = row('#', 'SET', 'NO.', 'PLAYER', 'TEAM', 'VALUE');
	const page = shown.slice(top, top + listRows());
	const total = shown.reduce((sum, card) => sum + card.value, 0);
	const range = shown.length
	      ? (top + 1) + ' TO ' + (top + page.length) + ' OF ' + shown.length
	      : 'NO CARDS';
	const screen = [
	    twoSided(TITLE, cards.length + ' CARDS' + (narrow() ? '' : '  ' + years())),
	    twoSided(selectionText(), narrow() ? 'BY ' + SORTS[sort][0] : 'SORTED BY ' + SORTS[sort][0]),
	    heading,
	    rule(),
	    ...page.map((card, i) => top + i === cursor
			? machine.inverse(listRow(card, top + i).padEnd(width()))
			: listRow(card, top + i)),
	    ...Array(listRows() - page.length).fill(' '),
	    rule('-'),
	    twoSided(range, (narrow() ? '' : 'VALUE ') + money(total)),
	    narrow() ? 'ARROWS, RETURN  T TEAM  S SET  V SORT'
		: 'ARROWS MOVE  RETURN CARD  T TEAM  S SET  V SORT  A ALL  NAME FINDS  Q QUIT',
	];
	return instant ? machine.redraw(screen) : machine.show(screen);
    }

    function cardScreen(index, instant = false) {
	open = index;
	cursor = index;
	choices = null;
	machine.setPrompt('COMMAND? ');
	machine.graphics.clear();
	const card = shown[index];
	const sameTeam = cards.filter((other) => other.team === card.team).length - 1;
	const sameSet = cards.filter((other) => other.set === card.set).length - 1;
	const field = (label, value) => cut(label, 12) + value;
	const also = [];
	if (card.team !== '(no team)' && sameTeam > 0) {
	    also.push('  ' + sameTeam + ' more ' + card.team + '  (D)');
	}
	if (card.set !== '(no set)' && sameSet > 0) {
	    also.push('  ' + sameSet + ' more ' + card.set + '  (S)');
	}
	const rows = [
	    twoSided(TITLE, 'CARD ' + (index + 1) + ' OF ' + shown.length),
	    rule(),
	    ' ',
	    card.name.toUpperCase(),
	    card.team,
	    ' ',
	    field('SET', card.set),
	    field('CARD NO.', card.number),
	    field('YEAR', String(card.year || '-')),
	    field('CONDITION', card.condition.toUpperCase() || '-'),
	    field('VALUE', money(card.value)),
	    ' ',
	];
	if (also.length) {
	    rows.push('ALSO IN THE BOX', ...also);
	}
	while (rows.length < machine.rows() - 4) {
	    rows.push(' ');
	}
	rows.push(rule('-'), narrow() ? 'ARROWS, RETURN  D TEAM  S SET  L LIST'
		  : 'ARROWS OR RETURN NEXT  D THIS TEAM  S THIS SET  L LIST  Q QUIT');
	const drawn = instant ? machine.redraw(rows) : machine.show(rows);
	if (card.image && !narrow()) {
	    // The scan, on the right half. A missing one just leaves it empty.
	    machine.graphics.picture(card.image, { column: 46, row: 2, columns: 32,
						   rows: machine.rows() - 6 }).catch(() => {});
	}
	return drawn;
    }

    function choiceScreen(kind) {
	const counts = new Map();
	for (const card of cards) {
	    const name = kind === 'TEAM' ? card.team : card.set;
	    counts.set(name, (counts.get(name) || 0) + 1);
	}
	const names = [...counts.keys()].sort((a, b) => a.localeCompare(b));
	choices = { kind, names };
	machine.setPrompt(kind + ' NUMBER (RETURN FOR ALL)? ');
	const half = Math.ceil(names.length / 2);
	const column = Math.floor(width() / 2);
	const entry = (i) => i < names.length
	      ? cut(String(i + 1).padStart(2) + ' ' + names[i] + ' (' + counts.get(names[i]) + ')', column)
	      : '';
	const rows = [twoSided(TITLE, kind === 'TEAM' ? 'TEAMS' : 'SETS'), rule(), ' '];
	for (let i = 0; i < half; i++) {
	    rows.push(entry(i) + entry(i + half));
	}
	return machine.show(rows);
    }

    function help() {
	return machine.print([' ',
	    'UP, DOWN  MOVE            LEFT, RIGHT  A SCREEN',
	    'RETURN  THE CARD          NUMBER  THAT CARD',
	    'NAME  FIND A PLAYER       B  PREVIOUS SCREEN',
	    'T  PICK A TEAM            S  PICK A SET',
	    'V  CHANGE THE SORT        A  ALL CARDS AGAIN',
	    'Q  QUIT', ' ']);
    }

    function listCommand(text) {
	const command = text.toUpperCase();
	const number = Number(text);
	if (text === '') {
	    return shown.length ? cardScreen(cursor) : listScreen();
	}
	if (Number.isInteger(number)) {
	    return number >= 1 && number <= shown.length
		? cardScreen(number - 1) : machine.print([' ', '?NO SUCH CARD', ' ']);
	}
	switch (command) {
	case 'B':
	    moveCursor(top - listRows());
	    return listScreen();
	case 'T':
	    return choiceScreen('TEAM');
	case 'S':
	    return choiceScreen('SET');
	case 'V':
	    sort = (sort + 1) % SORTS.length;
	    select();
	    return listScreen();
	case 'A':
	    team = set = find = null;
	    select();
	    return listScreen();
	case '?':
	case 'HELP':
	    return help();
	}
	if (command.length < 2) {
	    return machine.print([' ', '?SYNTAX ERROR', ' ']);
	}
	const before = find;
	find = text;
	select();
	if (!shown.length) {
	    find = before;
	    select();
	    return machine.print([' ', 'NO ' + text.toUpperCase() + ' IN THIS SELECTION', ' ']);
	}
	return shown.length === 1 ? cardScreen(0) : listScreen();
    }

    function cardCommand(text) {
	const card = shown[open];
	switch (text.toUpperCase()) {
	case '':
	    return cardScreen((open + 1) % shown.length);
	case 'B':
	    return cardScreen((open - 1 + shown.length) % shown.length);
	case 'D':
	    team = card.team;
	    set = find = null;
	    select();
	    return listScreen();
	case 'S':
	    set = card.set;
	    team = find = null;
	    select();
	    return listScreen();
	case 'L':
	    moveCursor(open);
	    return listScreen();
	case '?':
	case 'HELP':
	    return machine.print([' ', 'RETURN OR ARROWS NEXT CARD, B BACK,',
				  'D THIS TEAM, S THIS SET, L THE LIST, Q QUIT', ' ']);
	}
	return machine.print([' ', '?SYNTAX ERROR', ' ']);
    }

    function choiceCommand(text) {
	const { kind, names } = choices;
	const number = Number(text);
	if (text !== '' && !(Number.isInteger(number) && number >= 1 && number <= names.length)) {
	    return machine.print([' ', '?NO SUCH ' + kind, ' ']);
	}
	const name = text === '' ? null : names[number - 1];
	if (kind === 'TEAM') {
	    team = name;
	} else {
	    set = name;
	}
	find = null;
	select();
	return listScreen();
    }

    return {
	start() {
	    return machine.work(fetch(url).then((response) => {
		if (!response.ok) {
		    throw new Error(url + ': ' + response.status);
		}
		return response.json();
	    })).then((data) => {
		load(data);
		select();
		return listScreen();
	    });
	},
	input(text) {
	    text = text.trim();
	    if (text.toUpperCase() === 'Q') {
		machine.graphics.clear();
		machine.exit();
		return machine.print([' ']);
	    }
	    if (choices) {
		return choiceCommand(text);
	    }
	    return open === null ? listCommand(text) : cardCommand(text);
	},
	key(name) {
	    // Arrow and page keys, the moment they're pressed.
	    if (choices || !shown.length) {
		return;
	    }
	    const forward = ['ArrowDown', 'ArrowRight', 'PageDown'].includes(name);
	    if (open !== null) {
		return cardScreen((open + (forward ? 1 : -1) + shown.length) % shown.length, true);
	    }
	    const step = name.startsWith('Arrow') && (name === 'ArrowUp' || name === 'ArrowDown')
		  ? 1 : listRows();
	    moveCursor(cursor + (forward ? step : -step));
	    return listScreen(true);
	},
    };
};


/* BRUN BARZY: Barzy, the audio/video sync checker, on a green screen.
 * The mascot bounces over colour bars, drawn as dot densities the way a
 * monochrome monitor showed them. Each time it hits an edge, that edge
 * flashes on the same frame as Barzy's bounce sound, so an engineer can
 * see whether a stream's sound and picture land together. While the
 * drive loads him (seven seconds), a title card: Barzy flying in on a
 * vapor trail of his colour bars.
 * payload: ["barzy", "<url of Barzy's assets/>"], on the same site. */
PROGRAMS.barzy = (machine, assets) => {
    const ROWS = 20;            // graphics rows; three rows of text below
    // Dots a second, across and down, chosen with left and right. 75 is
    // about the pace of Barzy's page (500 px a second across a screen).
    const SPEEDS = [25, 40, 55, 75, 100, 130, 170, 220];
    const FLASH_MS = 100;       // how long an edge stays lit
    const SPRITE = { width: 56, height: 51 };
    // Where his eye is in barzy-boi-trans.png (384 x 349): the centre, as a
    // share of width and height, and the ring's and pupil's radii, as a
    // share of width.
    const EYE = { x: 192 / 384, y: 131 / 349, ring: 36 / 384, pupil: 12 / 384 };
    const LEVELS = 11;          // Barzy's audio level runs 0 to 11
    // 4x4 ordered dither: steady patterns, so the bars don't crawl.
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

    let screen = null;
    let background = null;
    let sprite = null;          // per dot: 0 clear, 1 lit, 2 dark (covers the bars)
    const sounds = {};
    let level = 0;              // starts silent, as Barzy does
    let savedLevel = 6;         // what SPACE brings back
    let speedStep = 3;          // SPEEDS[3], Barzy's own pace
    let x = 0, y = 0;
    let dx = 1, dy = 1;         // directions; times the speed in step()
    let bounces = 0;
    let lastEdge = '';
    const flashUntil = { LEFT: 0, RIGHT: 0, TOP: 0, BOTTOM: 0 };
    let lastFrame = null;
    let stopped = false;

    const width = () => machine.columns();
    const twoSided = (left, right) =>
	  toAscii(left).slice(0, Math.max(0, width() - right.length - 1))
	  .padEnd(Math.max(0, width() - right.length - 1)) + ' ' + right;

    function bars(w, h) {
	/* Barzy's bars as brightness, then dithered to dots. Brightness is
	 * each colour's luma, which is how it looked in green. */
	const level = new Float32Array(w * h);
	const luma = (hex) => {
	    const n = parseInt(hex, 16);
	    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
	};
	const gradient = (from, to) => (t) => from + (to - from) * t;
	const bands = [ // [height share, [[width share, brightness or ramp], ...]]
	    [0.55, ['646464', 'c0c0c0', 'ffff00', '00ffff', '00ff00', 'ff00ff', 'ff0000', '0000ff', '646464']
	     .map((hex) => [1 / 9, luma(hex)])],
	    [0.10, [[1 / 9, luma('00ffff')], [1 / 9, luma('0000ff')], [6 / 9, gradient(1, luma('808080'))],
		    [1 / 9, luma('0000ff')]]],
	    [0.10, [[1 / 9, luma('ffff00')], [1 / 9, luma('800080')], [6 / 9, gradient(0, 1)],
		    [1 / 9, luma('ff0000')]]],
	    [0.25, [[0.1111, luma('282828')], [0.173, 0], [0.21, 1], [0.173, 0],
		    [0.037, luma('0a0a0a')], [0.037, 0], [0.037, luma('323232')], // PLUGE
		    [0.1111, 0], [0.1111, luma('282828')]]],
	];
	let top = 0;
	for (const [share, columns] of bands) {
	    const bottom = Math.round(top + share * h);
	    let left = 0;
	    columns.forEach(([part, value], i) => {
		const right = i === columns.length - 1 ? w : Math.round(left + part * w);
		for (let yy = top; yy < Math.min(bottom, h); yy++) {
		    for (let xx = left; xx < right; xx++) {
			level[yy * w + xx] = typeof value === 'function'
			    ? value((xx - left) / Math.max(1, right - left - 1)) : value;
		    }
		}
		left = right;
	    });
	    top = bottom;
	}
	const dots = new Uint8Array(w * h);
	for (let yy = 0; yy < h; yy++) {
	    for (let xx = 0; xx < w; xx++) {
		dots[yy * w + xx] = level[yy * w + xx] > BAYER[(yy & 3) * 4 + (xx & 3)] ? 1 : 0;
	    }
	}
	return dots;
    }

    function makeSprite(bitmap) {
	/* The mascot in three flat tones (light parts lit, middle ones a
	 * checkerboard, dark ones dark) inside a lit outline with a dark ring
	 * just inside it, so it stands out against any bar. */
	const { width: w, height: h, level: light, alpha } = bitmap;
	const inside = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && alpha[yy * w + xx] > 0.5;
	const edgeDistance = (xx, yy) => {
	    for (let d = 1; d <= 2; d++) {
		for (const [ox, oy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
		    if (!inside(xx + ox, yy + oy)) {
			return d;
		    }
		}
	    }
	    return 3;
	};
	const tones = new Uint8Array(w * h);
	for (let yy = 0; yy < h; yy++) {
	    for (let xx = 0; xx < w; xx++) {
		if (!inside(xx, yy)) {
		    continue;
		}
		const d = edgeDistance(xx, yy);
		const v = light[yy * w + xx];
		const lit = d === 1 || (d > 2 && (v > 0.7 || (v > 0.35 && ((xx + yy) & 1))));
		tones[yy * w + xx] = lit ? 1 : 2;
		// His eye: a grey ring round a dark pupil, as bright as the green
		// round it, so it would dither away. Drawn lit, with a dark rim.
		const e = Math.hypot(xx + 0.5 - EYE.x * w, yy + 0.5 - EYE.y * h);
		if (e < EYE.pupil * w + 0.25) {
		    tones[yy * w + xx] = 2;
		} else if (e < EYE.ring * w) {
		    tones[yy * w + xx] = 1;
		} else if (e < EYE.ring * w + 1) {
		    tones[yy * w + xx] = 2;
		}
	    }
	}
	return { width: w, height: h, tones };
    }

    /* The splash, while the drive loads him: a matinee serial's title card,
     * Barzy flying in on a vapor trail of his own colour bars. Near him the
     * bars are a crisp ribbon; behind, they ripple, spread and fade, then
     * break up into dust, with puffs of vapor rolling off and the odd
     * glint. Drawn in grey on a canvas each frame and dithered to dots
     * (ordered dither for the ribbon, shifting grain for the dust), then
     * Barzy stamped on top in his three tones. Runs until stop(). */
    const SPLASH_MS = 7000;
    const HERO = { width: 84, height: 77 };
    const SPLASH_TEXT = ['CHAPTER 1:  THE CASE OF THE LATE BEEP',
			 'STARRING BARZY, AUDIO-VISUAL',
			 'CALIBRATION TOOL.'];
    const BAR_LUMAS = ['c0c0c0', 'ffff00', '00ffff', '00ff00', 'ff00ff', 'ff0000', '0000ff']
	  .map((hex) => {
	      const n = parseInt(hex, 16);
	      return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
	  });

    function splash(heroBitmap) {
	const page = machine.graphics.screen(ROWS);
	const { width: w, height: h, dots } = page;
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const g = canvas.getContext('2d', { willReadFrequently: true });
	const grey = (v, a = 1) => {
	    const c = Math.round(Math.min(1, v) * 255);
	    return 'rgba(' + c + ',' + c + ',' + c + ',' + a + ')';
	};
	const FONT = '"Arial Black", Impact, "Helvetica Neue", sans-serif';
	const hero = makeSprite(heroBitmap);
	const hx = 182, hy = 68;      // where Barzy is; he bobs from there
	const tail = hx + 30;         // the trail starts behind the saucer
	const noise = (x, y, seed) => {
	    let n = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
	    n = Math.imul(n ^ (n >>> 13), 1274126177);
	    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
	};

	// The title, drawn once: THE ADVENTURES OF, then BARZY in comic
	// lettering, a solid outline round a half-lit fill.
	const titles = document.createElement('canvas');
	titles.width = w;
	titles.height = h;
	const tg = titles.getContext('2d');
	tg.textAlign = 'center';
	tg.textBaseline = 'middle';
	tg.font = '900 11px ' + FONT;
	tg.fillStyle = '#fff';
	tg.fillText('THE ADVENTURES OF', 140, 12);
	tg.save();
	tg.translate(140, 40);
	tg.transform(1, 0, -0.15, 1, 0, 0);
	tg.font = '900 40px ' + FONT;
	tg.lineJoin = 'round';
	tg.lineWidth = 4;
	tg.strokeStyle = '#fff';
	tg.strokeText('BARZY', 0, 0);
	tg.fillStyle = grey(0.5);
	tg.fillText('BARZY', 0, 0);
	tg.restore();

	const puffs = [];             // vapor rolling off the ribbon
	let lastPuff = 0;
	let running = true;
	const started = performance.now();
	let last = started;

	function frame(now) {
	    if (!running || !machine.running()) {
		return;
	    }
	    const s = (now - started) / 1000;
	    const dt = Math.min(0.1, (now - last) / 1000);
	    last = now;
	    const bob = Math.sin(s * 3.1) * 2.5;
	    const mid = hy + 40 + bob; // the ribbon leaves the saucer's middle

	    g.globalCompositeOperation = 'source-over';
	    g.fillStyle = '#000';
	    g.fillRect(0, 0, w, h);
	    g.drawImage(titles, 0, 0);

	    // The ribbon: one column at a time, from the saucer backwards. The
	    // ripple travels back along it; the bars spread apart and dim.
	    for (let xx = tail; xx >= 0; xx--) {
		const t = (tail - xx) / tail;                 // 0 at him, 1 far behind
		const ripple = Math.sin(xx / 13 + s * 7) * (1 + 6 * t) + Math.sin(xx / 31 - s * 2) * 3 * t;
		const lag = bob * Math.min(1, t * 3);         // the far end lags his bobbing
		const spacing = 5 + 2.5 * t;
		const fade = 1 - 0.85 * Math.pow(t, 1.2);
		const crisp = t < 0.45;                       // near him: sharp bands, dark gaps
		const top = mid - lag + ripple - spacing * 3.5;
		BAR_LUMAS.forEach((v, i) => {
		    // Every bar shows on green: dim ones lifted, bright ones kept.
		    g.fillStyle = grey((0.32 + 0.68 * v) * fade);
		    const y0 = top + i * spacing;
		    if (crisp) {
			g.fillRect(xx, Math.round(y0), 1, Math.round(spacing) - 1);
		    } else {
			g.fillRect(xx, y0, 1, Math.ceil(spacing));
		    }
		});
	    }

	    // Puffs: born where the ribbon starts to fray, drifting back,
	    // swelling and thinning out.
	    if (now - lastPuff > 90) {
		lastPuff = now;
		puffs.push({
		    x: hx - 60 - Math.random() * 40, y: mid - 14 + Math.random() * 28,
		    r: 3 + Math.random() * 3, age: 0, life: 1.6 + Math.random() * 1.2,
		    vx: -(35 + Math.random() * 30), vy: (Math.random() - 0.5) * 10,
		});
	    }
	    g.globalCompositeOperation = 'lighter';
	    for (const p of puffs) {
		p.age += dt;
		p.x += p.vx * dt;
		p.y += p.vy * dt;
		p.r += 7 * dt;
		const a = Math.max(0, 1 - p.age / p.life) * 0.45;
		const glow = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
		glow.addColorStop(0, grey(1, a));
		glow.addColorStop(1, grey(1, 0));
		g.fillStyle = glow;
		g.beginPath();
		g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
		g.fill();
	    }
	    while (puffs.length && puffs[0].age > puffs[0].life) {
		puffs.shift();
	    }

	    // To dots. Near him, the steady ordered dither; further back, a
	    // grain that shifts every few frames, so the trail turns to dust.
	    const pixels = g.getImageData(0, 0, w, h).data;
	    const seed = Math.floor(s * 20);
	    for (let yy = 0; yy < h; yy++) {
		for (let xx = 0; xx < w; xx++) {
		    const v = pixels[(yy * w + xx) * 4] / 255;
		    // Only the trail turns to dust, not the title above it.
		    const dust = xx < tail && yy > 58
			  ? Math.min(1, Math.max(0, ((tail - xx) / tail - 0.5) * 2.2)) : 0;
		    const order = BAYER[(yy & 3) * 4 + (xx & 3)];
		    const threshold = dust ? order + (noise(xx, yy, seed) - order) * dust : order;
		    dots[yy * w + xx] = v > threshold ? 1 : 0;
		}
	    }

	    // Glints: a few lit crosses that wink on and off along the trail.
	    for (let i = 0; i < 6; i++) {
		const k = Math.floor(s * 6) + i * 7;
		if (noise(k, i, 3) < 0.55) {
		    continue;
		}
		const gx = Math.floor(noise(k, i, 1) * (hx - 10)) + 2;
		const gy = Math.floor(mid - 18 + noise(k, i, 2) * 36);
		for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
		    const px = gx + ox, py = gy + oy;
		    if (px >= 0 && px < w && py >= 0 && py < h) {
			dots[py * w + px] = 1;
		    }
		}
	    }

	    // Barzy, bobbing.
	    const top = Math.round(hy + bob);
	    for (let yy = 0; yy < hero.height; yy++) {
		for (let xx = 0; xx < hero.width; xx++) {
		    const tone = hero.tones[yy * hero.width + xx];
		    const py = top + yy;
		    if (tone && py >= 0 && py < h) {
			dots[py * w + hx + xx] = tone === 1 ? 1 : 0;
		    }
		}
	    }
	    page.show();
	    requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);
	return { stop() { running = false; } };
    }

    function bounce(edge) {
	bounces++;
	lastEdge = edge;
	flashUntil[edge] = performance.now() + FLASH_MS;
	const sound = edge === 'LEFT' ? sounds.left : edge === 'RIGHT' ? sounds.right : sounds.topBottom;
	machine.sound.play(sound, level / LEVELS); // the same frame the edge lights
	status();
    }

    function step(seconds) {
	const maxX = screen.width - sprite.width;
	const maxY = screen.height - sprite.height;
	const speed = SPEEDS[speedStep];
	x += dx * speed * seconds;
	y += dy * speed * seconds;
	if (x >= maxX) { x = maxX - (x - maxX); dx = -1; bounce('RIGHT'); }
	if (x <= 0) { x = -x; dx = 1; bounce('LEFT'); }
	if (y >= maxY) { y = maxY - (y - maxY); dy = -1; bounce('BOTTOM'); }
	if (y <= 0) { y = -y; dy = 1; bounce('TOP'); }
    }

    function draw(now) {
	const { width: w, height: h, dots } = screen;
	dots.set(background);
	const band = (x0, y0, x1, y1) => {
	    for (let yy = y0; yy < y1; yy++) dots.fill(1, yy * w + x0, yy * w + x1);
	};
	if (now < flashUntil.LEFT) band(0, 0, 3, h);
	if (now < flashUntil.RIGHT) band(w - 3, 0, w, h);
	if (now < flashUntil.TOP) band(0, 0, w, 3);
	if (now < flashUntil.BOTTOM) band(0, h - 3, w, h);
	const left = Math.round(x);
	const top = Math.round(y);
	for (let yy = 0; yy < sprite.height; yy++) {
	    for (let xx = 0; xx < sprite.width; xx++) {
		const tone = sprite.tones[yy * sprite.width + xx];
		if (tone) {
		    dots[(top + yy) * w + left + xx] = tone === 1 ? 1 : 0;
		}
	    }
	}
	screen.show();
    }

    function frame(now) {
	if (stopped || !machine.running()) {
	    return;
	}
	const seconds = lastFrame === null ? 0 : Math.min(0.1, (now - lastFrame) / 1000);
	lastFrame = now;
	step(seconds);
	draw(now);
	requestAnimationFrame(frame);
    }

    function status() {
	const narrow = width() < 80;
	const meter = '#'.repeat(level) + '.'.repeat(LEVELS - level);
	const heard = lastEdge ? lastEdge + ' EDGE  ' + (level ? '*BEEP*' : '(MUTED)') : ' ';
	const speedText = 'SPEED ' + (speedStep + 1) + '/' + SPEEDS.length;
	machine.redraw([
	    ...Array(ROWS).fill(' '),
	    twoSided(narrow ? 'BARZY' : 'BARZY   AUDIO/VIDEO SYNC TEST',
		     speedText + '   BOUNCE ' + String(bounces).padStart(4, '0')),
	    twoSided(heard, (narrow ? 'LEVEL ' : 'AUDIO LEVEL ') + String(level).padStart(2) + ' ' + meter),
	]);
    }

    return {
	allKeys: true, // every key comes to key(), at once
	start() {
	    const quietly = (promise) => promise.catch(() => null); // no sound beats no Barzy
	    const prompt = width() < 80 ? 'UP/DN LEVEL  L/R SPEED  Q '
		  : 'UP/DOWN LEVEL   LEFT/RIGHT SPEED   SPACE MUTE   Q QUIT ';
	    machine.setPrompt('');
	    // The drive runs the whole time: the splash, then the rest of him.
	    return machine.work((async () => {
		const hero = await machine.graphics.bitmap(assets + 'barzy-boi-trans.png', HERO.width, HERO.height);
		const shown = performance.now();
		const card = splash(hero);
		// Mixed mode: the picture, then three lines, the last on the prompt row.
		const [first, second, third] = SPLASH_TEXT.map((text) => text.slice(0, width()));
		machine.setPrompt(third);
		machine.redraw([...Array(ROWS).fill(' '), first, second]);
		const loaded = await Promise.all([
		    machine.graphics.bitmap(assets + 'barzy-boi-trans.png', SPRITE.width, SPRITE.height),
		    quietly(machine.sound.load(assets + 'bounce-left.wav')),
		    quietly(machine.sound.load(assets + 'bounce-right.wav')),
		    quietly(machine.sound.load(assets + 'bounce-topbottom.wav')),
		]);
		await machine.sound.pause(Math.max(0, SPLASH_MS - (performance.now() - shown)) / 1000);
		card.stop();
		return loaded;
	    })()).then(([bitmap, left, right, topBottom]) => {
		if (stopped || !machine.running()) {
		    return;
		}
		machine.setPrompt(prompt);
		Object.assign(sounds, { left, right, topBottom });
		sprite = makeSprite(bitmap);
		screen = machine.graphics.screen(ROWS);
		background = bars(screen.width, screen.height);
		status();
		requestAnimationFrame(frame);
	    });
	},
	key(name) {
	    if (name === 'q' || name === 'Q' || name === 'Escape') {
		stopped = true;
		machine.graphics.clear();
		machine.exit();
		return machine.print([' ']);
	    }
	    if (!screen) {
		return; // still loading: only Q works
	    }
	    if (['ArrowUp', '+', '='].includes(name)) {
		level = Math.min(LEVELS, level + 1);
	    } else if (['ArrowDown', '-'].includes(name)) {
		level = Math.max(0, level - 1);
	    } else if (['ArrowRight', '>', '.'].includes(name)) {
		speedStep = Math.min(SPEEDS.length - 1, speedStep + 1);
	    } else if (['ArrowLeft', '<', ','].includes(name)) {
		speedStep = Math.max(0, speedStep - 1);
	    } else if (name === ' ') {
		if (level) {
		    savedLevel = level;
		    level = 0;
		} else {
		    level = savedLevel;
		}
	    } else {
		return;
	    }
	    status();
	},
	input() {
	    // Every key goes to key(); nothing is typed at a prompt.
	},
    };
};


/* BRUN DEBT: the US national debt, ticking, from the web page at
 * /us-debt-counter/ (its own repository). While the drive loads the
 * figures, a title card: a tycoon in a top hat between his money bags,
 * coins raining down, tipping his hat now and then. Then the counter: the
 * latest Treasury figure plus the past year's average growth, worked out
 * as the web page does, in big lamp-board digits, with the official
 * figures under it. S switches to one person's share, C to a chart of the
 * debt (R for a longer range), N back to the number, Q quits. Left out:
 * the live Treasury check (the server's copy is refreshed daily) and who
 * holds the debt.
 * payload: ["debt", "<url of the counter's debt.js>"], on the same site. */
PROGRAMS.debt = (machine, url) => {
    const US_POPULATION = 343000000; // as the web page has it
    const DAY = 864e5;
    const YEAR = 365.25 * DAY;
    const SPLASH_MS = 6500;
    const SPLASH_ROWS = 20;       // graphics rows; three rows of text below
    const NUMBER_ROWS = 6;        // the lamp board; the figures in text below
    const CHART_ROWS = 20;
    const LABEL_COLUMNS = 6;      // the chart's dollar labels, left of it
    const RANGES = [[10, 'LAST 10 YEARS'], [20, 'LAST 20 YEARS'],
		    [50, 'LAST 50 YEARS'], [Infinity, 'SINCE 1790']];
    const SPLASH_TEXT = ['A TICKING TALE OF TRILLIONS.',
			 "FIGURES FROM THE U.S. TREASURY'S",
			 'DEBT TO THE PENNY.'];
    // 4x4 ordered dither, as Barzy's title card has it.
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
    // The lamp board's characters, 5 x 7, one lamp per 1.
    const GLYPHS = {
	0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
	1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
	2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
	3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
	4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
	5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
	6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
	7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
	8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
	9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
	'$': ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
	',': ['00', '00', '00', '00', '01', '01', '10'],
	'.': ['0', '0', '0', '0', '0', '0', '1'],
	'-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
    };

    let data = null;              // { rows, latest, yearAgo, rate } once loaded
    let view = null;              // 'number' or 'chart'
    let share = false;            // one person's share instead of the total
    let range = 0;                // RANGES[range] on the chart
    let screen = null;
    let shown = '';               // what the lamp board shows now
    let stopped = false;

    const width = () => machine.columns();
    const factor = () => share ? 1 / US_POPULATION : 1;
    const center = (text) => {
	const t = toAscii(text).slice(0, width());
	return ' '.repeat(Math.max(0, Math.floor((width() - t.length) / 2))) + t;
    };
    const twoSided = (left, right) =>
	  toAscii(left).slice(0, Math.max(0, width() - right.length - 1))
	  .padEnd(Math.max(0, width() - right.length - 1)) + ' ' + right;

    // Money, as the web page writes it.
    function dollars(v, cents) {
	const digits = cents ? 2 : 0;
	return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', {
	    minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    function short(v, digits = 2) {
	// $40.710T, $6.60B; under a million, in whole dollars.
	const a = Math.abs(v);
	const [size, letter] = a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : [1, ''];
	if (!letter) {
	    return dollars(v, a < 100);
	}
	return (v < 0 ? '-$' : '$') + (a / size).toFixed(digits) + letter;
    }
    const signed = (v, text) => (v < 0 ? '-' : '+') + text.replace(/^-/, '');
    const day = (date) => {
	// Treasury's figures are as of close of business, about 5pm Eastern.
	const [y, m, d] = date.split('-').map(Number);
	return Date.UTC(y, m - 1, d, 22);
    };
    const longDate = (t) => new Date(t).toLocaleDateString('en-US', {
	month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).toUpperCase();

    async function load() {
	/* debt.js sets window.DEBT_SNAPSHOT to a JSON object: daily rows of
	 * [date, total, held by the public, intragovernmental] since 1993,
	 * and yearly rows of [date, total] back to 1790. */
	const response = await fetch(url, { cache: 'no-cache' });
	if (!response.ok) {
	    throw new Error(url + ': ' + response.status);
	}
	const text = await response.text();
	const snapshot = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
	const daily = snapshot.daily
	      .filter((r) => r[1] > 0)
	      .map(([date, total, pub, intra]) => ({ t: day(date), total, pub, intra }));
	if (daily.length < 300) {
	    throw new Error(url + ': too few figures');
	}
	const yearly = (snapshot.yearly || [])
	      .map(([date, total]) => ({ t: day(date), total }))
	      .filter((r) => r.total > 0 && r.t < daily[0].t);
	const latest = daily[daily.length - 1];
	const split = [...daily].reverse().find((r) => r.pub > 0 && r.intra > 0) || latest;
	// The earliest figure at least a year before the latest, for the rate.
	const yearAgo = daily.find((r) => r.t >= latest.t - 365 * DAY) || daily[0];
	return {
	    rows: [...yearly, ...daily].sort((a, b) => a.t - b.t),
	    latest, split, yearAgo,
	    rate: (latest.total - yearAgo.total) / (latest.t - yearAgo.t),
	};
    }

    const estimate = () => data.latest.total + data.rate * (Date.now() - data.latest.t);

    function valueAt(t) {
	// The debt at time t, in a straight line between Treasury's figures.
	const rows = data.rows;
	let lo = 0, hi = rows.length - 1;
	if (t <= rows[0].t) return rows[0].total;
	if (t >= rows[hi].t) return rows[hi].total;
	while (hi - lo > 1) {
	    const mid = (lo + hi) >> 1;
	    if (rows[mid].t <= t) lo = mid; else hi = mid;
	}
	const a = rows[lo], b = rows[hi];
	return a.total + (b.total - a.total) * (t - a.t) / (b.t - a.t);
    }

    /* The title card: a tycoon in a top hat, cane in one hand, between his
     * money bags on a bare floor, coins raining down behind them. Every few
     * seconds he lifts his hat and winks. Drawn in grey on a canvas each
     * frame and dithered to dots. Runs until stop(). */
    function splash() {
	const page = machine.graphics.screen(SPLASH_ROWS);
	const { width: w, height: h, dots } = page;
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const g = canvas.getContext('2d', { willReadFrequently: true });
	const grey = (v) => {
	    const c = Math.round(Math.min(1, v) * 255);
	    return 'rgb(' + c + ',' + c + ',' + c + ')';
	};
	const FONT = '"Arial Black", Impact, "Helvetica Neue", sans-serif';
	const GROUND = 158;
	const CX = 140;               // the middle of him

	// The title, drawn once, with a dotted shadow.
	const title = document.createElement('canvas');
	title.width = w;
	title.height = h;
	const tg = title.getContext('2d');
	const words = 'THE NATIONAL DEBT';
	let size = 22;
	tg.font = '900 ' + size + 'px ' + FONT;
	const across = tg.measureText(words).width;
	if (across > 262) {
	    size = Math.floor(size * 262 / across);
	    tg.font = '900 ' + size + 'px ' + FONT;
	}
	tg.textAlign = 'center';
	tg.textBaseline = 'middle';
	tg.translate(CX, 14);
	tg.transform(1, 0, -0.15, 1, 0, 0);
	tg.fillStyle = grey(0.45);
	tg.fillText(words, 2, 2);
	tg.fillStyle = '#fff';
	tg.fillText(words, 0, 0);

	function shape(trace, fill, line = 2, stroke = '#fff') {
	    // Trace a path, fill it, outline it (in white unless told).
	    g.beginPath();
	    trace();
	    if (fill) {
		g.fillStyle = fill;
		g.fill();
	    }
	    if (line) {
		g.lineWidth = line;
		g.strokeStyle = stroke;
		g.stroke();
	    }
	}

	function bag(x, size, lift, squash) {
	    // A sack of money: a round belly on the floor, a neck tied with
	    // string, two ears of cloth above the knot, a $ on the front.
	    const rx = size * (0.82 + squash);
	    const ry = size * (0.7 - squash);
	    const cy = GROUND - lift - ry;
	    const neck = cy - ry - size * 0.12;
	    shape(() => {
		g.moveTo(x - size * 0.16, neck);
		g.lineTo(x - size * 0.46, neck - size * 0.3);
		g.lineTo(x, neck - size * 0.16);
		g.lineTo(x + size * 0.46, neck - size * 0.3);
		g.lineTo(x + size * 0.16, neck);
		g.closePath();
	    }, grey(0.55), 1.5);
	    shape(() => {
		g.moveTo(x - size * 0.16, neck);
		g.lineTo(x - size * 0.3, cy - ry + 3);
		g.lineTo(x + size * 0.3, cy - ry + 3);
		g.lineTo(x + size * 0.16, neck);
		g.closePath();
	    }, grey(0.55), 1.5);
	    shape(() => g.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2), grey(0.55), 2);
	    shape(() => {
		g.moveTo(x - size * 0.2, neck + 1);
		g.lineTo(x + size * 0.2, neck + 1);
	    }, null, 2.5);
	    g.font = '900 ' + Math.round(size * 0.95) + 'px ' + FONT;
	    g.textAlign = 'center';
	    g.textBaseline = 'middle';
	    g.lineJoin = 'round';
	    g.lineWidth = 3;
	    g.strokeStyle = '#000';
	    g.strokeText('$', x, cy + 1);
	    g.fillStyle = '#fff';
	    g.fillText('$', x, cy + 1);
	}

	function arm(fromX, fromY, toX, toY) {
	    // A sleeve, outlined, ending in a white glove.
	    g.lineCap = 'round';
	    shape(() => { g.moveTo(fromX, fromY); g.lineTo(toX, toY); }, null, 8);
	    shape(() => { g.moveTo(fromX, fromY); g.lineTo(toX, toY); }, null, 4.5, grey(0.22));
	    shape(() => g.arc(toX, toY, 4.5, 0, Math.PI * 2), '#fff', 1, '#000');
	}

	function tycoon(s) {
	    const bob = Math.sin(s * 2.4) * 1.2;          // breathing
	    const y = (v) => v + bob;
	    const p = (s % 3.2) / 3.2;                    // every 3.2 s, his hat
	    const tip = p > 0.55 && p < 0.9 ? Math.sin(Math.PI * (p - 0.55) / 0.35) : 0;
	    const wiggle = Math.sin(s * 9) * 1.2;         // the moustache's curls

	    // The cane, behind him.
	    g.lineCap = 'round';
	    shape(() => { g.moveTo(102, y(119)); g.lineTo(95, GROUND - 1); }, null, 2.5);
	    shape(() => g.arc(108, y(119), 6, Math.PI, Math.PI * 2.15), null, 2.5);

	    // Legs and shoes.
	    for (const [leg, shoe] of [[124, 123], [147, 157]]) {
		shape(() => g.rect(leg, y(146), 9, GROUND - 5 - y(146)), grey(0.22), 1.5);
		shape(() => g.ellipse(shoe, GROUND - 4, 11, 4, 0, 0, Math.PI * 2), '#000', 2);
	    }

	    // The suit: a round belly, a white shirt front, two buttons and a
	    // watch chain.
	    shape(() => g.ellipse(CX, y(126), 30, 25, 0, 0, Math.PI * 2), grey(0.22), 2);
	    shape(() => {
		g.moveTo(CX - 11, y(102));
		g.lineTo(CX + 11, y(102));
		g.lineTo(CX, y(124));
		g.closePath();
	    }, '#fff', 0);
	    for (const by of [131, 140]) {
		shape(() => g.arc(CX, y(by), 2, 0, Math.PI * 2), '#fff', 0);
	    }
	    shape(() => {
		g.moveTo(CX - 23, y(127));
		g.quadraticCurveTo(CX - 12, y(139), CX, y(131));
	    }, null, 1.2);
	    shape(() => g.arc(CX - 23, y(127), 3, 0, Math.PI * 2), '#fff', 0);

	    // His right arm (on our left) holds the cane.
	    arm(CX - 24, y(110), 104, y(121));

	    // Head: ears, a black face drawn in white lines.
	    for (const side of [-1, 1]) {
		shape(() => g.arc(CX + side * 18, y(86), 5, 0, Math.PI * 2), '#000', 2);
	    }
	    shape(() => g.arc(CX, y(84), 18, 0, Math.PI * 2), '#000', 2);
	    // Eyes: on our left, a wink while the hat's up.
	    if (tip > 0.3) {
		shape(() => g.arc(CX - 7, y(81), 3, Math.PI, Math.PI * 2), null, 1.5);
	    } else {
		shape(() => g.ellipse(CX - 7, y(79), 3.5, 4.5, 0, 0, Math.PI * 2), '#fff', 0);
		shape(() => g.arc(CX - 6, y(80), 1.8, 0, Math.PI * 2), '#000', 0);
	    }
	    shape(() => g.ellipse(CX + 7, y(79), 3.5, 4.5, 0, 0, Math.PI * 2), '#fff', 0);
	    shape(() => g.arc(CX + 6, y(80), 1.8, 0, Math.PI * 2), '#000', 0);
	    // Bushy brows, raised with the hat.
	    for (const side of [-1, 1]) {
		shape(() => {
		    g.moveTo(CX + side * 12, y(74) - 2 * tip);
		    g.lineTo(CX + side * 3, y(72) - 3 * tip);
		}, null, 2.5);
	    }
	    // A round nose, a smile, and a big handlebar moustache.
	    shape(() => g.arc(CX, y(98), 5, Math.PI * 0.15, Math.PI * 0.85), null, 1.5);
	    for (const side of [-1, 1]) {
		// Edged in black, so it stands clear of his chin.
		shape(() => {
		    g.moveTo(CX, y(91));
		    g.quadraticCurveTo(CX + side * 11, y(87), CX + side * 20, y(92));
		    g.quadraticCurveTo(CX + side * 27, y(95), CX + side * 25, y(86) + wiggle);
		    g.quadraticCurveTo(CX + side * 30, y(99), CX + side * 16, y(99));
		    g.quadraticCurveTo(CX + side * 6, y(99), CX, y(96));
		    g.closePath();
		}, '#fff', 1.5, '#000');
	    }
	    shape(() => g.arc(CX, y(88), 4.5, 0, Math.PI * 2), grey(0.65), 1.5);
	    // The bow tie.
	    shape(() => {
		g.moveTo(CX, y(104));
		g.lineTo(CX - 10, y(99));
		g.lineTo(CX - 10, y(109));
		g.closePath();
		g.moveTo(CX, y(104));
		g.lineTo(CX + 10, y(99));
		g.lineTo(CX + 10, y(109));
		g.closePath();
	    }, '#000', 1.5);
	    shape(() => g.arc(CX, y(104), 2.5, 0, Math.PI * 2), '#fff', 0);

	    // The top hat: lifted and tilted while he tips it.
	    const hatX = CX + 3 * tip;
	    const hatY = y(67) - 12 * tip;
	    const tilt = -0.3 * tip;
	    g.save();
	    g.translate(hatX, hatY);
	    g.rotate(tilt);
	    shape(() => {
		g.moveTo(-15, 0);
		g.lineTo(-17, -30);
		g.lineTo(17, -30);
		g.lineTo(15, 0);
		g.closePath();
	    }, '#000', 2);
	    shape(() => g.rect(-15.5, -8, 31, 5), grey(0.7), 0);
	    shape(() => { g.moveTo(-10, -26); g.lineTo(-9, -12); }, null, 1.5);   // a shine
	    shape(() => g.ellipse(0, 0, 26, 4, 0, 0, Math.PI * 2), '#000', 2);
	    g.restore();

	    // His left arm (on our right): at his side, or up at the brim.
	    const brimX = hatX + 24 * Math.cos(tilt);
	    const brimY = hatY + 24 * Math.sin(tilt);
	    const reach = Math.min(1, tip * 1.6);
	    arm(CX + 24, y(110), CX + 36 + (brimX - CX - 36) * reach, y(136) + (brimY - y(136)) * reach);
	}

	const coins = [];
	let lastCoin = 0;
	let running = true;
	const started = performance.now();
	let last = started;

	function frame(now) {
	    if (!running || stopped || !machine.running()) {
		return;
	    }
	    const s = (now - started) / 1000;
	    const dt = Math.min(0.1, (now - last) / 1000);
	    last = now;

	    g.fillStyle = '#000';
	    g.fillRect(0, 0, w, h);
	    g.drawImage(title, 0, 0);
	    g.fillStyle = '#fff';
	    g.fillRect(0, GROUND, w, 1);  // the floor

	    // Coins rain down either side of him, spinning, behind the bags.
	    if (now - lastCoin > 110) {
		lastCoin = now;
		const left = Math.random() < 0.5;
		coins.push({
		    x: left ? 8 + Math.random() * 86 : 186 + Math.random() * 86,
		    y: 28, vx: (Math.random() - 0.5) * 10, vy: 10 + Math.random() * 25,
		    spin: Math.random() * 6, rate: 5 + Math.random() * 7,
		});
	    }
	    for (const c of coins) {
		c.vy += 160 * dt;
		c.x += c.vx * dt;
		c.y += c.vy * dt;
		c.spin += c.rate * dt;
		const face = Math.abs(Math.cos(c.spin));
		shape(() => g.ellipse(c.x, c.y, Math.max(0.6, 3.5 * face), 3.5, 0, 0, Math.PI * 2), '#fff', 0);
		if (face > 0.97) {    // a glint as it turns face on
		    shape(() => {
			g.moveTo(c.x - 6, c.y);
			g.lineTo(c.x + 6, c.y);
			g.moveTo(c.x, c.y - 6);
			g.lineTo(c.x, c.y + 6);
		    }, null, 1);
		}
	    }
	    while (coins.length && coins[0].y > GROUND - 3) {
		coins.shift();
	    }

	    // The bags: the big ones jiggle, the small ones hop.
	    const hop = (phase) => Math.max(0, Math.sin(s * 5 + phase)) * 5;
	    const jiggle = (phase) => Math.sin(s * 10 + phase) * 0.03;
	    bag(46, 26, 0, jiggle(0));
	    bag(80, 14, hop(0), 0);
	    bag(234, 26, 0, jiggle(2));
	    bag(198, 14, hop(Math.PI), 0);

	    tycoon(s);

	    const pixels = g.getImageData(0, 0, w, h).data;
	    for (let yy = 0, i = 0; yy < h; yy++) {
		for (let xx = 0; xx < w; xx++, i++) {
		    dots[i] = pixels[i * 4] / 255 > BAYER[(yy & 3) * 4 + (xx & 3)] ? 1 : 0;
		}
	    }
	    page.show();
	    requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);
	return { stop() { running = false; } };
    }

    /* The counter: a lamp board across the top, each lamp a 2 x 4 block of
     * dots, in a frame; then the figures in text. */
    function drawBoard(text) {
	const { width: w, dots } = screen;
	dots.fill(0);
	const gap = 2;
	const across = (step) => [...text].reduce(
	    (n, c) => n + (GLYPHS[c] ? GLYPHS[c][0].length * step + gap : 0), -gap);
	const step = across(3) <= w - 8 ? 3 : 2;
	// Lamps touch top to bottom: a gap there fights the scanlines.
	const lamp = { width: step - 1, height: 4 };
	const top = 10;
	let x = Math.floor((w - across(step)) / 2);
	for (const c of text) {
	    const glyph = GLYPHS[c];
	    if (!glyph) {
		continue;
	    }
	    glyph.forEach((row, gy) => {
		for (let gx = 0; gx < row.length; gx++) {
		    if (row[gx] !== '1') {
			continue;
		    }
		    for (let yy = 0; yy < lamp.height; yy++) {
			const at = (top + gy * 4 + yy) * w + x + gx * step;
			dots.fill(1, at, at + lamp.width);
		    }
		}
	    });
	    x += glyph[0].length * step + gap;
	}
	// The frame round the board, with its corners cut.
	const [left, right, upper, lower] = [2, w - 3, 3, 44];
	dots.fill(1, upper * w + left + 2, upper * w + right - 1);
	dots.fill(1, lower * w + left + 2, lower * w + right - 1);
	for (let yy = upper + 2; yy <= lower - 2; yy++) {
	    dots[yy * w + left] = 1;
	    dots[yy * w + right] = 1;
	}
	for (const [cx, cy] of [[left + 1, upper + 1], [right - 1, upper + 1],
				[left + 1, lower - 1], [right - 1, lower - 1]]) {
	    dots[cy * w + cx] = 1;
	}
	screen.show();
    }

    function boardText() {
	return share ? dollars(estimate() / US_POPULATION, true) : dollars(estimate(), false);
    }

    function numberLines() {
	const { latest, split, yearAgo, rate } = data;
	const f = factor();
	const change = latest.total - yearAgo.total;
	const percent = (v, digits = 1) => (v * 100).toFixed(digits) + '%';
	const figure = (label, value, extra) => twoSided(label, value.padStart(10) + '  ' + extra.padStart(7));
	const rateLine = share
	      ? signed(rate, dollars(rate * DAY * f, true)) + ' PER DAY   ' +
	      signed(rate, dollars(rate * 365 * DAY * f, false)) + ' PER YEAR'
	      : signed(rate, dollars(rate * 1000, false)) + ' PER SECOND   ' +
	      signed(rate, short(rate * DAY)) + ' PER DAY';
	return [
	    ...Array(NUMBER_ROWS).fill(' '),
	    center(share ? 'YOUR SHARE OF THE DEBT, RIGHT NOW' : 'ESTIMATED U.S. NATIONAL DEBT, RIGHT NOW'),
	    center(rateLine),
	    ' ',
	    twoSided(share ? 'OFFICIAL SHARE' : 'OFFICIAL TOTAL', dollars(latest.total * f, true)),
	    twoSided(' ', 'AS OF ' + longDate(latest.t)),
	    ' ',
	    figure('HELD BY THE PUBLIC', short(split.pub * f, 3), percent(split.pub / split.total)),
	    figure('INTRAGOVERNMENTAL', short(split.intra * f, 3), percent(split.intra / split.total)),
	    figure('CHANGE, PAST YEAR', signed(change, short(change * f)),
		   signed(change, percent(change / yearAgo.total, 2))),
	    ' ',
	    center(share ? 'THE DEBT, SPLIT 343 MILLION WAYS.'
		   : 'ABOUT ' + dollars(latest.total / US_POPULATION, false) + ' A PERSON IN THE U.S.'),
	    ' ',
	    ' ',
	    center('THE LATEST TREASURY FIGURE, PLUS THE'),
	    center("PAST YEAR'S AVERAGE GROWTH: AN ESTIMATE."),
	    center('SOURCE: U.S. TREASURY, DEBT TO THE PENNY'),
	];
    }

    function scale(max) {
	/* The chart's top and its gridlines: n steps of a round amount, n
	 * dividing the 18 text rows the plot spans, so every gridline sits on
	 * a row and its label beside it. The lowest top that fits. */
	const steps = [];
	for (let p = Math.floor(Math.log10(max)) - 2; p <= Math.ceil(Math.log10(max)); p++) {
	    for (const m of [1, 2, 2.5, 5]) {
		steps.push(m * Math.pow(10, p));
	    }
	}
	let best = null;
	for (const n of [9, 6, 3]) {
	    for (const step of steps) {
		if (n * step >= max && (!best || n * step < best.top)) {
		    best = { n, step, top: n * step };
		}
	    }
	}
	return best;
    }

    function label(v) {
	// $45T, $2.5T, $120K: short enough for the chart's margin.
	const [size, letter] = v >= 1e12 ? [1e12, 'T'] : v >= 1e9 ? [1e9, 'B'] : v >= 1e6 ? [1e6, 'M']
	      : v >= 1e3 ? [1e3, 'K'] : [1, ''];
	return '$' + String(+(v / size).toFixed(1)) + letter;
    }

    function drawChart() {
	/* The debt over the range, plotted from the left margin to the right
	 * edge: a line with a light fill under it, dotted gridlines, ticks
	 * for the years. Labels are text under the dots. */
	const { width: w, dots } = screen;
	const columns = width();
	const f = factor();
	const [years, title] = RANGES[range];
	const t1 = data.latest.t;
	const t0 = Math.max(data.rows[0].t, t1 - years * YEAR);
	const x0 = Math.ceil(w * LABEL_COLUMNS / columns) + 1;
	const x1 = w - 1;
	const timeAt = (x) => t0 + (x - x0) / (x1 - x0) * (t1 - t0);
	const xAt = (t) => x0 + (t - t0) / (t1 - t0) * (x1 - x0);
	let max = 0;
	for (let x = x0; x <= x1; x++) {
	    max = Math.max(max, valueAt(timeAt(x)) * f);
	}
	const { n, step, top } = scale(max);
	const yTop = 12, yBottom = 156;  // the middles of text rows 1 and 19
	const yAt = (v) => Math.round(yBottom - v / top * (yBottom - yTop));
	const lines = Array(22).fill(' ');

	dots.fill(0);
	for (let k = 0; k <= n; k++) {
	    const row = 19 - k * 18 / n;
	    const gy = row * 8 + 4;
	    for (let x = x0; x <= x1; x += k ? 3 : 1) {
		dots[gy * w + x] = 1;
	    }
	    lines[row] = label(k * step).padStart(LABEL_COLUMNS - 1);
	}
	let previous = null;
	for (let x = x0; x <= x1; x++) {
	    const y = yAt(valueAt(timeAt(x)) * f);
	    for (let yy = y; yy < yBottom; yy++) {
		if (!(x & 1) && !(yy & 1)) {
		    dots[yy * w + x] = 1;
		}
	    }
	    const from = previous === null ? y : previous;
	    for (let yy = Math.min(from, y); yy <= Math.max(from, y); yy++) {
		dots[yy * w + x] = 1;
	    }
	    previous = y;
	}

	// The years along the bottom: ticks on the dots, labels in row 20.
	const span = (t1 - t0) / YEAR;
	const every = span <= 12 ? 2 : span <= 25 ? 5 : span <= 60 ? 10 : 50;
	const first = new Date(t0).getUTCFullYear();
	const row = Array(columns).fill(' ');
	let free = LABEL_COLUMNS;
	for (let year = Math.ceil(first / every) * every; ; year += every) {
	    const t = Date.UTC(year, 0, 1);
	    if (t > t1) {
		break;
	    }
	    if (t < t0) {
		continue;
	    }
	    const x = Math.round(xAt(t));
	    for (let yy = yBottom + 1; yy <= yBottom + 3; yy++) {
		dots[yy * w + x] = 1;
	    }
	    const column = Math.round(x * columns / w) - 2;
	    if (column >= free && column + 4 <= columns) {
		row.splice(column, 4, ...String(year));
		free = column + 5;
	    }
	}
	screen.show();
	lines[20] = row.join('');
	lines[21] = twoSided((share ? 'YOUR SHARE, ' : 'TOTAL DEBT, ') + title,
			     short(data.latest.total * f, share ? 0 : 2));
	return lines;
    }

    function prompt() {
	const narrow = width() < 80;
	if (view === 'chart') {
	    return narrow ? 'R RANGE  S SHARE  N NUMBER  Q ' : 'R RANGE   S YOUR SHARE   N NUMBER   Q QUIT ';
	}
	return narrow ? 'S SHARE  C CHART  Q QUIT ' : 'S YOUR SHARE   C CHART   Q QUIT ';
    }

    function showView(next) {
	// Put up the number or the chart, on a fresh graphics screen.
	const changed = next !== view;
	view = next;
	if (changed || !screen) {
	    machine.graphics.clear();
	    screen = machine.graphics.screen(view === 'chart' ? CHART_ROWS : NUMBER_ROWS);
	}
	machine.setPrompt(prompt());
	if (view === 'chart') {
	    machine.redraw(drawChart());
	    return;
	}
	shown = '';
	machine.redraw(numberLines());
	if (changed) {
	    requestAnimationFrame(tick);
	}
    }

    function tick() {
	if (stopped || !machine.running() || view !== 'number') {
	    return;
	}
	const text = boardText();
	if (text !== shown) {
	    shown = text;
	    drawBoard(text);
	}
	requestAnimationFrame(tick);
    }

    return {
	allKeys: true, // every key comes to key(), at once
	start() {
	    machine.setPrompt('');
	    // The drive runs the whole time: the title card, then the figures.
	    return machine.work((async () => {
		const began = performance.now();
		const card = splash();
		const [first, second, third] = SPLASH_TEXT.map((text) => text.slice(0, width()));
		machine.setPrompt(third);
		machine.redraw([...Array(SPLASH_ROWS).fill(' '), first, second]);
		try {
		    const loaded = await load();
		    await machine.sound.pause(Math.max(0, SPLASH_MS - (performance.now() - began)) / 1000);
		    return loaded;
		} finally {
		    card.stop();
		}
	    })()).then((loaded) => {
		if (stopped || !machine.running()) {
		    return;
		}
		data = loaded;
		showView('number');
	    });
	},
	key(name) {
	    if (name === 'q' || name === 'Q' || name === 'Escape') {
		stopped = true;
		machine.graphics.clear();
		machine.exit();
		return machine.print([' ']);
	    }
	    if (!data) {
		return; // still loading: only Q works
	    }
	    const k = name.length === 1 ? name.toUpperCase() : name;
	    if (k === 'S') {
		share = !share;
		showView(view);
	    } else if (k === 'C' && view !== 'chart') {
		showView('chart');
	    } else if (k === 'N' && view !== 'number') {
		showView('number');
	    } else if (view === 'chart' && (k === 'R' || k === 'ArrowRight')) {
		range = (range + 1) % RANGES.length;
		showView('chart');
	    } else if (view === 'chart' && k === 'ArrowLeft') {
		range = (range + RANGES.length - 1) % RANGES.length;
		showView('chart');
	    }
	},
	input() {
	    // Every key goes to key(); nothing is typed at a prompt.
	},
    };
};


/* The telephone: what answers at each number (assets/phone-book.json) and
 * how a call sounds. Shared by the modem (PR#2) and RUN DEMONDIAL. */
const PHONE_BOOK = 'assets/phone-book.json';
const TOUCH_TONES = { // row and column frequencies of each key
    1: [697, 1209], 2: [697, 1336], 3: [697, 1477],
    4: [770, 1209], 5: [770, 1336], 6: [770, 1477],
    7: [852, 1209], 8: [852, 1336], 9: [852, 1477],
    '*': [941, 1209], 0: [941, 1336], '#': [941, 1477],
};
const LINE_TONES = { dial: [350, 440], ring: [440, 480], busy: [480, 620], answer: [2225], fax: [1100] };

function phoneNumber(text) {
    // The seven-digit number in what was typed, as 555-0147, or null.
    const digits = text.replace(/[^0-9]/g, '');
    if (digits.length < 7 || digits.length > 11) {
	return null;
    }
    const local = digits.slice(-7);
    return local.slice(0, 3) + '-' + local.slice(3);
}

function whatAnswers(book, number) {
    // A listed number says what's there. Any other rings out, is busy, or a
    // person picks up, decided by its digits, so it's the same every time.
    if (book[number]) {
	return book[number];
    }
    let hash = 0;
    for (const character of number) {
	hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    }
    const roll = hash % 20;
    if (roll < 3) {
	return { answers: 'busy' };
    }
    if (roll < 6) {
	return { answers: 'voice', says: 'Hello?' };
    }
    return { answers: 'none' };
}

function loadPhoneBook(machine) {
    return machine.wait(fetch(PHONE_BOOK).then((response) => {
	if (!response.ok) {
	    throw new Error(PHONE_BOOK + ': ' + response.status);
	}
	return response.json();
    }));
}

async function touchTones(machine, number, digitSeconds, gapSeconds) {
    for (const digit of number.replace(/-/g, '')) {
	await machine.sound.tone(TOUCH_TONES[digit], digitSeconds);
	await machine.sound.pause(gapSeconds);
    }
}


/* What's on the other end of a carrier. The phone book names one for a
 * number ("system": "maxwell"). Each is a function of that phone book
 * entry (and the machine) returning { start(), input(text) }; both give
 * back { print: [lines], prompt: 'text', hangup: true }, all optional, or
 * a promise of one. */
const SYSTEMS = {};

/* A gopher hole on the end of the line, such as Dungeoneer's: browsed the
 * way BRUN GOPHER browses, through the site's gopher proxy, starting at
 * the phone book's "hole": a gopher:// address, or one per environment,
 * { local, uat, prod }, so a dev copy calls the hole on this machine and
 * /menu-uat/ calls the uat hole. The proxy has to be told the hole is the
 * site's own (GOPHER_EXTRA_HOLES; see INSTALLATION.md). If it can't be
 * reached, the line drops. */
function environment() {
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
	return 'local';
    }
    return new URL(document.baseURI).pathname.startsWith('/menu-uat/') ? 'uat' : 'prod';
}

SYSTEMS.gopher = (entry, machine) => {
    const PROXY = 'proxy/gopher.cgi';
    const hole = typeof entry.hole === 'string' ? entry.hole : (entry.hole || {})[environment()];
    let state = null;

    async function step(input) {
	const reply = await machine.wait(fetch(PROXY, {
	    method: 'POST',
	    headers: { 'Content-Type': 'application/json' },
	    body: JSON.stringify({ input, state, columns: machine.columns(), rows: machine.rows() - 1 }),
	}).then((response) => {
	    if (!response.ok) {
		throw new Error('HTTP ' + response.status);
	    }
	    return response.json();
	}));
	state = reply.state === undefined ? null : reply.state;
	return reply;
    }

    const rows = (reply) => (reply.print || []).flatMap((text) => toAscii(text).split('\n'))
	  .flatMap((text) => text.length <= machine.columns() ? [text || ' '] : wordWrap(text, machine.columns()));

    async function answer(input) {
	try {
	    const reply = await step(input);
	    if (reply.exit) {
		return { print: rows(reply), hangup: true };
	    }
	    return { print: rows(reply), prompt: toAscii(reply.prompt || '?') };
	} catch (error) {
	    console.log(error);
	    return { print: [' ', 'THE LINE WENT DEAD.'], hangup: true };
	}
    }

    return {
	async start() {
	    try {
		await step(null); // the proxy's home menu, then straight to the hole
		if (!hole) {
		    return { print: [' ', (entry.name || 'THE HOLE') + ' IS NOT ANSWERING.'], hangup: true };
		}
		const reply = await step('G ' + hole);
		const lines = rows(reply);
		if (lines.some((text) => /NO ANSWER FROM|NO SUCH HOST/.test(text))) {
		    return { print: [' ', (entry.name || 'THE HOLE') + ' IS NOT ANSWERING.'], hangup: true };
		}
		return { print: [' ', entry.name || '', ...lines], prompt: toAscii(reply.prompt || '?') };
	    } catch (error) {
		console.log(error);
		return { print: [' ', 'THE LINE WENT DEAD.'], hangup: true };
	    }
	},
	input: (text) => answer(text),
    };
};

/* A gopher hole straight from the disk, no modem: RUN DUNGEONEER.
 * payload: ["gopher", address, "NAME"], the address as in the phone book
 * (one gopher:// address, or { local, uat, prod }). The same as dialling
 * the hole's number, through SYSTEMS.gopher. */
PROGRAMS.gopher = (machine, hole, name) => {
    const line = SYSTEMS.gopher({ hole, name }, machine);
    const show = (reply) => {
	if (reply.hangup) {
	    machine.exit();
	} else {
	    machine.setPrompt(reply.prompt || '?');
	}
	return machine.print(reply.print || []);
    };
    return {
	start: () => line.start().then(show),
	input: (text) => line.input(text).then(show),
    };
};

/* A system with a logon. Every one takes the same three accounts, so a
 * visitor is never stuck on outside knowledge:
 *   guest   gets in, to a smaller area that hints at the rest;
 *   help    says what the accounts are, then asks again;
 *   admin   asks for the password (the phone book's "password"), which
 *           opens everything. The password typed at the logon works too.
 * guest and admin are areas: functions returning { start(), input(said) }.
 * Three wrong answers and the line drops. */
function logonSystem({ banner, logonPrompt, passwordPrompt, wrong, help, guest, admin, secret }) {
    let mode = 'logon';         // then 'password', or inside: 'guest', 'admin'
    let area = null;
    let failures = 0;
    const enter = (which) => {
	mode = which;
	area = which === 'guest' ? guest() : admin();
	return area.start();
    };
    const refuse = () => {
	failures++;
	return failures >= 3 ? { print: [wrong, ' '], hangup: true }
	    : { print: [wrong, ' '], prompt: logonPrompt };
    };
    return {
	start: () => ({ print: banner, prompt: logonPrompt }),
	input(text) {
	    const said = text.trim().toLowerCase();
	    if (mode === 'guest' || mode === 'admin') {
		return area.input(said);
	    }
	    if (mode === 'password') {
		mode = 'logon';
		return secret && said === secret ? enter('admin') : refuse();
	    }
	    if (said === 'guest') {
		return enter('guest');
	    }
	    if (said === 'help') {
		return { print: [...help, ' '], prompt: logonPrompt };
	    }
	    if (said === 'admin') {
		mode = 'password';
		return { prompt: passwordPrompt };
	    }
	    return secret && said === secret ? enter('admin') : refuse();
	},
    };
}

const LEAVING = /^(bye|quit|exit|logoff|logout|q)$/;

/* MAXWELL: an old research computer, named for Maxwell's demon, the one
 * that sorts the fast from the slow. Guests read its public notes, which
 * say how to get further. A draft, for rewriting. */
SYSTEMS.maxwell = (entry) => logonSystem({
    banner: [' ', 'MAXWELL', 'APPLIED THERMODYNAMICS GROUP', ' ',
	     'FOR A DEMONSTRATION, LOG ON AS GUEST.', ' '],
    logonPrompt: 'LOGON: ',
    passwordPrompt: 'PASSWORD: ',
    wrong: 'LOGON INCORRECT',
    help: ['ACCOUNTS: GUEST, ADMIN.', 'GUEST READS THE PUBLIC NOTES.', 'ADMIN NEEDS A PASSWORD.'],
    secret: (entry.password || '').toLowerCase(),
    guest: () => {
	const menu = [' ', 'MAXWELL PUBLIC NOTES', ' ', '1  ABOUT THIS SYSTEM', '2  THE DEMON',
		      '3  OTHER LINES', 'Q  LOG OFF', ' '];
	const NOTES = {
	    1: ['THIS SYSTEM IS NAMED FOR A MAN, NOT A DEMON.',
		'HIS FIRST NAME OPENS THE REST.'],
	    2: ['IN 1867 A PHYSICIST IMAGINED A TINY DEMON',
		'AT A DOOR BETWEEN TWO ROOMS OF GAS, LETTING',
		'FAST MOLECULES ONE WAY AND SLOW ONES THE OTHER.',
		'IT WOULD SORT HEAT FOR NOTHING. IT CANNOT,',
		'AND FINDING OUT WHY TOOK A CENTURY.'],
	    3: ['OTHER LINES THAT ANSWER:',
		'  555-0127  A GAME COMPANY',
		'  555-0147  SOMETHING THAT TALKS'],
	};
	return {
	    start: () => ({ print: menu, prompt: 'NOTE? ' }),
	    input(said) {
		if (LEAVING.test(said)) {
		    return { print: ['LOGGED OFF.', ' '], hangup: true };
		}
		return { print: [' ', ...(NOTES[said] || ['NO SUCH NOTE.']), ...menu], prompt: 'NOTE? ' };
	    },
	};
    },
    admin: () => {
	const SAYS = {
	    log: ['RESEARCH LOG', ' ',
		  'DAY 112  THE DEMON SORTED FOR ELEVEN SECONDS.',
		  'DAY 113  IT ASKED WHAT IT WAS SORTING FOR.',
		  'DAY 114  WE TURNED THE ROOM OFF.'],
	    help: ['COMMANDS: LOG, HELP, BYE.'],
	};
	return {
	    start: () => ({ print: [' ', 'ADMINISTRATOR.', 'TYPE HELP FOR COMMANDS.', ' '], prompt: 'MAXWELL> ' }),
	    input(said) {
		if (LEAVING.test(said)) {
		    return { print: ['LOGGED OFF.', ' '], hangup: true };
		}
		return { print: [...(SAYS[said] || ['UNKNOWN COMMAND.']), ' '], prompt: 'MAXWELL> ' };
	    },
	};
    },
});

/* daemous: the mind from the brain scan (the site's 1989 self-portrait,
 * /daemous/), on a line of its own. Everything in lowercase. Guests may
 * talk; it tells them it looks different upside down. Its password is
 * its name upside down. A draft, for rewriting. */
SYSTEMS.daemous = (entry) => {
    const SAYS = [
	[/^(who|what) are you|^who|^what/, ['i am daemous.', 'i was made in 1989 from a brain scan.']],
	[/^how/, ['fire, and a scanner, and pbmtools.', 'i remember the fire best.']],
	[/^why/, ['someone wanted to see inside their own head.', 'so do i.']],
	[/^(hello|hi)\b/, ['hello.']],
    ];
    const talk = (prompt, extra, help) => (said) => {
	if (LEAVING.test(said)) {
	    return { print: ['goodbye.', ' '], hangup: true };
	}
	if (/^(help|\?)$/.test(said)) {
	    return { print: [...help, ' '], prompt };
	}
	if (extra[said]) {
	    return { print: [...extra[said], ' '], prompt };
	}
	const reply = SAYS.find(([pattern]) => pattern.test(said));
	return { print: [...(reply ? reply[1] : ['i do not know that yet.']), ' '], prompt };
    };
    return logonSystem({
	banner: [' ', 'daemous', ' '],
	logonPrompt: 'logon: ',
	passwordPrompt: 'password: ',
	wrong: 'no.',
	help: ['accounts: guest, admin.', 'guests may talk. the rest is for those who know me.'],
	secret: (entry.password || '').toLowerCase(),
	guest: () => ({
	    start: () => ({ print: [' ', 'hello, guest.', 'i will talk a little.',
				    'i look different upside down.', ' '], prompt: 'guest> ' }),
	    input: talk('guest> ', {}, ['ask me who, how, or why.', 'say bye when you are done.']),
	}),
	admin: () => ({
	    start: () => ({ print: [' ', 'hello.', 'it has been a long time.', ' '], prompt: '> ' }),
	    input: talk('> ', {
		memories: ['a scanner hums.', 'fire on a graphics screen.', 'a face, then a skull, then a face.'],
	    }, ['ask me who, how, or why, or for my memories.', 'say bye when you are done.']),
	}),
    });
};

/* HELLHOUND SOFTWARE: a game company's BBS, from below. */
SYSTEMS.hellhound = () => {
    let writing = false;
    return {
	start: () => ({
	    print: [' ', 'HELLHOUND SOFTWARE', 'GAMES FROM BELOW SINCE 1982', ' ',
		    'NOW IN DEVELOPMENT:',
		    '  DUNGEONEER       APPLE II, 48K, 2 DISKS',
		    '                   BETA LINE: 555-0130',
		    '  BRIMSTONE MAZE   ATARI 800', ' ',
		    'THE SYSOP IS OUT.'],
	    prompt: 'LEAVE A MESSAGE (Y/N)? ',
	}),
	input(text) {
	    const answer = text.trim().toUpperCase();
	    if (writing) {
		return { print: [' ', 'THE SYSOP WILL READ IT', 'ON THE WAY BACK UP.', ' ',
				 'THANKS FOR CALLING.'], hangup: true };
	    }
	    if (answer.startsWith('Y')) {
		writing = true;
		return { prompt: 'MESSAGE? ' };
	    }
	    return { print: [' ', 'THANKS FOR CALLING. CALL AGAIN!'], hangup: true };
	},
    };
};

/* A line with a modem on it and nothing good: the carrier comes up, then
 * garbage, then it drops. */
SYSTEMS.noise = () => ({
    start() {
	const junk = '~`!@#$%^&*()_+{}|:"<>?[];,./\\';
	const line = () => Array.from({ length: 12 + Math.floor(Math.random() * 20) },
				      () => junk[Math.floor(Math.random() * junk.length)]).join('');
	return { print: [line(), line(), line()], hangup: true };
    },
});


async function placeCall(machine, book, number, speaker = true) {
    /* Dial a number, listen, and say what happened, as a modem would:
     * { lines: ['BUSY'] } and the like, or, when a computer with a system
     * behind it answers, { system, baud }. With the speaker off the call
     * takes as long, silently. Shared by PR#2 and RUN DIALUP. */
    const sound = machine.sound;
    const tone = (name, seconds) => speaker ? sound.tone(LINE_TONES[name], seconds) : sound.pause(seconds);
    const ring = async (times) => {
	for (let i = 0; i < times; i++) {
	    await tone('ring', 1.2);
	    await sound.pause(1.6);
	}
    };
    await tone('dial', 0.8);
    if (speaker) {
	await touchTones(machine, number, 0.09, 0.07);
    } else {
	await sound.pause(1.1);
    }
    await sound.pause(0.8);
    const there = whatAnswers(book, number);
    switch (there.answers) {
    case 'busy':
	for (let i = 0; i < 4; i++) {
	    await tone('busy', 0.5);
	    await sound.pause(0.5);
	}
	return { lines: ['BUSY'] };
    case 'voice':
	await ring(2);
	if (speaker) {
	    await sound.say(there.says || 'Hello?');
	} else {
	    await sound.pause(1.5);
	}
	return { lines: ['NO CARRIER'] };
    case 'fax':
	await ring(1);
	for (let i = 0; i < 2; i++) {
	    await tone('fax', 0.5);
	    await sound.pause(1);
	}
	return { lines: ['NO CARRIER'] };
    case 'computer': {
	await ring(1);
	await tone('answer', 1.5);
	if (speaker) {
	    await sound.noise(1.2);
	}
	const baud = there.baud || 300;
	if (SYSTEMS[there.system]) {
	    return { system: SYSTEMS[there.system](there, machine), baud };
	}
	machine.print(['CONNECT ' + baud]);
	await sound.pause(4); // nobody home: the line goes quiet, then drops
	return { lines: ['NO CARRIER'] };
    }
    default:
	await ring(5);
	return { lines: ['NO ANSWER'] };
    }
}


/* PR#2: a Hayes-style modem on a serial card in slot 2. Talk to it in AT
 * commands; it answers OK, ERROR, or what happened to a call. Once a
 * computer answers, what you type goes to it; +++ gets the modem's
 * attention again (ATO goes back, ATH hangs up). ATDL redials. PR#0 (or
 * Ctrl-C) goes back to DOS. Its speaker is on until ATM0. */
PROGRAMS.modem = (machine) => {
    let book = null;
    let speaker = true;
    let online = null;      // { system, baud } while connected
    let held = false;       // connected, but talking to the modem (+++)
    let lastNumber = null;

    async function call(number) {
	book = book || await loadPhoneBook(machine);
	lastNumber = number;
	return placeCall(machine, book, number, speaker);
    }

    function show(reply, before = []) {
	// What a system sent (or will send, if it has to wait on the
	// network): its lines, then its prompt, or the line dropping.
	return Promise.resolve(reply).then((result) => {
	    const lines = [...before, ...(result.print || [])];
	    if (result.hangup) {
		online = null;
		machine.setPrompt('');
		return machine.print([...lines, 'NO CARRIER']);
	    }
	    machine.setPrompt(result.prompt || '');
	    return machine.print(lines);
	});
    }

    function command(text) {
	/* One line of AT commands, which may run together: ATZ, ATH (hang up),
	 * ATI, ATO (back online), ATM0 (speaker off), ATM1, ATDT5550147 (dial;
	 * the rest is the number), ATDL (dial the last number again). */
	const line = text.toUpperCase().replace(/\s+/g, '');
	if (!line.startsWith('AT')) {
	    return null;
	}
	let rest = line.slice(2);
	while (rest) {
	    const letter = rest[0];
	    rest = rest.slice(1);
	    if (letter === 'D') {
		if (online) {
		    return { reply: 'ERROR' }; // hang up first
		}
		if (/^L/.test(rest)) {
		    return lastNumber ? { dial: lastNumber } : { reply: 'ERROR' };
		}
		const number = phoneNumber(rest.replace(/^[TP]/, ''));
		return number ? { dial: number } : { reply: 'ERROR' };
	    }
	    if (letter === 'O') {
		return online ? { resume: true } : { reply: 'ERROR' };
	    }
	    if (letter === 'H') {
		online = null;
		held = false;
		rest = rest.replace(/^\d/, '');
	    } else if (letter === 'Z') {
		speaker = true;
		online = null;
		held = false;
	    } else if (letter === 'M') {
		speaker = rest[0] !== '0';
		rest = rest.replace(/^\d/, '');
	    } else if (letter === 'I') {
		return { reply: '1200' };
	    } else if (letter === 'E') {
		rest = rest.replace(/^\d/, '');
	    } else {
		return { reply: 'ERROR' };
	    }
	}
	return { reply: 'OK' };
    }

    return {
	start() {
	    machine.setPrompt(''); // a modem has no prompt: you just type
	    return machine.print([]);
	},
	input(text) {
	    if (online && !held) {
		if (text.trim() === '+++') {
		    held = true;
		    machine.setPrompt('');
		    return machine.print(['OK']);
		}
		return show(online.system.input(text));
	    }
	    const typed = text.trim().toUpperCase();
	    if (typed === 'PR#0' || typed === 'IN#0') {
		machine.exit();
		return machine.print([' ']);
	    }
	    const what = command(typed);
	    if (!what) {
		return machine.print([]); // not for the modem
	    }
	    if (what.reply) {
		return machine.print([what.reply]);
	    }
	    if (what.resume) {
		held = false;
		return show({ prompt: online.prompt }, ['CONNECT ' + online.baud]);
	    }
	    return machine.wait(call(what.dial)).then((result) => {
		if (!result.system) {
		    return machine.print(result.lines);
		}
		online = { system: result.system, baud: result.baud, prompt: '' };
		held = false;
		return Promise.resolve(result.system.start()).then((opening) => {
		    if (online) {
			online.prompt = opening.prompt || ''; // for ATO
		    }
		    return show(opening, ['CONNECT ' + result.baud]);
		});
	    });
	},
    };
};


/* RUN DIALUP: a terminal program's dialing directory. It lists the numbers
 * DEMONDIAL LOG found; the arrow keys move a bar down them and RETURN
 * calls the one it's on, or type any number to try that. Once a computer
 * answers, what you type goes to it; when it hangs up (or after +++),
 * you're back at the directory. Q quits. */
PROGRAMS.dialup = (machine) => {
    let book = null;
    let entries = [];       // { number, what } from the log
    let cursor = 0;
    let note = ' ';         // what happened last, under the list
    let online = null;      // { system } while connected

    const width = () => machine.columns();

    function readLog() {
	entries = [];
	for (const text of machine.readFile('DEMONDIAL LOG') || []) {
	    const found = /^(\d{3}-\d{4})\s+(.*)$/.exec(text.trim());
	    if (found && !/^TO\b/.test(found[2])) { // not the "555-0100 TO 555-0199" heading
		entries.push({ number: found[1], what: found[2] });
	    }
	}
	cursor = Math.min(cursor, Math.max(0, entries.length - 1));
    }

    function directory(instant = false) {
	machine.setPrompt('NUMBER, OR RETURN TO DIAL? ');
	const rows = entries.length
	      ? entries.map((entry, i) => {
		  const row = '  ' + String(i + 1).padStart(2) + '  ' + entry.number + '  ' + entry.what;
		  return i === cursor ? machine.inverse(row.padEnd(width())) : row;
	      })
	      : ['  NO NUMBERS IN THE LOG YET.'];
	const screen = ['DIALUP', '='.repeat(width()), ' ', ...rows, ' ', note, ' ',
			entries.length ? 'ARROWS PICK  RETURN DIALS  OR TYPE A NUMBER  Q QUITS'
			: 'TYPE A NUMBER  Q QUITS'];
	return instant ? machine.redraw(screen) : machine.show(screen);
    }

    function hangUp(lines) {
	online = null;
	note = 'DISCONNECTED.';
	machine.setPrompt('');
	return machine.print([...lines, 'NO CARRIER']).then(() => machine.sound.pause(1.5))
	    .then(() => directory());
    }

    function show(reply, before = []) {
	// A system's reply, which may still be on its way.
	return Promise.resolve(reply).then((result) => {
	    const lines = [...before, ...(result.print || [])];
	    if (result.hangup) {
		return hangUp(lines);
	    }
	    machine.setPrompt(result.prompt || '');
	    return machine.print(lines);
	});
    }

    async function dial(number) {
	book = book || await loadPhoneBook(machine);
	machine.setPrompt('');
	await machine.show(['DIALUP', '='.repeat(width()), ' ', 'DIALING ' + number + '...', ' ']);
	const result = await machine.wait(placeCall(machine, book, number));
	if (!result.system) {
	    note = number + '  ' + result.lines.join(' ');
	    return directory();
	}
	online = { system: result.system };
	const opening = result.system.start();
	return show(opening, ['CONNECT ' + result.baud]);
    }

    return {
	start() {
	    readLog();
	    return directory();
	},
	key(name) {
	    // The arrows move the bar, but not while connected.
	    if (online || !entries.length) {
		return;
	    }
	    const step = name === 'ArrowDown' || name === 'ArrowRight' || name === 'PageDown' ? 1 : -1;
	    cursor = (cursor + step + entries.length) % entries.length;
	    return directory(true);
	},
	input(text) {
	    if (online) {
		if (text.trim() === '+++') {
		    return hangUp(['OK']);
		}
		return show(online.system.input(text));
	    }
	    const typed = text.trim();
	    if (typed.toUpperCase() === 'Q') {
		machine.exit();
		return machine.print([' ']);
	    }
	    if (typed === '') {
		return entries.length ? dial(entries[cursor].number) : directory();
	    }
	    const number = phoneNumber(typed);
	    if (!number) {
		note = '?THAT IS NOT A NUMBER';
		return directory();
	    }
	    return dial(number);
	},
    };
};


/* RUN DEMONDIAL: dial every number in the 555-01xx block in turn and log
 * which ones answer, and how. What answers with a carrier or a fax tone
 * goes in a file on the disk, DEMONDIAL LOG, which appears in CATALOG.
 * Ctrl-C stops it; what it found so far is kept. */
PROGRAMS.demondial = (machine) => {
    const FIRST = 100;
    const LAST = 199;
    const log = [];
    const found = [];
    const sound = machine.sound;
    const quiet = 0.05;

    function show(current) {
	machine.redraw([...log, current].slice(-(machine.rows() - 1)));
    }

    function keep() {
	// The log file, rewritten as each find comes in.
	machine.saveFile('DEMONDIAL LOG', [
	    'DEMONDIAL LOG', '555-0' + FIRST + ' TO 555-0' + LAST, ' ', ...found, ' ']);
    }

    async function listen(there) {
	// A short listen: enough to tell what answered.
	switch (there.answers) {
	case 'busy':
	    await sound.tone(LINE_TONES.busy, 0.25, quiet);
	    await sound.pause(0.25);
	    await sound.tone(LINE_TONES.busy, 0.25, quiet);
	    return 'BUSY';
	case 'voice':
	    await sound.tone(LINE_TONES.ring, 0.5, quiet);
	    await sound.pause(0.3);
	    return 'VOICE';
	case 'fax':
	    await sound.tone(LINE_TONES.ring, 0.5, quiet);
	    await sound.pause(0.3);
	    await sound.tone(LINE_TONES.fax, 0.4, quiet);
	    return 'FAX';
	case 'computer':
	    await sound.tone(LINE_TONES.ring, 0.5, quiet);
	    await sound.pause(0.3);
	    await sound.tone(LINE_TONES.answer, 0.7, quiet);
	    return 'CARRIER ' + (there.baud || 300) + '  *****';
	default:
	    await sound.tone(LINE_TONES.ring, 0.5, quiet);
	    await sound.pause(0.3);
	    return 'NO ANSWER';
	}
    }

    async function sweep(book) {
	for (let n = FIRST; n <= LAST; n++) {
	    if (!machine.running()) {
		return;
	    }
	    const number = '555-0' + n;
	    show(number + '  DIALING');
	    await sound.tone(LINE_TONES.dial, 0.15, quiet);
	    await touchTones(machine, number, 0.05, 0.03);
	    const there = whatAnswers(book, number);
	    const result = await listen(there);
	    log.push(number + '  ' + result);
	    if (there.answers === 'computer' || there.answers === 'fax') {
		found.push(number + '  ' + result.replace(/\s+\*+$/, ''));
		keep();
	    }
	}
	if (!machine.running()) {
	    return;
	}
	// The last of the log, then what answered, then DOS's prompt.
	const summary = [' ', (LAST - FIRST + 1) + ' NUMBERS DIALED',
			 ...(found.length ? found : ['NOTHING ANSWERED']), ' '];
	machine.exit();
	machine.redraw([...log, ...summary].slice(-(machine.rows() - 1)));
    }

    return {
	start() {
	    machine.setPrompt('');
	    log.push('DEMONDIAL  555-0' + FIRST + ' TO 555-0' + LAST, ' ');
	    return loadPhoneBook(machine).then((book) => {
		// Runs on its own; Ctrl-C stops it.
		sweep(book).catch((error) => {
		    console.log(error);
		    machine.exit();
		    machine.print([' ', 'I/O ERROR', ' ']);
		});
	    });
	},
	input() {
	    // Typing while it dials does nothing.
	},
    };
};


/* A program that runs on a server, such as the thoughtrights.com proxy.
 * payload: ["remote", "https://.../program-url"]
 *
 * Each step POSTs JSON:
 *   { "input": null on start, else the typed line,
 *     "state": whatever the last reply's "state" was (null at first),
 *     "columns": 40 or 80, "rows": 23 }
 * and expects back:
 *   { "print": ["lines", ...], "prompt": "? ", "state": {...}, "exit": false }
 * The server keeps no session: everything it needs to remember goes in
 * "state". Lines should be ASCII and fit "columns"; anything else is
 * cleaned up and wrapped here anyway. */
PROGRAMS.remote = (machine, url) => {
    let state = null;

    async function step(input) {
	const reply = await machine.work(fetch(url, {
	    method: 'POST',
	    headers: { 'Content-Type': 'application/json' },
	    body: JSON.stringify({ input, state, columns: machine.columns(), rows: machine.rows() }),
	}).then((response) => {
	    if (!response.ok) {
		throw new Error('HTTP ' + response.status);
	    }
	    return response.json();
	}));
	state = reply.state === undefined ? null : reply.state;
	// Keep the server's spacing; only wrap what is too wide.
	const rows = (reply.print || [])
	      .flatMap((text) => toAscii(text).split('\n'))
	      .flatMap((text) => text.length <= machine.columns() ? [text || ' '] : wordWrap(text, machine.columns()));
	if (reply.exit) {
	    machine.exit();
	} else {
	    machine.setPrompt(toAscii(reply.prompt || '?'));
	}
	return machine.print(rows);
    }

    return {
	start: () => step(null),
	input: (text) => step(text),
    };
};


/* ZORK I, II, III: Infocom's story files, MIT licensed by Microsoft in
 * 2025 (assets/zork/LICENSE), played by JSZM, a public-domain Z-machine
 * (js/jszm.js). JSZM runs the game as a generator that stops at every
 * READ; each line typed starts it again. What it printed up to the last
 * newline goes on the screen and the rest (">") becomes the prompt.
 * SAVE and RESTORE use this browser's storage, one game per story. */
PROGRAMS.zork = (machine, story) => {
    const saveKey = 'apple-IIe-zork-' + story;
    let run = null;
    let text = '';

    function show() {
	const cut = text.lastIndexOf('\n') + 1;
	const printed = text.slice(0, cut);
	const prompt = toAscii(text.slice(cut));
	text = '';
	machine.setPrompt(prompt || '>');
	return machine.print(wordWrap(toAscii(printed), machine.columns()));
    }

    function resume(line) {
	if (run.next(line).done) { // QUIT: the last words, then DOS's "]"
	    machine.exit();
	    const last = wordWrap(toAscii(text), machine.columns());
	    text = '';
	    return machine.print(last);
	}
	return show();
    }

    function load(buffer) {
	const game = new JSZM(new Uint8Array(buffer));
	game.print = function* (output) { text += output; };
	game.read = function* () { return yield 'read'; };
	game.save = function* (data) {
	    try {
		let bytes = '';
		data.forEach((byte) => { bytes += String.fromCharCode(byte); });
		localStorage.setItem(saveKey, btoa(bytes));
		return true;
	    } catch (error) {
		return false;
	    }
	};
	game.restore = function* () {
	    try {
		const saved = localStorage.getItem(saveKey);
		return saved ? Uint8Array.from(atob(saved), (c) => c.charCodeAt(0)) : null;
	    } catch (error) {
		return null;
	    }
	};
	run = game.run();
	return resume();
    }

    return {
	start: () => machine.work(fetch('assets/zork/' + story + '.z3').then((response) => {
	    if (!response.ok) {
		throw new Error('story file: ' + response.status);
	    }
	    return response.arrayBuffer();
	})).then(load),
	input: (line) => resume(line),
    };
};
