/* FORK of "Apple IIe 3D" */

/* The keyboard is done interestingly, but it doesn't resemble the
 * real thing. That said, I could attach listeners on the keyboard
 * keys for mobile use. The monitor and drive are nice. The monitor
 * could use a few small extra image elements but it is generally
 * great. The drive has issues with 3D for mobile. */

/* This fork makes some lights flash, fixes some bugs, and but
   generally makes the 3D model into a toy UI. If it looks like it was
   written by two people for two completely different purposes and
   approaches, that's why. ;-) */

/* The scaffolding used to swap spaces for no-break spaces because HTML
 * collapses runs of spaces. The terminal now renders with
 * white-space: pre, and no-break spaces are turned back into plain
 * spaces wherever they appear, so command-data.json may use either. */

const MAX_LINE_LENGTH = 80; // columns on screen; longer lines wrap
const MAX_INPUT_LENGTH = 240; // the prompt plus 239 typed characters, as on the real thing
const MAX_ROWS = 22;
const OUTPUT_SPEED = 350;
const COMMAND_JSON = 'assets/command-data.json';
const REDIRECT_SECONDS = 7;
const MAX_SEQUENTIAL_SYNTAX_ERRORS = 3;
const POWER_BUTTON_ALERT_SECONDS_START = 5; // start alerting the user after seconds if they haven't hit the power button
const POWER_BUTTON_ALERT_SECONDS_STOP = 120; // just stop any alert if they haven't clicked
const DOS_FILE_VERBS = ['RUN', 'BRUN', 'OPEN', 'LOAD', 'BLOAD', 'EXEC', 'READ'];
const DESK_PARTS = '.monitor, .keyboard, .keyboard *, .floppy-drive, .floppy-drive *';
const ZOOM_SECONDS = 1.4;
const FLICKER_WARM_UP_SECONDS = 60; // then the screen only flickers now and then:
const FLICKER_EVERY_SECONDS = 60;    // a flicker every 60 seconds...
const FLICKER_JITTER_SECONDS = 20;   // ...plus up to 20 more, so it never keeps time
const FLICKERS = [                   // one of these, at random (apple-IIe.css)
    'flicker-burst 0.6s steps(1, end)',
    'flicker-burst-fast 0.25s steps(1, end)',
    'flicker-burst-faint 0.6s steps(1, end)',
];
const TOAST_SECONDS = 2.5;
const PHONE_LINE_HEIGHT = 1.2;
const PHONE_80_COLUMN_WIDTH = 640; // narrower screens get the 40 column display

// Phones and tablets: no hover, a finger for a pointer, and no keyboard
// until a text field has focus. Turning the machine on zooms into the
// screen, which then fills the window above the phone's own keyboard.
const touchMode = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
let screenMode = false;
let zoomed = false;     // desktop: leaning in to the monitor
let zoomToggle = null;
let toastTimer = null;
let emulator = null;    // the frame while a real //e (apple2js/) has the screen
let columns = MAX_LINE_LENGTH;

// could also do this in CSS
const POWER_ON_COLOR  = 'rgb(59 159 1)';
const POWER_ON_SHADOW = 'inset 0 0.15vmin 0.3vmin #00ff00';
const POWER_OFF_COLOR = '#d1c919';
const POWER_OFF_SHADOW= 'inset 0 0.15vmin 0.3vmin #f7e652';
const POWER_ALERT_COLOR='#ff4300';


let syntaxErrorCounter = 0;
let on = false;
let booting = false;
let line = 0;
const lines = [' '];
let promptText = ']';     // DOS's prompt, or the running program's

// A program from the disk (see apple-IIe-programs.js) gets each line
// typed at its prompt until it exits. Ctrl-C or power off ends it, which
// bumps programToken so anything it was still waiting for is ignored.
let program = null;
let programToken = 0;
let working = false;      // the program is waiting on the network

// Timers that belong to the running machine. Power off cancels them all.
let output = null;        // the listing being printed, if any
let redirectTimer = null;
let powerOffTimer = null;
let floppyTimer = null;
let flickerTimer = null;

