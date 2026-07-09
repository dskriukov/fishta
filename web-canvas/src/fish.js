// imp/web-canvas/src/fish.js
// Implements: fish.dsc (entity, integrateMotion, grow, updateFacing, spendEnergy, derived radius/maxSpeed)
// Decisions: fish.air#ia:fish.radius-formula..ia:fish.decor.fear-eye-state

import { FISH, GROWTH, ENERGY, REGIME, MOUTH, SWIM, FEAR_EYE, BUBBLE, EXHALE, PREDATION } from './constants.js';
import { add, sub, scale, normalize, clampLen, len } from './vec.js';
import { clampToBounds, applyDrag } from './world.js';

let nextId = 1;

// ds:cbc1225a
export function radiusOf(size){
    return FISH.baseRadius * Math.sqrt(size);
}

// ds:8869f043
export function maxSpeedOf(size, ownerKind = null){
    const factor = Math.max(FISH.speedFloor, 1 - size * FISH.speedDecay);
    const sizeCap = FISH.baseSpeed * factor;
    return ownerKind === 'user' ? Math.max(FISH.minBurstSpeed, sizeCap) : sizeCap;
}

// ds:1f3abc43
export function makeFish({
    pos,
    size = 1,
    isPlayer = false,
    hue = 200,
    ownerKind = isPlayer ? 'user' : 'npc',
    clientId = null,
    temporaryConnectionCode = null,
    userName = '',
    userColor = '#59bcd6',
    userTier = 'free',
    npcRole = 'prey',
    formerUserColor = null,
    fryAge = null,
    nominalStartSize = null,
    courage = null,
}){
    return {
        id: nextId++,
        pos: { ...pos },
        vel: { x: 0, y: 0 },
        size,
        radius: radiusOf(size),
        facing: 1,          // 1 = right, -1 = left
        mode: 'cruise',
        age: 0,
        eatenFishCount: 0,
        feedingSuccessFactor: 1,     // @ds:4e2a91f0
        feedingCooldown: 0,          // @ds:4e2a91f0
        visualScale: 1,
        exhale: {
            requested: false,
            requestedRedRatio: 0,
            redRatio: 0,
            stage: 'idle',
            t: 0,
            emitTimer: 0,
            emitCount: 0,
            emitTotal: 0,
        },
        bubbleTimer: 0,              // @ia 7a8b9c0d
        bubbleBurstRemaining: 0,     // @ia 7a8b9c0d
        mouthOpen: 0,                // @ia 9c0d1e2f
        mouthHold: 0,                // @ia 9c0d1e2f
        mouthEatenSize: 0,           // @ia 9c0d1e2f
        swimPhase: 0,                // @ia 3a4b5c6e
        burstKick: 0,                // @ia 3a4b5c6e
        wasBurstThrusting: false,    // @ia 3a4b5c6e
        eyeFear: 0,                  // @ia 7d8e9f0a
        isPlayer,
        ownerKind,
        clientId,
        temporaryConnectionCode,
        userName,
        userColor,
        userTier,
        npcRole,
        formerUserColor,
        fryAge,
        nominalStartSize,
        courage: courage ?? (ownerKind === 'npc' ? 50 : null),
        hue,
        prevAccel: { x: 0, y: 0 },
        // prey-only steering memory (ignored for player)
        heading: { x: 0, y: 0 },
    };
}

// @ds:c5a92431
export function updateUserLabel(fish, fields = {}){
    if( fields.userName !== undefined ) fish.userName = fields.userName;
    if( fields.userColor !== undefined ) fish.userColor = fields.userColor;
    if( fields.userTier !== undefined ) fish.userTier = fields.userTier;
}

// @ds:c3708d14 @ds:bfd5a97a
export function updateAbandonedGradient(fish){
    if( fish.ownerKind !== 'npc' || fish.npcRole !== 'abandoned-user-fish' ) return;
    fish.formerUserColor = fish.formerUserColor || fish.userColor || '#59bcd6';
    fish.hue = 52;
}

// ds:7ce238da
// contract: fish.integrateMotion  (v += a*dt; v = drag(v); p += v*dt)
export function integrate(fish, accel, world, dt){
    fish.age += dt;
    fish.vel = add(fish.vel, scale(accel, dt));
    const speedCap = fish.mode === 'burst'
        ? maxSpeedOf(fish.size, fish.ownerKind)
        : maxSpeedOf(fish.size) * REGIME.cruiseFactor;  // ds:ee07d6da
    fish.vel = clampLen(fish.vel, speedCap);
    fish.vel = applyDrag(fish.vel, dt, fish.size);
    const move = scale(fish.vel, dt);
    fish.pos = add(fish.pos, move);
    spendEnergy(fish, len(move));   // ds:f51831f5
    if( fish.spawnGrace > 0 ){
        fish.spawnGrace = Math.max(0, fish.spawnGrace - dt);
    }else{
        clampToBounds(fish, world);  // ds:c4073e51
    }
    updateMouth(fish, accel, dt);
    updateSwimMotion(fish, accel, dt); // ds:bd354b7a
    updateFearEye(fish, accel, dt);
    updateFacing(fish);
}

