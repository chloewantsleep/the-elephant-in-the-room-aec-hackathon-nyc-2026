# Feature demo videos

Screen recordings of the app, ready for the website. Files in `deck/public/` are served from the site root, so these
are at `/video/<name>.mp4`.

| Video | Shows | Length |
|---|---|---|
| `1-evaluate-environment.mp4` | The furniture already in the room is found; tap a piece to take it out of the photo | 8 s |
| `2-sketch.mp4` | Sketch Ideas: drawing where a new piece should go on the photo | 20 s |
| `4-multiple-export.mp4` | Shopping list, the room as an isometric plan, the itemized list with PDF / CSV export | 13 s |

Each has a poster image (its first frame) with the same name, `.jpg`.

```html
<video src="/video/2-sketch.mp4" poster="/video/2-sketch.jpg" autoplay muted loop playsinline preload="metadata"></video>
```

`muted` and `playsinline` are needed for autoplay on phones. The videos have no sound.

## How they were made

Recorded at 2304x1440, then sped up 1.25x and converted for the web: 1920x1200, 30 fps, H.264 (plays in every
browser), no audio track, `faststart` so playback begins before the whole file has loaded. 1-2 MB each.

```bash
ffmpeg -i input.mp4 -an -vf "setpts=PTS/1.25,fps=30,scale=1920:-2:flags=lanczos" \
  -c:v libx264 -preset slow -crf 24 -profile:v high -pix_fmt yuv420p -movflags +faststart output.mp4
ffmpeg -i output.mp4 -frames:v 1 -vf "scale=1280:-2" -q:v 4 output.jpg   # poster
```
