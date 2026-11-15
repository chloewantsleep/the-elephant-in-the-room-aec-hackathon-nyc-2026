/* Floor plan from a perspective image: points on the floor in the render -> positions on the room's floor.
 *
 * Input: where the walls meet the floor, read off the render (api/_core.py inspect_render_layout):
 *   back_left, back_right  the two back corners
 *   left_near, right_near  one more point on each side wall's floor line, nearer the camera
 * all as [x, y] in 0-1000 of the image width / height.
 *
 * The two side lines meet at the vanishing point of the room's depth direction; the back line gives the
 * width direction. With a pinhole camera (principal point at the image center, focal length estimated
 * or assumed) that fixes the floor plane, and every image point below the horizon maps to one floor
 * point by casting its ray onto that plane. Result: a plan with x along the back wall (0 = back-left
 * corner) and y from the back wall toward the camera, in units of the camera height (scale is set later
 * from real furniture sizes or the measured wall).
 */
(function (root) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => { const n = len(a); return n > 1e-12 ? a.map(v => v / n) : null; };
  const scale = (a, s) => a.map(v => v * s);

  // focal length in pixels: from the two vanishing points if they look orthogonal with a level camera,
  // otherwise a typical phone lens (about 26 mm equivalent)
  function focal(back, vy, W, H) {
    const diag = Math.hypot(W, H), fallback = 0.6 * diag;
    if (Math.abs(vy[2]) < 1e-9) return fallback;
    const vyx = vy[0] / vy[2], vyy = vy[1] / vy[2];
    const vx = cross(back, [0, 1, -vyy]);   // back line meets the horizon (level camera: horizontal through vy)
    if (Math.abs(vx[2]) < 1e-9) return fallback;
    const d = (vx[0] / vx[2] - W / 2) * (vyx - W / 2) + (vx[1] / vx[2] - H / 2) * (vyy - H / 2);
    const f = d < 0 ? Math.sqrt(-d) : 0;
    return f > 0.35 * diag && f < 1.6 * diag ? f : fallback;
  }

  function solve(room, W, H) {
    if (!room || !(W > 0) || !(H > 0)) return null;
    const px = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) ? [p[0] / 1000 * W, p[1] / 1000 * H, 1] : null;
    const BL = px(room.back_left), BR = px(room.back_right), LN = px(room.left_near), RN = px(room.right_near);
    if (!BL || !BR || !LN || !RN) return null;
    const back = cross(BL, BR), left = cross(BL, LN), right = cross(BR, RN);
    const vy = cross(left, right);   // vanishing point of depth (may be at infinity)
    if (len(back) < 1e-9 || len(left) < 1e-9 || len(right) < 1e-9 || len(vy) < 1e-9) return null;
    const f = focal(back, vy, W, H), cx = W / 2, cy = H / 2;
    const ray = p => [(p[0] - cx * p[2]) / f, (p[1] - cy * p[2]) / f, p[2]];   // K^-1 p
    const dy = unit(ray(vy));
    const nb = [f * back[0], f * back[1], cx * back[0] + cy * back[1] + back[2]];   // plane through the camera and the back line
    const dx = dy && unit(cross(nb, dy));
    let n = dx && unit(cross(dx, dy));   // floor normal
    if (!n) return null;
    if (dot(n, ray(BL)) < 0) n = scale(n, -1);
    const onFloor = p => { const r = ray(p), t = dot(n, r); return t > 1e-9 ? scale(r, 1 / t) : null; };   // floor: n·X = 1
    const O = onFloor(BL), B = onFloor(BR), L = onFloor(LN);
    if (!O || !B || !L || !onFloor(RN)) return null;
    const ex = unit(sub(B, O));
    let ey = ex && unit(cross(n, ex));
    if (!ey) return null;
    if (dot(sub(L, O), ey) < 0) ey = scale(ey, -1);
    const toPlan = p => {
      const X = onFloor(px(p) || [NaN, NaN, 1]);
      if (!X || !X.every(Number.isFinite)) return null;
      const v = sub(X, O);
      return [dot(v, ex), dot(v, ey)];
    };
    return { width: len(sub(B, O)), focal: f, toPlan };
  }

  /* Plan positions (inches) for every measured instance.
   * rows: [{ key, cat, w, d, edges: [{left, right, turn}] }] -> { width, depth, pieces: Map(key:i -> {x, y, turn}) } or null
   * The near bottom edge's midpoint sits half a footprint in front of the piece's center. Real product widths
   * against measured edge lengths give the inches-per-unit scale, unless the back wall was measured (wallIn). */
  const NO_SCALE = new Set(["rug", "pendant_lamp", "table_lamp", "floor_lamp", "mirror"]);
  function plan(room, W, H, rows, wallIn) {
    const g = solve(room, W, H);
    if (!g || !(g.width > 0)) return null;
    const found = [], ratios = [];
    for (const row of rows) {
      (row.edges || []).forEach((e, i) => {
        const a = g.toPlan(e.left), b = g.toPlan(e.right);
        if (!a || !b) return;
        const turn = e.turn || 0, rw = turn % 2 ? row.d : row.w, rd = turn % 2 ? row.w : row.d;
        const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!NO_SCALE.has(row.cat) && span > 1e-6 && Math.abs(b[0] - a[0]) > 0.7 * span) ratios.push(rw / span);
        found.push({ key: `${row.key}:${i}`, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], turn, rw, rd });
      });
    }
    if (!found.length) return null;
    ratios.sort((a, b) => a - b);
    const s = wallIn > 0 ? wallIn / g.width
      : ratios.length ? ratios[Math.floor(ratios.length / 2)] : 144 / g.width;
    const width = g.width * s;
    const pieces = new Map();
    let front = 0;
    for (const p of found) {
      const x = Math.min(width - p.rw / 2, Math.max(p.rw / 2, p.mid[0] * s));
      const y = Math.max(p.rd / 2, p.mid[1] * s - p.rd / 2);
      pieces.set(p.key, { x, y, turn: p.turn });
      front = Math.max(front, y + p.rd / 2);
    }
    return { width, depth: Math.max(front + 24, 72), scale: s, pieces };
  }

  const api = { solve, plan };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FloorGeometry = api;
})(typeof window !== "undefined" ? window : globalThis);