// @do:a7a50f7b
export function serializeFish(fish){
    const base = [
        `type=${fish.ownerKind === 'user' ? 'user' : fish.npcRole || 'npc'}`,
        `size=${fish.size.toFixed(2)}`,
        `age=${fish.age.toFixed(1)}`,
        `eatenFishCount=${fish.eatenFishCount || 0}`,
    ];
    if( fish.ownerKind === 'user' ){
        base.push(`userName=${fish.userName || ''}`);
        base.push(`userColor=${fish.userColor || ''}`);
        base.push(`userTier=${fish.userTier || 'free'}`);
    }
    return base.join(' ');
}

// @ds:f51831f5 @ds:6aa7c828
// Drift (no thrust) is free; traveling 100*size with thrust => -1% size.
export function spendEnergy(fish, distance){
    if( fish.mode !== 'burst' || distance <= 0 ) return;
    const refDist = ENERGY.refSizes * fish.size;            // "100 текущих размеров"
    const lossFrac = ENERGY.lossPerRef * (distance / refDist);
    const minSize = fish.ownerKind === 'user' ? ENERGY.userMinSize : ENERGY.minSize;
    fish.size = Math.max(minSize, fish.size * (1 - lossFrac));
    fish.radius = radiusOf(fish.size);
}

// ds:8d0ca6a8
export function updateFacing(fish){
    if( fish.vel.x > FISH.facingThreshold ) fish.facing = 1;
    else if( fish.vel.x < -FISH.facingThreshold ) fish.facing = -1;
}

// ds:d867989f
export function grow(fish, preySize){
    const gain = growSizeFromAreas(fish.size, preySize) - fish.size;
    fish.size += gain;
    fish.radius = radiusOf(fish.size);
    fish.eatenFishCount += 1;
    fish.mouthEatenSize = Math.max(fish.mouthEatenSize, preySize);
    fish.mouthHold = Math.max(fish.mouthHold, MOUTH.holdDuration);
}

// @ds:79c1e3a5 @ds:d867989f
export function growFromNutrient(fish, areaValue){
    fish.size += Math.max(0, areaValue);
    fish.radius = radiusOf(fish.size);
}

// @ds:d867989f @ds:b024b514
export function growSizeFromAreas(predatorSize, preySize){
    return predatorSize + Math.max(0, preySize) * GROWTH.fishAreaGainRatio;
}

// @ds:4e2a91f0
export function advanceFeedingState(fish, dt){
    fish.feedingCooldown = Math.max(0, (fish.feedingCooldown || 0) - dt);
    const recoverySeconds = Math.max(1e-6, PREDATION.feedingRecoverySeconds);
    fish.feedingSuccessFactor = Math.min(1, (fish.feedingSuccessFactor ?? 1) + dt / recoverySeconds);
}

// ds:975ca168
export function updateMouth(fish, accel, dt){
    if( fish.mouthHold > 0 ) fish.mouthHold = Math.max(0, fish.mouthHold - dt);
    if( fish.mouthEatenSize > 0 ) fish.mouthEatenSize = Math.max(0, fish.mouthEatenSize - dt * fish.size * 2);

    const thrusting = accel && (Math.abs(accel.x) + Math.abs(accel.y) > 1e-3);
    const chaseOpen = thrusting && fish.mode === 'burst' ? MOUTH.chaseOpenRatio : 0;
    const eatOpen = fish.mouthHold > 0 ? Math.min(1, fish.mouthEatenSize / Math.max(1, fish.size)) : 0;
    fish.mouthOpen = Math.max(chaseOpen, eatOpen);
}

// ds:bd354b7a
export function updateSwimMotion(fish, accel, dt){
    const speed = len(fish.vel);
    const thrusting = accel && (Math.abs(accel.x) + Math.abs(accel.y) > 1e-3);
    const burstThrusting = thrusting && fish.mode === 'burst';
    if( burstThrusting && !fish.wasBurstThrusting ) fish.burstKick = 1;
    fish.wasBurstThrusting = burstThrusting;
    fish.burstKick = Math.max(0, fish.burstKick - dt * SWIM.kickDecay);
    fish.swimPhase += dt * (SWIM.basePhaseRate + speed * SWIM.speedPhaseRate);
}

// ds:906be50b
export function updateFearEye(fish, accel, dt){
    const thrusting = accel && (Math.abs(accel.x) + Math.abs(accel.y) > 1e-3);
    const fleeing = !fish.isPlayer && fish.mode === 'burst' && thrusting;
    const rate = fleeing ? FEAR_EYE.riseRate : FEAR_EYE.decayRate;
    const target = fleeing ? 1 : 0;
    fish.eyeFear += (target - fish.eyeFear) * Math.min(1, dt * rate);
}

