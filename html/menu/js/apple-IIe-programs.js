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
 *
 *   machine.print(lines)     print lines, then the current prompt
 *   machine.show(lines)      clear the screen, draw lines quickly, then the prompt
 *   machine.redraw(lines)    replace the screen at once, keeping what's typed
 *   machine.inverse(text)    a line in inverse video, dark on green
 *   machine.graphics.clear()               wipe the hi-res dots
 *   machine.graphics.picture(url, box)     a photo, dithered to dots, in a box
 *                            of text cells { column, row, columns, rows }
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