const keys = [
  { key: 'Esc', key2: '', keyCode: 27 },
  { key: 'bang', key2: '1', keyCode: 49 },
  { key: 'at', key2: '2', keyCode: 50 },
  { key: 'hash', key2: '3', keyCode: 51 },
  { key: 'dolar', key2: '4', keyCode: 52 },
  { key: 'prc', key2: '5', keyCode: 53 },
  { key: 'caret', key2: '6', keyCode: 54 },
  { key: 'amp', key2: '7', keyCode: 55 },
  { key: 'star', key2: '8', keyCode: 56 },
  { key: 'lp', key2: '9', keyCode: 57 },
  { key: 'rp', key2: '0', keyCode: 48 },
  { key: '-', key2: '_', keyCode: 189 },
  { key: 'plus', key2: 'eq', keyCode: 187 },
  { key: 'Del', key2: '', keyCode: 8 },
  { key: '⇥', key2: '', keyCode: 9 },
  { key: 'Q', key2: '', code: 81, keyCode: 81 },
  { key: 'W', key2: '', code: 87, keyCode: 87 },
  { key: 'E', key2: '', code: 69, keyCode: 69 },
  { key: 'R', key2: '', code: 82, keyCode: 82 },
  { key: 'T', key2: '', keyCode: 84 },
  { key: 'Y', key2: '', keyCode: 89 },
  { key: 'U', key2: '', keyCode: 85 },
  { key: 'I', key2: '', keyCode: 73 },
  { key: 'O', key2: '', keyCode: 79 },
  { key: 'P', key2: '', keyCode: 80 },
  { key: 'lb', key2: 'lbr', keyCode: 219 },
  { key: 'rb', key2: 'rbr', keyCode: 221 },
  { key: '↵', key2: '', keyCode: 13 },
  { key: 'Ctrl', key2: '', keyCode: 17 },
  { key: 'A', key2: '', keyCode: 65 },
  { key: 'S', key2: '', keyCode: 83 },
  { key: 'D', key2: '', keyCode: 68 },
  { key: 'F', key2: '', keyCode: 70 },
  { key: 'G', key2: '', keyCode: 71 },
  { key: 'H', key2: '', keyCode: 72 },
  { key: 'J', key2: '', keyCode: 74 },
  { key: 'K', key2: '', keyCode: 75 },
  { key: 'L', key2: '', keyCode: 76 },
  { key: 'semi', key2: 'colon', keyCode: 186 },
  { key: 'dquote', key2: 'quote', keyCode: 222 },
  { key: 'tild', key2: 'dot', keyCode: 220 },
  { key: '⇧L', key2: '', keyCode: 16 },
  { key: 'pipe', key2: 'backslash', keyCode: 192 },
  { key: 'Z', key2: '', keyCode: 90 },
  { key: 'X', key2: '', keyCode: 88 },
  { key: 'C', key2: '', keyCode: 67 },
  { key: 'V', key2: '', keyCode: 86 },
  { key: 'B', key2: '', keyCode: 66 },
  { key: 'N', key2: '', keyCode: 78 },
  { key: 'M', key2: '', keyCode: 77 },
  { key: 'langleb', key2: 'comma', keyCode: 188 },
  { key: 'rangleb', key2: 'dot', keyCode: 190 },
  { key: 'qmark', key2: 'slash', keyCode: 191 },
  { key: '⇧', key2: '' },
  { key: '⇩', key2: '' },
  { key: 'none', key2: '' },
  { key: '', key2: '', keyCode: 91 },
  { key: '_', key2: '', keyCode: 32 },
  { key: 'r', key2: '', keyCode: 93 },
  { key: '⭠', key2: '', keyCode: 37 },
  { key: '⭢', key2: '', keyCode: 39 },
  { key: '⭣', key2: '', keyCode: 40 },
  { key: '⭡', key2: '', keyCode: 38 },
];
let keysContainer, keyTemplate, powerSwitch, powerLight;
let phoneScreen, phoneKeyboard, phoneInput, terminalHome;
let bootedOnce = false;


function powerButtonAlert() {
    /* light up the floppy "IN USE" led for a quick read */
    const onColor  = POWER_ALERT_COLOR;
    const offColor = POWER_OFF_COLOR;
    const powerLed = document.querySelector('.monitor__power-switch__button');

    powerLed.style.backgroundColor = onColor;

    let rotateColor = onColor;
    const blinkPowerButton =
	  setInterval(() => {
	      if (bootedOnce) {
		  powerLed.style.boxShadow = POWER_ON_SHADOW; // could also do this in CSS
		  powerLed.style.backgroundColor = POWER_ON_COLOR;
		  clearInterval(blinkPowerButton);
	      } else {
		  powerLed.style.backgroundColor = rotateColor;
		  if (rotateColor == onColor) {
		      rotateColor = offColor;
		  } else {
		      rotateColor = onColor;
		  }
	      }
	  }, 500);
    // Stop blinkPowerButton
    setTimeout(function() {
	clearInterval(blinkPowerButton);
    }, (POWER_BUTTON_ALERT_SECONDS_STOP * 1000));
}


document.addEventListener('DOMContentLoaded', () => {

    keysContainer = document.querySelector('.keys-container');
    keyTemplate = document.querySelector('.key--template');
    powerSwitch = document.querySelector('.monitor__power-switch');
    powerLight = document.querySelector('.monitor__power-switch__button');

    // After content load, wait at most POWER_BUTTON_ALERT_SECONDS_START and
    // then flash the power button.
    setTimeout(function() {
	if (!bootedOnce) {
	    powerButtonAlert();
	}
    }, (1000 * POWER_BUTTON_ALERT_SECONDS_START));

    powerSwitch.addEventListener('click', togglePower);

    if (touchMode) {
	setUpPhone();
    } else {
	zoomToggle = document.querySelector('.zoom-toggle');
	zoomToggle.addEventListener('click', () => {
	    toggleZoom();
	    zoomToggle.blur(); // so the space bar and RETURN keep typing
	});
	document.querySelector('.monitor').addEventListener('dblclick', (event) => {
	    if (event.target.closest('.monitor__power-switch')) {
		return;
	    }
	    window.getSelection().removeAllRanges(); // a double-click selects a word
	    toggleZoom();
	});
    }

  for (let i = 0; i < keys.length; i++) {
      const key = keyTemplate.cloneNode(true);
      key.classList.remove('key--template');
      key.classList.add('key--' + keys[i].key);
      if (keys[i].keyCode) {
	  key.classList.add('key-code--' + keys[i].keyCode);
      }
      const keyLabelTop = key.querySelector('.key__label-top');
      if (keys[i].key === '') {
	  const appleFilled = document.createElement('div');
	  appleFilled.classList.add('apple-outlined');
	  keyLabelTop.appendChild(appleFilled);
      } else if (keys[i].key === 'r') {
	  const appleFilled = document.createElement('div');
	  appleFilled.classList.add('apple-filled');
	  keyLabelTop.appendChild(appleFilled);
      } else {
	  keyLabelTop.innerText = getKeyLabel(keys[i].key);
      }

      const keyLabelBottom = key.querySelector('.key__label-bottom');
      keyLabelBottom.innerText = getKeyLabel(keys[i].key2);
      keysContainer.appendChild(key);
  }
  updateKeysZ();
  fitScene();
});

