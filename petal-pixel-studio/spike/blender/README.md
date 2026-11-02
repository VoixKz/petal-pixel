# Pictures of the flowers

The specimen tiles, the night shelf and the cover are the engine's real geometry rendered in
Blender. Re-render them after any change to the shape or colour of a flower. The hero poster and
the Grow thumbnails must match the live canvas, so they stay browser captures: with the dev server
on port 8080, `node spike/capture.cjs "$PWD" grow/,first.webp`.

Run from `petal-pixel-studio/`.

1. Export the plants: `npx vite-node spike/blender/export.ts <plants dir> Dana Anna Maria Aisha Oleg Sara Iris Noah Zara Omar`
2. Write `jobs.json`, a list of frames:

   ```json
   { "plant": "<plants dir>/anna.json", "frame": "head", "night": false, "width": 1000, "height": 1000, "samples": 128, "out": "<renders dir>/names-anna.png" }
   ```

   `frame` is `head` for tiles, `lamp` for the shelf and `cover` for the cover; a night frame also takes `"power": 14`.
   Tiles are 1000 x 1000 and named `names-<name>.png` or `names-<name>-night.png`. The shelf is 864 x 1248 and named `lamps-<name>.png`.
3. Render: `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python spike/blender/render.py -- jobs.json`
4. Make the pictures: `python3 spike/blender/post.py <renders dir> public/flowers`
5. The cover is Maria at night in the `cover` frame, 1800 x 945, passed through `night()` in `post.py`, scaled to 1200 x 630 and saved as `public/flowers/cover.png`. Then `node spike/blender/cover.cjs "$PWD"` sets the words on it and writes `public/og-cover.png`; delete `cover.png` afterwards.

The first Cycles run on Metal spends about five minutes compiling kernels. After that a frame takes seconds.
