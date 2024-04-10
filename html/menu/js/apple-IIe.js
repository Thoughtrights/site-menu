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

/* KNOWN ISSUE: the scaffolding swaps spaces for ' ' -- I'm guessing
 * because of font issues. This has gotten increasingly awkward as I
 * move things into commands-data.json. */

console.clear();

const MAX_LINE_LENGTH = 80;
const MAX_ROWS = 22;
const OUTPUT_SPEED = 350;
const COMMAND_JSON = 'assets/command-data.json';
const REDIRECT_SECONDS = 7;
const MAX_SEQUENTIAL_SYNTAX_ERRORS = 3;
const POWER_BUTTON_ALERT_SECONDS_START = 5; // start alerting the user after seconds if they haven't hit the power button
const POWER_BUTTON_ALERT_SECONDS_STOP = 120; // just stop any alert if they haven't clicked

// could also do this in CSS
const POWER_ON_COLOR  = 'rgb(59 159 1)';
const POWER_ON_SHADOW = 'inset 0 0.15vmin 0.3vmin #00ff00';
const POWER_OFF_COLOR = '#d1c919';
const POWER_OFF_SHADOW= 'inset 0 0.15vmin 0.3vmin #f7e652';
const POWER_ALERT_COLOR='#ff4300';


let syntaxErrorCounter = 0;
let on = false;
let line = 0;
const lines = [' '];

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
  { key: '', key2: '', keyCode: 91 },
  { key: '_', key2: '', keyCode: 32 },
  { key: 'r', key2: '', keyCode: 93 },
  { key: '⭠', key2: '', keyCode: 37 },
  { key: '⭢', key2: '', keyCode: 39 },
  { key: '⭣', key2: '', keyCode: 40 },
  { key: '⭡', key2: '', keyCode: 38 },
];
let keysContainer, keyTemplate, powerSwitch;
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
    
    let booting = false;
    powerSwitch.addEventListener('click', () => {
	bootedOnce = true; // Don't show the power button alert if clicked
	if (booting) {
	    return;
	}
	on = !on;
	if (on) {
 	    booting = true;
	    powerLight.style.boxShadow = POWER_ON_SHADOW;
	    powerLight.style.backgroundColor = POWER_ON_COLOR;
	    readFromFloppy(7);
	    nukeTerminal();
	    showData(bootPromData).then(() => {
		nukeTerminal();
		showData(introData).then(() => {
		    booting = false;
		    clearTerminal();
		});
	    });
	} else {
	    powerLight.style.boxShadow = POWER_OFF_SHADOW;
	    powerLight.style.backgroundColor = POWER_OFF_COLOR;
	    /* Would be nice: animate the LCD fade instead of just zero'ng it */
	    setTimeout(() => nukeTerminal(), 500);
	}
    });

  for (let i = 0; i < keys.length; i++) {
      const key = keyTemplate.cloneNode(true);
      key.classList.remove('key--template');
      key.classList.add('key--' + keys[i].key);
      if (keys[i].keyCode) {
	  key.classList.add('key-code--' + keys[i].keyCode);
      }
      const keyLabelTop = key.querySelector('.key__label-top');
      if (keys[i].key === '') {
	  const appleFilled = document.createElement('div');
	  appleFilled.classList.add('apple-outlined');
	  keyLabelTop.appendChild(appleFilled);
      } else if (keys[i].key === 'r') {
	  const appleFilled = document.createElement('div');
	  appleFilled.classList.add('apple-filled');
	  keyLabelTop.appendChild(appleFilled);
      } else {
	  keyLabelTop.innerText = getKeyLabel(keys[i].key);
	  const appleFilled = document.createElement('div');
      }

      const keyLabelBottom = key.querySelector('.key__label-bottom');
      keyLabelBottom.innerText = getKeyLabel(keys[i].key2);
      keysContainer.appendChild(key);
  }
  updateKeysZ();
});

window.addEventListener('resize', updateKeysZ);


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
    lines.push(' ');
    line = 0;
}
function clearTerminal() {
    terminal.innerHTML = '';
    lines.length = 0;
    lines.push(']');
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
    case 'r':
	return '';
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
commands = fetchJsonOldSchool(COMMAND_JSON);


document.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) {
	return;
    }

    const keycode = event.keyCode;

    animateKey(keycode);

    if (!on) {
	return;
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

    const startNewLine = lines[line].length >= MAX_LINE_LENGTH;

    if (isPrintable) {
	if (keycode === BACKSPACE) {
	    if (lines[line].length <= 1 && line > 0) {
		
	      // If you want to allow for deleting and moving up to a
	      // previous line then this will do it. I am not allowing
	      // for "word processing" or something that calls for
	      // this.
	      
	      // lines.pop();
	      // line--;

	    } else {
		const length = lines[line].length - 1;
		lines[line] = lines[line].slice(0, Math.max(1, length));
	    }
	} else if (keycode === ENTER || startNewLine) {
	    if (line > MAX_ROWS) {
		// This should not happen unless something was not render()ed
		lines.splice(0, (line - MAX_ROWS));
		line = MAX_ROWS;
	    }

	    // WHAT WE GOT?
	    processCommand(lines[line]);

	    if (startNewLine) {
		if (keycode === SPACEBAR) {
		    lines[line] += '\u00A0'; // non breaking space
		} else {
		    lines[line] += event.key;
		}
	    }
	
	} else if (lines[line].length < MAX_LINE_LENGTH) {
	    if (keycode === SPACEBAR) {
		lines[line] += '\u00A0'; // non breaking space
	    } else {
		lines[line] += event.key;
	    }
	}
    }
    render();
    
});

