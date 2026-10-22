# Series 10 visual regression

Pixel-exact screenshots of real-card fixtures and focused renderer probes, rendered in the pinned
Playwright Chromium. Baselines are canonical Chromium-on-Linux lossless WebP files, so visual
commands fail early on other platforms; use `pnpm check:portable` there.

Regenerate baselines deliberately with:

```sh
pnpm --filter yugilife-templates test:visual:update
```

## Other bundled templates

The harness renders any bundled template when the fixture query carries `template=<id>`; the card
is then built from that template's own declared defaults plus generic `variant`, `attribute`,
`artwork`, `fullArt` and `rich` parameters, and any `field=value` pair the template declares
(lists split on `|`). `dynamis-duel.visual.spec.ts` covers the Dynamis Duel layout this way and
keeps its baselines beside it. Prepared textures are verified per template with the same check.
