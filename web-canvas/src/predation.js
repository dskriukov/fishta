// imp/web-canvas/src/predation.js
// Implements: predation.dsc (overlaps, canEat, resolveEating)
// Note: user fish victim eligibility is derived from paid/free tier.
// @ds a3e394a8 98224ab9 e9fb3705 fcdfb2b7 d867989f 6f1b0a3c 39305789

import { LEAVE, PREDATION, PLAYER } from './constants.js';
import { normalize } from './vec.js';
import { grow, makeFish } from './fish.js';
import { findLowestDensitySpawn } from './world.js';

// @ds:a3e394a8 @ds:b024b514
export function overlaps(a, b, world = null){
    return toroidalDistance(a.pos, b.pos, world) < a.radius + b.radius;
}

// @ds:b39c93a5 @ds:b024b514
export function isAttackContact(predator, victim, world = null){
    if( predator.mode !== 'burst' ) return false;
    const speed = Math.hypot(predator.vel?.x || 0, predator.vel?.y || 0);
    if( speed <= 1e-3 ) return false;

    const separation = nearestToroidalDelta(predator.pos, victim.pos, world);
    const distance = Math.hypot(separation.x, separation.y);
    const contactDistance = predator.radius + victim.radius;
    const forward = speed > 1e-3
        ? normalize(predator.vel)
        : { x: predator.facing || 1, y: 0 };
    const direction = normalize(separation);
    const alignment = forward.x * direction.x + forward.y * direction.y;
    if( alignment < PREDATION.attackConeDotMin ) return false;

    const relativeVelocity = {
        x: (predator.vel?.x || 0) - (victim.vel?.x || 0),
        y: (predator.vel?.y || 0) - (victim.vel?.y || 0),
    };
    if( relativeVelocity.x * separation.x + relativeVelocity.y * separation.y <= 0 ) return false;

    if( distance < contactDistance ) return true;

    const reach = contactDistance * PREDATION.attackReachRatio;
    return distance < contactDistance + reach;
}

// Backward-compatible name for legacy call sites; new IMP code uses isAttackContact.
export const canReachForEating = isAttackContact;

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

// @ds:98224ab9 @ds:32745a4f @ds:b39c93a5
export function canEat(predator, prey, world = null, attackContact = null){
    const contact = attackContact ?? isAttackContact(predator, prey, world);
    return predator.mode === 'burst' && isEdibleBySize(predator, prey) && canBeVictimOf(predator, prey) && contact;
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
        const toVictim = nearestToroidalDelta(other.pos, userFish.pos, world);
        const distance = Math.hypot(toVictim.x, toVictim.y);
        const speed = Math.hypot(other.vel?.x || 0, other.vel?.y || 0);
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
        const attackContact = isAttackContact(p, player, state.world);
        if( attackContact && canEat(p, player, state.world, attackContact) && canRemoveVictim(state, player) ){
            grow(p, player.size);
            respawnPlayerAfterEating(state);
            return eatenByPlayer;
        }
    }

    // ds:e9fb3705 ds:d867989f
    for( let i = prey.length - 1; i >= 0; i-- ){
        const p = prey[i];
        const attackContact = isAttackContact(player, p, state.world);
        if( attackContact && canEat(player, p, state.world, attackContact) && canRemoveVictim(state, p) ){
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
            const attackContact = isAttackContact(a, b, state.world);
            if( attackContact && canEat(a, b, state.world, attackContact) && canRemoveVictim(state, b) ){
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
            const attackContact = isAttackContact(predator, victim, world);
            if( attackContact && canEat(predator, victim, world, attackContact) ){
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

// @ds:b39c93a5
export function estimatedAttackContactTime(predator, victim, world = null){
    const separation = nearestToroidalDelta(predator.pos, victim.pos, world);
    const relativeVelocity = {
        x: (predator.vel?.x || 0) - (victim.vel?.x || 0),
        y: (predator.vel?.y || 0) - (victim.vel?.y || 0),
    };
    const closingSpeed = relativeVelocity.x * normalize(separation).x + relativeVelocity.y * normalize(separation).y;
    if( closingSpeed <= 1e-3 ) return Infinity;
    const reach = predator.radius + victim.radius + (predator.radius + victim.radius) * PREDATION.attackReachRatio;
    return Math.max(0, (Math.hypot(separation.x, separation.y) - reach) / closingSpeed);
}

export function nearestToroidalDelta(from, to, world = null){
    let dx = (to?.x || 0) - (from?.x || 0);
    let dy = (to?.y || 0) - (from?.y || 0);
    if( world?.width > 0 ){
        if( dx > world.width / 2 ) dx -= world.width;
        if( dx < -world.width / 2 ) dx += world.width;
    }
    if( world?.height > 0 ){
        if( dy > world.height / 2 ) dy -= world.height;
        if( dy < -world.height / 2 ) dy += world.height;
    }
    return { x: dx, y: dy };
}

function toroidalDistance(a, b, world){
    const delta = nearestToroidalDelta(a, b, world);
    return Math.hypot(delta.x, delta.y);
}
