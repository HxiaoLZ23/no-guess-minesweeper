# Buscaminas sin conjeturas

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md)

Cada tablero se puede terminar por lógica. No hace falta adivinar.

Jugar: https://hxiaolz23.github.io/no-guess-minesweeper/

La interfaz está en inglés, chino simplificado, chino tradicional, japonés, coreano, español, francés, alemán, portugués, ruso y árabe. El idioma predeterminado es el inglés.

## Cómo jugar

- **Ordenador**: clic izquierdo para abrir, clic derecho para marcar. Si las banderas alrededor de un número están completas, un doble clic o clic central abre el resto.
- **Teléfono**: toca para abrir, mantén pulsado para marcar. Se puede alternar entre Abrir y Bandera. Pellizca para ampliar.
- **Teclado**: las flechas mueven, Espacio abre, F marca, Z deshace, H pide una pista.
- Elige un modo en la página inicial. Práctica, Velocidad y Zen continúan en un selector de tablero. Campaña y Lecciones tienen cada una su página.

## Dificultades y modos

- Clásico: Principiante, Intermedio y Experto.
- Escaso, Uniforme y Denso tienen menos minas y sirven para practicar.
- En Práctica, empieza con menos minas y luego pasa a los recuentos clásicos. Velocidad solo registra los tres tamaños clásicos y el desafío diario. Zen no tiene tiempo y el tamaño se puede definir.
- La campaña empieza en 8×8 y crece en el orden 8×8, 8×9, 9×9, 9×10, hasta 18×18.
- Cada lección puede mostrar el análisis completo.
- Práctica permite pistas, deshacer y pausa.
- Velocidad empieza tras una cuenta atrás. No hay pistas y no se puede pausar. Se registran los clics y el mejor tiempo.
- Zen no tiene tiempo. Abrir una mina no termina la partida.
- La repetición se puede pausar y reproducir a 0.5×, 1×, 2× o 4×.

## Juego local y nube opcional

El juego funciona sin conexión. El progreso se puede exportar e importar en Ajustes.

Un endpoint de sincronización añade la copia en la nube y el tablero diario. Un fallo no impide jugar. Véase [`cloud/README.md`](cloud/README.md).

## Inicio

- Abre `index.html` o usa el enlace de arriba.
- También se puede instalar como PWA y usarse sin conexión.

No hay partidas en tiempo real. Para comparar tiempos, comparte un enlace.

## Colaboradores

Véase [CONTRIBUTORS.md](CONTRIBUTORS.md).