window.addEventListener('resize', () => {
    updateKeysZ();
    if (screenMode) {
	zoomToScreen(0);
	layoutPhoneScreen();
    } else if (zoomed) {
	zoomToMonitor(0);
    } else {
	fitScene();
    }
});


function togglePower() {
    bootedOnce = true; // Don't show the power button alert if clicked
    on = !on;
    if (on) {
 	booting = true;
	clearTimeout(powerOffTimer); // switched back on before the screen finished fading
	powerLight.style.boxShadow = POWER_ON_SHADOW;
	powerLight.style.backgroundColor = POWER_ON_COLOR;
	if (touchMode) {
	    enterScreen();
	}
	readFromFloppy(7);
	animateTerminalPowerOn(4);
	nukeTerminal();
	showData(bootPromData()).then(() => {
	    nukeTerminal();
	    showData(introData).then(() => {
		booting = false;
		clearTerminal();
		animateTerminalFlicker();
	    });
	});
    } else {
	powerLight.style.boxShadow = POWER_OFF_SHADOW;
	powerLight.style.backgroundColor = POWER_OFF_COLOR;
	stopMachine();
	if (screenMode) {
	    leaveScreen();
	}
	/* Would be nice: animate the LCD fade instead of just zero'ng it */
	/* Something like: */
	animateTerminalPowerOff(0.55);
	powerOffTimer = setTimeout(() => nukeTerminal(), 500);
    }
}


function measureScene(selector) {
    /* Rects of the matching elements as drawn with the scene
     * untransformed (and the scene's own box). */
    const scene = document.querySelector('.🖥️');
    const transform = scene.style.transform;
    scene.style.transition = 'none';
    scene.style.transform = 'none';
    scene.style.transformOrigin = '0 0';

    const box = scene.getBoundingClientRect();
    const rects = [...document.querySelectorAll(selector)]
	  .map((element) => element.getBoundingClientRect())
	  .filter((r) => r.width > 0 && r.height > 0);

    scene.style.transform = transform;
    scene.offsetWidth; // put it back before any transition starts
    return { scene, box, rects };
}

function setSceneToFit(selector, maxScale, margin, seconds) {
    /* Scale and move the scene so the matching elements are centered
     * and as large as fits, animating over `seconds`. */
    const { scene, box, rects } = measureScene(selector);
    const left   = Math.min(...rects.map((r) => r.left));
    const right  = Math.max(...rects.map((r) => r.right));
    const top    = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));

    const scale = Math.min(maxScale,
			   (window.innerWidth  * (1 - margin)) / (right - left),
			   (window.innerHeight * (1 - margin)) / (bottom - top));
    const dx = window.innerWidth  / 2 - (box.left + ((left + right) / 2 - box.left) * scale);
    const dy = window.innerHeight / 2 - (box.top  + ((top + bottom) / 2 - box.top)  * scale);
    scene.style.transition = seconds ? 'transform ' + seconds + 's ease-in-out' : 'none';
    scene.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ')';
}

function fitScene(seconds = 0) {
    /* The desk (keyboard, monitor and drive) is wider than the 100vmin
     * box it is drawn in, so on most window shapes the page scrolled
     * sideways and the drive was cut off. Scale the whole scene down
     * to fit and center what is actually drawn. The 3D faces stick out
     * of their parents, so every piece is measured. A little margin
     * leaves room for shadows. */
    setSceneToFit(DESK_PARTS, 1, 0.04, seconds);
}

function zoomToScreen(seconds) {
    setSceneToFit('.monitor__screen', Infinity, 0, seconds);
}

function zoomToMonitor(seconds) {
    /* Desktop: the screen and its bezel fill the window. */
    setSceneToFit('.monitor__inner', Infinity, 0.04, seconds);
}

function toggleZoom() {
    /* Desktop: the zoom toggle and a double-click on the monitor. There
     * is nothing to lean in to until the machine is on, and finding the
     * power switch is part of it. */
    if (!zoomed && !on) {
	showToast('Turn the computer on first.');
	return;
    }
    setZoomed(!zoomed);
}

