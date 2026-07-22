// Server-owned shred mechanics.
// @ds e13d7a52 7c2f91ad 918d4b63 d5e7a01c 0b8e71d4 3ad65f20 8b62d9ce c14f7a08 9e4c1b7a b6f08d21 4d7c2e93 f0a6c5d8 a2d5936f ed2b4f19 d3187816 31a8f5c2 fb0f32c4 eccfca7e

import { FISH, WORLD, SHRED } from './constants.js';
import { nearestToroidalDelta } from './predation.js';
import { canAddControlledObjects, wrapPoint } from './world.js';
import { buildFlowField, sampleFlowField } from './flow.js';

const DEFAULT_NPC_COLOR = '#d6b84f';

export function spawnShredsFromFish(world, fish, rng){
    if( !world.shreds ) world.shreds = [];
    const random = typeof rng === 'function' ? rng : Math.random;
    const deadArea = Math.PI * Math.max(0, fish.radius || 0) ** 2;
    let remainingArea = deadArea * SHRED.areaRatio;
    const sourceColor = sourceColorForFish(fish);
    const created = [];
    let guard = 0;

    while( remainingArea > minShredArea(world.scale) * 0.35 && guard < 500 ){
        if( !canAddControlledObjects(world, 1) ) return created;
        const sampledSize = technicalDiameterFromPixelDiameter(sampleShredDiameterPx(random), world.scale);
        const sampledArea = circleAreaFromDiameter(sampledSize);
        const geometricArea = Math.min(remainingArea, sampledArea);
        const size = diameterFromCircleArea(geometricArea);
        const shred = makeShred(world, fish, size, geometricArea, sourceColor, random);
        world.shreds.push(shred);
        created.push(shred);
        remainingArea -= geometricArea;
        guard++;
    }

    if( remainingArea > 1e-3 && canAddControlledObjects(world, 1) ){
        const size = diameterFromCircleArea(remainingArea);
        const shred = makeShred(world, fish, size, remainingArea, sourceColor, random);
        world.shreds.push(shred);
        created.push(shred);
    }
    return created;
}

// @fix:7c8d9e0f
export function spawnTestShreds(world, amount, rng = Math.random){
    const created = [];
    const target = Math.max(0, Math.floor(Number(amount) || 0));
    while( created.length < target && canAddControlledObjects(world, 1) ){
        const remaining = target - created.length;
        const groupAmount = Math.min(remaining, 8 + Math.floor(rng() * 17));
        const groupSize = 15 + rng() * 20;
        const fish = {
            pos: { x: rng() * world.width, y: rng() * world.height },
            radius: FISH.nominalStartDiameter * Math.sqrt(groupSize) / 2 / Math.max(1e-6, world.scale || 1),
        };
        for( let i = 0; i < groupAmount && created.length < target && canAddControlledObjects(world, 1); i++ ){
            const sampledSize = technicalDiameterFromPixelDiameter(sampleShredDiameterPx(rng), world.scale);
            const geometricArea = circleAreaFromDiameter(sampledSize);
            const shred = makeShred(world, fish, sampledSize, geometricArea, DEFAULT_NPC_COLOR, rng);
            world.shreds.push(shred);
            created.push(shred);
        }
    }
    return created;
}

function makeShred(world, fish, size, geometricArea, sourceColor, rng){
    const angle = rng() * Math.PI * 2;
    const scatter = Math.max(0, fish.radius || 0) * SHRED.scatterRadiusRatio * Math.sqrt(rng());
    const speed = SHRED.initialSpeedMin + rng() * (SHRED.initialSpeedMax - SHRED.initialSpeedMin);
    return {
        id: nextShredId(world),
        pos: wrapPoint({
            x: fish.pos.x + Math.cos(angle) * scatter,
            y: fish.pos.y + Math.sin(angle) * scatter,
        }, world),
        vel: {
            x: Math.cos(angle) * speed,
            y: Math.sin(angle) * speed,
        },
        size,
        radius: size / 2,
        geometricArea,
        initialGeometricArea: geometricArea,
        sourceColor,
        remainingLayers: SHRED.layerOrder.flat(),
        decayAge: 0,
        drag: SHRED.dragMin + rng() * (SHRED.dragMax - SHRED.dragMin),
        visualSeed: rng(),
    };
}

function nextShredId(world){
    world.nextShredId = (world.nextShredId || 1) + 1;
    return world.nextShredId - 1;
}

function sampleShredDiameterPx(rng){
    const startDiameterPx = FISH.nominalStartDiameter * WORLD.pixelsPerWorldUnit;
    const minSize = startDiameterPx * SHRED.minDiameterRatio;
    const maxSize = startDiameterPx * SHRED.maxDiameterRatio;
    const span = Math.max(0, maxSize - minSize);
    const biased = Math.pow(rng(), SHRED.fragmentation);
    const jitter = 1 + (rng() * 2 - 1) * SHRED.sizeJitter;
    return clamp(minSize + span * biased * jitter, minSize, maxSize);
}

