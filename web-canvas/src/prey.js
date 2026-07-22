// imp/web-canvas/src/prey.js
// Implements: prey.dsc (wanderSteer, fleeSteer[status:added], maintainPopulation, variety)
// @ds 31cb7a0d 579e4888 e699c42d e6ecfbdd 1e66d817 ad8d81d8 92d5b0c1 7cb92a44 4f58a1cd c6d7e8f9 7d9f5b31 8f1a2c3d 9b4e6d7f 4e7a9c2d
// @ia 6c5e4b2a 7a6b5c4d 5b8d1f6a

import { ENERGY, FISH, FRY, GROWTH, NPC, PERCEPTION, PREDATION, PREY, REGIME, SHRED, WORLD } from './constants.js';
import { v, add, sub, scale, normalize, dist, clampLen } from './vec.js';
import { burstEnergyFactorOf, growSizeFromAreas, makeFish, speedCapOf, technicalRadiusOf } from './fish.js';
import { canBeVictimOf, estimatedAttackContactTime, isAttackContact, isEdibleBySize, nearestToroidalDelta } from './predation.js';
import { shredCandidateNutrition, spawnShredsFromFish } from './shred.js';
import { queryInteractionCandidates, recordDirectionDanger, sampleDangerRaster } from './perception.js';
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
        reverseFacing: false,
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

// @ds:d0ef4576 @ds:e29aeb93 @ds:d867989f @ds:98224ab9 @ds:8f1a2c3d @ds:9b4e6d7f @ds:4e7a9c2d @ia:7a6b5c4d @ia:5b8d1f6a
export function chooseNpcIntent(self, world, rng, dt){
    const nearestThreat = findNearestThreat(self, world);
    const selectedFood = findSelectedFood(self, world);
    if( selectedFood && nearestThreat ){
        const compromise = tryCompromiseHunt(self, selectedFood.target, world, dt, rng);
        if( compromise ) return compromise;
    }
    if( shouldContinueFleeFear(self, world, dt) ) return fleeFromThreat(self, world, dt, rng);
    if( !nearestThreat && selectedFood ) return pursueIntent(self, selectedFood.target, world, dt, rng);
    if( !nearestThreat ) return wanderIntent(self, dt, rng);

    const incomingTime = estimatedAttackContactTime(burstCapablePredator(nearestThreat, self, world), self, world);
    if( selectedFood?.kind === 'fish' ){
        const selectedPrey = selectedFood.target;
        const ownTime = estimatedAttackContactTime(burstCapablePredator(self, selectedPrey, world), selectedPrey, world);
        const postEatSize = growSizeFromAreas(self.size, selectedPrey.size);
        const postEatSelf = { ...self, size: postEatSize, radius: technicalRadiusOf(postEatSize, world.scale) };
        if( ownTime <= incomingTime && !isEdibleBySize(nearestThreat, postEatSelf) ){
            return pursueIntent(self, selectedPrey, world, dt, rng);
        }
    }

    const courageRoll = rng() * 100;
    if( selectedFood && (self.courage ?? NPC.courageBase) >= courageRoll && incomingTime > 0.25 ){
        return pursueIntent(self, selectedFood.target, world, dt, rng);
    }
    return fleeFromThreat(self, world, dt, rng);
}

// @fix:2a7e5c19
function tryCompromiseHunt(self, target, world, dt, rng){
    const intent = pursueIntent(self, target, world, dt, rng);
    const state = self.steerDecision || {};
    const threats = potentialThreatsFor(self, world);
    const direction = state.desired || currentDirection(self);
    if( !immediateDangerForDirection(self, direction, threats, world) ) return intent;
    return null;
}

