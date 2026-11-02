# The flowers

Every flower on the site is a real one: a 3D scan, stood on one of our stems. Run from `petal-pixel-studio/`.

## Getting a flower

The models below come from Sketchfab, mirrored in [Objaverse](https://huggingface.co/datasets/allenai/objaverse), which needs no login. Look a model's id up in `object-paths.json.gz` there to find its file, then put it at `<models>/<name>/model.glb`.

| Head | Source | Author | Licence |
|---|---|---|---|
| rose | [Rose Scan](https://sketchfab.com/3d-models/none-48bc8f9448184489807301064d5dd538) | 0BNDT | CC BY 4.0 |
| peony | [Pink Peony](https://sketchfab.com/3d-models/none-1ce8ca97769a439aa83ee1e13fd75db7) | thesidekick | CC BY 4.0 |
| water-lily | [Water Lily](https://sketchfab.com/3d-models/none-e7830f486a0248b6b894f3e7a63b8c16) | ffishAsia and floraZia | CC0 |
| camellia | [Camellia japonica](https://sketchfab.com/3d-models/none-ec873a576ea74ca5a868393c1d24a7b9) | ffishAsia and floraZia | CC0 |
| hibiscus | [Hibiscus hamabo](https://sketchfab.com/3d-models/none-ab103e63aa5e45d1831cfd7da85ca935) | ffishAsia and floraZia | CC0 |
| tiger-lily | [Tiger Lily](https://sketchfab.com/3d-models/none-b11d9f411194426bb16883aed176e4e6) | ffishAsia and floraZia | CC0 |

A CC BY flower must name its author wherever it is shown. Give it a `credit` in `src/math/blossom/species.ts` and the footer does the rest. Only CC0 and CC BY allow prints to be sold.

Many scans arrive unlit, with the light of the photographs baked in, and look better in a viewer than they will on the page. Always judge a flower re-lit.

## Making a head

`spike/blender/heads/<name>.json` holds what each flower needs: which part of the file to keep, which way it faces and where its base sits. Replace `<models>` in `path`, then:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --disable-autoexec --python spike/blender/heads.py -- spike/blender/heads/rose.json public/models/heads
```

It prints the head's size, how far its petals lean (`top` in `species.ts`) and its colours (`colours`). A flower has to hold together as one piece: a model of loose parts falls apart as it closes. Check every new head from bud to bloom with `spike/heads.html`.

## Pictures

With the dev server on port 8080, `node spike/capture.cjs "$PWD"` recaptures the tiles, the night shelf, the Grow thumbnails and the hero poster from the live plant, and `cover.webp` for the cover. Pass a comma-separated list of path fragments to take only some of them.

For the cover, run `node spike/blender/cover.cjs "$PWD"`, which sets the words and writes `public/og-cover.png`, then delete `public/flowers/cover.webp`.
