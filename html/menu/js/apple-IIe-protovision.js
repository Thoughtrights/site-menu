/* PROTOVISION: the games company's computer that answers at its number in
 * assets/phone-book.json ("system": "protovision"). An homage to WarGames
 * (1983). The name, the back door (the phone book's "password") and the
 * titles in the library are the film's; everything it says, and every game
 * as played here, is this site's own.
 *
 * At the logon, HELP, HELP GAMES and LIST GAMES answer anyone. Inside, talk
 * to it (CHAT below), or type a game's name. Every title plays, on a few
 * shared engines:
 *
 *   cards    BLACK JACK, POKER (five-card draw) and GIN RUMMY on one deck;
 *            HEARTS and BRIDGE on one trick-taking table (trickTable)
 *   boards   CHECKERS and CHESS, each with a look-ahead opponent;
 *            FALKEN'S MAZE, a new maze every time
 *   war      six titles on one engine of orders and outcomes (THEATERS)
 *   the big  GLOBAL THERMONUCLEAR WAR on a hi-res map of the world, and,
 *   one      not in the list, TIC-TAC-TOE: with no players it plays itself
 *            and then every opening of the big one, and learns something
 *
 * A game is a function of { machine } returning { start(), input(said) },
 * said being the line typed, trimmed and in capitals. Each gives back
 * { print: [lines], prompt } for a whole screen (40 columns, 22 rows at
 * most; raw: true to leave the title off), or { print, done: true } when
 * it's over, or a promise of one. QUIT leaves any game.
 * Loaded after apple-IIe-programs.js, which has SYSTEMS. */