function showToast(text) {
    const toast = document.querySelector('.toast');
    toast.textContent = text;
    toast.classList.add('toast--shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('toast--shown'), TOAST_SECONDS * 1000);
}

function setZoomed(zoom) {
    zoomed = zoom;
    document.body.classList.toggle('zoomed', zoomed);
    zoomToggle.setAttribute('aria-pressed', String(zoomed));
    zoomToggle.setAttribute('aria-label', zoomed ? 'Back out to the desk' : 'Zoom in on the screen');
    if (zoomed) {
	zoomToMonitor(ZOOM_SECONDS);
    } else {
	fitScene(ZOOM_SECONDS);
    }
}


function setUpPhone() {
    phoneScreen = document.querySelector('.phone-screen');
    phoneKeyboard = document.querySelector('.phone-keyboard');
    phoneInput = phoneKeyboard.querySelector('input');
    terminalHome = terminal.parentElement;

    // The power switch is a few pixels wide on a phone: the whole
    // monitor turns it on.
    document.querySelector('.monitor').addEventListener('click', (event) => {
	if (!on && !powerSwitch.contains(event.target)) {
	    togglePower();
	}
    });

    // Tapping the screen brings the phone keyboard back after it was dismissed.
    phoneScreen.addEventListener('click', () => phoneInput.focus());

    // The text field holds the line being typed; the screen mirrors it.
    // While a real //e runs, each character is a key press on it instead,
    // and the field keeps one space so that DELETE has something to delete.
    phoneInput.addEventListener('input', () => {
	if (emulator) {
	    const typed = phoneInput.value;
	    if (typed.length < 1) {
		forwardKey('keydown', { key: 'Backspace', keyCode: 8 });
		forwardKey('keyup', { key: 'Backspace', keyCode: 8 });
	    } else {
		typeOnEmulator(typed.slice(1).replace(/[‘’]/g, "'").replace(/[“”]/g, '"'));
	    }
	    phoneInput.value = ' ';
	    return;
	}
	if (!acceptingInput()) {
	    phoneInput.value = ''; // the machine is off or busy
	    return;
	}
	const typed = phoneInput.value
	      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"') // phones "smarten" quotes
	      .replace(/[^\x20-\x7e]/g, '')
	      .slice(0, MAX_INPUT_LENGTH - promptText.length);
	lines[line] = promptText + typed;
	render();
    });

    // RETURN on any keyboard submits the form.
    phoneKeyboard.addEventListener('submit', (event) => {
	event.preventDefault();
	if (emulator) {
	    forwardKey('keydown', { key: 'Enter', keyCode: 13 });
	    forwardKey('keyup', { key: 'Enter', keyCode: 13 });
	    phoneInput.value = ' ';
	    return;
	}
	phoneInput.value = '';
	if (acceptingInput()) {
	    processCommand(lines[line]);
	    render();
	}
    });

    // The browser's back button (or swipe) turns the machine off and
    // zooms back out to the desk.
    if (history.state && history.state.screen) {
	history.replaceState(null, ''); // reloaded while zoomed in
    }
    window.addEventListener('popstate', () => {
	if (screenMode && on) {
	    togglePower();
	}
    });

    if (window.visualViewport) {
	window.visualViewport.addEventListener('resize', () => screenMode && layoutPhoneScreen());
	window.visualViewport.addEventListener('scroll', () => screenMode && layoutPhoneScreen());
    }
    // Character widths can only be measured once the fonts are in.
    document.fonts.load('16px Terminal40').then(() => screenMode && layoutPhoneScreen());
    document.fonts.load('16px Terminal').then(() => screenMode && layoutPhoneScreen());
}

function enterScreen() {
    screenMode = true;
    phoneInput.value = '';
    phoneInput.focus(); // must happen during the tap or the phone keyboard won't come up
    if (!(history.state && history.state.screen)) {
	history.pushState({ screen: true }, '');
    }
    layoutPhoneScreen();
    phoneScreen.appendChild(terminal);
    zoomToScreen(ZOOM_SECONDS);
    setTimeout(() => {
	if (screenMode) {
	    document.body.classList.add('screen-on');
	}
    }, ZOOM_SECONDS * 700);
}

function leaveScreen() {
    screenMode = false;
    phoneInput.value = '';
    phoneInput.blur();
    // Let the picture collapse on the big screen, then zoom back out.
    setTimeout(() => {
	if (screenMode) {
	    return;
	}
	document.body.classList.remove('screen-on');
	columns = MAX_LINE_LENGTH;
	fitScene(ZOOM_SECONDS);
	terminal.style.animation = 'none'; // moving it would replay the power-off
	terminalHome.appendChild(terminal);
    }, 600);
    if (history.state && history.state.screen) {
	history.back(); // turned off some other way than the back button
    }
}

function characterWidth(family) {
    // The width of one character at a 1px font size.
    const context = document.createElement('canvas').getContext('2d');
    context.font = '100px ' + family;
    return context.measureText('M').width / 100;
}

function layoutPhoneScreen() {
    /* Fill what is visible above the phone keyboard: 40 columns on a
     * narrow screen, as a IIe booted, 80 on a wide one; 24 rows. */
    const viewport = window.visualViewport ||
	  { width: window.innerWidth, height: window.innerHeight, offsetLeft: 0, offsetTop: 0 };
    phoneScreen.style.left   = viewport.offsetLeft + 'px';
    phoneScreen.style.top    = viewport.offsetTop + 'px';
    phoneScreen.style.width  = viewport.width + 'px';
    phoneScreen.style.height = viewport.height + 'px';

    columns = viewport.width >= PHONE_80_COLUMN_WIDTH ? 80 : 40;
    const family = columns == 40 ? 'Terminal40' : 'Terminal';
    const width = characterWidth(family);
    const rows = MAX_ROWS + 1;
    const fontSize = Math.min((viewport.width  * 0.92) / (columns * width),
			      (viewport.height * 0.92) / (rows * PHONE_LINE_HEIGHT));
    phoneScreen.style.setProperty('--terminal-font', family);
    phoneScreen.style.setProperty('--terminal-font-size', fontSize + 'px');
    phoneScreen.style.setProperty('--terminal-line-height', PHONE_LINE_HEIGHT);
    phoneScreen.style.setProperty('--terminal-width', (columns * width * fontSize) + 'px');
    phoneScreen.style.setProperty('--terminal-height', (rows * PHONE_LINE_HEIGHT * fontSize) + 'px');
    render();
}


function fetchJsonOldSchool(location) {
    // This should use async await and most especially fetch() but a lot would need to be refactored
    const req = new XMLHttpRequest();
    req.overrideMimeType("application/json");
    req.open("GET", location, false); // `false` makes the request synchronous
    req.send(null);
    if (req.status == 200) {
	return(JSON.parse(req.responseText));
    } else {
	return({});
    }
}

function nukeTerminal() {
    terminal.innerHTML = '';
    lines.length = 0;
    lines.push(' ');
    line = 0;
}
function clearTerminal() {
    terminal.innerHTML = '';
    lines.length = 0;
    lines.push(promptText);
    line = 0;
    render();
}

function updateKeysZ() {
    window.requestAnimationFrame(() => {
	window.requestAnimationFrame(() => {
	    for (let i = 0; i < keys.length; i++) {
		const keyClass = '.key--' + keys[i].key;
		const key = keysContainer.querySelector(keyClass);
		if (key) {
		    const keyRight = key.querySelector('.key__side--right');
		    const z = key.offsetWidth;
		    keyRight.style.setProperty(
			'--key-right-z',
			'calc(-0.75vmin + ' + z + 'px)'
		    );
		    if (keys[i].key === '↵') {
			const keyFront = key.querySelector('.key__side--front');
			const frontOffset = key.offsetHeight;
			keyFront.style.setProperty(
			    '--height-half',
			    'calc(-0.75vmin + ' + frontOffset + 'px)'
			);
		    }
		} else {
		    console.log(keys[i].key);
		}
	    }
	});
    });
}

function getKeyLabel(key) {
    switch (key) {
    case '⇧L':
	return '⇧';
    case 'plus':
	return '+';
    case 'lb':
	return '[';
    case 'rb':
	return ']';
    case 'semi':
	return ';';
    case 'dquote':
	return '"';
    case 'tild':
	return '~';
    case 'langleb':
	return '<';
    case 'rangleb':
	return '>';
    case 'qmark':
	return '?';
    case 'backslash':
	return '\\';
    case 'r':
	return '';
    case 'quote':
	return "'";
    case 'colon':
	return ':';
    case 'pipe':
	return '|';
    case 'bang':
	return '!';
    case 'at':
	return '@';
    case 'hash':
	return '#';
    case 'prc':
	return '%';
    case 'dolar':
	return '$';
    case 'caret':
	return '^';
    case 'amp':
	return '&';
    case 'star':
	return '*';
    case 'lp':
	return '(';
    case 'rp':
	return ')';
    case 'eq':
	return '=';
    case 'lbr':
	return '{';
    case 'rbr':
	return '}';
    case 'slash':
	return '/';
    case 'comma':
	return ',';
    case 'dot':
	return '.';
    }

    return key;
}

const ENTER = 13;
const BACKSPACE = 8;
const SPACEBAR = 32;
const TAB = 9;
const KEY_C = 67;

function normalizeCommand(command) {
    // Spaces may be plain or no-break, doubled, leading or trailing.
    return command.replace(/ /g, ' ').trim().replace(/\s+/g, ' ').toUpperCase();
}

function loadCommands(location) {
    const loaded = {};
    const raw = fetchJsonOldSchool(location);
    for (const name in raw) {
	loaded[normalizeCommand(name)] = raw[name];
    }
    return loaded;
}

function catalogEntries() {
    // Every command with a "type" is a file on the disk, listed in the
    // order it appears in command-data.json. A command without one still
    // works; it just doesn't show up in CATALOG.
    return Object.keys(commands)
	.filter((name) => commands[name]["type"])
	.map((name) => ({
	    name: name.split(' ').slice(1).join(' '),
	    type: commands[name]["type"],
	    sectors: commands[name]["sectors"] || 2,
	    locked: Boolean(commands[name]["locked"]),
	}));
}

function catalogListing(volume) {
    // As DOS 3.3 printed it: lock, type, size in sectors, name.
    return [' ', 'DISK VOLUME ' + volume, ' ',
	    ...catalogEntries().map((file) =>
		(file.locked ? '*' : ' ') + file.type + ' ' +
		    String(file.sectors % 1000).padStart(3, '0') + ' ' + file.name),
	    ' '];
}

function diskFiles() {
    // Every file the disk knows about: the CATALOG plus the NAME in any
    // "VERB NAME" command.
    const files = new Set(catalogEntries().map((file) => file.name));
    for (const name in commands) {
	const [verb, ...rest] = name.split(' ');
	if (rest.length && DOS_FILE_VERBS.includes(verb)) {
	    files.add(rest.join(' '));
	}
    }
    return files;
}

const commands = loadCommands(COMMAND_JSON);
const files = diskFiles();


document.addEventListener('keyup', (event) => {
    // Let go of a key forwarded to the //e (see keydown).
    if (emulator && event.target !== phoneInput && !event.metaKey && !event.altKey) {
	forwardKey('keyup', event);
    }
});

document.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) {
	return;
    }
    if (event.metaKey || event.altKey) {
	return; // leave browser shortcuts alone (and don't type a letter for Cmd-R)
    }

    const keycode = event.keyCode;

    animateKey(keycode);

    if (event.key === 'Escape' && zoomed) {
	setZoomed(false);
	return;
    }

    if (emulator) {
	// The //e has the screen; a key pressed out here (after clicking
	// the zoom toggle, say) still goes to it.
	if (event.target !== phoneInput) {
	    event.preventDefault();
	    forwardKey('keydown', event);
	}
	return;
    }

    if (event.ctrlKey) {
	if (keycode === KEY_C || event.key.toLowerCase() === 'c') {
	    event.preventDefault();
	    if (on) {
		controlC();
	    }
	}
	return;
    }

    if (phoneInput && event.target === phoneInput) {
	return; // typing goes into the phone's text field; see setUpPhone()
    }

    const isPrintable =
	  (keycode > 47 && keycode < 58) || // number keys
	  keycode == SPACEBAR ||
	  keycode == ENTER || // spacebar & return key(s) (if you want to allow carriage returns)
	  keycode == BACKSPACE ||
	  (keycode > 64 && keycode < 91) || // letter keys
	  (keycode > 95 && keycode < 112) || // numpad keys
	  (keycode > 185 && keycode < 193) || // ;=,-./` (in order)
	  (keycode > 218 && keycode < 223); // [\]' (in order)
    const isArrow = keycode > 36 && keycode < 41;

    // The whole page is the keyboard: don't let these scroll the page,
    // move focus, or open Firefox's quick-find (' and /).
    if (isPrintable || isArrow || keycode == TAB) {
	event.preventDefault();
    }

    if (!acceptingInput()) {
	return; // the machine is off or busy
    }

    if (isPrintable) {
	if (keycode === BACKSPACE) {
	    // Stop at the prompt. Deleting back onto a previous line would
	    // need "word processing" this doesn't do.
	    if (lines[line].length > promptText.length) {
		lines[line] = lines[line].slice(0, -1);
	    }
	} else if (keycode === ENTER) {
	    // WHAT WE GOT?
	    processCommand(lines[line]);
	} else if (lines[line].length < MAX_INPUT_LENGTH && event.key.length === 1) { // not "Dead" or "Unidentified"
	    lines[line] += event.key;
	}
    }
    render();

});

