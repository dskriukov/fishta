// imp/web-canvas/src/prey.js
// Implements: prey.dsc (wanderSteer, fleeSteer[status:added], maintainPopulation, variety)
// @ds 31cb7a0d 579e4888 e699c42d e6ecfbdd 1e66d817 ad8d81d8

import { PREY } from './constants.js';
import { v, sub, add, scale, normalize, dist, clampLen } from './vec.js';
import { makeFish } from './fish.js';
import { canEat } from './predation.js';

// @ia 7f8a9b0c
function sampleSize(rng){
    const t = Math.pow(rng(), PREY.smallBias); // bias toward 0 => small
    return PREY.minSize + t * (PREY.maxSize - PREY.minSize);
}

// ds:31cb7a0d
export function wanderSteer(p, dt, rng){
    if( rng() < PREY.wanderTurn * dt || (p.heading.x === 0 && p.heading.y === 0) ){
        const ang = rng() * Math.PI * 2;
        p.heading = { x: Math.cos(ang), y: Math.sin(ang) };
    }
    return scale(p.heading, PREY.wanderAccel);
}

// ds:579e4888
export function fleeSteer(p, threats){
    let nearest = null;
    let nearestD = PREY.fleeRadius;
    for( const t of threats ){
        if( !canEat(t, p) ) continue;
        const d = dist(p.pos, t.pos);
        if( d < nearestD ){ nearestD = d; nearest = t; }
    }
    if( !nearest ) return { accel: null, mode: 'cruise' };
    const threatSpeed = Math.hypot(nearest.vel.x, nearest.vel.y);
    const preySpeed = Math.hypot(p.vel.x, p.vel.y);
    if( preySpeed > threatSpeed + PREY.speedMargin ){
        return { accel: null, mode: 'cruise' };
    }
    const away = normalize(sub(p.pos, nearest.pos));
    const proximity = Math.max(0, Math.min(1, (PREY.fleeRadius - nearestD) / PREY.fleeRadius));
    return {
        accel: scale(away, PREY.fleeAccel * proximity),
        mode: 'burst',
    };
}

// ds:579e4888 ds:31cb7a0d
export function preySteer(p, threats, dt, rng){
    const flee = fleeSteer(p, threats);
    if( flee.accel ) return flee;
    return {
        accel: wanderSteer(p, dt, rng),
        mode: 'cruise',
    };
}

// ds:e6ecfbdd
export function maintainPopulation(state, rng){
    const { prey, world } = state;
    while( prey.length < PREY.target ){
        prey.push(spawnOne(world, rng));
    }
}

// @ia 3b4c5d6e
function spawnOne(world, rng){
    const edge = Math.floor(rng() * 4);
    const m = PREY.spawnMargin;
    let pos;
    if( edge === 0 ) pos = v(-m, rng() * world.height);
    else if( edge === 1 ) pos = v(world.width + m, rng() * world.height);
    else if( edge === 2 ) pos = v(rng() * world.width, -m);
    else pos = v(rng() * world.width, world.height + m);

    const fish = makeFish({ pos, size: sampleSize(rng), hue: 30 + rng() * 60 });
    fish.spawnGrace = PREY.spawnGrace;

    const center = v(world.width / 2, world.height / 2);
    const dx = center.x - fish.pos.x;
    const dy = center.y - fish.pos.y;
    const lenToCenter = Math.hypot(dx, dy) || 1;
    fish.vel = v((dx / lenToCenter) * PREY.maxSpeed * 0.45, (dy / lenToCenter) * PREY.maxSpeed * 0.45);
    fish.heading = { x: dx / lenToCenter, y: dy / lenToCenter };

    return fish;
}

// @ia 2d3e4f5a
export function capPreySpeed(p){
    p.vel = clampLen(p.vel, PREY.maxSpeed);
}