function minShredArea(worldScale = 1){
    const minDiameterPx = FISH.nominalStartDiameter * WORLD.pixelsPerWorldUnit * SHRED.minDiameterRatio;
    return circleAreaFromDiameter(technicalDiameterFromPixelDiameter(minDiameterPx, worldScale));
}

function baseFishArea(){
    const radius = FISH.nominalStartDiameter / 2;
    return Math.PI * radius * radius;
}

function technicalDiameterFromPixelDiameter(diameter, worldScale = 1){
    return Math.max(0, diameter) / WORLD.pixelsPerWorldUnit / Math.max(1e-6, worldScale);
}

function circleAreaFromDiameter(diameter){
    const radius = Math.max(0, diameter) / 2;
    return Math.PI * radius * radius;
}

function diameterFromCircleArea(area){
    return 2 * Math.sqrt(Math.max(0, area) / Math.PI);
}

function sourceColorForFish(fish){
    if( fish.npcRole === 'abandoned-user-fish' && fish.formerUserColor ) return fish.formerUserColor;
    if( fish.userColor ) return fish.userColor;
    return DEFAULT_NPC_COLOR;
}

// @ds:8b62d9ce @ds:d3187816
export function advanceShreds(world, dt){
    const shreds = world.shreds || [];
    const flowField = buildFlowField(world);
    world.flowField = flowField;
    updateShredDensityLimit(world, dt);
    for( let i = shreds.length - 1; i >= 0; i-- ){
        const shred = shreds[i];
        applyFlowField(shred, flowField, world, dt);
        const drag = Math.exp(-Math.max(0, shred.drag || 0) * dt);
        shred.vel.x *= drag;
        shred.vel.y *= drag;
        if( Math.hypot(shred.vel.x, shred.vel.y) < SHRED.restSpeed ){
            shred.vel.x = 0;
            shred.vel.y = 0;
        }
        shred.pos.x += shred.vel.x * dt;
        shred.pos.y += shred.vel.y * dt;
        wrapPoint(shred.pos, world);
        if( advanceShredDecay(world, shred, dt) ){
            shreds.splice(i, 1);
        }
    }
}

// @fix:6a7b8c9d
function applyFlowField(shred, flowField, world, dt){
    const flow = sampleFlowField(flowField, shred.pos, world);
    shred.vel.x += flow.x * dt;
    shred.vel.y += flow.y * dt;
}

// @ds:d3187816 @ds:31a8f5c2
function advanceShredDecay(world, shred, dt){
    const interval = Math.max(0, SHRED.decayIntervalSeconds || 0);
    if( interval <= 0 ) return false;
    shred.decayAge = (shred.decayAge || 0) + Math.max(0, dt);
    while( shred.decayAge >= interval ){
        shred.decayAge -= interval;
        if( currentShredDensity(world) < (world.shredDensityLimit ?? SHRED.densityLimitBase) ) continue;
        const group = nextLayerGroup(shred);
        if( group.length === 0 || isFinalLayerGroup(group) ) return true;
        shred.remainingLayers = (shred.remainingLayers || []).filter(layer => !group.includes(layer));
    }
    return false;
}

// @ds:31a8f5c2
function updateShredDensityLimit(world, dt){
    const base = Math.max(0, SHRED.densityLimitBase || 0);
    const current = Number.isFinite(world.shredDensityLimit) ? world.shredDensityLimit : base;
    const rate = Math.max(0, SHRED.densityLimitSmoothRate || 0);
    const t = Math.min(1, rate * Math.max(0, dt));
    world.shredDensityLimit = current + (base - current) * t;
}

function currentShredDensity(world){
    const area = Math.max(1, (world.width || 0) * (world.height || 0));
    return (world.shreds?.length || 0) / area;
}

// @ds:fb0f32c4
export function refreshShredDecay(shred){
    if( shred ) shred.decayAge = 0;
}

// @ds:c14f7a08 @ds:3ad65f20
export function canEatShred(fish, shred, world){
    const speed = Math.hypot(fish.vel?.x || 0, fish.vel?.y || 0);
    if( speed < SHRED.minFeedingSpeed ) return false;
    if( (fish.radius || 0) * 2 < (shred.radius || 0) * 2 * SHRED.eatSizeRatio ) return false;
    const delta = nearestToroidalDelta(fish.pos, shred.pos, world);
    return Math.hypot(delta.x, delta.y) <= (fish.radius || 0) + (shred.radius || 0);
}