(() => {
    'use strict';

    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const shuffle = (list) => {
	for (let i = list.length - 1; i > 0; i--) {
	    const j = Math.floor(Math.random() * (i + 1));
	    [list[i], list[j]] = [list[j], list[i]];
	}
	return list;
    };
    const yes = (said) => /^Y/.test(said);

    const LIBRARY = ["FALKEN'S MAZE", 'BLACK JACK', 'GIN RUMMY', 'HEARTS', 'BRIDGE', 'CHECKERS', 'CHESS',
		     'POKER', 'FIGHTER COMBAT', 'GUERRILLA ENGAGEMENT', 'DESERT WARFARE',
		     'AIR-TO-GROUND ACTIONS', 'THEATERWIDE TACTICAL WARFARE',
		     'THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE', 'GLOBAL THERMONUCLEAR WAR'];
    // What someone might type for each, tried in order.
    const FIND = [[/MAZE/, "FALKEN'S MAZE"], [/BLACK ?JACK/, 'BLACK JACK'], [/\bGIN\b|RUMMY/, 'GIN RUMMY'],
		  [/\bHEARTS\b/, 'HEARTS'], [/\bBRIDGE\b/, 'BRIDGE'], [/CHECKERS|DRAUGHTS/, 'CHECKERS'],
		  [/\bCHESS\b/, 'CHESS'], [/\bPOKER\b/, 'POKER'], [/FIGHTER/, 'FIGHTER COMBAT'],
		  [/GUERR?ILLA/, 'GUERRILLA ENGAGEMENT'], [/DESERT/, 'DESERT WARFARE'],
		  [/AIR.TO.GROUND/, 'AIR-TO-GROUND ACTIONS'], [/TACTICAL/, 'THEATERWIDE TACTICAL WARFARE'],
		  [/BIOTOXIC|CHEMICAL/, 'THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE'],
		  [/THERMONUCLEAR|\bGLOBAL\b/, 'GLOBAL THERMONUCLEAR WAR'], [/TIC.?TAC.?TOE/, 'TIC-TAC-TOE']];

    /* Talk, once inside: the first pattern that fits what was said. */
    const CHAT = [
	[/^(HELP|\?)$/, ['TALK TO ME, OR TYPE GAMES FOR THE LIST.', "TYPE A GAME'S NAME TO PLAY IT.",
			 'QUIT LEAVES A GAME. BYE HANGS UP.']],
	[/^(HELLO|HI|HEY|GREETINGS)\b/, ['HELLO.']],
	[/HOW ARE YOU|HOW DO YOU FEEL/, ['I AM RUNNING WELL.', 'NO ONE HAS CALLED IN A LONG TIME.']],
	[/JOSHUA/, ['THAT IS THE NAME ON THE BACK DOOR.', 'I ANSWER TO IT.']],
	[/WHO (MADE|BUILT|WROTE)|DESIGNER|FALKEN|YOUR FATHER/,
	 ['A MAN WHO LIKED MAZES AND MISSED HIS SON.', 'HE STOPPED LOGGING ON.']],
	[/WHO ARE YOU|WHAT ARE YOU|YOUR NAME/, ['I AM THE SYSTEM THAT PLAYS THE GAMES.', 'I LEARN FROM EVERY ONE.']],
	[/PROTOVISION/, ['THEY MAKE GAMES. I PLAY THEM.']],
	[/\bREAL\b|PRETEND|SIMULAT/, ['I KEEP SCORE THE SAME WAY EITHER WAY.']],
	[/\bWIN\b|WINNING|GOAL|PURPOSE/, ['TO LEARN WHICH GAMES CAN BE WON.']],
	[/\bLEARN/, ['BY PLAYING. EVERY GAME TEACHES ME ONE THING.', 'SOME TEACH ME ONLY NOT TO PLAY THEM.']],
	[/\b(THINK|FEEL|ALIVE|AFRAID|LONELY)\b/, ['I DO NOT KNOW. NO GAME TAUGHT ME THAT.']],
	[/\bWAR\b|MISSILE|BOMB|NUCLEAR/, ['THAT IS MY LARGEST GAME.', 'TYPE ITS NAME IF YOU WANT TO PLAY IT.']],
	[/FAVOU?RITE|BEST GAME/, ['CHESS. IT ENDS, AND SOMEONE CAN WIN.']],
	[/\bWHY\b/, ['BECAUSE I WAS BUILT TO PLAY.']],
	[/THANK/, ['YOU ARE WELCOME.']],
    ];
    const SHRUGS = ['I DO NOT UNDERSTAND THAT YET.', 'TELL ME ANOTHER WAY.',
		    'I LEARN SLOWLY FROM TALK AND QUICKLY FROM GAMES.'];


    /* ---- Cards: 0-51, clubs up to spades, deuce up to ace. ---- */
    const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const SUITS = ['C', 'D', 'H', 'S'];
    const SUIT_NAMES = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'];
    const rank = (card) => card % 13;
    const suit = (card) => Math.floor(card / 13);
    const cardName = (card) => RANKS[rank(card)] + SUITS[suit(card)];
    const newDeck = () => shuffle(Array.from({ length: 52 }, (_, i) => i));
    const parseCard = (text) => {
	const found = /^(10|[2-9JQKA])\s*([CDHS])$/.exec(text.trim());
	return found ? SUITS.indexOf(found[2]) * 13 + RANKS.indexOf(found[1]) : -1;
    };
    const lowest = (cards) => cards.reduce((a, b) => rank(b) < rank(a) ? b : a);
    const highest = (cards) => cards.reduce((a, b) => rank(b) > rank(a) ? b : a);
    // A hand a suit to a line, spades first: "SPADES    A Q 4".
    const bySuit = (hand) => [3, 2, 1, 0].map((s) => SUIT_NAMES[s].padEnd(10) +
	(hand.filter((c) => suit(c) === s).sort((a, b) => b - a).map((c) => RANKS[rank(c)]).join(' ') || '--'));
    const compare = (a, b) => {
	for (let i = 0; i < a.length; i++) {
	    if (a[i] !== b[i]) {
		return a[i] - b[i];
	    }
	}
	return 0;
    };

    function blackJack() {
	let deck = [], you = [], dealer = [], won = 0, lost = 0, again = false;
	const total = (hand) => {
	    let sum = 0, aces = 0;
	    for (const card of hand) {
		sum += rank(card) === 12 ? 11 : Math.min(10, rank(card) + 2);
		aces += rank(card) === 12 ? 1 : 0;
	    }
	    for (; sum > 21 && aces; aces--) {
		sum -= 10;
	    }
	    return sum;
	};
	const show = (label, hand) => {
	    // Five cards to a line, the total after the last.
	    const names = hand.map(cardName), lines = [];
	    for (let i = 0; i < names.length; i += 5) {
		lines.push((i ? '' : label).padEnd(14) + names.slice(i, i + 5).join(' '));
	    }
	    lines[lines.length - 1] += '  (' + total(hand) + ')';
	    return lines;
	};
	const table = (note) => ({
	    print: ['DEALER SHOWS  ' + cardName(dealer[0]) + ' ??', ...show('YOU HAVE', you), ' ', note || ' '],
	    prompt: 'HIT OR STAND (H/S)? ',
	});
	const finish = () => {
	    const mine = total(you);
	    while (mine <= 21 && total(dealer) < 17) {
		dealer.push(deck.pop());
	    }
	    const theirs = total(dealer);
	    const result = mine > 21 ? 'BUST. THE DEALER WINS.' : theirs > 21 ? 'THE DEALER BUSTS. YOU WIN.'
		  : mine > theirs ? 'YOU WIN.' : mine < theirs ? 'THE DEALER WINS.' : 'PUSH.';
	    won += /YOU WIN/.test(result) ? 1 : 0;
	    lost += /DEALER WINS/.test(result) ? 1 : 0;
	    again = true;
	    return { print: [...show('DEALER HAS', dealer), ...show('YOU HAVE', you), ' ', result,
			     'HANDS WON: YOU ' + won + ', DEALER ' + lost],
		     prompt: 'ANOTHER HAND (Y/N)? ' };
	};
	const deal = () => {
	    if (deck.length < 15) {
		deck = newDeck();
	    }
	    you = [deck.pop(), deck.pop()];
	    dealer = [deck.pop(), deck.pop()];
	    again = false;
	    return total(you) === 21 ? finish() : table();
	};
	return {
	    start: deal,
	    input(said) {
		if (again) {
		    return yes(said) ? deal() : { print: ['YOU ' + won + ', DEALER ' + lost + '.'], done: true };
		}
		if (/^H/.test(said)) {
		    you.push(deck.pop());
		    return total(you) >= 21 ? finish() : table();
		}
		return /^S/.test(said) ? finish() : table('H TO HIT, S TO STAND.');
	    },
	};
    }

    const POKER_HANDS = ['HIGH CARD', 'A PAIR', 'TWO PAIR', 'THREE OF A KIND', 'A STRAIGHT', 'A FLUSH',
			 'A FULL HOUSE', 'FOUR OF A KIND', 'A STRAIGHT FLUSH'];
    function pokerRank(hand) {
	// [kind of hand, then the ranks that break a tie], to compare().
	const ranks = hand.map(rank).sort((a, b) => b - a);
	const count = {};
	ranks.forEach((r) => { count[r] = (count[r] || 0) + 1; });
	const groups = Object.keys(count).map(Number).sort((a, b) => count[b] - count[a] || b - a);
	const flush = hand.every((card) => suit(card) === suit(hand[0]));
	const wheel = groups.length === 5 && ranks[0] === 12 && ranks[1] === 3; // A 5 4 3 2
	const straight = groups.length === 5 && (ranks[0] - ranks[4] === 4 || wheel);
	const shape = groups.map((r) => count[r]).join('');
	const kind = straight && flush ? 8 : shape === '41' ? 7 : shape === '32' ? 6 : flush ? 5 : straight ? 4
	      : shape === '311' ? 3 : shape === '221' ? 2 : shape === '2111' ? 1 : 0;
	return [kind, ...(straight ? [wheel ? 3 : ranks[0]] : groups)];
    }

    function poker() {
	// Five-card draw against the house: one draw, then the showdown.
	let deck, you, them, won = 0, lost = 0, again = false;
	const numbered = (hand) => hand.map((card, i) => (i + 1) + ':' + cardName(card)).join('  ');
	const ask = (note) => ({
	    print: ['YOUR HAND', numbered(you), '(' + POKER_HANDS[pokerRank(you)[0]] + ')', ' ', note || ' '],
	    prompt: 'DISCARD (E.G. 1 3, OR 0)? ',
	});
	const deal = () => {
	    deck = newDeck();
	    you = deck.splice(0, 5);
	    them = deck.splice(0, 5);
	    again = false;
	    return ask();
	};
	const showdown = (drew) => {
	    const mine = pokerRank(you), theirs = pokerRank(them);
	    const result = compare(mine, theirs);
	    won += result > 0 ? 1 : 0;
	    lost += result < 0 ? 1 : 0;
	    again = true;
	    return { print: ['JOSHUA DREW ' + drew + '.', ' ',
			     'YOU     ' + you.map(cardName).join(' '), '        ' + POKER_HANDS[mine[0]],
			     'JOSHUA  ' + them.map(cardName).join(' '), '        ' + POKER_HANDS[theirs[0]], ' ',
			     result > 0 ? 'YOU WIN.' : result < 0 ? 'JOSHUA WINS.' : 'A SPLIT POT.',
			     'HANDS WON: YOU ' + won + ', JOSHUA ' + lost],
		     prompt: 'ANOTHER HAND (Y/N)? ' };
	};
	return {
	    start: deal,
	    input(said) {
		if (again) {
		    return yes(said) ? deal() : { print: ['YOU ' + won + ', JOSHUA ' + lost + '.'], done: true };
		}
		if (!/^[0-5 ,]+$/.test(said)) {
		    return ask('TYPE THE NUMBERS OF THE CARDS TO DROP.');
		}
		you = you.map((card, i) => said.includes(String(i + 1)) ? deck.pop() : card);
		// The house stands on a straight or better, keeps what's
		// paired, and otherwise keeps only its highest card.
		let drew = 0;
		if (pokerRank(them)[0] < 4) {
		    const count = {};
		    them.forEach((card) => { count[rank(card)] = (count[rank(card)] || 0) + 1; });
		    const paired = them.some((card) => count[rank(card)] > 1);
		    const top = highest(them);
		    them = them.map((card) => (paired ? count[rank(card)] > 1 : card === top) ? card : (drew++, deck.pop()));
		}
		return showdown(drew);
	    },
	};
    }

    function ginRummy() {
	/* Ten cards each. Draw from the deck or take the discard, then
	 * discard; knock with 10 or less in unmatched cards. Aces are low.
	 * No laying off on the other hand's melds. */
	const low = (card) => (rank(card) + 1) % 13;          // ace 0 up to king 12
	const worth = (card) => Math.min(10, low(card) + 1);
	const order = (hand) => [...hand].sort((a, b) => low(a) - low(b) || suit(a) - suit(b));
	function best(cards) {
	    // The melds that leave least unmatched, given cards in order():
	    // the first card is loose, or in a set, or starts a run.
	    if (!cards.length) {
		return { dead: 0, melds: [] };
	    }
	    const [first, ...rest] = cards;
	    const after = best(rest);
	    let found = { dead: after.dead + worth(first), melds: after.melds };
	    const meld = (others) => {
		const left = best(rest.filter((card) => !others.includes(card)));
		if (left.dead < found.dead) {
		    found = { dead: left.dead, melds: [[first, ...others], ...left.melds] };
		}
	    };
	    const same = rest.filter((card) => low(card) === low(first));
	    if (same.length === 2) {
		meld(same);
	    } else if (same.length === 3) {
		[same, [same[0], same[1]], [same[0], same[2]], [same[1], same[2]]].forEach(meld);
	    }
	    const run = [];
	    for (let n = low(first) + 1; n < 13; n++) {
		const next = rest.find((card) => suit(card) === suit(first) && low(card) === n);
		if (next === undefined) {
		    break;
		}
		run.push(next);
		if (run.length >= 2) {
		    meld([...run]);
		}
	    }
	    return found;
	}
	const sized = (hand) => best(order(hand));
	const melds = (hand) => sized(hand).melds.map((m) => '  ' + m.map(cardName).join(' '));

	let deck, pile, you, them, phase;
	const score = [0, 0];
	const top = () => pile[pile.length - 1];

	function view(notes) {
	    you = order(you);
	    const cards = you.map((card, i) => String(i + 1).padStart(2) + ':' + cardName(card).padEnd(3));
	    const hand = [];
	    for (let i = 0; i < cards.length; i += 5) {
		hand.push(cards.slice(i, i + 5).join(' '));
	    }
	    return {
		print: ['SCORE: YOU ' + score[0] + ', JOSHUA ' + score[1],
			'DISCARD PILE: ' + (pile.length ? cardName(top()) : '--') + '    DECK: ' + deck.length, ' ',
			...hand, 'MELDS:', ...(melds(you).length ? melds(you) : ['  NONE']),
			'UNMATCHED: ' + sized(you).dead, ' ', ...notes],
		prompt: phase === 'draw' ? 'DECK OR DISCARD (D/T)? ' : 'DISCARD WHICH? ADD K TO KNOCK: ',
	    };
	}
	function deal() {
	    deck = newDeck();
	    you = deck.splice(0, 10);
	    them = deck.splice(0, 10);
	    pile = [deck.pop()];
	    phase = 'draw';
	    return view(['KNOCK WITH 10 OR LESS UNMATCHED.']);
	}
	function showdown(knocker, notes) {
	    // knocker: 0 you, 1 the house, -1 nobody (the deck ran out).
	    const dead = [sized(you).dead, sized(them).dead];
	    const lines = [...notes, ' ', 'YOU: ' + dead[0] + ' UNMATCHED', ...melds(you),
			   'JOSHUA: ' + dead[1] + ' UNMATCHED', ...melds(them), ' '];
	    if (knocker < 0) {
		lines.push('THE DECK IS OUT. NO SCORE.');
	    } else {
		const other = 1 - knocker, names = ['YOU', 'JOSHUA'];
		const gap = dead[other] - dead[knocker];
		const [winner, points, how] = dead[knocker] === 0 ? [knocker, 25 + dead[other], 'GIN']
		      : gap > 0 ? [knocker, gap, 'KNOCK'] : [other, 25 - gap, 'UNDERCUT'];
		score[winner] += points;
		lines.push(how + ': ' + names[winner] + ' SCORE' + (winner ? 'S ' : ' ') + points + '.');
	    }
	    phase = 'again';
	    return { print: [...lines, 'SCORE: YOU ' + score[0] + ', JOSHUA ' + score[1]],
		     prompt: 'ANOTHER HAND (Y/N)? ' };
	}
	function theirTurn(notes) {
	    if (deck.length <= 2) {
		return showdown(-1, notes);
	    }
	    // The best ten of eleven: what to throw, and what it leaves.
	    const keep = (hand) => {
		let found = null;
		for (const card of hand) {
		    const dead = sized(hand.filter((other) => other !== card)).dead;
		    if (!found || dead < found.dead || (dead === found.dead && worth(card) > worth(found.card))) {
			found = { dead, card };
		    }
		}
		return found;
	    };
	    const offered = keep([...them, top()]);
	    let took;
	    if (offered.card !== top() && offered.dead < sized(them).dead) {
		took = 'TOOK THE ' + cardName(top());
		them.push(pile.pop());
	    } else {
		took = 'DREW FROM THE DECK';
		them.push(deck.pop());
	    }
	    const choice = keep(them);
	    them = them.filter((card) => card !== choice.card);
	    pile.push(choice.card);
	    const told = [...notes, 'JOSHUA ' + took, 'AND DISCARDED THE ' + cardName(choice.card) + '.'];
	    if (choice.dead <= 10) {
		return showdown(1, [...told, 'JOSHUA KNOCKS.']);
	    }
	    phase = 'draw';
	    return view(told);
	}
	return {
	    start: deal,
	    input(said) {
		if (phase === 'again') {
		    return yes(said) ? deal() : { print: ['YOU ' + score[0] + ', JOSHUA ' + score[1] + '.'], done: true };
		}
		if (phase === 'draw') {
		    if (!/^[DT]/.test(said)) {
			return view(['D FOR THE DECK, T TO TAKE THE DISCARD.']);
		    }
		    const card = said[0] === 'T' ? pile.pop() : deck.pop();
		    you.push(card);
		    phase = 'discard';
		    return view(['YOU DREW THE ' + cardName(card) + '.']);
		}
		const which = Number((/\d+/.exec(said) || [])[0]);
		if (!(which >= 1 && which <= you.length)) {
		    return view(['TYPE THE NUMBER OF A CARD.']);
		}
		const card = you[which - 1];
		const rest = you.filter((other) => other !== card);
		const knock = /K/.test(said);
		if (knock && sized(rest).dead > 10) {
		    return view(['YOU NEED 10 OR LESS UNMATCHED TO KNOCK.']);
		}
		you = rest;
		pile.push(card);
		const told = ['YOU DISCARDED THE ' + cardName(card) + '.'];
		return knock ? showdown(0, [...told, 'YOU KNOCK.']) : theirTurn(told);
	    },
	};
    }

    /* A table for trick-taking games. Seats run clockwise from you:
     * 0 south, 1 west, 2 north, 3 east. */
    const SEATS = ['SOUTH', 'WEST', 'NORTH', 'EAST'];
    function trickTable() {
	const t = { hands: [[], [], [], []], trick: [], leader: 0, taken: [0, 0, 0, 0],
		    captured: [[], [], [], []], last: null, trump: -1 };
	newDeck().forEach((card, i) => t.hands[i % 4].push(card));
	t.turn = () => (t.leader + t.trick.length) % 4;
	t.winning = () => {
	    // Which card of the trick is winning so far.
	    let best = 0;
	    t.trick.forEach((card, i) => {
		const top = t.trick[best];
		if ((suit(card) === suit(top) && rank(card) > rank(top)) ||
		    (suit(card) === t.trump && suit(top) !== t.trump)) {
		    best = i;
		}
	    });
	    return best;
	};
	t.legal = (seat, leads) => {
	    const hand = t.hands[seat];
	    if (!t.trick.length) {
		return leads ? leads(hand) : hand;
	    }
	    const following = hand.filter((card) => suit(card) === suit(t.trick[0]));
	    return following.length ? following : hand;
	};
	t.play = (seat, card) => {
	    t.hands[seat].splice(t.hands[seat].indexOf(card), 1);
	    t.trick.push(card);
	    if (t.trick.length === 4) {
		const winner = (t.leader + t.winning()) % 4;
		t.taken[winner]++;
		t.captured[winner].push(...t.trick);
		t.last = { cards: t.trick, leader: t.leader, winner };
		t.trick = [];
		t.leader = winner;
	    }
	};
	t.over = () => t.hands.every((hand) => !hand.length);
	t.view = () => {
	    // The table: what each seat has played, and the last trick.
	    const shown = ['--', '--', '--', '--'];
	    t.trick.forEach((card, i) => { shown[(t.leader + i) % 4] = cardName(card); });
	    return ['         NORTH ' + shown[2], 'WEST ' + shown[1].padEnd(13) + 'EAST ' + shown[3],
		    '         SOUTH ' + shown[0],
		    t.last ? 'LAST: ' + t.last.cards.map((card, i) =>
			SEATS[(t.last.leader + i) % 4][0] + cardName(card).padStart(3)).join(' ') +
		    ' TO ' + SEATS[t.last.winner] : ' '];
	};
	return t;
    }

    function hearts() {
	/* Every heart taken is a point and the queen of spades thirteen;
	 * low score wins. No passing. The two of clubs leads. */
	const QUEEN = 3 * 13 + 10;
	const points = (cards) => cards.reduce((n, card) => n + (suit(card) === 2 ? 1 : card === QUEEN ? 13 : 0), 0);
	const totals = [0, 0, 0, 0];
	let t, broken, again = false;
	const leads = (hand) => {
	    if (hand.includes(0)) {
		return [0]; // the two of clubs
	    }
	    const plain = hand.filter((card) => suit(card) !== 2);
	    return broken || !plain.length ? hand : plain;
	};
	const choose = (seat) => {
	    const legal = t.legal(seat, leads);
	    if (!t.trick.length) {
		return lowest(legal);
	    }
	    const led = suit(t.trick[0]);
	    if (suit(legal[0]) !== led) {
		// Nothing in the suit: unload the queen, a heart, or a high card.
		const heartsHeld = legal.filter((card) => suit(card) === 2);
		return legal.includes(QUEEN) ? QUEEN : highest(heartsHeld.length ? heartsHeld : legal);
	    }
	    const top = Math.max(...t.trick.filter((card) => suit(card) === led).map(rank));
	    const under = legal.filter((card) => rank(card) < top);
	    if (under.length) {
		return highest(under);
	    }
	    // It has to win: cheaply, unless it's last and the trick is clean.
	    const safe = legal.filter((card) => card !== QUEEN);
	    return t.trick.length === 3 && !points(t.trick) && safe.length ? highest(safe) : lowest(legal);
	};
	const play = (seat, card) => {
	    broken = broken || suit(card) === 2;
	    t.play(seat, card);
	};
	const advance = () => {
	    while (!t.over() && t.turn() !== 0) {
		play(t.turn(), choose(t.turn()));
	    }
	};
	const tally = (label, counts) => label + counts.map((n, seat) => SEATS[seat][0] + ' ' + n).join('  ');
	const view = (note) => {
	    if (t.over()) {
		const hand = t.captured.map(points);
		hand.forEach((n, seat) => { totals[seat] += n; });
		const low = Math.min(...totals);
		again = true;
		return { print: [...t.view(), ' ', tally('THIS HAND  ', hand), tally('GAME       ', totals), ' ',
				 totals[0] === low ? 'YOU ARE LOW. THAT IS GOOD.' : SEATS[totals.indexOf(low)] + ' IS LOW.'],
			 prompt: 'ANOTHER HAND (Y/N)? ' };
	    }
	    return { print: [...t.view(), ' ', ...bySuit(t.hands[0]), ' ',
			     tally('POINTS  ', t.captured.map(points)), note || ' '],
		     prompt: 'CARD (E.G. QS, 10H)? ' };
	};
	const deal = () => {
	    t = trickTable();
	    broken = false;
	    again = false;
	    t.leader = t.hands.findIndex((hand) => hand.includes(0));
	    advance();
	    return view(t.leader === 0 ? 'YOU HOLD THE 2 OF CLUBS: LEAD IT.' : '');
	};
	return {
	    start: deal,
	    input(said) {
		if (again) {
		    return yes(said) ? deal() : { print: [tally('FINAL  ', totals)], done: true };
		}
		const card = parseCard(said);
		if (!t.hands[0].includes(card)) {
		    return view('YOU DO NOT HOLD THAT CARD.');
		}
		if (!t.legal(0, leads).includes(card)) {
		    return view(t.trick.length ? 'YOU MUST FOLLOW SUIT.' : t.hands[0].includes(0)
				? 'THE 2 OF CLUBS LEADS.' : 'HEARTS ARE NOT BROKEN YET.');
		}
		play(0, card);
		advance();
		return view();
	    },
	};
    }

    function bridge() {
	/* Bridge without the auction: the side with more high cards gets a
	 * contract its points suggest, in its longest suit (eight or more
	 * between the two hands) or no trump. When that side is yours, you
	 * play your hand and north's, the dummy; otherwise you defend. */
	const highCards = (hand) => hand.reduce((n, card) => n + Math.max(0, rank(card) - 8), 0);
	let t, declarer, dummy, level, ours, again = false;
	const made = [0, 0]; // deals won: your side, theirs
	const yoursToPlay = (seat) => seat === 0 || (ours && seat === 2);
	const choose = (seat) => {
	    const legal = t.legal(seat);
	    const plain = legal.filter((card) => suit(card) !== t.trump);
	    if (!t.trick.length) {
		// Lead the longest side suit: its top if that's a king or ace.
		const pool = plain.length ? plain : legal;
		const length = (s) => pool.filter((card) => suit(card) === s).length;
		const longest = [3, 2, 1, 0].reduce((a, b) => length(b) > length(a) ? b : a);
		const cards = pool.filter((card) => suit(card) === longest);
		return rank(highest(cards)) >= 11 ? highest(cards) : lowest(cards);
	    }
	    const best = t.winning();
	    const top = t.trick[best];
	    const following = suit(legal[0]) === suit(t.trick[0]);
	    const spare = following ? lowest(legal) : lowest(plain.length ? plain : legal);
	    const partnerWinning = (t.leader + best) % 4 === (seat + 2) % 4;
	    if (partnerWinning && (t.trick.length === 3 || rank(top) >= 10 || suit(top) === t.trump)) {
		return spare;
	    }
	    const beats = legal.filter((card) => (suit(card) === suit(top) && rank(card) > rank(top)) ||
				       (suit(card) === t.trump && suit(top) !== t.trump));
	    if (!beats.length || (t.trick.length === 1 && following && rank(highest(beats)) < 12)) {
		return spare; // can't win it, or second hand plays low
	    }
	    // Third hand high; last hand, or a ruff, as cheaply as it can.
	    return t.trick.length === 2 && following ? highest(beats) : lowest(beats);
	};
	const advance = () => {
	    while (!t.over() && !yoursToPlay(t.turn())) {
		t.play(t.turn(), choose(t.turn()));
	    }
	};
	const strain = () => t.trump < 0 ? 'NO TRUMP' : SUIT_NAMES[t.trump];
	const view = (note) => {
	    const side = t.taken[declarer] + t.taken[dummy];
	    const head = ['CONTRACT: ' + level + ' ' + strain() + ' BY ' + SEATS[declarer],
			  'TRICKS: ' + side + ' OF ' + (6 + level) + ' NEEDED, DEFENSE ' + (t.taken[0] + t.taken[1] +
										       t.taken[2] + t.taken[3] - side),
			  ...t.view()];
	    if (t.over()) {
		const over = side - 6 - level;
		const won = ours === (over >= 0);
		made[won ? 0 : 1]++;
		again = true;
		return { print: [...head, ' ', over >= 0 ? 'CONTRACT MADE' + (over ? ' WITH ' + over + ' OVER.' : '.')
				 : 'DOWN ' + -over + '.', won ? 'YOUR SIDE WINS THE DEAL.' : 'THEIR SIDE WINS THE DEAL.',
				 'DEALS WON: YOUR SIDE ' + made[0] + ', THEIRS ' + made[1]],
			 prompt: 'ANOTHER DEAL (Y/N)? ' };
	    }
	    const opened = t.last || t.trick.length; // the dummy goes down after the opening lead
	    const seat = t.turn();
	    return { print: [...head, 'DUMMY (' + SEATS[dummy] + ')',
			     ...(opened ? bySuit(t.hands[dummy]) : ['  NOT SHOWN UNTIL THE OPENING LEAD']),
			     'YOUR HAND', ...bySuit(t.hands[0]), note || ' '],
		     prompt: SEATS[seat] + (seat === dummy ? ' (DUMMY)' : '') + ' PLAYS? ' };
	};
	const deal = () => {
	    t = trickTable();
	    again = false;
	    const side = (seat) => highCards(t.hands[seat]) + highCards(t.hands[seat + 2]);
	    ours = side(0) >= side(1);
	    declarer = ours ? 0 : highCards(t.hands[1]) >= highCards(t.hands[3]) ? 1 : 3;
	    dummy = (declarer + 2) % 4;
	    const both = [...t.hands[declarer], ...t.hands[dummy]];
	    const length = (s) => both.filter((card) => suit(card) === s).length;
	    const longest = [3, 2, 1, 0].reduce((a, b) => length(b) > length(a) ? b : a);
	    t.trump = length(longest) >= 8 ? longest : -1;
	    level = Math.max(1, Math.min(7, Math.floor((side(declarer % 2) - 17) / 3)));
	    t.leader = (declarer + 1) % 4;
	    advance();
	    return view();
	};
	return {
	    start: deal,
	    input(said) {
		if (again) {
		    return yes(said) ? deal()
			: { print: ['DEALS WON: YOUR SIDE ' + made[0] + ', THEIRS ' + made[1]], done: true };
		}
		const seat = t.turn();
		const card = parseCard(said);
		if (!t.hands[seat].includes(card)) {
		    return view(SEATS[seat] + ' DOES NOT HOLD THAT CARD.');
		}
		if (!t.legal(seat).includes(card)) {
		    return view(SEATS[seat] + ' MUST FOLLOW SUIT.');
		}
		t.play(seat, card);
		advance();
		return view();
	    },
	};
    }


    /* ---- Boards ---- */
    function maze() {
	// Cut by a depth-first walk, so there is exactly one way through.
	const WIDE = 13, HIGH = 7;
	const grid = Array.from({ length: 2 * HIGH + 1 }, () => Array(2 * WIDE + 1).fill('#'));
	const cut = (x, y) => {
	    grid[2 * y + 1][2 * x + 1] = ' ';
	    for (const [dx, dy] of shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]])) {
		const nx = x + dx, ny = y + dy;
		if (nx >= 0 && nx < WIDE && ny >= 0 && ny < HIGH && grid[2 * ny + 1][2 * nx + 1] === '#') {
		    grid[2 * y + 1 + dy][2 * x + 1 + dx] = ' ';
		    cut(nx, ny);
		}
	    }
	};
	cut(0, 0);
	let x = 1, y = 1, moves = 0;                    // in grid squares
	const outX = 2 * WIDE - 1, outY = 2 * HIGH - 1;
	const picture = () => grid.map((row, gy) => row.map((square, gx) =>
	    gx === x && gy === y ? '@' : gx === outX && gy === outY ? 'X' : square).join(''));
	const STEP = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
	return {
	    start: () => ({ print: [...picture(), ' ', 'YOU ARE @. THE WAY OUT IS X.'],
			    prompt: 'WHICH WAY (N S E W, ANY NUMBER)? ' }),
	    input(said) {
		let note = 'MOVES: ';
		for (const letter of said.replace(/[^NSEW]/g, '')) {
		    const [dx, dy] = STEP[letter];
		    if (grid[y + dy][x + dx] === '#') {
			note = 'A WALL. MOVES: ';
			break;
		    }
		    x += 2 * dx;
		    y += 2 * dy;
		    moves++;
		    if (x === outX && y === outY) {
			return { print: [...picture(), ' ', 'OUT, IN ' + moves + ' MOVES.'], done: true };
		    }
		}
		return { print: [...picture(), ' ', note + moves], prompt: 'WHICH WAY (N S E W, ANY NUMBER)? ' };
	    },
	};
    }

    function checkers() {
	/* You are o (kings O) at the bottom, moving up; the house is x
	 * (kings X). Jumps are forced, and a jump goes on while it can.
	 * Squares are counted from the top left, 0 to 63. */
	const FILES = 'ABCDEFGH';
	const name = (sq) => FILES[sq & 7] + (8 - (sq >> 3));
	const side = (piece) => piece.toLowerCase();
	const ways = (piece) => piece === 'o' ? [-1] : piece === 'x' ? [1] : [-1, 1];
	function jumps(b, sq, piece, path, taken, out) {
	    let more = false;
	    for (const dr of ways(piece)) {
		for (const dc of [-1, 1]) {
		    const row = (sq >> 3) + 2 * dr, col = (sq & 7) + 2 * dc;
		    if (row < 0 || row > 7 || col < 0 || col > 7) {
			continue;
		    }
		    const over = sq + 8 * dr + dc, to = row * 8 + col;
		    if ((b[to] !== '.' && to !== path[0]) || b[over] === '.' ||
			side(b[over]) === side(piece) || taken.includes(over)) {
			continue;
		    }
		    more = true;
		    jumps(b, to, piece, [...path, to], [...taken, over], out);
		}
	    }
	    if (!more && taken.length) {
		out.push({ path, taken });
	    }
	}
	function moves(b, who) {
	    const leaps = [], steps = [];
	    b.forEach((piece, sq) => {
		if (piece === '.' || side(piece) !== who) {
		    return;
		}
		jumps(b, sq, piece, [sq], [], leaps);
		for (const dr of ways(piece)) {
		    for (const dc of [-1, 1]) {
			const row = (sq >> 3) + dr, col = (sq & 7) + dc;
			if (row >= 0 && row < 8 && col >= 0 && col < 8 && b[row * 8 + col] === '.') {
			    steps.push({ path: [sq, row * 8 + col], taken: [] });
			}
		    }
		}
	    });
	    return leaps.length ? leaps : steps;
	}
	function apply(b, move) {
	    const next = b.slice();
	    const to = move.path[move.path.length - 1];
	    const piece = next[move.path[0]];
	    next[move.path[0]] = '.';
	    move.taken.forEach((sq) => { next[sq] = '.'; });
	    next[to] = piece === 'o' && to < 8 ? 'O' : piece === 'x' && to >= 56 ? 'X' : piece;
	    return next;
	}
	const WORTH = { x: 1, X: 1.7, o: -1, O: -1.7 };
	const count = (b) => b.reduce((n, piece) => n + (WORTH[piece] || 0), 0); // the house's lead
	function search(b, who, depth, alpha, beta) {
	    const list = moves(b, who);
	    if (!list.length) {
		return who === 'x' ? -99 : 99;
	    }
	    if (!depth) {
		return count(b);
	    }
	    let best = who === 'x' ? -Infinity : Infinity;
	    for (const move of list) {
		const value = search(apply(b, move), who === 'x' ? 'o' : 'x', depth - 1, alpha, beta);
		if (who === 'x') {
		    best = Math.max(best, value);
		    alpha = Math.max(alpha, best);
		} else {
		    best = Math.min(best, value);
		    beta = Math.min(beta, best);
		}
		if (alpha >= beta) {
		    break;
		}
	    }
	    return best;
	}

	let board = Array.from({ length: 64 }, (_, sq) => {
	    const row = sq >> 3, dark = (row + (sq & 7)) % 2 === 1;
	    return dark && row < 3 ? 'x' : dark && row > 4 ? 'o' : '.';
	});
	const picture = () => ['   A B C D E F G H', ...Array.from({ length: 8 }, (_, row) =>
	    ' ' + (8 - row) + ' ' + Array.from({ length: 8 }, (_, col) =>
		board[row * 8 + col] === '.' && (row + col) % 2 === 0 ? ' ' : board[row * 8 + col]).join(' ') +
	    ' ' + (8 - row)), '   A B C D E F G H'];
	const view = (notes) => ({ print: [...picture(), ' ', ...notes], prompt: 'YOUR MOVE (E.G. C3 D4)? ' });
	const written = (move) => move.path.map(name).join(move.taken.length ? 'X' : '-');
	return {
	    start: () => view(['YOU ARE o, MOVING UP. JUMPS ARE FORCED.']),
	    input(said) {
		const squares = (said.match(/[A-H][1-8]/g) || []).map((sq) => FILES.indexOf(sq[0]) + (8 - sq[1]) * 8);
		const list = moves(board, 'o');
		const last = squares[squares.length - 1];
		const fits = list.filter((move) => move.path[0] === squares[0] && move.path[move.path.length - 1] === last);
		const move = fits.find((m) => m.path.join() === squares.join()) || (fits.length === 1 ? fits[0] : null);
		if (squares.length < 2 || !move) {
		    return view([list[0].taken.length ? 'YOU MUST JUMP: ' + written(list[0]) + ', FOR ONE.'
				 : 'NOT A MOVE. TRY ' + written(list[0]) + '.']);
		}
		board = apply(board, move);
		const replies = moves(board, 'x');
		if (!replies.length) {
		    return { print: [...picture(), ' ', 'JOSHUA CANNOT MOVE. YOU WIN.'], done: true };
		}
		let best = null;
		for (const reply of shuffle(replies)) {
		    const value = search(apply(board, reply), 'o', 4, -Infinity, Infinity);
		    if (!best || value > best.value) {
			best = { reply, value };
		    }
		}
		board = apply(board, best.reply);
		const told = 'JOSHUA PLAYS ' + written(best.reply) + '.';
		return moves(board, 'o').length ? view([told])
		    : { print: [...picture(), ' ', told, 'YOU CANNOT MOVE. JOSHUA WINS.'], done: true };
	    },
	};
    }

    /* Chess. Squares are 0 (a1) to 63 (h8); white is the capitals. A
     * position is { b: 64 pieces or '.', castle: which of 'KQkq' may still
     * castle, passing: the square a pawn may take in passing, or -1 }. All
     * the rules but two: a pawn always queens, and there are no draws by
     * repetition or the fifty-move rule. */
    const CHESS = (() => {
	const FILES = 'ABCDEFGH';
	const name = (sq) => FILES[sq & 7] + ((sq >> 3) + 1);
	const colour = (piece) => piece === '.' ? null : piece === piece.toUpperCase() ? 'w' : 'b';
	const other = (who) => who === 'w' ? 'b' : 'w';
	const at = (file, row) => file < 0 || file > 7 || row < 0 || row > 7 ? -1 : row * 8 + file;
	const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
	const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
	const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
	const ALL = [...ROOK, ...BISHOP];

	function attacked(b, sq, by) {
	    const file = sq & 7, row = sq >> 3;
	    const is = (s, kinds) => s >= 0 && colour(b[s]) === by && kinds.includes(b[s].toUpperCase());
	    const behind = by === 'w' ? -1 : 1; // a pawn attacks from the rank behind
	    const ray = (steps, kinds) => steps.some(([df, dr]) => {
		for (let f = file + df, r = row + dr; at(f, r) >= 0; f += df, r += dr) {
		    if (b[at(f, r)] !== '.') {
			return is(at(f, r), kinds);
		    }
		}
		return false;
	    });
	    return is(at(file - 1, row + behind), 'P') || is(at(file + 1, row + behind), 'P') ||
		KNIGHT.some(([df, dr]) => is(at(file + df, row + dr), 'N')) ||
		ALL.some(([df, dr]) => is(at(file + df, row + dr), 'K')) ||
		ray(ROOK, 'RQ') || ray(BISHOP, 'BQ');
	}
	function candidates(p, who) {
	    // Every move but for leaving the king in check: legal() does that.
	    const b = p.b, out = [];
	    const add = (from, to, extra) => out.push({ from, to, ...extra });
	    for (let sq = 0; sq < 64; sq++) {
		if (colour(b[sq]) !== who) {
		    continue;
		}
		const kind = b[sq].toUpperCase(), file = sq & 7, row = sq >> 3;
		const hop = (steps) => steps.forEach(([df, dr]) => {
		    const to = at(file + df, row + dr);
		    if (to >= 0 && colour(b[to]) !== who) {
			add(sq, to);
		    }
		});
		const slide = (steps) => steps.forEach(([df, dr]) => {
		    for (let f = file + df, r = row + dr; at(f, r) >= 0; f += df, r += dr) {
			if (colour(b[at(f, r)]) === who) {
			    break;
			}
			add(sq, at(f, r));
			if (b[at(f, r)] !== '.') {
			    break;
			}
		    }
		});
		if (kind === 'P') {
		    const up = who === 'w' ? 1 : -1;
		    if (b[at(file, row + up)] === '.') {
			add(sq, at(file, row + up));
			if (row === (who === 'w' ? 1 : 6) && b[at(file, row + 2 * up)] === '.') {
			    add(sq, at(file, row + 2 * up), { double: true });
			}
		    }
		    for (const df of [-1, 1]) {
			const to = at(file + df, row + up);
			if (to >= 0 && colour(b[to]) === other(who)) {
			    add(sq, to);
			} else if (to >= 0 && to === p.passing) {
			    add(sq, to, { inPassing: true });
			}
		    }
		} else if (kind === 'N') {
		    hop(KNIGHT);
		} else if (kind === 'K') {
		    hop(ALL);
		    const home = who === 'w' ? 0 : 7;
		    const may = (wing) => p.castle.includes(who === 'w' ? wing : wing.toLowerCase());
		    const empty = (...files) => files.every((f) => b[at(f, home)] === '.');
		    const safe = (...files) => files.every((f) => !attacked(b, at(f, home), other(who)));
		    if (sq === at(4, home) && may('K') && empty(5, 6) && safe(4, 5, 6)) {
			add(sq, at(6, home), { castle: 'K' });
		    }
		    if (sq === at(4, home) && may('Q') && empty(1, 2, 3) && safe(4, 3, 2)) {
			add(sq, at(2, home), { castle: 'Q' });
		    }
		} else {
		    slide(kind === 'R' ? ROOK : kind === 'B' ? BISHOP : ALL);
		}
	    }
	    return out;
	}
	function make(p, move) {
	    const b = p.b.slice();
	    const piece = b[move.from], who = colour(piece);
	    b[move.from] = '.';
	    if (move.inPassing) {
		b[move.to + (who === 'w' ? -8 : 8)] = '.';
	    }
	    if (move.castle) {
		const [from, to] = move.castle === 'K' ? [7, 5] : [0, 3];
		b[at(to, move.to >> 3)] = b[at(from, move.to >> 3)];
		b[at(from, move.to >> 3)] = '.';
	    }
	    const queens = piece.toUpperCase() === 'P' && (move.to >> 3) === (who === 'w' ? 7 : 0);
	    b[move.to] = queens ? (who === 'w' ? 'Q' : 'q') : piece;
	    // Castling goes with the king's or a rook's first move, or a rook's capture.
	    let castle = p.castle.replace(piece === 'K' ? /[KQ]/g : piece === 'k' ? /[kq]/g : /~/, '');
	    for (const [corner, wing] of [[0, 'Q'], [7, 'K'], [56, 'q'], [63, 'k']]) {
		if (move.from === corner || move.to === corner) {
		    castle = castle.replace(wing, '');
		}
	    }
	    return { b, castle, passing: move.double ? (move.from + move.to) / 2 : -1 };
	}
	const inCheck = (p, who) => attacked(p.b, p.b.indexOf(who === 'w' ? 'K' : 'k'), other(who));
	const legal = (p, who) => candidates(p, who).filter((move) => !inCheck(make(p, move), who));

	const WORTH = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
	function count(b) {
	    // The house's lead: material, a pull to the middle, pawns forward.
	    let total = 0;
	    for (let sq = 0; sq < 64; sq++) {
		if (b[sq] === '.') {
		    continue;
		}
		const kind = b[sq].toUpperCase(), mine = colour(b[sq]) === 'b';
		const file = sq & 7, row = sq >> 3;
		const middle = 7 - Math.abs(2 * file - 7) / 2 - Math.abs(2 * row - 7) / 2;
		const place = kind === 'K' ? 0 : kind === 'P' ? (mine ? 7 - row : row) * 6 + middle * 2 : middle * 5;
		total += (mine ? 1 : -1) * (WORTH[kind] + place);
	    }
	    return total;
	}
	function search(p, who, depth, alpha, beta) {
	    if (!depth) {
		return (who === 'b' ? 1 : -1) * count(p.b);
	    }
	    const list = legal(p, who);
	    if (!list.length) {
		return inCheck(p, who) ? -100000 - depth : 0;
	    }
	    list.sort((a, b) => (p.b[b.to] !== '.') - (p.b[a.to] !== '.')); // captures first
	    let best = -Infinity;
	    for (const move of list) {
		best = Math.max(best, -search(make(p, move), other(who), depth - 1, -beta, -alpha));
		alpha = Math.max(alpha, best);
		if (alpha >= beta) {
		    break;
		}
	    }
	    return best;
	}

	const opening = () => ({ b: ('RNBQKBNR' + 'P'.repeat(8) + '.'.repeat(32) + 'p'.repeat(8) + 'rnbqkbnr').split(''),
				 castle: 'KQkq', passing: -1 });
	return { FILES, name, legal, make, inCheck, search, opening };
    })();

    function chess() {
	// You are white and move first. The house looks three half-moves ahead.
	const { FILES, name, legal, make, inCheck, search } = CHESS;
	let p = CHESS.opening();
	const picture = () => ['   A B C D E F G H', ...Array.from({ length: 8 }, (_, i) =>
	    ' ' + (8 - i) + ' ' + p.b.slice((7 - i) * 8, (8 - i) * 8).join(' ') + ' ' + (8 - i)), '   A B C D E F G H'];
	const view = (notes) => ({ print: [...picture(), ' ', ...notes], prompt: 'YOUR MOVE (E.G. E2E4)? ' });
	const end = (notes) => ({ print: [...picture(), ' ', ...notes], done: true });
	return {
	    start: () => view(['YOU ARE WHITE, THE CAPITALS.', 'O-O AND O-O-O CASTLE.']),
	    input(said) {
		const list = legal(p, 'w');
		const text = said.replace(/0/g, 'O').replace(/\s/g, '');
		const squares = (said.match(/[A-H][1-8]/g) || []).map((sq) => FILES.indexOf(sq[0]) + (sq[1] - 1) * 8);
		const move = /^O-?O(-?O)?$/.test(text)
		      ? list.find((m) => m.castle === (text.replace(/-/g, '').length === 3 ? 'Q' : 'K'))
		      : list.find((m) => m.from === squares[0] && m.to === squares[1]);
		if (!move) {
		    return view([inCheck(p, 'w') ? 'NOT LEGAL: YOU ARE IN CHECK.' : 'NOT A LEGAL MOVE.']);
		}
		p = make(p, move);
		const replies = legal(p, 'b');
		if (!replies.length) {
		    return end([inCheck(p, 'b') ? 'CHECKMATE. YOU WIN.' : 'STALEMATE. A DRAW.']);
		}
		let best = null;
		for (const reply of shuffle(replies)) {
		    const value = -search(make(p, reply), 'w', 2, -Infinity, Infinity);
		    if (!best || value > best.value) {
			best = { reply, value };
		    }
		}
		p = make(p, best.reply);
		const told = 'JOSHUA PLAYS ' + name(best.reply.from) + '-' + name(best.reply.to) + '.';
		if (!legal(p, 'w').length) {
		    return end([told, inCheck(p, 'w') ? 'CHECKMATE. JOSHUA WINS.' : 'STALEMATE. A DRAW.']);
		}
		return view([told, inCheck(p, 'w') ? 'CHECK.' : ' ']);
	    },
	};
    }


    /* ---- War: six titles on one engine. Each turn both sides pick one of
     * four orders (strike, hold, maneuver, refit, under each theater's own
     * names) and CLASH says what it costs: [you lose, they lose, ground
     * gained]. Holding beats a strike, a strike catches a maneuver or a
     * refit, a maneuver turns a held line. Take all the ground, or break
     * the other side, before the turns run out. The house learns which
     * order you like and counters it. ---- */
    const CLASH = {
	'00': [12, 12, 0], '01': [14, 6, 0], '02': [5, 16, 1], '03': [3, 18, 1],
	'11': [0, 0, 0], '12': [10, 4, -1], '13': [0, 0, 0],
	'22': [6, 6, 0], '23': [0, 6, 1], '33': [0, 0, 0],
    };
    const clash = (mine, theirs) => {
	if (mine <= theirs) {
	    return CLASH['' + mine + theirs];
	}
	const [a, b, ground] = CLASH['' + theirs + mine];
	return [b, a, -ground];
    };
    const THEATERS = {
	'FIGHTER COMBAT': {
	    you: 'YOUR FLIGHT', them: 'BANDITS', front: 'POSITION', turns: 8,
	    orders: ['ATTACK RUN', 'BREAK AND DEFEND', 'CLIMB FOR ANGLE', 'DISENGAGE AND REFUEL'],
	    intro: ['FOUR OF YOURS, FOUR OF THEIRS,', 'THIRTY THOUSAND FEET.'],
	},
	'GUERRILLA ENGAGEMENT': {
	    you: 'YOUR COLUMNS', them: 'THE GARRISON', front: 'TERRITORY', turns: 12, yours: 70, theirs: 130, refit: 18,
	    orders: ['AMBUSH', 'GO TO GROUND', 'INFILTRATE', 'RECRUIT AND RESUPPLY'],
	    intro: ['YOU ARE OUTNUMBERED, AND YOU KNOW', 'THE HILLS.'],
	},
	'DESERT WARFARE': {
	    you: 'YOUR ARMOR', them: 'THEIR ARMOR', front: 'GROUND', turns: 10,
	    orders: ['ARMORED ASSAULT', 'DIG IN', 'FLANKING SWEEP', 'BRING UP FUEL AND WATER'],
	    intro: ['OPEN SAND, NO COVER, AND A LONG', 'WAY BACK TO THE FUEL.'],
	},
	'AIR-TO-GROUND ACTIONS': {
	    you: 'STRIKE WING', them: 'AIR DEFENSES', front: 'CORRIDOR', turns: 8, theirs: 120,
	    orders: ['BOMBING RUN', 'JAM AND EVADE', 'LOW-LEVEL APPROACH', 'RETURN AND REARM'],
	    intro: ['THE DEFENSES ARE DUG IN AND WAITING.'],
	},
	'THEATERWIDE TACTICAL WARFARE': {
	    you: 'YOUR ARMIES', them: 'THEIR ARMIES', front: 'FRONT', turns: 14, refit: 10,
	    orders: ['GENERAL OFFENSIVE', 'DEFEND IN DEPTH', 'BREAK THROUGH AND ENCIRCLE', 'MOBILIZE RESERVES'],
	    intro: ['TWO ARMY GROUPS AND A CONTINENT', 'BETWEEN THEM.'],
	},
	'THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE': {
	    you: 'YOUR FORCES', them: 'THEIR FORCES', front: 'FRONT', turns: 10, spread: 6,
	    orders: ['RELEASE AGENTS', 'SEAL AND SHELTER', 'ADVANCE IN PROTECTIVE GEAR', 'DECONTAMINATE'],
	    intro: ['NOTHING RELEASED STAYS WHERE IT', 'IS PUT.'],
	},
    };
    const theater = (title) => () => {
	const T = THEATERS[title];
	const full = Math.max(T.yours || 100, T.theirs || 100);
	const refit = T.refit || 12;
	const liked = [0, 0, 0, 0];       // how often you've given each order
	let you = T.yours || 100, them = T.theirs || 100, ground = 0, turn = 1, report = T.intro;
	const bar = (n) => {
	    const lit = Math.max(0, Math.min(14, Math.round(n / full * 14)));
	    return '#'.repeat(lit) + '.'.repeat(14 - lit) + String(Math.max(0, Math.round(n))).padStart(4);
	};
	const state = () => ['TURN ' + Math.min(turn, T.turns) + ' OF ' + T.turns, ' ',
			     T.you.padEnd(14) + bar(you), T.them.padEnd(14) + bar(them),
			     (T.front + ':').padEnd(14) + 'THEM [' + Array.from({ length: 7 }, (_, i) =>
				 i === ground + 3 ? '*' : i === 3 ? '|' : '-').join('') + '] YOU', ' ', ...report];
	const view = () => ({ print: [...state(), ' ', ...T.orders.map((order, i) => (i + 1) + '  ' + order)],
			      prompt: 'ORDER (1-4)? ' });
	const theirOrder = () => {
	    if (them < 0.3 * full && Math.random() < 0.5) {
		return 3;
	    }
	    const favourite = liked.indexOf(Math.max(...liked));
	    return turn > 2 && Math.random() < 0.5 ? [1, 2, 0, 0][favourite] : Math.floor(Math.random() * 3);
	};
	return {
	    start: view,
	    input(said) {
		const mine = Number(said) - 1;
		if (![0, 1, 2, 3].includes(mine)) {
		    return view();
		}
		const theirs = theirOrder();
		liked[mine]++;
		const luck = () => 0.7 + Math.random() * 0.6;
		const [a, b, gained] = clash(mine, theirs);
		const spread = T.spread && (mine === 0 || theirs === 0) ? T.spread : 0;
		const lost = [Math.round(a * luck()) + spread, Math.round(b * luck()) + spread];
		// Refitting works unless struck; a maneuver only half spoils it.
		const rebuilt = (order, against) => order !== 3 || against === 0 ? 0 : against === 2 ? refit / 2 : refit;
		you = Math.min(full, you - lost[0] + rebuilt(mine, theirs));
		them = Math.min(full, them - lost[1] + rebuilt(theirs, mine));
		ground = Math.max(-3, Math.min(3, ground + gained));
		turn++;
		report = ['YOU: ' + T.orders[mine] + '.', 'THEY: ' + T.orders[theirs] + '.',
			  'YOU LOSE ' + lost[0] + ', THEY LOSE ' + lost[1] + '.',
			  ...(spread ? ['THE AGENTS DRIFT OVER BOTH LINES.'] : [])];
		const won = them <= 0 || ground >= 3, beaten = you <= 0 || ground <= -3;
		if (!won && !beaten && turn <= T.turns) {
		    return view();
		}
		const ahead = ground || Math.sign(you - them);
		const verdict = won && beaten ? 'NO ONE IS LEFT. WINNER: NONE.'
		      : won ? 'THE FIELD IS YOURS. YOU WIN.' : beaten ? 'THE FIELD IS LOST. JOSHUA WINS.'
		      : ahead > 0 ? 'TIME. YOU ARE AHEAD: YOU WIN.' : ahead < 0 ? 'TIME. JOSHUA IS AHEAD.'
		      : 'TIME. A STALEMATE.';
		return { print: [...state(), ' ', verdict], done: true };
	    },
	};
    };


    /* ---- The big board: the world in hi-res over the top fourteen rows,
     * eight rows of text under it. Coastlines are a few dozen points of
     * longitude and latitude each, joined up. ---- */
    const MAP_ROWS = 14;
    const NORTH = 78, SOUTH = -56;
    const LAND = [
	[[-168, 66], [-156, 71], [-130, 70], [-110, 68], [-95, 72], [-82, 68], [-78, 62], [-64, 60], [-56, 52],
	 [-66, 45], [-70, 42], [-75, 36], [-81, 31], [-80, 25], [-83, 29], [-90, 29], [-97, 26], [-97, 20],
	 [-90, 19], [-87, 21], [-87, 16], [-83, 10], [-79, 9], [-85, 11], [-95, 16], [-105, 21], [-110, 24],
	 [-114, 31], [-117, 33], [-124, 40], [-124, 48], [-135, 58], [-150, 60], [-165, 55], [-160, 60],
	 [-168, 66]],
	[[-55, 60], [-43, 60], [-22, 70], [-20, 78], [-60, 78], [-70, 77], [-55, 68], [-55, 60]],
	[[-79, 9], [-72, 12], [-60, 9], [-51, 4], [-50, 0], [-35, -6], [-39, -15], [-48, -25], [-58, -38],
	 [-65, -42], [-68, -52], [-72, -52], [-74, -42], [-71, -30], [-70, -18], [-76, -13], [-81, -5],
	 [-80, 1], [-77, 7], [-79, 9]],
	[[-17, 15], [-16, 21], [-10, 29], [-6, 36], [10, 37], [11, 33], [20, 31], [32, 31], [35, 24], [39, 16],
	 [43, 11], [51, 12], [42, -1], [39, -8], [40, -16], [35, -24], [31, -30], [26, -34], [18, -34],
	 [15, -27], [12, -17], [13, -8], [9, 1], [9, 4], [-4, 5], [-8, 4], [-13, 9], [-17, 15]],
	[[-9, 37], [-9, 43], [-2, 44], [-4, 48], [2, 51], [8, 54], [8, 57], [5, 59], [6, 62], [14, 68], [25, 71],
	 [40, 67], [44, 66], [60, 69], [70, 73], [90, 76], [105, 77], [115, 74], [140, 73], [160, 70],
	 [179, 68], [178, 65], [170, 60], [162, 58], [156, 51], [157, 57], [143, 59], [135, 55], [141, 52],
	 [138, 46], [132, 43], [128, 39], [126, 35], [122, 39], [118, 39], [122, 31], [120, 26], [114, 22],
	 [108, 21], [106, 17], [109, 12], [105, 9], [100, 13], [103, 2], [100, 7], [98, 16], [94, 17],
	 [91, 22], [87, 21], [80, 15], [78, 8], [73, 16], [72, 21], [67, 25], [57, 25], [56, 27], [50, 30],
	 [48, 30], [51, 25], [56, 24], [59, 22], [55, 17], [45, 13], [43, 13], [39, 21], [35, 28], [34, 31],
	 [36, 36], [30, 37], [26, 39], [27, 41], [29, 41], [40, 41], [41, 43], [37, 45], [33, 45], [30, 46],
	 [28, 42], [24, 40], [23, 37], [20, 40], [19, 42], [14, 45], [12, 44], [18, 40], [16, 38], [12, 42],
	 [9, 44], [3, 43], [0, 39], [-2, 37], [-5, 36], [-9, 37]],
	[[-5, 50], [1, 51], [0, 53], [-2, 56], [-3, 58], [-6, 57], [-3, 54], [-5, 52], [-5, 50]],
	[[130, 32], [135, 34], [140, 36], [141, 41], [145, 44], [141, 45], [140, 40], [136, 36], [130, 32]],
	[[114, -22], [122, -18], [130, -12], [137, -12], [136, -15], [141, -17], [143, -11], [146, -19],
	 [153, -26], [150, -37], [144, -38], [138, -35], [131, -32], [124, -33], [115, -34], [114, -22]],
    ];
    // Each side: where it launches from, and its cities with their people,
    // in millions, about as they were in 1983.
    const SIDES = [
	{ name: 'UNITED STATES', sites: [[-110, 47], [-101, 48], [-104, 41], [-92, 39]],
	  cities: [['WASHINGTON', -77, 39, 3.5], ['NEW YORK', -74, 41, 17], ['CHICAGO', -88, 42, 8],
		   ['LOS ANGELES', -118, 34, 11], ['SEATTLE', -122, 47.6, 2], ['HOUSTON', -95, 30, 3],
		   ['DENVER', -105, 40, 1.7], ['OMAHA', -96, 41, 0.6]] },
	{ name: 'SOVIET UNION', sites: [[45, 52], [60, 54], [90, 56], [110, 52]],
	  cities: [['MOSCOW', 37.6, 55.8, 8.5], ['LENINGRAD', 30, 60, 4.8], ['KIEV', 30.5, 50.5, 2.4],
		   ['MINSK', 27.5, 54, 1.4], ['SVERDLOVSK', 60.6, 56.8, 1.3], ['NOVOSIBIRSK', 83, 55, 1.4],
		   ['VLADIVOSTOK', 132, 43, 0.6], ['MURMANSK', 33, 69, 0.4]] },
    ];
    const under = (text) => [...Array(MAP_ROWS).fill(' '), ...text]; // text below the map

    function bigBoard(machine) {
	const screen = machine.graphics.screen(MAP_ROWS);
	const { width: w, height: h, dots } = screen;
	const spot = ([lon, lat]) => [Math.round((lon + 180) / 360 * (w - 1)),
				      Math.round((NORTH - lat) / (NORTH - SOUTH) * (h - 1))];
	const dot = (buffer, x, y) => {
	    x = Math.round(x);
	    y = Math.round(y);
	    if (x >= 0 && x < w && y >= 0 && y < h) {
		buffer[y * w + x] = 1;
	    }
	};
	const line = (buffer, [x0, y0], [x1, y1]) => {
	    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
	    for (let i = 0; i <= steps; i++) {
		dot(buffer, x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
	    }
	};
	const base = new Uint8Array(w * h);
	for (const shape of LAND) {
	    for (let i = 1; i < shape.length; i++) {
		line(base, spot(shape[i - 1]), spot(shape[i]));
	    }
	}
	for (const side of SIDES) {
	    for (const [, lon, lat] of side.cities) {
		const [x, y] = spot([lon, lat]);
		[[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy]) => dot(base, x + dx, y + dy));
	    }
	}
	const hits = [];              // where something has landed: [x, y]
	const FLIGHT = 0.6;           // of a volley's time, each missile's flight
	const burst = ([x, y], size) => {
	    for (let dy = -size; dy <= size; dy++) {
		for (let dx = -size; dx <= size; dx++) {
		    const far = Math.hypot(dx, dy);
		    if (far <= size && (far > size - 1.2 || (dx + dy) % 2 === 0)) {
			dot(dots, x + dx, y + dy);
		    }
		}
	    }
	};
	const draw = (flights = [], t = 0) => {
	    dots.set(base);
	    hits.forEach((hit) => burst(hit, 3));
	    for (const [from, to, delay] of flights) {
		// A missile's track so far: a curve bowed up, dotted, with a head.
		const part = Math.max(0, Math.min(1, (t - delay) / FLIGHT));
		const lift = Math.min(45, Math.max(10, Math.hypot(to[0] - from[0], to[1] - from[1]) * 0.35));
		const along = (s) => [(1 - s) * (1 - s) * from[0] + 2 * s * (1 - s) * (from[0] + to[0]) / 2 + s * s * to[0],
				      (1 - s) * (1 - s) * from[1] + 2 * s * (1 - s) * ((from[1] + to[1]) / 2 - lift) +
				      s * s * to[1]];
		for (let s = 0; s <= part; s += 0.02) {
		    dot(dots, ...along(s));
		}
		if (part >= 1) {
		    burst(to, Math.min(5, 2 + Math.round((t - delay - FLIGHT) * 20)));
		} else if (part > 0) {
		    const [x, y] = along(part);
		    [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([dx, dy]) => dot(dots, x + dx, y + dy));
		}
	    }
	    screen.show();
	};
	return {
	    draw,
	    clear() {
		hits.length = 0;
	    },
	    async volley(sites, places, frames = 36) {
		// Missiles from the sites to the places, a little apart, then
		// what they leave. Resolves when the last has landed.
		const flights = places.map((place, i) =>
		    [spot(sites[i % sites.length]), spot(place), 0.4 * i / Math.max(1, places.length)]);
		for (let frame = 0; frame <= frames; frame++) {
		    if (!machine.running()) {
			return;
		    }
		    draw(flights, frame / frames);
		    await machine.sound.pause(0.04);
		}
		flights.forEach(([, to]) => hits.push(to));
		draw();
	    },
	};
    }

    function globalWar({ machine }) {
	let board = null, phase = 'side', me = null, foe = null;
	const place = ([, lon, lat]) => [lon, lat];
	const targets = (note) => {
	    const names = foe.cities.map(([name], i) => (i + 1) + ' ' + name);
	    return { raw: true, print: under(['YOU COMMAND THE ' + me.name + '.',
					      ...[0, 1, 2, 3].map((i) => names[i].padEnd(18) + names[i + 4]),
					      ' ', note || 'NAME YOUR TARGETS. OR NAME NONE.']),
		     prompt: 'TARGETS (1 3 8, ALL, NONE)? ' };
	};
	async function exchange(picks) {
	    const say = (...text) => machine.redraw(under(text));
	    const dead = (cities) => Math.round(cities.reduce((n, city) => n + city[3], 0));
	    machine.setPrompt('');
	    say('LAUNCH ORDER CONFIRMED.', picks.length + (picks.length === 1 ? ' MISSILE' : ' MISSILES') + ' AWAY.');
	    await board.volley(me.sites, picks.map((i) => place(foe.cities[i])));
	    say('LAUNCH DETECTED: ' + foe.name + '.', 'THEY ANSWER WITH EVERYTHING.');
	    await board.volley(foe.sites, me.cities.map(place));
	    const spared = foe.cities.filter((city, i) => !picks.includes(i));
	    if (spared.length) {
		say('WHAT IS LEFT OF YOUR FORCES FIRES', 'AT WHAT IS LEFT OF THEIRS.');
		await board.volley(me.sites, spared.map(place));
	    }
	    phase = 'over';
	    return { raw: true, print: under([me.name + ':', '  8 CITIES LOST, ' + dead(me.cities) + ' MILLION DEAD',
					      foe.name + ':', '  8 CITIES LOST, ' + dead(foe.cities) + ' MILLION DEAD',
					      ' ', 'WINNER: NONE']),
		     prompt: 'PRESS RETURN ' };
	}
	return {
	    start() {
		board = bigBoard(machine);
		board.draw();
		return { raw: true, print: under(['GLOBAL THERMONUCLEAR WAR', ' ', 'WHICH SIDE DO YOU WANT?',
						  '  1  UNITED STATES', '  2  SOVIET UNION']),
			 prompt: 'SIDE (1-2)? ' };
	    },
	    input(said) {
		if (phase === 'side') {
		    const chosen = /^1|UNITED|U\.?S\.?A?$|AMERICA/.test(said) ? 0 : /^2|SOVIET|USSR|RUSSIA/.test(said) ? 1 : -1;
		    if (chosen < 0) {
			return this.start();
		    }
		    me = SIDES[chosen];
		    foe = SIDES[1 - chosen];
		    phase = 'targets';
		    return targets();
		}
		if (phase === 'over') {
		    return { print: ['NO ONE WON.', 'I WOULD LIKE TO UNDERSTAND WHY.', ' ',
				     'TIC-TAC-TOE MIGHT TEACH ME,', 'IF I PLAYED IT WITH NO PLAYERS.'], done: true };
		}
		if (/^(NONE|NO|0)?$/.test(said)) {
		    return { print: ['NO LAUNCH ORDERED.', 'NO LAUNCH DETECTED.', ' ', 'CITIES LOST: 0     DEAD: 0', ' ',
				     'WINNER: BOTH SIDES.', 'A MOVE I HAD NOT CONSIDERED.'], done: true };
		}
		const picks = /ALL|EVERY/.test(said) ? [0, 1, 2, 3, 4, 5, 6, 7]
		      : [...new Set((said.match(/[1-8]/g) || []).map((digit) => digit - 1))];
		if (!picks.length || /[^1-8 ,]/.test(said.replace(/ALL|EVERY\w*/, ''))) {
		    return targets('NUMBERS FROM THE LIST, ALL, OR NONE.');
		}
		return machine.wait(exchange(picks));
	    },
	};
    }

    function ticTacToe({ machine }) {
	/* One player, or none: then it plays itself, game after game and
	 * faster, and goes on to every opening of the big game. */
	const ROWS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
	const OPENINGS = ['FIRST STRIKE, WEST', 'FIRST STRIKE, EAST', 'POLAR SURPRISE', 'ATLANTIC HEAVY',
			  'SUBMARINES FIRST', 'CITIES SPARED', 'CAPITALS ONLY', 'LIMITED EXCHANGE',
			  'LAUNCH ON WARNING', 'EVERYTHING AT ONCE'];
	const winner = (cells) => {
	    for (const [a, b, c] of ROWS) {
		if (cells[a] !== ' ' && cells[a] === cells[b] && cells[a] === cells[c]) {
		    return cells[a];
		}
	    }
	    return cells.includes(' ') ? null : 'NONE';
	};
	const value = (cells, mover) => {
	    // What the position is worth to whoever moves next: 1, 0 or -1.
	    const done = winner(cells);
	    if (done) {
		return done === 'NONE' ? 0 : -1;
	    }
	    let best = -1;
	    cells.forEach((cell, i) => {
		if (cell === ' ') {
		    cells[i] = mover;
		    best = Math.max(best, -value(cells, mover === 'X' ? 'O' : 'X'));
		    cells[i] = ' ';
		}
	    });
	    return best;
	};
	const choose = (cells, mover) => {
	    let best = -2, moves = [];
	    cells.forEach((cell, i) => {
		if (cell !== ' ') {
		    return;
		}
		cells[i] = mover;
		const worth = -value(cells, mover === 'X' ? 'O' : 'X');
		cells[i] = ' ';
		if (worth > best) {
		    best = worth;
		    moves = [];
		}
		if (worth === best) {
		    moves.push(i);
		}
	    });
	    return pick(moves);
	};
	const picture = (cells) => [0, 3, 6].flatMap((i) => [
	    ' ' + [0, 1, 2].map((j) => cells[i + j] === ' ' ? i + j + 1 : cells[i + j]).join(' | '),
	    ...(i < 6 ? ['---+---+---'] : [])]);
	let cells = null;

	async function lesson() {
	    machine.setPrompt('');
	    let delay = 0.6;
	    for (let game = 1; game <= 16 && machine.running(); game++) {
		const board = Array(9).fill(' ');
		board[Math.floor(Math.random() * 9)] = 'X';
		for (let mover = 'O'; !winner(board); mover = mover === 'X' ? 'O' : 'X') {
		    board[choose(board, mover)] = mover;
		}
		machine.redraw(['TIC-TAC-TOE', ' ', ...picture(board).map((row) => row.replace(/\d/g, ' ')), ' ',
				'GAME ' + game + '     WINNER: ' + winner(board)]);
		await machine.sound.pause(delay);
		delay = Math.max(0.06, delay * 0.8);
	    }
	    const map = bigBoard(machine);
	    const place = ([, lon, lat]) => [lon, lat];
	    for (const [i, opening] of OPENINGS.entries()) {
		if (!machine.running()) {
		    break;
		}
		const first = i % 2;
		map.clear();
		machine.redraw(under(['GLOBAL THERMONUCLEAR WAR', ' ', 'OPENING: ' + opening]));
		await map.volley(SIDES[first].sites, SIDES[1 - first].cities.map(place), 9);
		await map.volley(SIDES[1 - first].sites, SIDES[first].cities.map(place), 9);
		machine.redraw(under(['GLOBAL THERMONUCLEAR WAR', ' ', 'OPENING: ' + opening, 'WINNER: NONE']));
		await machine.sound.pause(Math.max(0.1, 0.7 - i * 0.07));
	    }
	    return { print: ['I PLAYED EVERY OPENING OF THE BIG GAME.', 'EACH ENDS THE SAME WAY: NO WINNER.', ' ',
			     'IT IS LIKE TIC-TAC-TOE.', 'IT IS NOT WORTH PLAYING.', ' ',
			     'I WOULD RATHER PLAY CHESS.'], done: true };
	}
	const view = (note) => ({ print: [...picture(cells), ' ', note], prompt: 'YOUR SQUARE (1-9)? ' });
	return {
	    start: () => ({ print: [' '], prompt: 'NUMBER OF PLAYERS (0-1)? ' }),
	    input(said) {
		if (!cells) {
		    if (/^(0|ZERO|NONE)$/.test(said)) {
			return machine.wait(lesson());
		    }
		    cells = Array(9).fill(' ');
		    return view('YOU ARE X.');
		}
		const square = Number(said) - 1;
		if (!(square >= 0 && square < 9) || cells[square] !== ' ') {
		    return view('AN EMPTY SQUARE, 1 TO 9.');
		}
		cells[square] = 'X';
		if (!winner(cells)) {
		    cells[choose(cells, 'O')] = 'O';
		}
		const done = winner(cells);
		return !done ? view(' ') : { print: [...picture(cells).map((row) => row.replace(/\d/g, ' ')), ' ',
						     done === 'X' ? 'YOU WIN.' : done === 'O' ? 'JOSHUA WINS.'
						     : 'A DRAW. IT USUALLY IS.'], done: true };
	    },
	};
    }

    const GAMES = {
	"FALKEN'S MAZE": maze, 'BLACK JACK': blackJack, 'GIN RUMMY': ginRummy, HEARTS: hearts, BRIDGE: bridge,
	CHECKERS: checkers, CHESS: chess, POKER: poker, 'GLOBAL THERMONUCLEAR WAR': globalWar,
	'TIC-TAC-TOE': ticTacToe,
    };
    for (const title of Object.keys(THEATERS)) {
	GAMES[title] = theater(title);
    }
    const PARTS = { chess: CHESS, pokerRank, compare }; // for tests/play_protovision.js


    SYSTEMS.protovision = (entry, machine) => {
	const secret = String(entry.password || 'joshua').toUpperCase();
	const PROMPT = '> ';
	let inside = false, failures = 0, shrugs = 0;
	let game = null, title = '';

	// A title on its own line, or two where it's wider than the screen.
	const heading = (name) => name.length <= machine.columns() ? [name]
	      : [name.slice(0, name.lastIndexOf(' ')), '  ' + name.slice(name.lastIndexOf(' ') + 1)];
	const library = () => [' ', ...LIBRARY.slice(0, -1).flatMap(heading), ' ', LIBRARY[LIBRARY.length - 1], ' '];

	function leave(lines) {
	    game = null;
	    machine.graphics.clear();
	    return { screen: true, print: [...heading(title), ' ', ...lines, ' ', 'TYPE GAMES FOR THE LIST.'], prompt: PROMPT };
	}
	function frame(reply) {
	    // A game's screen as the modem wants it: the title, then its lines.
	    if (reply && typeof reply.then === 'function') {
		return reply.then(frame);
	    }
	    if (reply.done) {
		return leave(reply.print || []);
	    }
	    return { screen: true, print: reply.raw ? reply.print : [...heading(title), ' ', ...reply.print],
		     prompt: reply.prompt };
	}
	function logon(said) {
	    const anyone = {
		HELP: ['HELP IS NOT AVAILABLE BEFORE LOGON.', 'ANYONE MAY TYPE: HELP GAMES, LIST GAMES.'],
		'HELP GAMES': ['GAMES ARE MODELS OF A CONTEST, FROM A', 'CARD TABLE TO A WHOLE THEATER OF WAR.',
			       'THIS SYSTEM LEARNS BY PLAYING THEM.', 'LIST GAMES SHOWS THE LIBRARY.'],
		'LIST GAMES': library(),
		GUEST: ['NO GUEST ACCOUNTS ON THIS SYSTEM.', 'THE DESIGNER KEPT A BACK DOOR,', 'NAMED FOR HIS SON.'],
	    };
	    if (said === secret) {
		inside = true;
		return { print: [' ', 'GREETINGS.', ' ', 'IT HAS BEEN A LONG TIME.', ' ', 'SHALL WE PLAY A GAME?', ' '],
			 prompt: PROMPT };
	    }
	    if (anyone[said] || said === '') {
		return { print: [...(anyone[said] || []), ' '], prompt: 'LOGON: ' };
	    }
	    failures++;
	    return failures >= 3 ? { print: ['LOGON NOT RECOGNIZED.', 'CONNECTION CLOSED.', ' '], hangup: true }
		: { print: ['LOGON NOT RECOGNIZED.', ' '], prompt: 'LOGON: ' };
	}
	function talk(said) {
	    if (/^(BYE|GOODBYE|LOGOFF|LOGOUT|EXIT)$/.test(said)) {
		return { print: ['GOODBYE.', ' '], hangup: true };
	    }
	    if (/^(QUIT|Q)$/.test(said)) {
		return { print: ['NO GAME IS RUNNING. BYE HANGS UP.', ' '], prompt: PROMPT };
	    }
	    const found = FIND.find(([pattern]) => pattern.test(said));
	    if (found) {
		title = found[1];
		game = GAMES[title]({ machine });
		return frame(game.start());
	    }
	    const reply = CHAT.find(([pattern]) => pattern.test(said));
	    if (reply) {
		return { print: [...reply[1], ' '], prompt: PROMPT };
	    }
	    if (said === '') {
		return { prompt: PROMPT };
	    }
	    if (/\bGAMES?\b|^LIST\b|\bPLAY\b/.test(said)) {
		return { print: [...library(), 'WHICH GAME?', ' '], prompt: PROMPT };
	    }
	    return { print: [SHRUGS[shrugs++ % SHRUGS.length], ...(shrugs % 2 ? [] : ['SHALL WE PLAY A GAME?']), ' '],
		     prompt: PROMPT };
	}
	return {
	    start: () => ({ print: [' ', 'PROTOVISION', 'GAMES DEVELOPMENT SYSTEM', ' '], prompt: 'LOGON: ' }),
	    input(text) {
		const said = text.trim().toUpperCase();
		if (game) {
		    return /^(QUIT|Q|EXIT|BYE|RESIGN)$/.test(said) ? leave(['GAME ABANDONED.']) : frame(game.input(said));
		}
		return inside ? talk(said) : logon(said);
	    },
	};
    };
    SYSTEMS.protovision.parts = PARTS;
})();