// @ds:a6c9e8b4 @ds:e13d7a52 @ds:d140effd
export function expireOldNpcFish(world, rng){
    if( isOldAgeSuspended(world) ) return;
    const now = Math.max(0, Number(world.elapsedSeconds) || 0);
    const fish = world.fish || [];
    for( let i = fish.length - 1; i >= 0; i-- ){
        const candidate = fish[i];
        if( candidate.ownerKind !== 'npc' || !Number.isFinite(candidate.lifetimeStartedAt) ) continue;
        if( (now - candidate.lifetimeStartedAt) < NPC.maxLifetimeSeconds ) continue;
        fish.splice(i, 1);
        spawnShredsFromFish(world, candidate, rng);
    }
}

function wanderIntent(self, dt, rng){
    resetFleeUrgency(self);
    if( self.steerDecision ){
        self.steerDecision.huntTarget = null;
        self.steerDecision.huntTargetKey = null;
    }
    const accel = wanderSteer(self, dt, rng);
    return {
        accel: smoothNpcSteering(self, normalize(accel), Math.hypot(accel.x, accel.y), dt),
        mode: 'cruise',
    };
}

function resetFleeUrgency(self){
    const state = self.steerDecision || {};
    state.mode = 'cruise';
    state.nextIn = 0;
    state.fleeUrgency = 0;
    state.fleeImmediateDanger = false;
    state.fleeFearActive = false;
    state.fleeFearRemaining = 0;
    state.fleeBurstLevel = REGIME.burstStartSpeedLevel;
    self.steerDecision = state;
}

function clearFleeFear(self){
    const state = self.steerDecision || {};
    state.fleeFearActive = false;
    state.fleeFearRemaining = 0;
    state.fleeBurstLevel = REGIME.burstStartSpeedLevel;
    self.steerDecision = state;
}

// @ds:4e7a9c2d @ia:5b8d1f6a
function shouldContinueFleeFear(self, world, dt){
    const state = self.steerDecision || {};
    if( !state.fleeFearActive ) return false;
    const remaining = Math.max(0, (state.fleeFearRemaining || 0) - dt);
    const nearbyThreat = findNearestThreatWithin(self, world, NPC.fleeFearReleaseDistance);
    if( remaining <= 0 && !nearbyThreat ){
        clearFleeFear(self);
        return false;
    }
    return true;
}

