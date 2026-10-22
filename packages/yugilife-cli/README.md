# YugiLife CLI

`yugilife-cli` renders one JSON-safe card input through the same browser renderer used by
`yugilife-core`. It launches the pinned Playwright Chromium build and does not import the React app
or the browser application. Rendering never downloads templates or assets.

## Usage

```bash
yugilife-cli doctor
yugilife-cli render ./card.json --output ./card.svg
yugilife-cli render ./card.json --output ./card.png
yugilife-cli render ./card.json --output ./card.jpg --width 1200 --quality 90
yugilife-cli render ./card.json --output ./card.webp --scale 2
yugilife-cli templates list
yugilife-cli templates install card/series-9@2026.08.12
```

The first release accepts this transport format:

```json
{
  "template": "card/series-10",
  "card": {
    "name": "Example Card",
    "cardVariant": "effect",
    "description": "Rendered from the command line"
  },
  "files": {
    "artwork": "./artwork.png"
  },
  "presentationOverrides": {
    "artworkTransforms": {
      "artwork": { "scale": 1.5, "x": 0, "y": 0, "mode": "full-art" }
    }
  }
}
```

`template` resolves an exact or locally installed official template. Omitting it uses the Series 10
template packaged with `yugilife-templates`; `--use-default-template` makes that choice explicit.
File references are resolved relative to the input JSON file. A file key matching an image card
field supplies that field; other keys are passed as semantic asset overrides. Optional
`presentationOverrides` is passed through to core for explicit crop, full-art, layer, mask, preset,
and typography choices. SVG output uses outlined text by default.

The output extension selects SVG, PNG, JPEG (`.jpg` or `.jpeg`), or WebP. Raster output defaults to
the template's native dimensions and lossless PNG. Use exactly one of `--scale`, `--width`, or
`--height`; width and height preserve the template aspect ratio. `--quality <0-100>` applies only to
JPEG/WebP and defaults to 92. JPEG uses a white matte by default; `--background <#RGB|#RRGGBB>`
selects another opaque matte. Raster options are rejected for SVG, and SVG-only `--text-mode` and
`--title` options are rejected for raster output.

The same render is available as a function. It takes the transport object directly (file paths
resolve against `baseDirectory`, default the current directory) and returns the encoded bytes:

```js
import { writeFile } from "node:fs/promises"
import { render } from "yugilife-cli"

const { data, warnings } = await render(
  { template: "card/series-10", card: { name: "Example Card" }, files: { artwork: "./art.png" } },
  { format: "png", scale: 2 },
)
await writeFile("card.png", data)
```

Options mirror the CLI flags (`format`, `scale`/`width`/`height`, `quality` from 0 to 1,
`backgroundColor`, `textMode`, `title`, `signal`). Each call launches and closes its own Chromium
unless you pass a shared one from `launchBrowser()`; renders on it run one at a time, and Node
stays alive until you close it:

```js
import { launchBrowser, render } from "yugilife-cli"

const browser = await launchBrowser()
try {
  for (const input of inputs) {
    const { data } = await render(input, { browser })
    // ...
  }
} finally {
  await browser.close()
}
```

`render` is strictly local and never downloads or updates a template. `templates install` is the
separate network-capable acquisition command. It requires an exact `id@version`, reads a declared
size and SHA-256 entry from the configured registry catalog, verifies the downloaded artifact, validates
its current core schema, and promotes it atomically into local template storage. Configure a registry
with `--registry <catalog-url>` or `YUGILIFE_TEMPLATE_REGISTRY_URL`.

`doctor` checks the CLI/core versions, the exact Chromium executable, the loopback harness, and a
small browser-side renderer smoke check. Install the browser during setup with the repository's
`pnpm setup:browsers` command, or with the browser package's package-manager install lifecycle.

For an installed package, run `yugilife-cli doctor` and `yugilife-cli render ...` directly. From this
workspace, run `pnpm build` before invoking the CLI so its workspace dependencies are built.