// @ds:9e4c1b7a @ds:b6f08d21 @ds:4d7c2e93 @ds:f0a6c5d8 @ds:f2ad71c9
export function shredCandidateNutrition(fish, shred){
    const group = nextLayerGroup(shred);
    if( group.length === 0 ) return null;
    const layerFraction = group.reduce((sum, layer) => sum + (SHRED.layerFractions[layer] || 0), 0);
    const factor = groupNeedsColorFactor(group) ? colorNutritionFactor(fishColor(fish), shred.sourceColor) : 1;
    const swallowedArea = ((shred.geometricArea || 0) / baseFishArea()) * layerFraction;
    return {
        group,
        swallowedArea,
        nutrition: swallowedArea * SHRED.nutritionMultiplier * factor,
    };
}

// @ds:9e4c1b7a @ds:a2d5936f @ds:fb0f32c4
export function consumeShredLayer(fish, shred, group){
    refreshShredDecay(shred);
    shred.remainingLayers = (shred.remainingLayers || []).filter(layer => !group.includes(layer));
    fish.shredEatCueCounter = (fish.shredEatCueCounter || 0) + 1;
    return true;
}

function nextLayerGroup(shred){
    const remaining = new Set(shred.remainingLayers || []);
    for( const group of SHRED.layerOrder ){
        if( group.some(layer => remaining.has(layer)) ) return group.filter(layer => remaining.has(layer));
    }
    return [];
}

function groupNeedsColorFactor(group){
    return group.includes('part_30_percents') || group.includes('part_30_percents_main_color');
}

function isFinalLayerGroup(group){
    const finalGroup = SHRED.layerOrder[SHRED.layerOrder.length - 1] || [];
    return group.length > 0 && group.every(layer => finalGroup.includes(layer));
}

function fishColor(fish){
    if( fish.ownerKind === 'user' && fish.userColor ) return fish.userColor;
    if( fish.npcRole === 'abandoned-user-fish' && fish.formerUserColor ) return fish.formerUserColor;
    if( fish.userColor ) return fish.userColor;
    return DEFAULT_NPC_COLOR;
}

function colorNutritionFactor(fishColorValue, shredColorValue){
    const fish = parseColorToHsv(fishColorValue);
    const shred = parseColorToHsv(shredColorValue);
    if( !fish || !shred ) return SHRED.colorFactorMaxDifferent;
    if( normalizeColorString(fishColorValue) === normalizeColorString(shredColorValue) ) return 1;
    const hueDistance = Math.abs(fish.h - shred.h);
    const hueSimilarity = 1 - Math.min(hueDistance, 360 - hueDistance) / 180;
    const saturationSimilarity = 1 - Math.abs(fish.s - shred.s);
    const similarity = clamp(
        SHRED.hueWeight * hueSimilarity + SHRED.saturationWeight * saturationSimilarity,
        0,
        1,
    );
    return SHRED.colorFactorMin + (SHRED.colorFactorMaxDifferent - SHRED.colorFactorMin) * similarity;
}

function parseColorToHsv(value){
    const text = String(value || '').trim().toLowerCase();
    if( text.startsWith('#') ) return rgbToHsv(hexToRgb(text));
    const hslMatch = /^hsl\(([-\d.]+),\s*([-\d.]+)%?,\s*([-\d.]+)%?\)$/.exec(text);
    if( hslMatch ){
        const h = ((Number(hslMatch[1]) % 360) + 360) % 360;
        const s = clamp(Number(hslMatch[2]) / 100, 0, 1);
        const l = clamp(Number(hslMatch[3]) / 100, 0, 1);
        return rgbToHsv(hslToRgb(h, s, l));
    }
    return null;
}

function hexToRgb(value){
    const hex = value.replace(/^#/, '').padEnd(6, '0').slice(0, 6);
    return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
    };
}

function hslToRgb(h, s, l){
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if( hp < 1 ) [r, g, b] = [c, x, 0];
    else if( hp < 2 ) [r, g, b] = [x, c, 0];
    else if( hp < 3 ) [r, g, b] = [0, c, x];
    else if( hp < 4 ) [r, g, b] = [0, x, c];
    else if( hp < 5 ) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const m = l - c / 2;
    return { r: r + m, g: g + m, b: b + m };
}

function rgbToHsv({ r, g, b }){
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    if( delta > 0 ){
        if( max === r ) h = 60 * (((g - b) / delta) % 6);
        else if( max === g ) h = 60 * ((b - r) / delta + 2);
        else h = 60 * ((r - g) / delta + 4);
    }
    return {
        h: (h + 360) % 360,
        s: max === 0 ? 0 : delta / max,
        v: max,
    };
}

function normalizeColorString(value){
    return String(value || '').trim().toLowerCase();
}

function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
}