function pushRedirect(url) {
    window.location = url;
}

function acceptingInput() {
    return on && !booting && !output && !working;
}

function controlC() {
    /* Ctrl-C breaks a listing, a running program or a pending redirect. */
    if (booting) {
	return;
    }
    if (output || program) {
	cancelOutput();
	endProgram();
    } else if (redirectTimer) {
	clearTimeout(redirectTimer);
	redirectTimer = null;
    } else {
	return;
    }
    lines.push(' ', 'BREAK', promptText);
    line = lines.length - 1;
    render();
}

function resolveCommand(command) {
    // Follow aliases (at most a few hops, in case two point at each other).
    for (let hops = 0; hops < 5 && command in commands; hops++) {
	if (commands[command]["action"] != "alias") {
	    return command;
	}
	command = normalizeCommand(commands[command]["payload"][0]);
    }
    return command in commands ? command : null;
}

function showError(message) {
    lines[++line] = ' ';
    lines[++line] = message;
    if (++syntaxErrorCounter > MAX_SEQUENTIAL_SYNTAX_ERRORS) {
	showArrayData(commands["HELP"]["payload"]);
	syntaxErrorCounter = 0;
    } else {
	lines[++line] = promptText;
    }
}

function makeMachine(token) {
    /* What a program may do. Once it has been broken off (Ctrl-C, power
     * off, another program) its token is stale and all of this is
     * ignored, so a late network reply can't print. */
    const alive = () => token === programToken;
    return {
	columns: () => columns,
	rows: () => MAX_ROWS + 1,
	setPrompt(text) {
	    if (alive()) {
		promptText = text;
	    }
	},
	print(textLines) {
	    // Prints the lines, then the prompt.
	    return alive() ? showArrayData(textLines) : new Promise(() => {});
	},
	work(promise) {
	    // Wait for the network with the drive light on and input off.
	    if (!alive()) {
		return promise;
	    }
	    working = true;
	    readFromFloppy(60);
	    return promise.finally(() => {
		if (alive()) {
		    working = false;
		    stopFloppy();
		}
	    });
	},
	exit() {
	    // Back to DOS. A print after this still shows, ending in "]".
	    if (alive()) {
		program = null;
		promptText = ']';
	    }
	},
    };
}

