# Artwork mask workers

Checked-in C/WASM kernels for dot-mask segmentation (`quick-selection-worker`) and mask effects
(`artwork-mask-worker`). Normal builds consume the committed WASM. Rebuild it only after changing
the C sources; this requires `clang` and `wasm-ld`:

```sh
pnpm --filter yugilife build:pin-mask
```
