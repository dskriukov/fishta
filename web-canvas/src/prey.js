// imp/web-canvas/src/prey.js
// Implements: prey.dsc (wanderSteer, fleeSteer[status:added], maintainPopulation, variety)
// @ds 31cb7a0d 579e4888 e699c42d e6ecfbdd 1e66d817 ad8d81d8

import { FRY, PREY } from './constants.js';
import { v, sub, add, scale, normalize, dist, clampLen } from './vec.js';
import { makeFish, radiusOf } from './fish.js';
import { isEdibleBySize } from './predation.js';
import { findLowestDensitySpawn, targetNpcCount } from './world.js';

// @ia 7f8a9b0c
export function sampleSize(rng){
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
        if( !isEdibleBySize(t, p) ) continue;
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
    const world = state.world;
    if( world && Array.isArray(world.fish) ){
        const target = targetNpcCount(world);
        while( world.fish.filter(fish => fish.ownerKind === 'npc').length < target ){
            world.fish.push(spawnOne(world, rng, true));
        }
        return;
    }
    const { prey } = state;
    while( prey.length < PREY.target ){
        prey.push(spawnOne(world, rng, false));
    }
}

// @ia 3b4c5d6e
function spawnOne(world, rng, densitySpawn){
    const nominalStartSize = sampleSize(rng);
    const pos = densitySpawn ? findLowestDensitySpawn(world, rng) : edgeSpawn(world, rng);
    const fish = makeFish({
        pos,
        size: densitySpawn ? FRY.startSize : nominalStartSize,
        hue: 30 + rng() * 60,
        ownerKind: 'npc',
        npcRole: 'prey',
        fryAge: densitySpawn ? 0 : null,
        nominalStartSize,
    });
    fish.spawnGrace = densitySpawn ? 0 : PREY.spawnGrace;

    const center = v(world.width / 2, world.height / 2);
    const dx = center.x - fish.pos.x;
    const dy = center.y - fish.pos.y;
    const lenToCenter = Math.hypot(dx, dy) || 1;
    fish.vel = v((dx / lenToCenter) * PREY.maxSpeed * 0.45, (dy / lenToCenter) * PREY.maxSpeed * 0.45);
    fish.heading = { x: dx / lenToCenter, y: dy / lenToCenter };

    return fish;
}

function edgeSpawn(world, rng){
    const edge = Math.floor(rng() * 4);
    const m = PREY.spawnMargin;
    if( edge === 0 ) return v(-m, rng() * world.height);
    if( edge === 1 ) return v(world.width + m, rng() * world.height);
    if( edge === 2 ) return v(rng() * world.width, -m);
    return v(rng() * world.width, world.height + m);
}

// @ds:e6ecfbdd
export function advanceFryGrowth(fish, dt){
    if( fish.fryAge === null || fish.fryAge === undefined ) return;
    fish.fryAge = Math.min(FRY.growthSeconds, fish.fryAge + dt);
    const t = fish.fryAge / FRY.growthSeconds;
    fish.size = FRY.startSize + (fish.nominalStartSize - FRY.startSize) * t;
    fish.radius = radiusOf(fish.size);
    if( fish.fryAge >= FRY.growthSeconds ) fish.fryAge = null;
}

// @ia 2d3e4f5a
// @ds:d4f6a1c2
export function capPreySpeed(p){
    p.vel = clampLen(p.vel, PREY.maxSpeed);
}
