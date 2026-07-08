// imp/web-canvas/src/prey.js
// Implements: prey.dsc (wanderSteer, fleeSteer[status:added], maintainPopulation, variety)
// @ds 31cb7a0d 579e4888 e699c42d e6ecfbdd 1e66d817 ad8d81d8

import { FISH, FRY, NPC, PREY, WORLD } from './constants.js';
import { v, sub, scale, normalize, dist, clampLen } from './vec.js';
import { growSizeFromAreas, makeFish, radiusOf } from './fish.js';
import { canBeVictimOf, estimatedAttackContactTime, isAttackContact, isEdibleBySize, nearestToroidalDelta } from './predation.js';
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
    const pos = densitySpawn ? findSafeNpcSpawn(world, nominalStartSize, rng) : edgeSpawn(world, rng);
    const fish = makeFish({
        pos,
        size: densitySpawn ? FRY.startSize : nominalStartSize,
        hue: 30 + rng() * 60,
        ownerKind: 'npc',
        npcRole: 'prey',
        fryAge: densitySpawn ? 0 : null,
        nominalStartSize,
        courage: densitySpawn ? assignNpcCourage(world, rng) : NPC.courageBase,
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

// @ds:7ba4084c @ds:e29aeb93
export function findSafeNpcSpawn(world, nominalStartSize, rng){
    let bestSafe = null;
    let bestSafeScore = Infinity;
    let bestFallback = null;
    const samples = Math.max(WORLD.densitySamples, WORLD.densitySamples * 2);
    for( let i = 0; i < samples; i++ ){
        const pos = i === 0 ? findLowestDensitySpawn(world, rng) : v(rng() * world.width, rng() * world.height);
        const candidate = spawnCandidate(pos, nominalStartSize);
        const densityScore = wrapAwareDensityScore(world, pos);
        const risk = spawnAttackRisk(world, candidate);
        if( !risk.risky && densityScore < bestSafeScore ){
            bestSafe = pos;
            bestSafeScore = densityScore;
        }
        if(
            !bestFallback
            || risk.time > bestFallback.risk.time
            || (risk.time === bestFallback.risk.time && densityScore < bestFallback.densityScore)
        ){
            bestFallback = { pos, densityScore, risk };
        }
    }
    return bestSafe || bestFallback?.pos || findLowestDensitySpawn(world, rng);
}

function spawnCandidate(pos, nominalStartSize){
    return {
        id: -1,
        pos,
        vel: v(0, 0),
        size: nominalStartSize,
        radius: radiusOf(nominalStartSize),
        ownerKind: 'npc',
        npcRole: 'prey',
        mode: 'cruise',
        facing: 1,
    };
}

function wrapAwareDensityScore(world, pos){
    let score = 0;
    for( const other of world.fish || [] ){
        const delta = nearestToroidalDelta(pos, other.pos, world);
        score += 1 / Math.max(80, Math.hypot(delta.x, delta.y));
    }
    return score;
}

function spawnAttackRisk(world, candidate){
    let risky = false;
    let bestTime = Infinity;
    for( const other of world.fish || [] ){
        if( !isEdibleBySize(other, candidate) || !canBeVictimOf(other, candidate) ) continue;
        const predator = burstCapablePredator(other, candidate, world);
        const time = estimatedAttackContactTime(predator, candidate, world);
        bestTime = Math.min(bestTime, time);
        if( isAttackContact(predator, candidate, world) || time < 0.75 ) risky = true;
    }
    return { risky, time: Number.isFinite(bestTime) ? bestTime : Infinity };
}

function burstCapablePredator(fish, candidate, world){
    const speed = Math.hypot(fish.vel?.x || 0, fish.vel?.y || 0);
    if( speed > 1e-3 ) return { ...fish, mode: 'burst' };
    const delta = nearestToroidalDelta(fish.pos, candidate.pos, world);
    const direction = normalize(delta);
    return {
        ...fish,
        mode: 'burst',
        vel: scale(direction.x || direction.y ? direction : v(fish.facing || 1, 0), FISH.minBurstSpeed),
    };
}

// @ds:e29aeb93
export function assignNpcCourage(world, rng){
    world.npcSpawnCount = (world.npcSpawnCount || 0) + 1;
    if( world.npcSpawnCount % NPC.courageRandomEvery === 0 ) return rng() * 100;
    const liveNpc = (world.fish || []).filter(fish => fish.ownerKind === 'npc' && Number.isFinite(fish.courage));
    const average = liveNpc.length
        ? liveNpc.reduce((sum, fish) => sum + fish.courage, 0) / liveNpc.length
        : NPC.courageBase;
    return clamp(average + (rng() * 2 - 1) * NPC.courageJitter, 0, 100);
}

// @ds:d0ef4576 @ds:e29aeb93 @ds:d867989f @ds:98224ab9
export function chooseNpcIntent(self, world, rng, dt){
    const nearestThreat = findNearestThreat(self, world);
    const selectedPrey = findSelectedPrey(self, world);
    if( !nearestThreat && selectedPrey ) return pursueIntent(self, selectedPrey, world);
    if( !nearestThreat ) return preySteer(self, world.fish || [], dt, rng);

    const incomingTime = estimatedAttackContactTime(burstCapablePredator(nearestThreat, self, world), self, world);
    if( selectedPrey ){
        const ownTime = estimatedAttackContactTime(burstCapablePredator(self, selectedPrey, world), selectedPrey, world);
        const postEatSize = growSizeFromAreas(self.size, selectedPrey.size);
        const postEatSelf = { ...self, size: postEatSize, radius: radiusOf(postEatSize) };
        if( ownTime <= incomingTime && !isEdibleBySize(nearestThreat, postEatSelf) ){
            return pursueIntent(self, selectedPrey, world);
        }
    }

    const courageRoll = rng() * 100;
    if( selectedPrey && (self.courage ?? NPC.courageBase) >= courageRoll && incomingTime > 0.25 ){
        return pursueIntent(self, selectedPrey, world);
    }
    return fleeFromThreat(self, nearestThreat, world);
}

function findNearestThreat(self, world){
    let nearest = null;
    let nearestDistance = Infinity;
    for( const candidate of world.fish || [] ){
        if( candidate === self ) continue;
        if( !isEdibleBySize(candidate, self) || !canBeVictimOf(candidate, self) ) continue;
        const delta = nearestToroidalDelta(self.pos, candidate.pos, world);
        const distance = Math.hypot(delta.x, delta.y);
        if( distance < nearestDistance ){
            nearest = candidate;
            nearestDistance = distance;
        }
    }
    return nearest;
}

function findSelectedPrey(self, world){
    let selected = null;
    let selectedDistance = PREY.fleeRadius;
    for( const candidate of world.fish || [] ){
        if( candidate === self ) continue;
        if( !isEdibleBySize(self, candidate) || !canBeVictimOf(self, candidate) ) continue;
        const delta = nearestToroidalDelta(self.pos, candidate.pos, world);
        const distance = Math.hypot(delta.x, delta.y);
        if( distance < selectedDistance ){
            selected = candidate;
            selectedDistance = distance;
        }
    }
    return selected;
}

function pursueIntent(self, target, world){
    const toward = normalize(nearestToroidalDelta(self.pos, target.pos, world));
    return {
        accel: scale(toward, PREY.fleeAccel),
        mode: 'burst',
    };
}

function fleeFromThreat(self, threat, world){
    const away = normalize(scale(nearestToroidalDelta(self.pos, threat.pos, world), -1));
    return {
        accel: scale(away, PREY.fleeAccel),
        mode: 'burst',
    };
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

function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
}
