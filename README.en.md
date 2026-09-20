# dsh-yukimi-theme

A [Sajo Yukimi](https://wiki.biligame.com/imascg/%E4%BD%90%E5%9F%8E%E9%9B%AA%E7%BE%8E) (佐城雪美) theme for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) web UI.

Restyles the page — colors, background, sidebar, and a few interactive widgets — around Yukimi Sajo from *THE iDOLM@STER Cinderella Girls*.

[中文说明](README.md) · [Live preview](https://alycestocking.github.io/dsh-yukimi-theme/)

## Features

- **Visible background art** with translucent reading surfaces limited to messages and tool content; supports light and dark palettes.
- **Always-visible floating doll**: drag, click to flip with dialogue, double-click to change outfits, and long-press to choose a doll or background.
- **Keyboard interaction**: Enter/Space interacts, the context-menu key opens settings, and Escape closes settings.
- **Floating card and signature**: the card remains draggable, automatically cycles, and advances on click.
- **Responsive extras**: below 1100px wide or 640px tall, only the Mobamas card and signature hide. The doll scales down but stays mounted and visible. Extras return with their previous display preferences when space permits.
- **Full conversation width**: no decoration sidebar, reserved column or decoration gallery dialog.
- **Viewport bounds**: doll dragging/resizing and the settings panel stay within the viewport.

The threshold is defined by matching client/CSS media queries. Preferences are page-local and reset on reload.

## Install

Install with dsh's own plugin management command (the package then appears in the Settings → Plugins management UI):

```bash
dsh plugin --profile web add github:AlyceStocking/dsh-yukimi-theme
```

Then restart:

```bash
dsh web
```

or `dsh --profile web`.

> Do not install by copying into `node_modules` and editing `cordis.patch.yml` by hand: the plugin runs, but because it is not a pnpm dependency of the profile, the plugin management UI will not list it and it cannot be toggled or removed from the UI.
> `DSH_HOME` defaults to `C:\Users\<you>\.dsh` on Windows.

## Development and validation

Edit `lib/client.js` directly; no build or test dependencies are required. Run `npm run check` and `npm test`. Sync the modified client to the installed copy before reloading DSH; restart the server if the old bundle remains cached. See [stage validation](docs/validation.md) for browser checks and official references.

## License & credits

- **Code**: MIT License, © 2026 AlyceStocking.
- **Artwork**: Yukimi Sajo and all illustrations / cards / paper dolls / signatures are © **Bandai Namco Entertainment / Cygames** (*THE iDOLM@STER Cinderella Girls*). This theme only hot-links the [imascg wiki](https://wiki.biligame.com/imascg) image URLs; it does **not bundle or redistribute** any official assets.
- Personal / fan use only; not for commercial use.

## Thanks

- Character & assets: [imascg wiki](https://wiki.biligame.com/imascg/佐城雪美)
- Palette based on Yukimi's image color `#171C8F` noted on the wiki page.