function endProgram() {
    programToken++;
    program = null;
    if (working) {
	stopFloppy(); // broken off while it waited on the network
    }
    working = false;
    promptText = ']';
}

function runProgramStep(step) {
    // A program that fails prints DOS's I/O ERROR and keeps its prompt.
    const token = programToken;
    Promise.resolve().then(step).catch((error) => {
	console.log(error);
	if (token === programToken) {
	    working = false;
	    stopFloppy();
	    showArrayData([' ', 'I/O ERROR', ' ']);
	}
    });
}

function startProgram(name, args) {
    if (!(name in PROGRAMS)) {
	showError('FILE NOT FOUND');
	return;
    }
    endProgram();
    program = PROGRAMS[name](makeMachine(programToken), ...args);
    runProgramStep(() => program.start());
}


function bootDisk(disk) {
    /* Hand the screen to a real Apple //e: apple2js (MIT, apple2js/) in a
     * frame, booting `disk` in drive 1 and showing it in green. The menu's
     * DOS is gone until the power switch brings it back. A disk that isn't
     * there is an I/O ERROR. */
    endProgram();
    const token = programToken;
    const url = new URL(disk, location.href).href;
    working = true;
    readFromFloppy(60);
    fetch(url, { method: 'HEAD' }).then((response) => {
	if (!response.ok) {
	    throw new Error(disk + ': ' + response.status);
	}
	if (token !== programToken || !on) {
	    return; // switched off while the drive spun up
	}
	emulator = document.createElement('iframe');
	emulator.className = 'monitor__emulator';
	emulator.title = 'Apple //e';
	emulator.src = 'apple2js/apple2jse.html?mono_screen=true&gl_canvas=false#' + url;
	if (!touchMode) {
	    // On a phone the keys come from the phone keyboard instead.
	    emulator.addEventListener('load', () => emulator && emulator.focus());
	}
	terminal.after(emulator);
	document.body.classList.add('emulating');
	if (touchMode) {
	    phoneInput.value = ' ';
	}
    }).catch((error) => {
	console.log(error);
	if (token === programToken) {
	    showError('I/O ERROR');
	}
    }).finally(() => {
	if (token === programToken) {
	    working = false;
	    stopFloppy();
	}
    });
}

