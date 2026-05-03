This is a port of a project I wrote a while back: <https://github.com/jbush001/TDDEmulator>
from Java to HTML/Javascript.

It's an emulator for the ANSI TIA/EIA-825 protocol, also referred to as Telecommunications
Device for the Deaf (TDD) or TTY.  These devices allow people who are hard of hearing to
communicate over analog phone lines using a keyboard and text display.  It's essentially
a very simple FSK modem.

You can run this using either python or node, if you have them:

    python3 -m http.server

Or

    npx serve

Open a browser to whatever local address it tells you.

You generally need to open two instances of this program to see it in action.
(if you have a computer with a microphone and speakers, the microphone will capture
the speakers allowing the two instances to talk to each other)
