// imp/web-canvas/src/world.js
// Implements: world.dsc#keepInsideBounds, world.dsc#applyDrag, world.dsc#emitBubbles, world.dsc#advanceBubbles
// Decisions: world.air#ia:world.bounds.clamp (clamp, not bounce), ia:world.drag.linear (linear damping)
// @ds c83f4c1e ca07d970 d6cebf86

import { WORLD, BUBBLE } from './constants.js';

// ds:c83f4c1e
export function clampToBounds(fish, world){
    const r = fish.radius;
    if( fish.pos.x < r ){ fish.pos.x = r; fish.vel.x = Math.max(0, fish.vel.x); }
    if( fish.pos.x > world.width - r ){ fish.pos.x = world.width - r; fish.vel.x = Math.min(0, fish.vel.x); }
    if( fish.pos.y < r ){ fish.pos.y = r; fish.vel.y = Math.max(0, fish.vel.y); }
    if( fish.pos.y > world.height - r ){ fish.pos.y = world.height - r; fish.vel.y = Math.min(0, fish.vel.y); }
}

// ds:ca07d970
export function applyDrag(vel, dt){
    const factor = Math.max(0, 1 - WORLD.drag * dt);
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
        radius,
        vel: {
            x: (rng() - 0.5) * BUBBLE.drift,
            y: -BUBBLE.riseSpeed * (0.8 + 0.4 * rng()),
        },
        life: BUBBLE.life,
        alpha: 1,
        phase: rng(),
    };
}

// ds:d6cebf86
export function advanceBubbles(bubbles, world, dt){
    for( let i = bubbles.length - 1; i >= 0; i-- ){
        const bubble = bubbles[i];
        bubble.pos.x += bubble.vel.x * dt;
        bubble.pos.y += bubble.vel.y * dt;
        bubble.life -= dt;
        bubble.alpha = Math.max(0, bubble.life / BUBBLE.life);
        if( bubble.life <= 0 || bubble.pos.y + bubble.radius < 0 || bubble.pos.x < -bubble.radius || bubble.pos.x > world.width + bubble.radius ){
            bubbles.splice(i, 1);
        }
    }
}

// @ia 5a6b7c8d
export function makeWorld(width, height){
    return { width, height };
}