function stopEmulator() {
    if (emulator) {
	emulator.remove();
	emulator = null;
	document.body.classList.remove('emulating');
	if (phoneInput) {
	    phoneInput.value = '';
	}
    }
}

function forwardKey(type, { key, keyCode, shiftKey = false, ctrlKey = false }) {
    /* Press a key on the //e. apple2js reads keyCode, which a made-up
     * event can't be given directly, so it is added as a property. */
    const frame = emulator.contentWindow;
    if (!frame || !frame.KeyboardEvent) {
	return; // still loading
    }
    const forwarded = new frame.KeyboardEvent(type, { key, shiftKey, ctrlKey, bubbles: true, cancelable: true });
    Object.defineProperty(forwarded, 'keyCode', { get: () => keyCode });
    frame.dispatchEvent(forwarded);
}

// US keyboard key codes for the punctuation a phone keyboard can type:
// [keyCode, shifted].
const PUNCTUATION_KEYS = {
    ')': [48, true], '!': [49, true], '@': [50, true], '#': [51, true], '$': [52, true],
    '%': [53, true], '^': [54, true], '&': [55, true], '*': [56, true], '(': [57, true],
    ';': [186, false], ':': [186, true], '=': [187, false], '+': [187, true],
    ',': [188, false], '<': [188, true], '-': [189, false], '_': [189, true],
    '.': [190, false], '>': [190, true], '/': [191, false], '?': [191, true],
    '`': [192, false], '~': [192, true], '[': [219, false], '{': [219, true],
    '\\': [220, false], '|': [220, true], ']': [221, false], '}': [221, true],
    "'": [222, false], '"': [222, true],
};

function typeOnEmulator(text) {
    // Characters from the phone keyboard, as key presses on the //e.
    for (const key of text) {
	let keyCode = key.toUpperCase().charCodeAt(0);
	let shiftKey = key >= 'A' && key <= 'Z';
	if (key in PUNCTUATION_KEYS) {
	    [keyCode, shiftKey] = PUNCTUATION_KEYS[key];
	} else if (!/[A-Za-z0-9 ]/.test(key)) {
	    continue;
	}
	forwardKey('keydown', { key, keyCode, shiftKey });
	forwardKey('keyup', { key, keyCode, shiftKey });
    }
}

