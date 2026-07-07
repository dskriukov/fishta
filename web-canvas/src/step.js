// imp/web-canvas/src/step.js
// Implements: dsr/use/ecs-loop.dsr — PURE domain step: state' = step(state, input, dt)
// Composes behaviours from world/fish/prey/predation/controls. No canvas here.
// @ds b28b7af6 22fd3ab4 55c13a4f 10baf178 7ce238da 8869f043 579e4888 31cb7a0d e9fb3705 e6ecfbdd d6cebf86 0c8d4e2a 6f1b0a3c

import { FISH } from './constants.js';
import { integrate, runExhaleCycle, requestExhale } from './fish.js';
import { preySteer, capPreySpeed, maintainPopulation, advanceFryGrowth } from './prey.js';
import { huntSteer } from './hunt.js';
import { playerSteer, huntMode } from './controls.js';
import { resolveEating } from './predation.js';
import { emitBubble, advanceBubbles } from './world.js';
import { normalize, scale } from './vec.js';

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
    state.player.mode = huntMode(input);
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
        triggerExhaleOnAccelStart(p, accel, p.prevAccel);
        p.prevAccel = { ...accel };
        integrate(p, accel, state.world, dt);
        capPreySpeed(p);
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
    const allFish = world.fish;

    for( const fish of allFish ){
        let accel = { x: 0, y: 0 };
        if( fish.ownerKind === 'user' ){
            const input = inputsByClient.get(fish.clientId) || {};
            fish.mode = input.hunt ? 'burst' : 'cruise';
            accel = input.accel ? scale(normalize(input.accel), FISH.accel) : accel;
        }else{
            advanceFryGrowth(fish, dt);
            const targets = allFish;
            const huntTargets = targets.filter(target => target !== fish);
            const hunt = huntSteer(fish, huntTargets);
            const steer = hunt.accel ? hunt : preySteer(fish, targets, dt, rng);
            accel = steer.accel ?? accel;
            fish.mode = steer.mode;
        }

        triggerExhaleOnAccelStart(fish, accel, fish.prevAccel);
        fish.prevAccel = { ...accel };
        integrate(fish, accel, world, dt);
        if( fish.ownerKind === 'npc' ) capPreySpeed(fish);
    }

    resolveEating({ world, rng });
    maintainPopulation({ world }, rng);
    world.bubbles = [];
    return state;
}
