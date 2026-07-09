// imp/web-canvas/src/world.js
// Implements: world.dsc#keepInsideBounds, world.dsc#applyDrag, world.dsc#emitBubbles, world.dsc#advanceBubbles
// Decisions: world.air#ia:7e8f9a0b (clamp, not bounce), ia:1c2d3e4f (linear damping)
// @ds c83f4c1e ca07d970 d6cebf86

import { WORLD, BUBBLE } from './constants.js';

// ds:c83f4c1e
export function wrapPosition(fish, world){
    fish.pos.x = ((fish.pos.x % world.width) + world.width) % world.width;
    fish.pos.y = ((fish.pos.y % world.height) + world.height) % world.height;
}

// @ds:c83f4c1e
export function wrapPoint(pos, world){
    pos.x = ((pos.x % world.width) + world.width) % world.width;
    pos.y = ((pos.y % world.height) + world.height) % world.height;
    return pos;
}

// Compatibility name retained for callers; DSR now requires wrapping, not clamping.
export const clampToBounds = wrapPosition;

// ds:ca07d970
export function applyDrag(vel, dt, size = 1){
    const sizeDrag = 1 + Math.max(0, size - 1) * WORLD.sizeDrag;
    const factor = Math.max(0, 1 - WORLD.drag * sizeDrag * dt);
    return { x: vel.x * factor, y: vel.y * factor };
}

// @ia 7a8b9c0d
function bubbleCooldown(rng){
    return BUBBLE.baseInterval + rng() * BUBBLE.intervalJitter;
}

// @ia 7a8b9c0d
function bubbleGapSeconds(fish, rng){
    const targetRadius = fish.radius * BUBBLE.maxRatio * BUBBLE.displayScale;
    const maxGapPx = Math.max(BUBBLE.gapMinPx, targetRadius * BUBBLE.gapMaxRatio);
    const minGapPx = BUBBLE.gapMinPx;
    const gapPx = Math.max(minGapPx, Math.min(maxGapPx, targetRadius * (0.6 + 0.2 * rng())));
    return gapPx / BUBBLE.riseSpeed;
}

// @ia 7a8b9c0d
function randomBurstCount(rng){
    return BUBBLE.burstMinCount + Math.floor(rng() * (BUBBLE.burstMaxCount - BUBBLE.burstMinCount + 1));
}

// ds:d6cebf86
export function emitBubble(fish, dt, rng){
    fish.bubbleTimer -= dt;
    if( fish.bubbleTimer > 0 ) return null;

    if( fish.bubbleBurstRemaining <= 0 ) fish.bubbleBurstRemaining = randomBurstCount(rng);

    const targetRadius = fish.radius * BUBBLE.maxRatio * BUBBLE.displayScale;
    const radius = Math.max(BUBBLE.minRadius, targetRadius * (0.6 + 0.4 * rng()));
    fish.bubbleBurstRemaining--;
    fish.bubbleTimer += fish.bubbleBurstRemaining > 0 ? bubbleGapSeconds(fish, rng) : bubbleCooldown(rng);
    return {
        pos: {
            x: fish.pos.x - fish.facing * fish.radius * 0.15,
            y: fish.pos.y + fish.radius * 0.05,
        },
        radius: 0,
        targetRadius: radius,
        vel: {
            x: (rng() - 0.5) * BUBBLE.drift,
            y: -BUBBLE.riseSpeed * (0.8 + 0.4 * rng()),
        },
        life: BUBBLE.life,
        age: 0,
        alpha: 0,
        phase: rng(),
    };
}

function clamp01(value){
    return Math.max(0, Math.min(1, value));
}

function easeOutCubic(t){
    const inv = 1 - t;
    return 1 - inv * inv * inv;
}

