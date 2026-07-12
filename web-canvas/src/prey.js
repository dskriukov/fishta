// imp/web-canvas/src/prey.js
// Implements: prey.dsc (wanderSteer, fleeSteer[status:added], maintainPopulation, variety)
// @ds 31cb7a0d 579e4888 e699c42d e6ecfbdd 1e66d817 ad8d81d8 92d5b0c1 7cb92a44 4f58a1cd c6d7e8f9

import { FISH, FRY, NPC, PREDATION, PREY, WORLD } from './constants.js';
import { v, add, sub, scale, normalize, dist, clampLen } from './vec.js';
import { growSizeFromAreas, makeFish, technicalRadiusOf } from './fish.js';
import { canBeVictimOf, estimatedAttackContactTime, isAttackContact, isEdibleBySize, nearestToroidalDelta } from './predation.js';
import { spawnShredsFromFish } from './shred.js';
import { findLowestDensitySpawn, isOldAgeSuspended, targetNpcCount } from './world.js';

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
        worldScale: world.scale,
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
        const candidate = spawnCandidate(pos, nominalStartSize, world.scale);
        const densityScore = wrapAwareDensityScore(world, pos);
        const risk = spawnAttackRisk(world, candidate);
        if( !risk.risky && densityScore < bestSafeScore ){
            bestSafe = pos;
            bestSafeScore = densityScore;
        }
        if(
            !bestFallback
            || risk.immediate < bestFallback.risk.immediate
            || (risk.immediate === bestFallback.risk.immediate && risk.time > bestFallback.risk.time)
            || (risk.immediate === bestFallback.risk.immediate && risk.time === bestFallback.risk.time && densityScore < bestFallback.densityScore)
        ){
            bestFallback = { pos, densityScore, risk };
        }
    }
    return bestSafe || bestFallback?.pos || findLowestDensitySpawn(world, rng);
}