function pushRedirect(url) {
    window.location = url;
}

function processCommand(command) {
    command = command.toUpperCase().substring(1);
    console.log("processCommand: " + command);

    // we should drive this by some nice command.json that has command and data combined

    if (command in commands) {
	syntaxErrorCounter = 0;
	// Before anything follow an alias if applicable
	if (commands[command]["action"] == "alias") {
	    command = commands[command]["payload"][0];
	}
	if (commands[command]["action"] == "print") {
	    showArrayData(commands[command]["payload"]);
	}
	if (commands[command]["action"] == "redirect") {
	    showArrayData([' \n', 'CONFIRMED\n', ' \n', 'You will be redirected in ' + REDIRECT_SECONDS.toString() + ' seconds.\n',
			   ' \n', 'You may use the BACK ARROW to return.\n', ' \n']);
	    setTimeout(function() {
		pushRedirect(commands[command]["payload"][0]);
	    }, (1000 * REDIRECT_SECONDS));
	}
	//if (commands[command]["action"] == "redirect") {
	  //  let tmpLink = commands[command]["payload"][0];
	  //  let tmpArry = ['<a href=', tmpLink, '>LINK</a>']
	  //  showArrayData(tmpArry);
        //}
	//DEBUGGG::: will need to handle redirects, reserved (syntax error?), add a POKE!, etc.
	//would be cool to make BRUN operate inside the screen as an iframe or something -- behind the CRT effect (https://codepen.io/frbarbre/pen/BaObOXL)
	
    } else if (command == '') {
	lines[++line] = ' ';
	lines[++line] = ']';
    } else {
	console.log(commands)
	lines[++line] = ' ';
	lines[++line] = '?SYNTAX ERROR';
	if (++syntaxErrorCounter > MAX_SEQUENTIAL_SYNTAX_ERRORS) {
	    showArrayData(commands["HELP"]["payload"]);
	    syntaxErrorCounter = 0;
	} else {
	    lines[++line] = ']';
	}
	    
    }
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
   
    terminal.innerHTML = '';
    if (lines.length > MAX_ROWS) {
	lines.splice(0, (line - MAX_ROWS));
	line = MAX_ROWS;
    }
    for (let i = 0; i < lines.length; i++) {
	const divLine = document.createElement('div');
	divLine.textContent = lines[i];
	const lastLine = i === lines.length - 1;
	if (lastLine) {
	    const cursor = document.createElement('span');
	    cursor.classList.add('cursor');
	    divLine.appendChild(cursor);
	}
	terminal.appendChild(divLine);
  }
}

function readFromFloppy(ms) {
    /* light up the floppy "IN USE" led for a quick read */
    const onColor  = '#ff4300';
    const offColor = '#e3bf1a';
    const led = document.querySelector('.led');

    led.style.backgroundColor = onColor;
    setTimeout(function() {
	led.style.backgroundColor = offColor;
    }, (ms * 1000));
}

const bootPromData = '                                      Apple //e\n';

const catalogData = " \n" +
      "DISK VOLUME 254\n" +
      " \n" +
      " T 019 RESUME\n" +
      " B 030 BARZY\n" +
      " B 008 DAEMOUS\n" +
      " I 040 SPOKENWORD\n" +
      " A 002 FOODNET\n" +
      " A 002 DUNGEONEER\n" +
      " \n";

const introData = " \n" +
      "CRACKED BY                   \n" +
      " ____  _      ____  _      _ \n" + 
      "/ ___|(_)_ __|  _ `(_) ___| |\n" + 
      "`___ `| | '__| |_) | |/ _ ` |\n" + 
      " ___) | | |  |  _ <| |  __/ |\n" + 
      "|____/|_|_|  |_| `_`_|`___|_|\n\n\n";


function showData(inputData) {
    let intervalId = null;
    const dataLines = inputData.split('\n');
    
    readFromFloppy(5);
    return new Promise((resolve) => {
	intervalId = setInterval(() => {
	    if (!dataLines.length) {
		clearInterval(intervalId);
		lines.push(']');
		line++;
		render();
		resolve();
		return;
	    }
	    lines.push(dataLines.splice(0, 1));
	    line++;
	    render();
	}, OUTPUT_SPEED);
    });
}

function showArrayData(dataLines) {
    let intervalId = null;
    let tmpDataLines = dataLines.slice(); // copy JSON array values not just a new reference

    readFromFloppy(5); // light up the floppy drive
    return new Promise((resolve) => {
	intervalId = setInterval(() => {
	    if (!tmpDataLines.length) {
		clearInterval(intervalId);
		lines.push(']');
		line++;
		render();
		resolve();
		return;
	    }
	    lines.push(tmpDataLines.splice(0, 1));
	    line++;
	    render();
	}, OUTPUT_SPEED);
    });
}
