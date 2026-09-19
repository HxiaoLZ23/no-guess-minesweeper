# No-Guess Minesweeper

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md)

Every board can be finished by logic. Guessing is not required.

Play: https://hxiaolz23.github.io/no-guess-minesweeper/

The interface is available in English, Simplified Chinese, Traditional Chinese, Japanese, Korean, Spanish, French, German, Portuguese, Russian, and Arabic. English is the default.

## How to play

- **Desktop**: left-click to open, right-click to flag. When the flags around a number are complete, double-click or middle-click that cell to open the rest.
- **Phone**: tap to open, long-press to flag. Switch between Open and Flag. Pinch to zoom.
- **Keyboard**: arrow keys move, Space opens, F flags, Z undoes, H asks for a hint.
- Choose a mode on the home page. Practice, Speed, and Zen continue to a board picker. Campaign and Lessons each have their own page.

## Difficulties and modes

- Classic: Beginner, Intermediate, and Expert.
- Sparse, Even, and Dense use fewer mines and are meant for practice.
- In Practice, start with the lower mine counts, then play the classic counts. Speed records only the three classic sizes and the daily challenge. Zen has no timer, and the size can be set freely.
- Campaign starts at 8×8 and grows in the order 8×8, 8×9, 9×9, 9×10, up to 18×18.
- Each lesson can show a full analysis.
- Practice allows hints, undo, and pause.
- Speed starts after a countdown. There are no hints, and pause is disabled. Clicks and the best time are recorded.
- Zen has no timer. Opening a mine does not end the game.
- Replay can be paused and played at 0.5×, 1×, 2×, or 4×.

## Local play and optional cloud

The game works fully offline. Progress can be exported and imported in Settings.

A sync endpoint adds cloud backup and the daily board. A failure does not stop play. See [`cloud/README.md`](cloud/README.md).

## Start

- Open `index.html`, or use the link above.
- The game can also be installed as a PWA and used offline.

There is no realtime match. To compare times, share a link.

## Contributors

See [CONTRIBUTORS.md](CONTRIBUTORS.md).
