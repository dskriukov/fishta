// imp/web-canvas/src/fish.js
// Implements: fish.dsc (entity, integrateMotion, grow, updateFacing, spendEnergy, derived radius/maxSpeed)
// Decisions: fish.air#ia:fish.radius-formula..ia:fish.decor.fear-eye-state
// @ds:07320d39
// @ds:9ce87fee

import { FISH, WORLD, GROWTH, ENERGY, REGIME, MOUTH, SWIM, FEAR_EYE, BUBBLE, EXHALE, PREDATION } from './constants.js';
import { add, sub, scale, normalize, clampLen, len } from './vec.js';
import { clampToBounds, applyDrag } from './world.js';

let nextId = 1;

// ds:cbc1225a
export function pixelRadiusOf(size){
    return FISH.nominalStartDiameter * WORLD.pixelsPerWorldUnit * Math.sqrt(Math.max(0, size)) / 2;
}

export function technicalRadiusOf(size, worldScale = 1){
    return FISH.nominalStartDiameter * Math.sqrt(Math.max(0, size)) / 2 / Math.max(1e-6, worldScale);
}

// ds:8869f043
export function maxSpeedOf(size, ownerKind = null){
    const area = Math.max(0, Number(size) || 0);
    const linearSize = Math.max(FISH.minLinearSpeedSize, Math.sqrt(area));
    const dragDenominator = 1 + FISH.waterDragByLinearSize * (linearSize - 1);
    const sizeCap = FISH.baseNoDragSpeed / Math.max(0.01, dragDenominator);
    return ownerKind === 'user' ? Math.max(FISH.minBurstSpeed, sizeCap) : sizeCap * FISH.npcSpeedFactor;
}

export const BURST_ENDURANCE_SIZE_THRESHOLDS = buildBurstEnduranceThresholds();

// @ds:8869f043
export function speedCapOf(size, ownerKind, speedLevel, cruiseControl = null){
    const level = normalizeSpeedLevel(speedLevel);
    if( level <= 0 ) return 0;
    const maxSpeed = maxSpeedOf(size, ownerKind);
    if( level <= REGIME.cruiseMaxSpeedLevel ){
        if( cruiseControl === 'keyboard' ){
            const cruiseSpeed = REGIME.keyboardCruiseSpeed * (level / REGIME.cruiseMaxSpeedLevel);
            return Math.min(maxSpeed, cruiseSpeed);
        }
        return maxSpeed * (level / 100) * REGIME.cruiseFactor;
    }
    return maxSpeed * (level / 100);
}

// @ds:f51831f5
export function burstEnergyFactorOf(speedLevel){
    const n = normalizeSpeedLevel(speedLevel);
    if( n < REGIME.burstStartSpeedLevel ) return 0;
    return 1 + ENERGY.burstExtraSpendFactor * (n - REGIME.burstStartSpeedLevel) / (REGIME.speedLevels - REGIME.burstStartSpeedLevel);
}

export function normalizeSpeedLevel(level){
    return Math.max(0, Math.min(REGIME.speedLevels, Math.floor(Number(level) || 0)));
}

// @ds:07320d39
export function availableSpeedLevelForSize(size, desiredLevel = REGIME.speedLevels){
    const desired = normalizeSpeedLevel(desiredLevel);
    if( desired < REGIME.burstStartSpeedLevel ) return desired;
    const currentSize = Number(size) || 0;
    for( let level = desired; level >= REGIME.burstStartSpeedLevel; level-- ){
        if( currentSize >= BURST_ENDURANCE_SIZE_THRESHOLDS[level] ) return level;
    }
    return REGIME.burstStartSpeedLevel;
}

// @ds:07320d39
function buildBurstEnduranceThresholds(){
    const thresholds = Array(REGIME.speedLevels + 1).fill(0);
    const maxSearchSize = 80;
    for( let level = REGIME.burstStartSpeedLevel; level <= REGIME.speedLevels; level++ ){
        let lo = ENERGY.userMinSize;
        let hi = ENERGY.userMinSize;
        while( hi < maxSearchSize && !canSustainBurst(hi, level) ) hi *= 1.18;
        if( hi >= maxSearchSize && !canSustainBurst(hi, level) ){
            thresholds[level] = maxSearchSize;
            continue;
        }
        for( let i = 0; i < 28; i++ ){
            const mid = (lo + hi) / 2;
            if( canSustainBurst(mid, level) ) hi = mid;
            else lo = mid;
        }
        thresholds[level] = hi;
    }
    return thresholds;
}

function canSustainBurst(initialSize, level){
    let size = initialSize;
    let elapsed = 0;
    const dt = REGIME.enduranceSimulationStepSeconds;
    while( elapsed < REGIME.enduranceReserveSeconds ){
        if( size <= ENERGY.userMinSize ) return false;
        const step = Math.min(dt, REGIME.enduranceReserveSeconds - elapsed);
        const speed = speedCapOf(size, 'user', level);
        size = sizeAfterBurstDistance(size, level, speed * step, ENERGY.userMinSize);
        elapsed += step;
    }
    return size > ENERGY.userMinSize;
}