// ds:d6cebf86
export function advanceBubbles(bubbles, world, dt){
    for( let i = bubbles.length - 1; i >= 0; i-- ){
        const bubble = bubbles[i];
        bubble.pos.x += bubble.vel.x * dt;
        bubble.pos.y += bubble.vel.y * dt;
        bubble.age = (bubble.age || 0) + dt;
        bubble.life -= dt;
        const targetRadius = bubble.targetRadius || bubble.radius || 0;
        bubble.targetRadius = targetRadius;
        const birth = BUBBLE.birthDuration > 0 ? clamp01(bubble.age / BUBBLE.birthDuration) : 1;
        const fade = clamp01(bubble.life / BUBBLE.life);
        bubble.radius = targetRadius * easeOutCubic(birth);
        bubble.alpha = Math.min(birth, fade);
        const boundsRadius = Math.max(bubble.radius, targetRadius);
        if( bubble.life <= 0 || bubble.pos.y + boundsRadius < 0 || bubble.pos.x < -boundsRadius || bubble.pos.x > world.width + boundsRadius ){
            bubbles.splice(i, 1);
        }
    }
}

// @ds:19c14fea
export function nextWorldSize(userFishCount, current){
    const step = Math.max(0, Math.ceil((userFishCount - WORLD.resizeHysteresisUsers) / 3));
    return {
        width: WORLD.initialWidth + step * 480,
        height: WORLD.initialHeight + step * 320,
    };
}

// @ds:19c14fea
export function scaleWorldEntities(world, nextSize){
    const sx = nextSize.width / world.width;
    const sy = nextSize.height / world.height;
    for( const fish of world.fish || [] ){
        fish.pos.x *= sx;
        fish.pos.y *= sy;
    }
    for( const shred of world.shreds || [] ){
        shred.pos.x *= sx;
        shred.pos.y *= sy;
    }
    world.width = nextSize.width;
    world.height = nextSize.height;
    world.nextSizeStep = { ...nextSize };
}

// @ds:53db39eb
export function targetNpcCount(world){
    return Math.max(6, Math.floor(world.width * world.height * WORLD.npcDensity));
}

// @ds:53db39eb
export function findLowestDensitySpawn(world, rng){
    let best = null;
    let bestScore = Infinity;
    const fish = world.fish || [];
    for( let i = 0; i < WORLD.densitySamples; i++ ){
        const candidate = {
            x: rng() * world.width,
            y: rng() * world.height,
        };
        let score = 0;
        for( const other of fish ){
            const dx = candidate.x - other.pos.x;
            const dy = candidate.y - other.pos.y;
            score += 1 / Math.max(80, Math.hypot(dx, dy));
        }
        for( const shred of world.shreds || [] ){
            const dx = candidate.x - shred.pos.x;
            const dy = candidate.y - shred.pos.y;
            score += 0.6 / Math.max(80, Math.hypot(dx, dy));
        }
        if( score < bestScore ){
            bestScore = score;
            best = candidate;
        }
    }
    return best || { x: world.width / 2, y: world.height / 2 };
}

// @ds:eccfca7e
export function controlledObjectCount(world){
    return (world.fish?.length || 0) + (world.shreds?.length || 0);
}

// @ds:eccfca7e
export function canAddControlledObjects(world, addedCount = 1){
    const limit = Number(WORLD.maxControlledObjects);
    if( !Number.isFinite(limit) || limit <= 0 ) return true;
    return controlledObjectCount(world) + Math.max(0, addedCount) <= limit;
}

// @ds:d140effd
export function isOldAgeSuspended(world){
    const limit = Number(WORLD.maxControlledObjects);
    if( !Number.isFinite(limit) || limit <= 0 ) return false;
    return controlledObjectCount(world) / limit > WORLD.oldAgeSuspendFillRatio;
}

// @ia 5a6b7c8d
export function makeWorld(width = WORLD.initialWidth, height = WORLD.initialHeight){
    return { width, height, nextSizeStep: null, fish: [], shreds: [], bubbles: [], tick: 0, nextShredId: 1 };
}
