/* Plays Protovision (html/menu/js/apple-IIe-protovision.js) with no browser:
 * the logon, some talk, and every game with random input, many times over.
 * Fails if anything throws, a game can't be finished or left, or a screen
 * doesn't fit 40 columns and 22 rows. Run by tests/test_site.py:
 *
 *     node tests/play_protovision.js [seed]
 *
 * The dice are seeded, so a run can be repeated: the same seed plays the
 * same games. Try other seeds after changing a game. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const COLUMNS = 40;
const ROWS = 22;            // lines of a screen, above the prompt
const source = fs.readFileSync(path.join(__dirname, '..', 'html', 'menu', 'js', 'apple-IIe-protovision.js'), 'utf8');
const SEED = Number(process.argv[2] || 1983);
let dice = SEED >>> 0;
const random = () => {
    // mulberry32: small, and the same everywhere.
    dice = (dice + 0x6D2B79F5) >>> 0;
    let t = dice;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const SYSTEMS = {};
const context = vm.createContext({ SYSTEMS, console, random });
vm.runInContext('Math.random = random;', context);
vm.runInContext(source, context);

let failures = 0;
const fail = (message) => {
    failures++;
    console.error('FAIL: ' + message);
};
const check = (what, lines) => {
    for (const line of lines) {
        if (typeof line !== 'string') {
            fail(what + ': a line is not text: ' + JSON.stringify(line));
        } else if (line.length > COLUMNS) {
            fail(what + ': wider than ' + COLUMNS + ': "' + line + '"');
        }
    }
};
const machine = {
    columns: () => COLUMNS,
    running: () => true,
    setPrompt() {},
    wait: (promise) => promise,
    redraw(lines) {
        check('redraw', lines);
        if (lines.length > ROWS) {
            fail('redraw: ' + lines.length + ' rows');
        }
    },
    graphics: {
        clear() {},
        screen: (rows) => ({ width: 280, height: rows * 8, dots: new Uint8Array(280 * rows * 8), show() {} }),
    },
    sound: { pause: () => Promise.resolve() },
};

const pick = (list) => list[Math.floor(random() * list.length)];
const CARD = () => pick(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']) + pick(['C', 'D', 'H', 'S']);
const SQUARE = () => pick([...'ABCDEFGH']) + pick([...'12345678']);
// What to type at each game, by its prompt.
const TYPISTS = {
    "FALKEN'S MAZE": () => Array.from({ length: 6 }, () => pick([...'NSEW'])).join(''),
    'BLACK JACK': (prompt) => /ANOTHER/.test(prompt) ? pick(['Y', 'Y', 'N']) : pick(['H', 'S', 'X']),
    POKER: (prompt) => /ANOTHER/.test(prompt) ? pick(['Y', 'Y', 'N']) : pick(['0', '1 3', '2,4,5', 'ALL']),
    'GIN RUMMY': (prompt) => /ANOTHER/.test(prompt) ? pick(['Y', 'N']) : /DECK/.test(prompt) ? pick(['D', 'T', 'X'])
        : pick(['1', '5', '11', '3 K', '10 K', '0', '']),
    HEARTS: (prompt) => /ANOTHER/.test(prompt) ? pick(['Y', 'N']) : CARD(),
    BRIDGE: (prompt) => /ANOTHER/.test(prompt) ? pick(['Y', 'N']) : CARD(),
    // Checkers says what would be a move when given a wrong one: type that.
    CHECKERS: (prompt, print) => {
        const hint = /(?:TRY|JUMP:) ([A-H][1-8](?:[-X][A-H][1-8])+)/.exec(print.join(' '));
        return hint ? hint[1].replace(/[-X]/g, ' ') : SQUARE() + ' ' + SQUARE();
    },
    // Chess: one of white's pieces, read off the board, to any square.
    CHESS: (prompt, print) => {
        const mine = [];
        for (const row of print) {
            const found = /^ ([1-8]) ((?:\S ){8})\1$/.exec(row);
            (found ? found[2].trim().split(' ') : []).forEach((piece, file) => {
                if (/[A-Z]/.test(piece)) {
                    mine.push('ABCDEFGH'[file] + found[1]);
                }
            });
        }
        return pick([pick(mine) + SQUARE(), pick(mine) + '-' + SQUARE(), 'O-O', '0-0-0']);
    },
    'GLOBAL THERMONUCLEAR WAR': (prompt) => /SIDE/.test(prompt) ? pick(['1', '2', 'USSR', 'X'])
        : /TARGETS/.test(prompt) ? pick(['ALL', '1 3 8', 'NONE', '9', '2']) : '',
    'TIC-TAC-TOE': (prompt) => /PLAYERS/.test(prompt) ? pick(['0', '1', '1']) : pick([...'123456789']),
};
const WAR = () => pick(['1', '2', '3', '4', '4', 'X']);

async function call() {
    // A fresh call, logged on through the back door, in any case.
    const system = SYSTEMS.protovision({ password: 'joshua' }, machine);
    const say = async (text) => {
        const reply = await system.input(text);
        check('"' + text + '"', reply.print || []);
        if (reply.screen && (reply.print || []).length > ROWS) {
            fail('"' + text + '": a screen of ' + reply.print.length + ' rows: ' + reply.print[0]);
        }
        if ((reply.prompt || '').length >= COLUMNS) {
            fail('prompt too wide: "' + reply.prompt + '"');
        }
        return reply;
    };
    check('banner', (await system.start()).print);
    return { system, say };
}

async function logons() {
    let { say } = await call();
    for (const public_ of ['help', 'Help Games', 'LIST GAMES', 'guest', '']) {
        if ((await say(public_)).hangup) {
            fail(public_ + ' hung up');
        }
    }
    const list = (await say('list games')).print.join('\n');
    for (const title of ["FALKEN'S MAZE", 'BLACK JACK', 'GIN RUMMY', 'HEARTS', 'BRIDGE', 'CHECKERS', 'CHESS', 'POKER',
                         'FIGHTER COMBAT', 'GUERRILLA ENGAGEMENT', 'DESERT WARFARE', 'AIR-TO-GROUND ACTIONS',
                         'THEATERWIDE TACTICAL WARFARE', 'GLOBAL THERMONUCLEAR WAR']) {
        if (!list.includes(title)) {
            fail('LIST GAMES lacks ' + title);
        }
    }
    await say('falken');
    await say('password');
    if (!(await say('wopr')).hangup) {
        fail('three wrong logons should drop the line');
    }
    for (const name of ['joshua', 'Joshua', 'JOSHUA', '  joshua ']) {
        ({ say } = await call());
        const reply = await say(name);
        if (reply.hangup || reply.prompt !== '> ') {
            fail('"' + name + '" should log on');
        }
    }
    for (const line of ['hello', 'how are you?', 'who are you', 'is this real or a game?', 'what is your goal',
                        'do you think', 'xyzzy', 'plugh', 'games', 'quit', 'help', '']) {
        if ((await say(line)).hangup) {
            fail('"' + line + '" hung up');
        }
    }
    if (!(await say('bye')).hangup) {
        fail('bye should hang up');
    }
}

async function play(title, type, rounds) {
    /* Start the game by name, type at it until it ends (the prompt is the
     * system's own again) or the tries run out, then make sure QUIT leaves.
     * Returns how the game ended, for the ones that should end. */
    let finished = 0;
    for (let round = 0; round < rounds; round++) {
        const { say } = await call();
        await say('JOSHUA');
        let reply = await say(title.toLowerCase());
        if (reply.prompt === '> ') {
            fail(title + ' did not start');
            return;
        }
        for (let tries = 0; tries < 20000 && reply.prompt !== '> '; tries++) {
            reply = await say(type(reply.prompt, reply.print || []));
            if (reply.hangup) {
                fail(title + ' hung up');
                return;
            }
        }
        if (reply.prompt === '> ') {
            finished++;
        } else if ((await say('quit')).prompt !== '> ') {
            fail(title + ': QUIT did not leave it');
        }
        if ((await say('hello')).print[0] !== 'HELLO.') {
            fail(title + ': no talk after the game');
        }
    }
    if (!finished) {
        fail(title + ' never finished in ' + rounds + ' tries');
    }
}