// @ds:a44b9d2c @fn:a9a3ed12
export function requestExhale(fish, options = {}){
    fish.exhale.requested = true;
    if( options.redBubbleRatio !== undefined ){
        fish.exhale.requestedRedRatio = Math.max(0, Math.min(1, options.redBubbleRatio));
    }
}

function lerp(a, b, t){
    return a + (b - a) * t;
}

function mouthPos(fish){
    return {
        x: fish.pos.x + fish.facing * fish.radius * 0.9,
        y: fish.pos.y + fish.radius * 0.05,
    };
}

function displacementWeight(dist, radius){
    if( radius <= 0 || dist >= radius ) return 0;
    return 1 - dist / radius;
}

function displaceExistingBubbles(fish, bubbles, dt, towardMouth){
    if( !Array.isArray(bubbles) || bubbles.length === 0 ) return;
    const mouth = mouthPos(fish);
    const radius = Math.max(1, fish.radius * EXHALE.influenceRadiusSizes);
    const sign = towardMouth ? 1 : -1;
    for( const bubble of bubbles ){
        const toMouth = sub(mouth, bubble.pos);
        const d = len(toMouth);
        const w = displacementWeight(d, radius);
        if( w <= 0 ) continue;
        const dir = normalize(toMouth);
        const shift = scale(dir, sign * EXHALE.bubbleDisplaceSpeed * w * dt);
        bubble.pos = add(bubble.pos, shift);
    }
}

// @ds:a44b9d2c @fn:a9a3ed12
function makeExhaleBubble(fish, rng){
    const radius = Math.max(BUBBLE.minRadius, fish.radius * BUBBLE.maxRatio * BUBBLE.displayScale * (0.6 + 0.4 * rng()));
    const mouth = mouthPos(fish);
    const red = rng() < (fish.exhale.redRatio || 0);
    const bubble = {
        pos: {
            x: mouth.x - fish.facing * fish.radius * 0.5,
            y: mouth.y,
        },
        radius: 0,
        targetRadius: radius,
        vel: {
            x: fish.facing * (BUBBLE.drift * (0.35 + 0.65 * rng())),
            y: -BUBBLE.riseSpeed * (0.8 + 0.4 * rng()),
        },
        life: BUBBLE.life,
        age: 0,
        alpha: 0,
        phase: rng(),
    };
    if( red ) bubble.color = 'red';
    return bubble;
}

function beginExhaleEmission(exhale, rng){
    exhale.emitTotal = EXHALE.emitMinCount + Math.floor(rng() * (EXHALE.emitMaxCount - EXHALE.emitMinCount + 1));
    exhale.emitCount = 0;
    exhale.emitTimer = 0;
}

// @fn:a9a3ed12
function emitExhaleSequential(fish, bubbles, rng, dt){
    const exhale = fish.exhale;
    if( exhale.emitCount >= exhale.emitTotal ) return;

    exhale.emitTimer -= dt;
    if( exhale.emitTimer > 0 ) return;

    bubbles.push(makeExhaleBubble(fish, rng));
    exhale.emitCount++;
    exhale.emitTimer += EXHALE.emitInterval;
}

// fn:a9a3ed12 ia:4a2ebf0d ia:0adbe79e ia:617964be
export function runExhaleCycle(fish, bubblesAround, rng, dt){
    const exhale = fish.exhale;
    if( exhale.stage === 'idle' && exhale.requested ){
        exhale.stage = 'inhale';
        exhale.t = 0;
        exhale.emitTimer = 0;
        exhale.emitCount = 0;
        exhale.emitTotal = 0;
        exhale.redRatio = exhale.requestedRedRatio || 0;
        exhale.requestedRedRatio = 0;
        exhale.requested = false;
    }

    if( exhale.stage === 'idle' ){
        fish.visualScale = 1;
        return;
    }

    if( exhale.stage === 'inhale' ){
        exhale.t += dt;
        const t = Math.min(1, exhale.t / EXHALE.inhaleDuration);
        fish.visualScale = lerp(1, EXHALE.inhaleScale, t);
        // Only already existing bubbles are displaced during inhale.
        displaceExistingBubbles(fish, bubblesAround, dt, true);
        if( t >= 1 ){
            exhale.stage = 'exhale';
            exhale.t = 0;
            beginExhaleEmission(exhale, rng);
        }
        return;
    }

    exhale.t += dt;
    emitExhaleSequential(fish, bubblesAround, rng, dt);
    const t = exhale.emitTotal > 0 ? Math.min(1, exhale.emitCount / exhale.emitTotal) : 1;
    fish.visualScale = lerp(EXHALE.inhaleScale, 1, t);
    displaceExistingBubbles(fish, bubblesAround, dt, false);

    if( exhale.emitCount >= exhale.emitTotal ){
        exhale.stage = 'idle';
        exhale.t = 0;
        exhale.emitTimer = 0;
        exhale.emitCount = 0;
        exhale.emitTotal = 0;
        exhale.redRatio = 0;
        fish.visualScale = 1;
    }
}
