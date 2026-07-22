// imp/web-canvas/src/step.js
// Implements: dsr/use/ecs-loop.dsr — PURE domain step: state' = step(state, input, dt)
// Composes behaviours from world/fish/prey/predation/controls. No canvas here.
// @ds b28b7af6 22fd3ab4 e6be3c03 55c13a4f 10baf178 7ce238da 8869f043 07320d39 9ce87fee 703efd43 579e4888 31cb7a0d e9fb3705 e6ecfbdd d6cebf86 0c8d4e2a 6f1b0a3c 4c7a2b91 c18e5b42 b7a4c391 7d9f5b31 4e7a9c2d

import { FISH, PERCEPTION, PLAYER, REGIME } from './constants.js';
import { advanceFeedingState, availableSpeedLevelForSize, integrate, normalizeSpeedLevel, runExhaleCycle, requestExhale, updateFishLifetimeState } from './fish.js';
import { chooseNpcIntent, preySteer, capPreySpeed, maintainPopulation, advanceFryGrowth, expireOldNpcFish } from './prey.js';
import { advanceUserFryStage, placeUserSpawn, startUserFryStage } from './player.js';
import { huntSteer } from './hunt.js';
import { playerSteer, huntMode } from './controls.js';
import { resolveEating, resolveFeedingBatches } from './predation.js';
import { advanceShreds, spawnShredsFromFish } from './shred.js';
import { emitBubble, advanceBubbles } from './world.js';
import { normalize, scale } from './vec.js';
import { rebuildPerception } from './perception.js';

// @fn:a9a3ed12
export function triggerExhaleOnAccelStart(fish, accel, prevAccel){
    const prevMagnitude = Math.hypot(prevAccel.x, prevAccel.y);
    const currentMagnitude = Math.hypot(accel.x, accel.y);
    if( prevMagnitude <= 1e-3 && currentMagnitude > 1e-3 ) requestExhale(fish);
}

// @ia e5f60718
export function step(state, input, dt, rng){
    if( state.world && Array.isArray(state.world.fish) ){
        return stepAuthoritativeWorld(state, input, dt, rng);
    }
    // ds:22fd3ab4 ds:55c13a4f ds:10baf178 ds:7ce238da
    state.player.speedLevel = availableSpeedLevelForSize(state.player.size, input.speedLevel ?? (huntMode(input) === 'burst' ? REGIME.burstStartSpeedLevel : 0));
    state.player.mode = state.player.speedLevel >= REGIME.burstStartSpeedLevel ? 'burst' : 'cruise';
    const playerAccel = playerSteer(state.player, input);
    triggerExhaleOnAccelStart(state.player, playerAccel, state.player.prevAccel);
    state.player.prevAccel = { ...playerAccel };
    integrate(state.player, playerAccel, state.world, dt);
    runExhaleCycle(state.player, state.bubbles, rng, dt);

    // ds:579e4888 ds:31cb7a0d ds:98224ab9 @ds:d4f6a1c2
    const threats = [state.player, ...state.prey];
    for( const p of state.prey ){
        const huntTargets = [state.player, ...state.prey];
        const hunt = huntSteer(p, huntTargets);
        const steer = hunt.accel ? hunt : preySteer(p, threats, dt, rng);
        const accel = steer.accel ?? { x: 0, y: 0 };
        p.mode = steer.mode;
        p.speedLevel = p.mode === 'burst'
            ? npcBurstLevel(steer.speedLevel)
            : REGIME.cruiseMaxSpeedLevel;
        const previousSpeed = Math.hypot(p.vel.x, p.vel.y);
        triggerExhaleOnAccelStart(p, accel, p.prevAccel);
        p.prevAccel = { ...accel };
        integrate(p, accel, state.world, dt);
        capPreySpeed(p, previousSpeed, state.world?.scale);
    }

    // ds:e9fb3705 ds:d867989f
    state.eaten += resolveEating(state);

    // ds:e6ecfbdd ds:1e66d817
    maintainPopulation(state, rng);

    // ds:d6cebf86
    const fish = [state.player, ...state.prey];
    for( const f of fish ){
        const bubble = emitBubble(f, dt, rng);
        if( bubble ) state.bubbles.push(bubble);
    }
    advanceBubbles(state.bubbles, state.world, dt);

    return state;
}