function rules() {
    /* Chess: count the positions a few moves deep from two well-known
     * starting points and compare with the published numbers ("perft").
     * The second has castling, pins, checks and taking in passing. */
    const { chess, pokerRank, compare } = SYSTEMS.protovision.parts;
    const fromFen = (fen) => {
        const [board, , castle, passing] = fen.split(' ');
        const b = Array(64).fill('.');
        board.split('/').forEach((row, i) => {
            let file = 0;
            for (const ch of row) {
                if (/\d/.test(ch)) {
                    file += Number(ch);
                } else {
                    b[(7 - i) * 8 + file++] = ch;
                }
            }
        });
        return { b, castle: castle === '-' ? '' : castle,
                 passing: passing === '-' ? -1 : 'abcdefgh'.indexOf(passing[0]) + (passing[1] - 1) * 8 };
    };
    const count = (p, who, depth) => depth === 0 ? 1 : chess.legal(p, who).reduce(
        (n, move) => n + count(chess.make(p, move), who === 'w' ? 'b' : 'w', depth - 1), 0);
    const KNOWN = [
        ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', [20, 400, 8902]],
        ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -', [48, 2039, 97862]],
        ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -', [14, 191, 2812, 43238]],
    ];
    for (const [fen, counts] of KNOWN) {
        counts.forEach((expected, i) => {
            const found = count(fromFen(fen), 'w', i + 1);
            if (found !== expected) {
                fail('chess: ' + found + ' positions ' + (i + 1) + ' deep, not ' + expected + ', from ' + fen);
            }
        });
    }
    if (chess.opening().b.join('') !== fromFen(KNOWN[0][0]).b.join('')) {
        fail('chess: the opening position is wrong');
    }

    // Poker: each hand beats the one after it.
    const card = (text) => 'CDHS'.indexOf(text.slice(-1)) * 13 +
          ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(text.slice(0, -1));
    const hands = ['10S JS QS KS AS', '9H 9D 9C 9S 2D', '8H 8D 8C KS KD', '2H 7H 9H JH AH', '6C 7D 8H 9S 10C',
                   'AH 2D 3C 4S 5D', '7H 7D 7C KS 2D', 'JH JD 4C 4S AD', 'JH JD 4C 4S KD', 'AH AD 3C 4S 6D',
                   'KH KD QC JS 9D', 'AH KD 8C 4S 2D', 'KH QD JC 9S 7D']
          .map((text) => pokerRank(text.split(' ').map(card)));
    for (let i = 1; i < hands.length; i++) {
        if (compare(hands[i - 1], hands[i]) <= 0) {
            fail('poker: hand ' + i + ' should beat hand ' + (i + 1));
        }
    }
}

(async () => {
    rules();
    await logons();
    for (const [title, type] of Object.entries(TYPISTS)) {
        await play(title, type, title === 'CHESS' ? 2 : 6);
    }
    for (const title of ['FIGHTER COMBAT', 'GUERRILLA ENGAGEMENT', 'DESERT WARFARE', 'AIR-TO-GROUND ACTIONS',
                         'THEATERWIDE TACTICAL WARFARE', 'THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE']) {
        await play(title, WAR, 6);
    }
    console.log(failures ? failures + ' failures (seed ' + SEED + ')' : 'ok');
    process.exit(failures ? 1 : 0);
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
