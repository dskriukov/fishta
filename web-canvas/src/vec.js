// imp/web-canvas/src/vec.js — vec2 helpers (pure)
// @ia a1b2c3d4
export const v = (x = 0, y = 0) => ({ x, y });
// @ia a1b2c3d4
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
// @ia a1b2c3d4
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
// @ia a1b2c3d4
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s });
// @ia a1b2c3d4
export const len = (a) => Math.hypot(a.x, a.y);

// @ia a1b2c3d4
export function normalize(a){
    const l = len(a);
    return l > 1e-6 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

// @ia a1b2c3d4
export function clampLen(a, max){
    const l = len(a);
    return l > max ? scale(normalize(a), max) : a;
}

// @ia a1b2c3d4
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