// @ds:27fa3caa @ds:e559831a @ds:4bfe0352
export function stepAuthoritativeWorld(state, inputsByClient, dt, rng){
    const world = state.world;
    world.tick = (world.tick || 0) + 1;
    world.elapsedSeconds = Math.max(0, Number(world.elapsedSeconds) || 0) + Math.max(0, dt);
    rebuildPerception(world, { resetDirectionDanger: true, motionHorizonSeconds: dt * PERCEPTION.dangerRasterMotionTicks }); // @ds:c94d2a8f @ds:9a6e4c31 @ds:d5c8b740 @fix:8c4e1a72 @fix:7f3c9a21
    const allFish = world.fish;

    for( const fish of allFish ){
        let accel = { x: 0, y: 0 };
        if( fish.ownerKind === 'user' ){
            advanceUserFryStage(fish, dt, world.scale);
            const input = inputsByClient.get(fish.clientId) || {};
            fish.speedLevel = normalizeSpeedLevel(input.speedLevel);
            fish.cruiseControl = input.cruiseControl === 'keyboard' ? 'keyboard' : null;
            fish.mode = fish.speedLevel >= REGIME.burstStartSpeedLevel ? 'burst' : 'cruise';
            accel = input.accel ? scale(normalize(input.accel), FISH.accel) : accel;
        }else{
            advanceFryGrowth(fish, dt, world.scale);
            fish.cruiseControl = null;
            const steer = chooseNpcIntent(fish, world, rng, dt);
            accel = steer.accel ?? accel;
            fish.mode = steer.mode;
            fish.speedLevel = fish.mode === 'burst'
                ? npcBurstLevel(steer.speedLevel)
                : REGIME.cruiseMaxSpeedLevel;
        }

        const previousSpeed = Math.hypot(fish.vel.x, fish.vel.y);
        triggerExhaleOnAccelStart(fish, accel, fish.prevAccel);
        fish.prevAccel = { ...accel };
        integrate(fish, accel, world, dt);
        if( fish.ownerKind === 'npc' ) capPreySpeed(fish, previousSpeed, world.scale);
        advanceFeedingState(fish, dt);
        updateFishLifetimeState(fish, world.elapsedSeconds); // @fix:c4e8a1b7
    }

    expireOldUserFish(world, rng);
    advanceShreds(world, dt); // @ds:8b62d9ce
    rebuildPerception(world, { resetDirectionDanger: false, motionHorizonSeconds: dt * PERCEPTION.dangerRasterMotionTicks }); // @fix:8c4e1a72 @fix:7f3c9a21
    expireOldNpcFish(world, rng); // @ds:a6c9e8b4
    resolveFeedingBatches(world, rng); // @ds:9b41d2ac @ds:6c80e3b4 @ds:f2ad71c9 @ds:a8f03d2e
    for( const fish of world.fish || [] ) updateFishLifetimeState(fish, world.elapsedSeconds); // @fix:c4e8a1b7
    maintainPopulation({ world }, rng);
    world.bubbles = [];
    return state;
}

function npcBurstLevel(requestedLevel){
    const requested = Number.isFinite(Number(requestedLevel))
        ? Number(requestedLevel)
        : REGIME.npcMaxBurstLevel;
    return normalizeSpeedLevel(Math.max(
        REGIME.burstStartSpeedLevel,
        Math.min(REGIME.npcMaxBurstLevel, requested),
    ));
}

// @ds:b7a4c391 @ds:c18e5b42 @ds:e13d7a52
function expireOldUserFish(world, rng){
    const now = Math.max(0, Number(world.elapsedSeconds) || 0);
    for( const fish of world.fish || [] ){
        if( fish.ownerKind !== 'user' ) continue;
        if( fish.fryAge !== null && fish.fryAge !== undefined ) continue;
        if( !Number.isFinite(fish.lifetimeStartedAt) ) continue;
        const lifetimeLimit = fish.lifetimeMode === 'lowSize'
            ? PLAYER.lowSizeMaxLifetimeSeconds
            : PLAYER.maxLifetimeSeconds;
        if( (now - fish.lifetimeStartedAt) < lifetimeLimit ) continue;
        const origin = { ...fish.pos };
        const shreds = spawnShredsFromFish(world, fish, rng);
        const position = placeUserSpawn(world, 'oldAge', rng, { origin, shreds });
        startUserFryStage(fish, position, 'oldAge', world.scale);
    }
}
