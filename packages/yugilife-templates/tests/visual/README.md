# Series 10 visual regression

Pixel-exact screenshots of real-card fixtures and focused renderer probes, rendered in the pinned
Playwright Chromium. Baselines are canonical Chromium-on-Linux lossless WebP files, so visual
commands fail early on other platforms; use `pnpm check:portable` there.

Regenerate baselines deliberately with:

```sh
pnpm --filter yugilife-templates test:visual:update
```