// @ds:4e7a9c2d
function findNearestThreatWithin(self, world, distanceLimit){
    const limit = Math.max(0, distanceLimit || 0);
    for( const threat of potentialThreatsFor(self, world) ){
        const delta = nearestToroidalDelta(self.pos, threat.pos, world);
        const distance = Math.max(0, Math.hypot(delta.x, delta.y) - (self.radius || 0) - (threat.radius || 0));
        if( distance <= limit ) return threat;
    }
    return null;
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

// @ds:8f1a2c3d @ds:9b4e6d7f @ia:7a6b5c4d
function findSelectedFood(self, world){
    const localCandidates = world.perception
        ? queryInteractionCandidates(world, self)
        : [...(world.fish || []), ...(world.shreds || [])];
    const fishTargets = [];
    const shredTargets = [];
    for( const candidate of localCandidates ){
        const delta = nearestToroidalDelta(self.pos, candidate.pos, world);
        const distance = Math.hypot(delta.x, delta.y);
        if( distance > NPC.threatSenseRadius ) continue;
        if( candidate.ownerKind !== undefined ){
            if( candidate === self || !isEdibleBySize(self, candidate) || !canBeVictimOf(self, candidate) ) continue;
            const nutrition = Math.max(0, candidate.size || 0) * GROWTH.fishAreaGainRatio;
            const cost = foodTravelEnergyCost(self, distance, world);
            const score = nutrition * NPC.foodFishSuccessFactor - cost * NPC.foodProfitMargin;
            if( score > 0 ) fishTargets.push({ kind: 'fish', target: candidate, score, distance });
            continue;
        }
        if( !isShredSizeAvailable(self, candidate) ) continue;
        const nutrition = shredCandidateNutrition(self, candidate);
        if( !nutrition ) continue;
        shredTargets.push({ shred: candidate, nutrition: nutrition.nutrition, distance });
    }

    const candidates = fishTargets.concat(groupShredTargets(self, shredTargets, world));
    let selected = null;
    for( const candidate of candidates ){
        if( !selected || candidate.score > selected.score || (candidate.score === selected.score && candidate.distance < selected.distance) ) selected = candidate;
    }
    return selected;
}

function groupShredTargets(self, entries, world){
    const remaining = entries.slice();
    const groups = [];
    while( remaining.length ){
        const seed = remaining.shift();
        const members = [seed];
        for( let i = remaining.length - 1; i >= 0; i-- ){
            const delta = nearestToroidalDelta(seed.shred.pos, remaining[i].shred.pos, world);
            if( Math.hypot(delta.x, delta.y) <= NPC.foodClusterRadius ) members.push(remaining.splice(i, 1)[0]);
        }
        let nutrition = 0;
        let weight = 0;
        let offsetX = 0;
        let offsetY = 0;
        for( const member of members ){
            nutrition += member.nutrition;
            const delta = nearestToroidalDelta(seed.shred.pos, member.shred.pos, world);
            offsetX += member.nutrition * delta.x;
            offsetY += member.nutrition * delta.y;
            weight += member.nutrition;
        }
        const center = {
            x: seed.shred.pos.x + offsetX / Math.max(1e-6, weight),
            y: seed.shred.pos.y + offsetY / Math.max(1e-6, weight),
        };
        const distance = Math.hypot(nearestToroidalDelta(self.pos, center, world).x, nearestToroidalDelta(self.pos, center, world).y);
        const cost = foodTravelEnergyCost(self, distance, world);
        const score = nutrition - cost * NPC.foodProfitMargin;
        if( score > 0 ) groups.push({ kind: 'shred', target: { pos: center, foodGroup: members.map(member => member.shred) }, score, distance });
    }
    return groups;
}

function isShredSizeAvailable(self, shred){
    return (self.radius || 0) * 2 >= (shred.radius || 0) * 2 * SHRED.eatSizeRatio;
}

function foodTravelEnergyCost(self, distance, world){
    const level = Math.max(REGIME.burstStartSpeedLevel, REGIME.npcMaxBurstLevel);
    const speed = Math.max(1, speedCapOf(self.size, 'npc', level));
    const travelSeconds = distance * Math.max(1, world.scale || 1) / speed;
    const travelledDistance = speed * travelSeconds;
    const referenceDistance = ENERGY.refSizes * Math.max(ENERGY.minSize, self.size || 0);
    return ENERGY.lossPerRef * burstEnergyFactorOf(level) * travelledDistance / Math.max(1e-6, referenceDistance);
}

// @fix:9d4e7b21
function pursueIntent(self, target, world, dt, rng){
    clearFleeFear(self);
    const state = self.steerDecision || {};
    const targetKey = huntTargetKey(target);
    const targetChanged = state.huntTargetKey !== targetKey;
    if( targetChanged || !['brake', 'inertia'].includes(state.huntStrategy) ){
        state.huntStrategy = rng() < 0.5 ? 'brake' : 'inertia';
    }
    if( targetChanged ) state.nextIn = 0;
    state.huntTargetKey = targetKey;
    state.huntTarget = target;
    self.steerDecision = state;
    const toward = huntBaseDirection(self, target, world, state.huntStrategy);
    const steering = chooseDangerAwareDirection(self, world, toward, 'hunt', dt, rng);
    const motion = huntMotionForStrategy(self, target, world, steering.direction, state.huntStrategy, dt);
    state.fleeDirection = null;
    self.steerDecision = state;
    return {
        accel: motion.acceleration,
        mode: 'burst',
        speedLevel: REGIME.npcMaxBurstLevel,
    };
}

function huntTargetKey(target){
    if( target?.ownerKind !== undefined ) return `fish:${target.id}`;
    if( target?.foodGroup ) return `shred:${target.foodGroup.map(shred => shred.id).sort((a, b) => a - b).join(',')}`;
    return target?.id === undefined ? null : `object:${target.id}`;
}

function huntBaseDirection(self, target, world, strategy){
    const delta = nearestToroidalDelta(self.pos, target.pos, world);
    if( strategy !== 'inertia' ) return normalize(delta);
    const targetVelocity = target.vel || { x: 0, y: 0 };
    const relativeVelocity = {
        x: (self.vel?.x || 0) - targetVelocity.x,
        y: (self.vel?.y || 0) - targetVelocity.y,
    };
    return normalize({
        x: delta.x - relativeVelocity.x * NPC.huntInertiaLeadSeconds,
        y: delta.y - relativeVelocity.y * NPC.huntInertiaLeadSeconds,
    });
}

function huntMotionForStrategy(self, target, world, direction, strategy, dt){
    if( strategy !== 'brake' ) return { acceleration: smoothNpcSteering(self, direction, PREY.fleeAccel, dt) };
    const targetVelocity = target.vel || { x: 0, y: 0 };
    const targetDelta = nearestToroidalDelta(self.pos, target.pos, world);
    const distance = Math.hypot(targetDelta.x, targetDelta.y);
    const contactDistance = Math.max(1, (self.radius || 0) + (target.radius || 0));
    const gap = Math.max(0, distance - contactDistance);
    const worldScale = Math.max(1e-6, world.scale || 1);
    const maxAcceleration = Math.max(1, PREY.fleeAccel / worldScale);
    const approachSpeed = Math.max(1, NPC.huntApproachSpeed / worldScale);
    const speedCap = speedCapOf(self.size, 'npc', REGIME.npcMaxBurstLevel) / worldScale;
    const desiredSpeed = Math.max(
        approachSpeed,
        Math.min(speedCap, Math.sqrt(2 * maxAcceleration * gap)),
    );
    const desiredVelocity = {
        x: targetVelocity.x + direction.x * desiredSpeed,
        y: targetVelocity.y + direction.y * desiredSpeed,
    };
    const velocityError = sub(desiredVelocity, self.vel || { x: 0, y: 0 });
    const responseSeconds = Math.max(0.12, 1 / Math.max(1, NPC.accelResponsePerSecond));
    const requestedAcceleration = clampLen(
        scale(velocityError, worldScale / responseSeconds),
        PREY.fleeAccel,
    );
    const accelerationDirection = normalize(requestedAcceleration);
    return {
        acceleration: smoothNpcSteering(
            self,
            accelerationDirection.x || accelerationDirection.y ? accelerationDirection : direction,
            Math.hypot(requestedAcceleration.x, requestedAcceleration.y),
            dt,
        ),
    };
}

// @ds:7d9f5b31 @ds:4e7a9c2d @ia:6c5e4b2a @ia:5b8d1f6a
function fleeFromThreat(self, world, dt, rng){
    const steering = chooseDangerAwareDirection(self, world, null, 'flee', dt, rng);
    const state = self.steerDecision || {};
    state.huntTarget = null;
    state.huntTargetKey = null;
    state.fleeDirection = steering.direction;
    const threats = potentialThreatsFor(self, world);
    const immediateDanger = Boolean(steering.immediateDanger && threats.length > 0);
    const urgency = Math.max(0, steering.fleeUrgency || 0);
    const burstMin = REGIME.burstStartSpeedLevel;
    const burstMax = REGIME.npcMaxBurstLevel;
    const burstTarget = Math.min(burstMax, burstMin + (urgency + 1) * NPC.fleeBurstLevelStep);
    if( !Number.isFinite(state.fleeBurstLevel) ) state.fleeBurstLevel = burstMin;
    if( immediateDanger ){
        state.fleeBurstLevel = Math.max(state.fleeBurstLevel, burstTarget);
    }else if( state.fleeFearActive ){
        state.fleeBurstLevel = Math.max(
            burstMin,
            state.fleeBurstLevel - NPC.fleeBurstRecoveryPerSecond * dt,
        );
    }else{
        state.fleeBurstLevel = burstMin;
    }
    self.steerDecision = state;
    const recovery = Math.max(1e-6, NPC.fleeFearRecoverySeconds);
    const fearFactor = state.fleeFearActive
        ? clamp((state.fleeFearRemaining || 0) / recovery, NPC.fleeFearMinAccelFactor, 1)
        : 1;
    const accelFearFactor = immediateDanger
        ? 1 + Math.min(NPC.fleeAccelFearFactor, urgency * NPC.fleeAccelFearFactor)
        : fearFactor;
    const targetAccel = Math.min(NPC.fleeAccelMax, PREY.fleeAccel * accelFearFactor);
    return {
        accel: smoothNpcSteering(self, steering.direction, targetAccel, dt),
        mode: 'burst',
        speedLevel: Math.min(burstMax, Math.max(burstMin, Math.round(state.fleeBurstLevel))),
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
        return {
            direction: state.desired,
            dangerScore: state.dangerScore ?? 0,
            immediateDanger: Boolean(state.fleeImmediateDanger),
            fleeUrgency: state.fleeUrgency || 0,
            recalculated: false,
        };
    }

    const threats = potentialThreatsFor(self, world);
    const directions = candidateDirections(bestDirectionForMode(normalizedBase, mode), mode);
    let bestDirection = normalizedBase.x || normalizedBase.y ? normalizedBase : v(1, 0);
    let bestScore = dangerScoreForDirection(self, bestDirection, threats, world);
    const baseScore = bestScore;

    let immediateDanger = false;
    if( mode === 'flee' ){
        const profiles = directions.map(direction => dangerProfileForDirection(self, direction, threats, world));
        immediateDanger = profiles.some(profile => profile.immediateDanger);
        const selected = chooseWidestSafeDirection(self, directions, profiles, threats, world, bestDirection);
        bestDirection = selected.direction;
        bestScore = selected.score;
        for( let index = 0; index < directions.length; index++ ){
            if( profiles[index].immediateDanger || profiles[index].score > bestScore ){
                recordRejectedDirection(self, directions[index], threats, world, profiles[index].score);
            }
        }
    }else{
        const scores = [];
        for( const direction of directions ){
            const score = dangerScoreForDirection(self, direction, threats, world);
            scores.push(score);
            if( score < bestScore ){
                bestScore = score;
                bestDirection = direction;
            }
        }
        if( baseScore > bestScore ) recordRejectedDirection(self, normalizedBase, threats, world, baseScore);
        for( let index = 0; index < directions.length; index++ ){
            if( scores[index] > bestScore ) recordRejectedDirection(self, directions[index], threats, world, scores[index]);
        }
    }

    state.mode = mode;
    state.desired = bestDirection;
    state.dangerScore = bestScore;
    state.searchMaxDiameter = maxDangerSearchDiameter(self);
    if( mode === 'flee' ){
        const previousImmediateDanger = Boolean(state.fleeImmediateDanger);
        const previousFearActive = Boolean(state.fleeFearActive);
        state.fleeFearActive = true;
        if( immediateDanger || !previousFearActive || (previousImmediateDanger && !immediateDanger) ){
            state.fleeFearRemaining = NPC.fleeFearRecoverySeconds;
        }
        state.fleeUrgency = immediateDanger
            ? (sameMode && state.fleeImmediateDanger ? (state.fleeUrgency || 0) + 1 : 0)
            : 0;
        state.fleeImmediateDanger = immediateDanger;
        if( !Number.isFinite(state.fleeBurstLevel) ) state.fleeBurstLevel = REGIME.burstStartSpeedLevel;
    }else{
        state.fleeUrgency = 0;
        state.fleeImmediateDanger = false;
        state.fleeFearActive = false;
        state.fleeFearRemaining = 0;
        state.fleeBurstLevel = REGIME.burstStartSpeedLevel;
    }
    state.nextIn = NPC.decisionIntervalSeconds * (0.75 + rng() * 0.5);
    self.steerDecision = state;
    return {
        direction: bestDirection,
        dangerScore: bestScore,
        immediateDanger,
        fleeUrgency: state.fleeUrgency,
        recalculated: true,
    };
}

// @fix:8c4e1a72
function recordRejectedDirection(self, direction, threats, world, score){
    if( !(score > 0) && score !== Infinity ) return;
    const normalized = normalize(direction);
    const point = firstDangerPointForDirection(self, normalized, threats, world);
    if( point ) recordDirectionDanger(world, [point]);
}

// @fix:8c4e1a72
function firstDangerPointForDirection(self, direction, threats, world){
    const normalized = normalize(direction);
    for( const position of dangerPredictionPositions(self, normalized, world) ){
        const point = dangerSampleAtPosition(self, position, normalized, threats, world);
        if( point ) return point;
    }
    const diameter = Math.max(1, (self.radius || 0) * 2);
    const threshold = (self.size || 0) * PREDATION.eatRatio;
    for( let ring = 2; ring * diameter <= NPC.dangerProjectionDistancePx; ring++ ){
        const point = {
            x: self.pos.x + normalized.x * ring * diameter / 2,
            y: self.pos.y + normalized.y * ring * diameter / 2,
        };
        if( threats.length >= PERCEPTION.dangerRasterThreshold && world.perception?.raster ){
            if( sampleDangerRaster(world.perception.raster, point) > threshold ) return point;
            continue;
        }
        if( threats.some(threat => {
            const delta = nearestToroidalDelta(point, threat.pos, world);
            return Math.hypot(delta.x, delta.y) <= (self.radius || 0) + (threat.radius || 0) * NPC.dangerRadiusWeight;
        }) ) return point;
    }
    return null;
}

function maxDangerSearchDiameter(self){
    const diameter = Math.max(1, (self.radius || 0) * 2);
    const projection = Math.max(diameter * 2, NPC.dangerProjectionDistancePx);
    return Math.max(diameter * 2, Math.floor(projection / diameter) * diameter);
}

function bestDirectionForMode(baseDirection, mode){
    return mode === 'flee' ? v(1, 0) : baseDirection;
}

function dangerProfileForDirection(self, direction, threats, world){
    return {
        score: dangerScoreForDirection(self, direction, threats, world),
        immediateDanger: immediateDangerForDirection(self, direction, threats, world),
    };
}

// @ds:7d9f5b31
function chooseWidestSafeDirection(self, directions, profiles, threats, world, fallback){
    const safe = profiles.map(profile => !profile.immediateDanger);
    const chooseLowestRisk = () => {
        let bestDirection = fallback;
        let bestScore = dangerScoreForDirection(self, fallback, threats, world);
        for( let i = 0; i < profiles.length; i++ ){
            if( profiles[i].score < bestScore ){
                bestScore = profiles[i].score;
                bestDirection = directions[i];
            }
        }
        return { direction: bestDirection, score: bestScore };
    };
    if( safe.every(Boolean) ) return chooseLowestRisk();

    let widest = null;
    for( let start = 0; start < safe.length; start++ ){
        if( !safe[start] || safe[(start - 1 + safe.length) % safe.length] ) continue;
        let length = 0;
        while( length < safe.length && safe[(start + length) % safe.length] ) length++;
        const centerIndex = start + (length - 1) / 2;
        const centerDirection = angleVector((Math.PI * 2 * centerIndex) / safe.length);
        const centerProfile = dangerProfileForDirection(self, centerDirection, threats, world);
        if( !widest || length > widest.length || (length === widest.length && centerProfile.score < widest.score) ){
            widest = { length, direction: centerDirection, score: centerProfile.score };
        }
    }
    return widest || chooseLowestRisk();
}

// @ds:7d9f5b31 @fix:5e1a7c42
export function immediateDangerForDirection(self, direction, threats, world){
    const dir = normalize(direction);
    if( !dir.x && !dir.y ) return true;
    for( const position of dangerPredictionPositions(self, dir, world) ){
        if( immediateDangerAtPosition(self, position, dir, threats, world) ) return true;
    }
    return false;
}

// @fix:5e1a7c42
function dangerPredictionPositions(self, direction, world){
    const positions = [self.pos];
    const samples = Math.max(0, Math.floor(NPC.dangerPredictionSamples || 0));
    const horizon = Math.max(0, Number(NPC.dangerPredictionSeconds) || 0);
    const velocity = self.vel || { x: 0, y: 0 };
    for( let index = 1; index <= samples; index++ ){
        const t = horizon * index / Math.max(1, samples);
        positions.push({
            x: self.pos.x + velocity.x * t,
            y: self.pos.y + velocity.y * t,
        });
    }
    return positions;
}

// @fix:5e1a7c42
function immediateDangerAtPosition(self, position, direction, threats, world){
    return Boolean(dangerSampleAtPosition(self, position, direction, threats, world));
}

// @fix:8c4e1a72
function dangerSampleAtPosition(self, position, direction, threats, world){
    const diameter = Math.max(1, (self.radius || 0) * 2);
    const firstRadii = [diameter, diameter * 1.5];
    const threshold = (self.size || 0) * PREDATION.eatRatio;
    if( threats.length >= PERCEPTION.dangerRasterThreshold && world.perception?.raster ){
        for( const radius of firstRadii ){
            const sample = {
                x: position.x + direction.x * radius,
                y: position.y + direction.y * radius,
            };
            if( sampleDangerRaster(world.perception.raster, sample) > threshold ) return sample;
        }
        return null;
    }
    for( const threat of threats ){
        const contactDistance = (self.radius || 0) + (threat.radius || 0) * NPC.dangerRadiusWeight;
        for( const radius of firstRadii ){
            const sample = { x: position.x + direction.x * radius, y: position.y + direction.y * radius };
            const delta = nearestToroidalDelta(sample, threat.pos, world);
            if( Math.hypot(delta.x, delta.y) <= contactDistance ) return sample;
        }
    }
    return null;
}

// @ds f4d7a892 a6c39e71 d9a4c82e
export function dangerScoreForDirection(self, direction, threats, world){
    const dir = normalize(direction);
    if( !dir.x && !dir.y ) return Infinity;
    if( dangerPredictionPositions(self, dir, world).some(position => immediateDangerAtPosition(self, position, dir, threats, world)) ) return Infinity;
    const projection = NPC.dangerProjectionDistancePx;
    let score = 0;
    const diameter = Math.max(1, (self.radius || 0) * 2);
    if( threats.length >= PERCEPTION.dangerRasterThreshold && world.perception?.raster ){
        for( let ring = 2; ring * diameter <= projection; ring++ ){
            const size = sampleDangerRaster(world.perception.raster, {
                x: self.pos.x + dir.x * ring * diameter / 2,
                y: self.pos.y + dir.y * ring * diameter / 2,
            });
            if( size > (self.size || 0) * PREDATION.eatRatio ) score += ring <= 3 ? 1e6 : size / ring;
        }
        return score;
    }
    for( const threat of threats ){
        const toThreat = nearestToroidalDelta(self.pos, threat.pos, world);
        const centerDistance = Math.hypot(toThreat.x, toThreat.y);
        const contactDistance = (self.radius || 0) + (threat.radius || 0) * NPC.dangerRadiusWeight;
        if( centerDistance - contactDistance > NPC.threatSenseRadius + projection ) continue;

        const segmentDistance = distanceToSegment(toThreat, v(0, 0), scale(dir, projection));
        const contactGap = segmentDistance - contactDistance;
        const attackReach = contactDistance * (1 + PREDATION.attackReachRatio);
        const attackGap = segmentDistance - attackReach;
        if( segmentDistance <= contactDistance && centerDistance <= diameter * 2.5 ) return Infinity;
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
    for( const candidate of (world.perception ? queryInteractionCandidates(world, self) : world.fish || []) ){
        if( candidate.ownerKind === undefined ) continue;
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
    if( p.mode === 'burst' ) return;
    const scaleFactor = Math.max(1e-6, worldScale || 1);
    p.vel = clampLen(p.vel, Math.max(PREY.maxSpeed / scaleFactor, previousSpeed));
}

function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
}
