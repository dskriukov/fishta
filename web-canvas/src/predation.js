// imp/web-canvas/src/predation.js
// Implements: predation.dsc (overlaps, canEat, resolveEating)
// Note: user fish victim eligibility is derived from paid/free tier.
// @ds a3e394a8 98224ab9 e9fb3705 fcdfb2b7 d867989f 6f1b0a3c 39305789

import { LEAVE, PREDATION, PLAYER } from './constants.js';
import { dist, normalize, sub } from './vec.js';
import { grow, makeFish } from './fish.js';
import { findLowestDensitySpawn } from './world.js';

// ds:a3e394a8
export function overlaps(a, b){
    return dist(a.pos, b.pos) < a.radius + b.radius;
}

// @ds:a3e394a8 @ds:98224ab9
export function canReachForEating(predator, victim){
    const contactDistance = predator.radius + victim.radius;
    const distance = dist(predator.pos, victim.pos);
    if( distance < contactDistance ) return true;
    if( predator.mode !== 'burst' ) return false;

    const speed = Math.hypot(predator.vel.x, predator.vel.y);
    if( speed <= 1e-3 ) return false;

    const toVictim = sub(victim.pos, predator.pos);
    const forward = normalize(predator.vel);
    const direction = normalize(toVictim);
    const alignment = forward.x * direction.x + forward.y * direction.y;
    if( alignment < 0.55 ) return false;

    const reach = contactDistance * PREDATION.attackReachRatio;
    return distance < contactDistance + reach;
}

// ds:98224ab9
export function isEdibleBySize(predator, prey){
    return predator.size > prey.size * PREDATION.eatRatio;
}

// ds:98224ab9
export function canBeVictimOf(predator, victim){
    if( victim.ownerKind !== 'user' ) return true;
    if( victim.userTier === 'paid' ) return predator.ownerKind === 'user' && predator.userTier === 'paid';
    return true;
}

// ds:98224ab9
export function canEat(predator, prey){
    return predator.mode === 'burst' && isEdibleBySize(predator, prey) && canBeVictimOf(predator, prey);
}

// ds:6f1b0a3c
export function canRemoveVictim(state, victim){
    if( !victim.isPlayer ) return true;
    return true;
}

// ds:39305789
export function respawnPlayerAfterEating(state){
    const { world } = state;
    state.player = makeFish({
        pos: {
            x: world.width / 2,
            y: world.height / 2,
        },
        size: PLAYER.startSize,
        isPlayer: true,
    });
    state.player.prevAccel = { x: 0, y: 0 };
}

// @ds:39305789 @ds:53db39eb
export function respawnUserFishAfterEating(world, fish, rng){
    const saved = {
        id: fish.id,
        clientId: fish.clientId,
        temporaryConnectionCode: fish.temporaryConnectionCode,
        userName: fish.userName,
        userColor: fish.userColor,
        userTier: fish.userTier,
    };
    const respawned = makeFish({
        pos: findLowestDensitySpawn(world, rng),
        size: PLAYER.startSize,
        isPlayer: true,
        ownerKind: 'user',
        ...saved,
    });
    respawned.id = saved.id;
    Object.assign(fish, respawned);
}

// @ds:8917ad63
export function isLeaveBlockedByUserAttack(world, userFish){
    for( const other of world.fish || [] ){
        if( other === userFish || other.ownerKind !== 'user' || other.mode !== 'burst' ) continue;
        const toVictim = sub(userFish.pos, other.pos);
        const distance = Math.hypot(toVictim.x, toVictim.y);
        const speed = Math.hypot(other.vel.x, other.vel.y);
        if( speed <= 1e-3 ) continue;
        const direction = normalize(other.vel);
        const toward = normalize(toVictim);
        const closing = direction.x * toward.x + direction.y * toward.y;
        if( closing > 0.65 && distance / speed < LEAVE.attackWindowSeconds ) return true;
    }
    return false;
}

// ds:e9fb3705
// Returns number of prey eaten by the player this tick (for HUD).
export function resolveEating(state){
    if( state.world && Array.isArray(state.world.fish) ){
        return resolveWorldEating(state.world, state.rng || Math.random);
    }
    const { player, prey } = state;
    let eatenByPlayer = 0;

    for( let i = prey.length - 1; i >= 0; i-- ){
        const p = prey[i];
        if( canReachForEating(p, player) && canEat(p, player) && canRemoveVictim(state, player) ){
            grow(p, player.size);
            respawnPlayerAfterEating(state);
            return eatenByPlayer;
        }
    }

    // ds:e9fb3705 ds:d867989f
    for( let i = prey.length - 1; i >= 0; i-- ){
        const p = prey[i];
        if( canReachForEating(player, p) && canEat(player, p) && canRemoveVictim(state, p) ){
            grow(player, p.size);
            prey.splice(i, 1);
            eatenByPlayer++;
        }
    }

    // ds:e9fb3705 ds:d867989f
    for( let i = prey.length - 1; i >= 0; i-- ){
        const a = prey[i];
        if( !a ) continue;
        for( let j = prey.length - 1; j >= 0; j-- ){
            if( i === j ) continue;
            const b = prey[j];
            if( !b ) continue;
            if( canReachForEating(a, b) && canEat(a, b) && canRemoveVictim(state, b) ){
                grow(a, b.size);
                prey.splice(j, 1);
                if( j < i ) i--;
            }
        }
    }
    return eatenByPlayer;
}

function resolveWorldEating(world, rng){
    let eatenByUsers = 0;
    const fish = world.fish;
    for( let i = fish.length - 1; i >= 0; i-- ){
        const predator = fish[i];
        if( !predator ) continue;
        for( let j = fish.length - 1; j >= 0; j-- ){
            if( i === j ) continue;
            const victim = fish[j];
            if( !victim ) continue;
            if( canReachForEating(predator, victim) && canEat(predator, victim) ){
                grow(predator, victim.size);
                if( predator.ownerKind === 'user' ) eatenByUsers++;
                if( victim.ownerKind === 'user' ){
                    respawnUserFishAfterEating(world, victim, rng);
                }else{
                    fish.splice(j, 1);
                    if( j < i ) i--;
                }
                break;
            }
        }
    }
    return eatenByUsers;
}
