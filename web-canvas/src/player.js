// Player-owned lifecycle helpers.
// @ds 4c7a2b91 c18e5b42 9d62f0a7 b7a4c391 2e91f6d4

import { PLAYER } from './constants.js';
import { technicalRadiusOf } from './fish.js';
import { findLowestDensitySpawn, wrapPoint } from './world.js';

// @ds:4c7a2b91
export function startUserFryStage(fish, position, reason = 'spawn', worldScale = 1){
    const saved = {
        id: fish.id,
        clientId: fish.clientId,
        temporaryConnectionCode: fish.temporaryConnectionCode,
        userName: fish.userName,
        userColor: fish.userColor,
        userTier: fish.userTier,
    };
    Object.assign(fish, {
        ...saved,
        pos: { ...position },
        vel: { x: 0, y: 0 },
        size: PLAYER.fryStartSize,
        radius: technicalRadiusOf(PLAYER.fryStartSize, worldScale),
        facing: fish.facing || 1,
        reverseFacing: false,
        mode: 'cruise',
        age: 0,
        ownerKind: 'user',
        isPlayer: true,
        npcRole: null,
        formerUserColor: null,
        fryAge: 0,
        nominalStartSize: PLAYER.startSize,
        lifetimeStartedAt: null, // @fix:c4e8a1b7
        lifetimeMode: null, // @fix:de7b4c19
        playerActiveAge: 0,
        playerSpawnReason: reason,
        feedingSuccessFactor: 1,
        feedingCooldown: 0,
        prevAccel: { x: 0, y: 0 },
        heading: { x: 0, y: 0 },
    });
    return fish;
}

// @ds:c18e5b42
export function placeUserSpawn(world, reason, rng, options = {}){
    if( reason === 'oldAge' ){
        return cloudCenter(world, options.origin, options.shreds);
    }
    return findLowestDensitySpawn(world, rng);
}

// @ds:4c7a2b91 @ds:b7a4c391
export function advanceUserFryStage(fish, dt, worldScale = 1){
    if( fish.ownerKind !== 'user' ) return false;
    if( fish.fryAge === null || fish.fryAge === undefined ) return false;
    fish.fryAge = Math.min(PLAYER.fryGrowthSeconds, fish.fryAge + dt);
    const t = PLAYER.fryGrowthSeconds > 0 ? fish.fryAge / PLAYER.fryGrowthSeconds : 1;
    if( fish.size < PLAYER.startSize ){
        const grownSize = PLAYER.fryStartSize + (PLAYER.startSize - PLAYER.fryStartSize) * t;
        fish.size = Math.min(PLAYER.startSize, Math.max(fish.size, grownSize));
    }
    fish.radius = technicalRadiusOf(fish.size, worldScale);
    if( fish.fryAge >= PLAYER.fryGrowthSeconds ){
        fish.fryAge = null;
    }
    return true;
}

// @ds:9d62f0a7
export function isUserFryProtected(fish){
    return fish?.ownerKind === 'user' && fish.fryAge !== null && fish.fryAge !== undefined;
}

function cloudCenter(world, origin, shreds){
    const base = origin || { x: world.width / 2, y: world.height / 2 };
    const created = (shreds || []).filter(shred => shred?.pos);
    if( created.length === 0 ) return wrapPoint({ ...base }, world);
    let dx = 0;
    let dy = 0;
    for( const shred of created ){
        const delta = nearestDelta(base, shred.pos, world);
        dx += delta.x;
        dy += delta.y;
    }
    return wrapPoint({
        x: base.x + dx / created.length,
        y: base.y + dy / created.length,
    }, world);
}

function nearestDelta(from, to, world){
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