function processCommand(command) {

    command = command.substring(promptText.length);
    if (program) {
	const current = program;
	runProgramStep(() => current.input(command));
	return;
    }

    command = normalizeCommand(command);
    const resolved = resolveCommand(command);
    const action = resolved ? commands[resolved]["action"] : null;

    if (["print", "redirect", "catalog", "program", "boot"].includes(action)) {
	syntaxErrorCounter = 0;
	if (action == "print") {
	    showArrayData(commands[resolved]["payload"]);
	}
	if (action == "catalog") {
	    showArrayData(catalogListing(commands[resolved]["volume"] || 254));
	}
	if (action == "program") {
	    const [name, ...args] = commands[resolved]["payload"];
	    startProgram(name, args);
	}
	if (action == "boot") {
	    bootDisk(commands[resolved]["payload"][0]);
	}
	if (action == "redirect") {
	    showArrayData([' ', 'CONFIRMED', ' ', 'You will be redirected in ' + REDIRECT_SECONDS.toString() + ' seconds.',
			   ' ', 'You may use the BACK ARROW to return.', ' ']);
	    clearTimeout(redirectTimer);
	    redirectTimer = setTimeout(function() {
		redirectTimer = null;
		pushRedirect(commands[resolved]["payload"][0]);
	    }, (1000 * REDIRECT_SECONDS));
	}

    } else if (command == '') {
	lines[++line] = ' ';
	lines[++line] = promptText;
    } else {
	// "reserved" entries (the boot text) are not commands you can type.
	const [verb, ...rest] = command.split(' ');
	if (rest.length && DOS_FILE_VERBS.includes(verb)) {
	    showError(files.has(rest.join(' ')) ? 'FILE TYPE MISMATCH' : 'FILE NOT FOUND');
	} else {
	    showError('?SYNTAX ERROR');
	}
    }
}
function animateTerminalFlicker() {
    /* Flicker hard while the set warms up, then only now and then. */
    terminal.style.animation = 'flicker-2 0.005s infinite';
    clearTimeout(flickerTimer);
    flickerTimer = setTimeout(() => {
	terminal.style.animation = 'none';
	scheduleFlicker();
    }, FLICKER_WARM_UP_SECONDS * 1000);
}
function scheduleFlicker() {
    const seconds = FLICKER_EVERY_SECONDS + Math.random() * FLICKER_JITTER_SECONDS;
    flickerTimer = setTimeout(() => {
	terminal.style.animation = 'none';
	void terminal.offsetWidth; // so the same flicker twice in a row still plays
	terminal.style.animation = FLICKERS[Math.floor(Math.random() * FLICKERS.length)];
	scheduleFlicker();
    }, seconds * 1000);
}
function animateTerminalPowerOn(warmUp) {
    terminal.style.animation = 'turn-on ' + warmUp.toString() + 's linear';
    terminal.style.animationFillMode = 'forwards';
}
function animateTerminalPowerOff(coolDown) {
    terminal.style.animation = 'turn-off ' + coolDown.toString() + 's cubic-bezier(0.23, 1, 0.32, 1)';
    terminal.style.animationFillMode = 'forwards';
}
function animateKey(keyCode) {
  const key = document.querySelector(`.key-code--${keyCode}`);
  if (key) {
    const movement = [
      { transform: 'translateZ(-0.5rem)' },
      { transform: 'translateZ(0rem)' },
    ];
    const timing = {
      duration: 250,
      iterations: 1,
      direction: 'alternate',
      easing: 'ease-in-out',
    };
    key.animate(movement, timing);
  }
}

const terminal = document.querySelector('.monitor__terminal');
function render() {

    // Long lines wrap onto the next screen row; drop whole lines off
    // the top until the screen rows fit.
    const screenRows = (text) => Math.max(1, Math.ceil(text.length / columns));
    let rows = lines.reduce((total, text) => total + screenRows(text), 0);
    while (rows > MAX_ROWS + 1 && lines.length > 1) {
	rows -= screenRows(lines.shift());
    }
    line = lines.length - 1;

    terminal.innerHTML = '';
    for (let i = 0; i < lines.length; i++) {
	const lastLine = i === lines.length - 1;
	for (let start = 0; start < lines[i].length || start === 0; start += columns) {
	    const divLine = document.createElement('div');
	    divLine.textContent = lines[i].slice(start, start + columns);
	    if (lastLine && start + columns >= lines[i].length) {
		const cursor = document.createElement('span');
		cursor.classList.add('cursor');
		divLine.appendChild(cursor);
	    }
	    terminal.appendChild(divLine);
	}
    }
}

function readFromFloppy(seconds) {
    /* light up the floppy "IN USE" led for a quick read */
    const onColor  = '#ff4300';
    const led = document.querySelector('.led');

    led.style.backgroundColor = onColor;
    clearTimeout(floppyTimer); // a second read keeps the light on until it is done too
    floppyTimer = setTimeout(stopFloppy, (seconds * 1000));
}

function stopFloppy() {
    const offColor = '#e3bf1a';
    clearTimeout(floppyTimer);
    document.querySelector('.led').style.backgroundColor = offColor;
}

function stopMachine() {
    /* Power off: stop printing, forget any pending redirect, stop the drive. */
    cancelOutput();
    endProgram();
    booting = false;
    clearTimeout(redirectTimer);
    redirectTimer = null;
    clearTimeout(flickerTimer); // or it would cut short the power-off fade
    stopEmulator();
    stopFloppy();
}

function bootPromData() {
    // "Apple //e" across the top, centered on a 40 column screen.
    if (columns == 40) {
	return '               Apple //e\n';
    }
    return '                                      Apple //e\n';
}

const introData = " \n" +
      "CRACKED BY                   \n" +
      " ____  _      ____  _      _ \n" +
      "/ ___|(_)_ __|  _ `(_) ___| |\n" +
      "`___ `| | '__| |_) | |/ _ ` |\n" +
      " ___) | | |  |  _ <| |  __/ |\n" +
      "|____/|_|_|  |_| `_`_|`___|_|\n\n\n";


function toScreenText(text) {
    // One screen line: no trailing newline, plain spaces, and a blank
    // line keeps its height.
    text = String(text).replace(/\n$/, '').replace(/ /g, ' ');
    return text === '' ? ' ' : text;
}

function cancelOutput() {
    if (output) {
	clearInterval(output);
	output = null;
    }
}

function showData(inputData) {
    return showArrayData(inputData.split('\n'));
}

function showArrayData(dataLines) {
    const tmpDataLines = dataLines.map(toScreenText); // copy JSON array values not just a new reference

    cancelOutput();
    readFromFloppy(5); // light up the floppy drive
    return new Promise((resolve) => {
	output = setInterval(() => {
	    if (!tmpDataLines.length) {
		cancelOutput();
		lines.push(promptText);
		line++;
		render();
		resolve();
		return;
	    }
	    lines.push(tmpDataLines.shift());
	    line++;
	    render();
	}, OUTPUT_SPEED);
    });
}
