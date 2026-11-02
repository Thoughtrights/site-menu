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
 *
 *   machine.print(lines)     print lines, then the current prompt
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
