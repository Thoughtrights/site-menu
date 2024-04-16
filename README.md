# site-menu

Two main navigation menu options appear in this repo:

1. A semi-traditional HTML page.
2. A novel 3D model of an Apple IIe turned into a data-driven navigation UI and simulated OS with lots of visual goodness and a slight Through the Looking Glass appeal.

The code is STABLE and mainly considered to still be artistic; It's
main purpose is to promote exploration and a feeling of
discovery. Nobody alive exactly knows (or remembers) how to use
one. That's kinda cool to have to knock around and achieve a sense of
accomplishment.

That discovery and experience may be entirely changed by simple
changes to the `command-data.json` file.

![Screenshot of the Apple IIe navigation UI in use](https://www.thoughtrights.com/menu/assets/site-menu-README-IMAGE-apple-IIe.png)

## Derivative

This is a derivative of an artistic "Apple IIe 3D" on CodePen from
Marian Ban. https://codepen.io/marianban/pen/mdeVBKo That work was
very interesting. It does appear that the author ran out of steam at
some point, but it's really nice.

I adapted that 3D CSS/JS model into a UI. It is currently more than
half-way through that grafting process but does require refactoring of
it's keyboard handling. If the code looks like it was written by two
people for two completely different purposes and approaches, you're
correct.

## UI Known Issues

There are UI issues that need some help. The keyboard is done
interestingly, but it doesn't resemble the actual Apple IIe
keyboard. That said, I could attach listeners on the keyboard keys
that are there and make some minimal cosmetic changes. This would be
ideal for mobile use.

Activating the keyboard keys as input devices would be good because
the keyboard does not auto-raise for mobile devices. The scaffolding
swaps spaces for ' ' -- I believe that is because of font issues. This
has gotten increasingly awkward as I moved things into
commands-data.json. It will be part of a major refactoring.

I made many bug fixes along the way. Many of these only became evident
because I expanded the codebase as a means to a UI.

I effectively added the Apple IIe 80 Character Expansion Card; I gave
it 80 columns, 64KB RAM, and lowercase characters.

## Future Work

I'd like to add CORS-acceptable external web page layers inside the
screen for `BRUN` programs.

If there are any Apple BASIC simulators, it wouldn't be too tough to
add them. However, I would also need to add the ability to have "word
processor"-like editing and cursor movement.

I initially considered building a direct web interface to an Apple IIe
emulator. However that's basically making a cloud-based Apple IIe and
... nuts. Additionally, the Linux ports are lacking.

I made drive light activation, computer lights flash, and the CRT
on/off/flicker. But I could add drive action sounds (plural), boot
beeps, and syntax error noises.

## Conclusions

Overall this was a fun little project that occupied me for two
days. Edit: Three for CRT effects. One of those days was until after
midnight. I spent an amazing amount of time doing tiny
only-I-would-notice things and very little time doing big things. It
was a surprising amount of fun to make.

Displaying some embeddable website pages following a BRUN command
would be pretty neat.


## Misc

Dropping this here. This is what an Apple IIe looks like.
[Wikipedia Apple IIe image](https://upload.wikimedia.org/wikipedia/commons/1/1d/Iie-system.jpg)



