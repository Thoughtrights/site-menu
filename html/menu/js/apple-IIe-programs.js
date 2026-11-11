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
 * see whether a stream's sound and picture land together.
 * payload: ["barzy", "<url of Barzy's assets/>"], on the same site. */
PROGRAMS.barzy = (machine, assets) => {
    const ROWS = 20;            // graphics rows; three rows of text below
    // Dots a second, across and down, chosen with left and right. 75 is
    // about the pace of Barzy's page (500 px a second across a screen).
    const SPEEDS = [25, 40, 55, 75, 100, 130, 170, 220];
    const FLASH_MS = 100;       // how long an edge stays lit
    const SPRITE = { width: 56, height: 51 };
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
	    }
	}
	return { width: w, height: h, tones };
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
	    machine.setPrompt(width() < 80 ? 'UP/DN LEVEL  L/R SPEED  Q '
			      : 'UP/DOWN LEVEL   LEFT/RIGHT SPEED   SPACE MUTE   Q QUIT ');
	    const quietly = (promise) => promise.catch(() => null); // no sound beats no Barzy
	    return machine.work(Promise.all([
		machine.graphics.bitmap(assets + 'barzy-boi-trans.png', SPRITE.width, SPRITE.height),
		quietly(machine.sound.load(assets + 'bounce-left.wav')),
		quietly(machine.sound.load(assets + 'bounce-right.wav')),
		quietly(machine.sound.load(assets + 'bounce-topbottom.wav')),
	    ])).then(([bitmap, left, right, topBottom]) => {
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


/* The telephone: what answers at each number (assets/phone-book.json) and
 * how a call sounds. Shared by the modem (PR#2) and RUN WARDIAL. */
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


/* PR#2: a Hayes-style modem on a serial card in slot 2. Talk to it in AT
 * commands; it answers OK, ERROR, or what happened to a call. PR#0 (or
 * Ctrl-C) goes back to DOS. Its speaker is on until ATM0. */
PROGRAMS.modem = (machine) => {
    let book = null;
    let speaker = true;

    const sound = machine.sound;
    const tone = (name, seconds) => speaker ? sound.tone(LINE_TONES[name], seconds) : sound.pause(seconds);

    async function ring(times, onSeconds = 1.2, offSeconds = 1.6) {
	for (let i = 0; i < times; i++) {
	    await tone('ring', onSeconds);
	    await sound.pause(offSeconds);
	}
    }

    async function call(number) {
	// Dial, listen, and say what happened, as the modem would.
	book = book || await loadPhoneBook(machine);
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
	    return ['BUSY'];
	case 'voice':
	    await ring(2);
	    if (speaker) {
		await sound.say(there.says || 'Hello?');
	    } else {
		await sound.pause(1.5);
	    }
	    return ['NO CARRIER'];
	case 'fax':
	    await ring(1);
	    for (let i = 0; i < 2; i++) {
		await tone('fax', 0.5);
		await sound.pause(1);
	    }
	    return ['NO CARRIER'];
	case 'computer':
	    await ring(1);
	    await tone('answer', 1.5);
	    if (speaker) {
		await sound.noise(1.2);
	    }
	    machine.print(['CONNECT ' + (there.baud || 300)]);
	    // Nothing on the other end says anything yet. The line goes quiet,
	    // then drops.
	    await sound.pause(4);
	    return ['NO CARRIER'];
	default:
	    await ring(5);
	    return ['NO ANSWER'];
	}
    }

    function command(text) {
	/* One line of AT commands, which may run together: ATZ, ATH, ATI,
	 * ATM0 (speaker off), ATM1, ATDT5550147 (dial; the rest is the number). */
	const line = text.toUpperCase().replace(/\s+/g, '');
	if (!line.startsWith('AT')) {
	    return null;
	}
	let rest = line.slice(2);
	while (rest) {
	    const letter = rest[0];
	    rest = rest.slice(1);
	    if (letter === 'D') {
		const number = phoneNumber(rest.replace(/^[TP]/, ''));
		return number ? { dial: number } : { reply: 'ERROR' };
	    }
	    if (letter === 'Z') {
		speaker = true;
	    } else if (letter === 'M') {
		speaker = rest[0] !== '0';
		rest = rest.replace(/^\d/, '');
	    } else if (letter === 'I') {
		return { reply: '300' };
	    } else if (letter !== 'H' && letter !== 'E') {
		return { reply: 'ERROR' };
	    } else {
		rest = rest.replace(/^\d/, '');
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
	    return machine.wait(call(what.dial)).then((result) => machine.print(result));
	},
    };
};


/* RUN WARDIAL: dial every number in the 555-01xx block in turn and log
 * which ones answer, and how. Ctrl-C stops it. */
PROGRAMS.wardial = (machine) => {
    const FIRST = 100;
    const LAST = 199;
    const log = [];
    const found = [];
    const sound = machine.sound;
    const quiet = 0.05;

    function show(current) {
	machine.redraw([...log, current].slice(-(machine.rows() - 1)));
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
		found.push(number + '  ' + result.split(' ')[0]);
	    }
	}
	if (!machine.running()) {
	    return;
	}
	machine.exit();
	machine.redraw(log.slice(-(machine.rows() - 6)));
	machine.print([' ', (LAST - FIRST + 1) + ' NUMBERS DIALED',
		       ...(found.length ? found : ['NOTHING ANSWERED']), ' ']);
    }

    return {
	start() {
	    machine.setPrompt('');
	    log.push('WARDIAL  555-0' + FIRST + ' TO 555-0' + LAST, ' ');
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