function sizeAfterBurstDistance(size, level, distance, minSize){
    if( level < REGIME.burstStartSpeedLevel || size <= minSize ) return size;
    const refDist = Math.max(1e-6, ENERGY.refSizes * Math.max(minSize, size));
    const lossFrac = ENERGY.lossPerRef * burstEnergyFactorOf(level) * (distance / refDist);
    return Math.max(minSize, size * (1 - lossFrac));
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
    worldScale = 1,
}){
    return {
        id: nextId++,
        pos: { ...pos },
        vel: { x: 0, y: 0 },
        size,
        radius: technicalRadiusOf(size, worldScale),
        facing: 1,          // 1 = right, -1 = left
        mode: 'cruise',
        speedLevel: 0,
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
// @ds:9ce87fee
// contract: fish.integrateMotion  (v += a*dt; v = drag(v); p += v*dt)
export function integrate(fish, accel, world, dt){
    fish.age += dt;
    const worldScale = Math.max(1e-6, world?.scale || 1);
    const level = normalizeSpeedLevel(fish.speedLevel);
    const thrusting = level > 0 && len(accel) > 1e-6;
    const previousSpeed = len(fish.vel);
    if( thrusting ){
        // Speed tunables are expressed in game pixels per second; positions
        // are stored in the fixed technical grid.
        fish.vel = add(fish.vel, scale(accel, dt / worldScale));
        const speedCap = speedCapOf(fish.size, fish.ownerKind, level, fish.cruiseControl) / worldScale;
        fish.vel = clampLen(fish.vel, Math.max(speedCap, previousSpeed));
    }
    fish.vel = applyDrag(fish.vel, dt, fish.size);
    const move = scale(fish.vel, dt);
    fish.pos = add(fish.pos, move);
    const activeBurstThrust = thrusting && level >= REGIME.burstStartSpeedLevel;
    spendEnergy(fish, activeBurstThrust ? len(move) * worldScale : 0, worldScale);   // ds:f51831f5
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
// @ds:9ce87fee
// Drift (no thrust) is free; traveling 100*size with thrust => -1% size.
export function spendEnergy(fish, distance, worldScale = 1){
    if( normalizeSpeedLevel(fish.speedLevel) < REGIME.burstStartSpeedLevel || distance <= 0 ) return;
    if( fish.ownerKind === 'user' && fish.fryAge !== null && fish.fryAge !== undefined ) return; // @ds:4c7a2b91
    const minSize = fish.ownerKind === 'user' ? ENERGY.userMinSize : ENERGY.minSize;
    fish.size = sizeAfterBurstDistance(fish.size, fish.speedLevel, distance, minSize);
    fish.radius = technicalRadiusOf(fish.size, worldScale);
}

// ds:8d0ca6a8
export function updateFacing(fish){
    if( fish.vel.x > FISH.facingThreshold ) fish.facing = 1;
    else if( fish.vel.x < -FISH.facingThreshold ) fish.facing = -1;
}

// ds:d867989f
export function grow(fish, preySize, worldScale = 1){
    const gain = growSizeFromAreas(fish.size, preySize) - fish.size;
    fish.size += gain;
    fish.radius = technicalRadiusOf(fish.size, worldScale);
    fish.eatenFishCount += 1;
    fish.mouthEatenSize = Math.max(fish.mouthEatenSize, preySize);
    fish.mouthHold = Math.max(fish.mouthHold, MOUTH.holdDuration);
}

// @ds:79c1e3a5 @ds:d867989f
export function growFromNutrient(fish, areaValue, worldScale = 1){
    fish.size += Math.max(0, areaValue);
    fish.radius = technicalRadiusOf(fish.size, worldScale);
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
    const radiusPx = pixelRadiusOf(fish.size);
    return {
        x: fish.pos.x * WORLD.pixelsPerWorldUnit + fish.facing * radiusPx * 0.9,
        y: fish.pos.y * WORLD.pixelsPerWorldUnit + radiusPx * 0.05,
    };
}

function displacementWeight(dist, radius){
    if( radius <= 0 || dist >= radius ) return 0;
    return 1 - dist / radius;
}

function displaceExistingBubbles(fish, bubbles, dt, towardMouth){
    if( !Array.isArray(bubbles) || bubbles.length === 0 ) return;
    const mouth = mouthPos(fish);
    const radius = Math.max(1, pixelRadiusOf(fish.size) * EXHALE.influenceRadiusSizes);
    const sign = towardMouth ? 1 : -1;
    for( const bubble of bubbles ){
        const toMouth = sub(mouth, bubble.posPx);
        const d = len(toMouth);
        const w = displacementWeight(d, radius);
        if( w <= 0 ) continue;
        const dir = normalize(toMouth);
        const shift = scale(dir, sign * EXHALE.bubbleDisplaceSpeed * w * dt);
        bubble.posPx = add(bubble.posPx, shift);
    }
}

// @ds:a44b9d2c @fn:a9a3ed12
function makeExhaleBubble(fish, rng){
    const fishRadiusPx = pixelRadiusOf(fish.size);
    const targetRadiusPx = fishRadiusPx * BUBBLE.maxRatio * BUBBLE.displayScale;
    const mouth = mouthPos(fish);
    const red = rng() < (fish.exhale.redRatio || 0);
    const bubble = {
        sourceFishId: fish.id,
        posPx: {
            x: mouth.x - fish.facing * fishRadiusPx * 0.5,
            y: mouth.y,
        },
        radiusPx: 0,
        targetRadiusPx,
        velPx: {
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