function spawnCandidate(pos, nominalStartSize, worldScale = 1){
    const spawnSize = FRY.startSize;
    return {
        id: -1,
        pos,
        vel: v(0, 0),
        size: spawnSize,
        radius: technicalRadiusOf(spawnSize, worldScale),
        nominalStartSize,
        fryAge: 0,
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
    let immediate = 0;
    let bestTime = Infinity;
    for( const other of world.fish || [] ){
        if( !isEdibleBySize(other, candidate) || !canBeVictimOf(other, candidate) ) continue;
        const predator = spawnThreatPredator(other, candidate, world);
        const time = estimatedAttackContactTime(predator, candidate, world);
        bestTime = Math.min(bestTime, time);
        const contactGap = spawnContactGap(predator, candidate, world);
        const attackGap = spawnAttackGap(predator, candidate, world);
        if( contactGap <= 0 ) immediate = Math.max(immediate, 2);
        else if( attackGap <= 0 ) immediate = Math.max(immediate, 1);
        if( contactGap <= 0 || attackGap <= 0 || isAttackContact(predator, candidate, world) || time < minSpawnLeadTime() ) risky = true;
    }
    return { risky, immediate, time: Number.isFinite(bestTime) ? bestTime : Infinity };
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

function spawnThreatPredator(fish, candidate, world){
    const delta = nearestToroidalDelta(fish.pos, candidate.pos, world);
    const direction = normalize(delta);
    const currentSpeed = Math.hypot(fish.vel?.x || 0, fish.vel?.y || 0);
    const speed = Math.max(currentSpeed, FISH.minBurstSpeed);
    return {
        ...fish,
        mode: 'burst',
        vel: scale(direction.x || direction.y ? direction : v(fish.facing || 1, 0), speed),
    };
}

function spawnContactGap(predator, candidate, world){
    const delta = nearestToroidalDelta(predator.pos, candidate.pos, world);
    return Math.hypot(delta.x, delta.y) - ((predator.radius || 0) + (candidate.radius || 0));
}

function spawnAttackGap(predator, candidate, world){
    const contactDistance = (predator.radius || 0) + (candidate.radius || 0);
    return spawnContactGap(predator, candidate, world) - contactDistance * PREDATION.attackReachRatio;
}

function minSpawnLeadTime(){
    return Math.max(0.25, NPC.decisionIntervalSeconds * 2);
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
    if( !nearestThreat && selectedPrey ) return pursueIntent(self, selectedPrey, world, dt, rng);
    if( !nearestThreat ) return wanderIntent(self, dt, rng);

    const incomingTime = estimatedAttackContactTime(burstCapablePredator(nearestThreat, self, world), self, world);
    if( selectedPrey ){
        const ownTime = estimatedAttackContactTime(burstCapablePredator(self, selectedPrey, world), selectedPrey, world);
        const postEatSize = growSizeFromAreas(self.size, selectedPrey.size);
        const postEatSelf = { ...self, size: postEatSize, radius: technicalRadiusOf(postEatSize, world.scale) };
        if( ownTime <= incomingTime && !isEdibleBySize(nearestThreat, postEatSelf) ){
            return pursueIntent(self, selectedPrey, world, dt, rng);
        }
    }

    const courageRoll = rng() * 100;
    if( selectedPrey && (self.courage ?? NPC.courageBase) >= courageRoll && incomingTime > 0.25 ){
        return pursueIntent(self, selectedPrey, world, dt, rng);
    }
    return fleeFromThreat(self, world, dt, rng);
}

// @ds:a6c9e8b4 @ds:e13d7a52 @ds:d140effd
export function expireOldNpcFish(world, rng){
    if( isOldAgeSuspended(world) ) return;
    const fish = world.fish || [];
    for( let i = fish.length - 1; i >= 0; i-- ){
        const candidate = fish[i];
        if( candidate.ownerKind !== 'npc' || (candidate.age || 0) < NPC.maxLifetimeSeconds ) continue;
        fish.splice(i, 1);
        spawnShredsFromFish(world, candidate, rng);
    }
}

function wanderIntent(self, dt, rng){
    const accel = wanderSteer(self, dt, rng);
    return {
        accel: smoothNpcSteering(self, normalize(accel), Math.hypot(accel.x, accel.y), dt),
        mode: 'cruise',
    };
}

function findNearestThreat(self, world){
    let nearest = null;
    let nearestDistance = Infinity;
    for( const candidate of potentialThreatsFor(self, world) ){
        const delta = nearestToroidalDelta(self.pos, candidate.pos, world);
        const distance = Math.max(0, Math.hypot(delta.x, delta.y) - (self.radius || 0) - (candidate.radius || 0));
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

function pursueIntent(self, target, world, dt, rng){
    const toward = normalize(nearestToroidalDelta(self.pos, target.pos, world));
    const steering = chooseDangerAwareDirection(self, world, toward, 'hunt', dt, rng);
    return {
        accel: smoothNpcSteering(self, steering.direction, PREY.fleeAccel, dt),
        mode: 'burst',
    };
}

function fleeFromThreat(self, world, dt, rng){
    const steering = chooseDangerAwareDirection(self, world, null, 'flee', dt, rng);
    return {
        accel: smoothNpcSteering(self, steering.direction, PREY.fleeAccel, dt),
        mode: 'burst',
    };
}

// @ds:92d5b0c1 @ds:7cb92a44 @ds:4f58a1cd @ds:c6d7e8f9 @ia:8a4b2f19
export function chooseDangerAwareDirection(self, world, baseDirection, mode, dt, rng){
    const state = self.steerDecision || {};
    const normalizedBase = normalize(baseDirection || currentDirection(self));
    const sameMode = state.mode === mode;
    state.nextIn = Math.max(0, (state.nextIn ?? 0) - dt);
    if( sameMode && state.desired && state.nextIn > 0 ){
        self.steerDecision = state;
        return { direction: state.desired, dangerScore: state.dangerScore ?? 0 };
    }

    const threats = potentialThreatsFor(self, world);
    let bestDirection = normalizedBase.x || normalizedBase.y ? normalizedBase : v(1, 0);
    let bestScore = dangerScoreForDirection(self, bestDirection, threats, world);
    for( const direction of candidateDirections(bestDirection, mode) ){
        const score = dangerScoreForDirection(self, direction, threats, world);
        if( score < bestScore ){
            bestScore = score;
            bestDirection = direction;
        }
    }

    state.mode = mode;
    state.desired = bestDirection;
    state.dangerScore = bestScore;
    state.nextIn = NPC.decisionIntervalSeconds * (0.75 + rng() * 0.5);
    self.steerDecision = state;
    return { direction: bestDirection, dangerScore: bestScore };
}

export function dangerScoreForDirection(self, direction, threats, world){
    const dir = normalize(direction);
    if( !dir.x && !dir.y ) return Infinity;
    const projection = NPC.dangerProjectionDistancePx;
    let score = 0;
    for( const threat of threats ){
        const toThreat = nearestToroidalDelta(self.pos, threat.pos, world);
        const centerDistance = Math.hypot(toThreat.x, toThreat.y);
        const contactDistance = (self.radius || 0) + (threat.radius || 0) * NPC.dangerRadiusWeight;
        if( centerDistance - contactDistance > NPC.threatSenseRadius + projection ) continue;

        const segmentDistance = distanceToSegment(toThreat, v(0, 0), scale(dir, projection));
        const contactGap = segmentDistance - contactDistance;
        const attackReach = contactDistance * (1 + PREDATION.attackReachRatio);
        const attackGap = segmentDistance - attackReach;
        const distanceBias = 1 / Math.max(1, centerDistance - contactDistance);

        score += threat.radius * NPC.dangerRadiusWeight * distanceBias;
        score += proximityScore(contactGap, NPC.dangerContactWeight);
        score += proximityScore(attackGap, NPC.dangerAttackReachWeight);
    }
    return score;
}

export function smoothNpcSteering(self, targetDirection, targetAccel, dt){
    const state = self.steerDecision || {};
    const current = normalize(state.smoothedDirection || currentDirection(self));
    const target = normalize(targetDirection);
    const maxTurn = NPC.maxTurnRateDegPerSecond * Math.PI / 180 * dt;
    const direction = rotateToward(current.x || current.y ? current : target, target, maxTurn);
    const desiredAccel = scale(direction, targetAccel);
    const response = clamp(NPC.accelResponsePerSecond * dt, 0, 1);
    const previousAccel = state.accel || v(0, 0);
    const accel = add(scale(previousAccel, 1 - response), scale(desiredAccel, response));
    state.smoothedDirection = direction;
    state.accel = accel;
    self.steerDecision = state;
    return accel;
}

function potentialThreatsFor(self, world){
    const threats = [];
    for( const candidate of world.fish || [] ){
        if( candidate === self ) continue;
        if( !isEdibleBySize(candidate, self) || !canBeVictimOf(candidate, self) ) continue;
        const delta = nearestToroidalDelta(self.pos, candidate.pos, world);
        const distance = Math.max(0, Math.hypot(delta.x, delta.y) - (self.radius || 0) - (candidate.radius || 0));
        if( distance <= NPC.threatSenseRadius ) threats.push(candidate);
    }
    return threats;
}

function candidateDirections(baseDirection, mode){
    const samples = Math.max(3, NPC.dangerDirectionSamples);
    const baseAngle = Math.atan2(baseDirection.y, baseDirection.x);
    const directions = [];
    if( mode === 'hunt' ){
        const limit = NPC.huntDangerCorrectionDeg * Math.PI / 180;
        const huntSamples = Math.max(3, Math.ceil(samples / 3) | 1);
        for( let i = 0; i < huntSamples; i++ ){
            const t = huntSamples === 1 ? 0.5 : i / (huntSamples - 1);
            directions.push(angleVector(baseAngle - limit + t * limit * 2));
        }
        return directions;
    }
    for( let i = 0; i < samples; i++ ){
        directions.push(angleVector((Math.PI * 2 * i) / samples));
    }
    return directions;
}

function currentDirection(self){
    const velocity = normalize(self.vel || v(0, 0));
    if( velocity.x || velocity.y ) return velocity;
    const heading = normalize(self.heading || v(0, 0));
    if( heading.x || heading.y ) return heading;
    return v(self.facing || 1, 0);
}

function distanceToSegment(point, start, end){
    const segment = sub(end, start);
    const lengthSq = segment.x * segment.x + segment.y * segment.y;
    if( lengthSq <= 1e-6 ) return Math.hypot(point.x - start.x, point.y - start.y);
    const t = clamp(((point.x - start.x) * segment.x + (point.y - start.y) * segment.y) / lengthSq, 0, 1);
    const closest = add(start, scale(segment, t));
    return Math.hypot(point.x - closest.x, point.y - closest.y);
}

function proximityScore(gap, weight){
    if( gap <= 0 ) return weight * (1000 + Math.abs(gap) * 10);
    return weight * 100 / (gap + 10);
}

function rotateToward(current, target, maxAngle){
    const from = normalize(current);
    const to = normalize(target);
    if( !to.x && !to.y ) return from;
    if( !from.x && !from.y ) return to;
    const delta = Math.atan2(from.x * to.y - from.y * to.x, from.x * to.x + from.y * to.y);
    const step = clamp(delta, -maxAngle, maxAngle);
    const angle = Math.atan2(from.y, from.x) + step;
    return angleVector(angle);
}

function angleVector(angle){
    return v(Math.cos(angle), Math.sin(angle));
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
export function advanceFryGrowth(fish, dt, worldScale = 1){
    if( fish.fryAge === null || fish.fryAge === undefined ) return;
    fish.fryAge = Math.min(FRY.growthSeconds, fish.fryAge + dt);
    const t = fish.fryAge / FRY.growthSeconds;
    fish.size = FRY.startSize + (fish.nominalStartSize - FRY.startSize) * t;
    fish.radius = technicalRadiusOf(fish.size, worldScale);
    if( fish.fryAge >= FRY.growthSeconds ) fish.fryAge = null;
}

// @ia 2d3e4f5a
// @ds:d4f6a1c2
// @ds:9ce87fee
export function capPreySpeed(p, previousSpeed = PREY.maxSpeed, worldScale = 1){
    const scaleFactor = Math.max(1e-6, worldScale || 1);
    p.vel = clampLen(p.vel, Math.max(PREY.maxSpeed / scaleFactor, previousSpeed));
}

function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
}
