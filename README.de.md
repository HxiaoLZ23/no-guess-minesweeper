# Minesweeper ohne Raten

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md)

Jedes Feld lässt sich durch Logik lösen. Raten ist nicht nötig.

Spielen: https://hxiaolz23.github.io/no-guess-minesweeper/

Die Oberfläche gibt es auf Englisch, vereinfachtem Chinesisch, traditionellem Chinesisch, Japanisch, Koreanisch, Spanisch, Französisch, Deutsch, Portugiesisch, Russisch und Arabisch. Die Standardsprache ist Englisch.

## So wird gespielt

- **Computer**: Linksklick öffnet, Rechtsklick markiert. Sind die Flaggen um eine Zahl vollständig, öffnet ein Klick oder Mittelklick den Rest.
- **Telefon**: Tippen öffnet, langes Drücken markiert. Zwischen Öffnen und Flagge kann umgeschaltet werden. Mit zwei Fingern zoomen.
- **Tastatur**: Pfeiltasten bewegen, Leertaste öffnet, F markiert, Z macht rückgängig, H fordert einen Hinweis.
- Wählen Sie auf der Startseite einen Modus. Übung, Tempo und Zen führen zur Feldauswahl. Kampagne und Lektionen haben jeweils eine eigene Seite.

## Schwierigkeiten und Modi

- Klassisch: Anfänger, Fortgeschritten und Experte.
- Spärlich, Gleichmäßig und Dicht haben weniger Minen und dienen der Übung.
- In der Übung beginnen Sie mit weniger Minen und spielen danach die klassischen Zahlen. Tempo zeichnet nur die drei klassischen Größen und die Tagesaufgabe auf. Zen hat keine Zeit, und die Größe kann frei gewählt werden.
- Die Kampagne beginnt bei 8×8 und wächst in der Folge 8×8, 8×9, 9×9, 9×10 bis 18×18.
- Jede Lektion kann die vollständige Analyse zeigen.
- Übung erlaubt Hinweise, Rückgängig und Pause.
- Tempo startet nach dem Countdown. Es gibt keine Hinweise, und Pause ist aus. Klicks und die Bestzeit werden gespeichert.
- Zen hat keine Zeit. Eine Mine beendet das Spiel nicht.
- Die Wiederholung kann pausiert und mit 0,5×, 1×, 2× oder 4× abgespielt werden.

## Lokal und optionale Cloud

Das Spiel funktioniert vollständig offline. Der Fortschritt kann in den Einstellungen exportiert und importiert werden.

Ein Sync-Endpunkt ergänzt Cloud-Sicherung und die Tagesliste. Ein Fehler stoppt das Spiel nicht. Siehe [`cloud/README.md`](cloud/README.md).

## Start

- Öffnen Sie `index.html` oder `start.bat`, oder den Link oben.
- Das Spiel kann auch als PWA installiert und offline genutzt werden.

Es gibt kein Spiel in Echtzeit. Zum Vergleichen der Zeiten teilen Sie einen Link.

## Bereitstellung

- **OpenShip**: dieses Repository importieren; es liest `openship.json` für statisches Hosting. Optional einen Worker aus `cloud/` anbinden.
- **GitHub Pages**: bereits aus dem Root von `main` veröffentlicht.

## Offline-Download

`scripts/pack-offline.ps1` (oder `scripts/pack-offline.bat`) ausführen. Unter `dist/` liegt dann eine Zip (z. B. `no-guess-minesweeper-v*.zip`). Entpacken und `index.html` oder `start.bat` öffnen. Ohne Netz fallen Cloud-Funktionen zurück; lokal spielen geht weiter.

## Mitwirkende

Siehe [CONTRIBUTORS.md](CONTRIBUTORS.md).
