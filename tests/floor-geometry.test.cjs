const test = require('node:test'), assert = require('node:assert/strict'), G = require('../app/floor-geometry.js');

// a synthetic level camera looking into a room: floor y=0 plane in world, room x 0..W (back wall at z=0, front toward +z)
function camera({ W = 1600, H = 1200, f = 0.6 * Math.hypot(1600, 1200), yaw = 0, pitch = 0.35, pos = [80, 60, 260] } = {}) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return ([x, z]) => {   // floor point (x across, z from back wall toward camera) in inches -> [0-1000, 0-1000]
    let d = [x - pos[0], 0 - pos[1], z - pos[2]];
    d = [cy * d[0] + sy * d[2], d[1], -sy * d[0] + cy * d[2]];          // yaw
    d = [d[0], cp * d[1] - sp * d[2], sp * d[1] + cp * d[2]];          // pitch (looking down)
    // camera looks toward -z; image y grows downward
    const zc = -d[2];
    return [(W / 2 + f * d[0] / zc) / W * 1000, (H / 2 - f * d[1] / zc) / H * 1000];
  };
}
const ROOM_W = 160;
const roomOf = P => ({ back_left: P([0, 0]), back_right: P([ROOM_W, 0]), left_near: P([0, 150]), right_near: P([ROOM_W, 150]) });

for (const [name, opts] of [['one-point view', {}], ['turned camera', { yaw: 0.25, pos: [60, 60, 240] }]]) {
  test(`floor points come back where they are (${name})`, () => {
    const P = camera(opts), g = G.solve(roomOf(P), 1600, 1200);
    assert.ok(g);
    const s = ROOM_W / g.width;
    for (const pt of [[20, 30], [80, 90], [140, 40], [60, 130]]) {
      const [x, y] = g.toPlan(P(pt)).map(v => v * s);
      assert.ok(Math.abs(x - pt[0]) < 0.5 && Math.abs(y - pt[1]) < 0.5, `${pt} -> ${x.toFixed(1)},${y.toFixed(1)}`);
    }
  });
}

test('pieces land at their centers and the scale comes from real product widths', () => {
  const P = camera({ yaw: 0.2, pos: [70, 60, 250] });
  // sofa 84x36 centered at (80, 30); armchair 30x32 turned to face right (turn 3) centered at (25, 90)
  const rows = [
    { key: 0, cat: 'sofa', w: 84, d: 36, edges: [{ left: P([38, 48]), right: P([122, 48]), turn: 0 }] },
    { key: 1, cat: 'armchair', w: 30, d: 32, edges: [{ left: P([9, 105]), right: P([41, 105]), turn: 3 }] },
  ];
  const out = G.plan(roomOf(P), 1600, 1200, rows, 0);
  assert.ok(out);
  const sofa = out.pieces.get('0:0'), chair = out.pieces.get('1:0');
  assert.ok(Math.abs(out.width - ROOM_W) < 1.5, `width ${out.width}`);
  assert.ok(Math.abs(sofa.x - 80) < 1 && Math.abs(sofa.y - 30) < 1, JSON.stringify(sofa));
  assert.ok(Math.abs(chair.x - 25) < 1 && Math.abs(chair.y - 90) < 1, JSON.stringify(chair));
  assert.equal(chair.turn, 3);
  assert.ok(chair.y > sofa.y && chair.x < sofa.x);   // in front of and left of the sofa, as in the picture
});

test('a measured back wall sets the scale', () => {
  const P = camera();
  const out = G.plan(roomOf(P), 1600, 1200, [{ key: 0, cat: 'sofa', w: 50, d: 36, edges: [{ left: P([38, 48]), right: P([122, 48]) }] }], 200);
  assert.ok(Math.abs(out.width - 200) < 1e-6);
});

test('unreadable room lines give no plan', () => {
  assert.equal(G.solve(null, 1600, 1200), null);
  assert.equal(G.solve({ back_left: [100, 500], back_right: [100, 500], left_near: [0, 900], right_near: [1000, 900] }, 1600, 1200), null);
  assert.equal(G.plan({ back_left: [200, 500], back_right: [800, 500], left_near: [0, 900], right_near: [1000, 900] }, 1600, 1200, [], 0), null);
});
