// imp/web-canvas/src/protocol.js
// Compact WebSocket string protocol.
// @ds:839f8cd0 @ds:5a4d3d6d @ds:671e9773 @ds:e6be3c03 @ds:4fad33f8 @ds:682570c7 @ds:ea18a088 @ds:f51a5030 @ds:a16328a6 @ds:ed2b4f19 @ds:a2d5936f @ds:2e91f6d4 @ds:2afd71a0 @ds:9f50b1be

import { FISH, REGIME, SHRED } from './constants.js';

export function encodeName(name){
    const bytes = new TextEncoder().encode(String(name || ''));
    return bytesToBase64Url(bytes);
}

export function decodeName(encoded){
    try{
        const bytes = base64UrlToBytes(encoded);
        return new TextDecoder().decode(bytes);
    }catch{
        return '';
    }
}

export function encodeClientJoin({ userColor, userName, userTier }){
    const color = normalizeHex(userColor || '59bcd6');
    const type = userTier === 'paid' ? 'p' : 'u';
    return `n:${color}:${encodeName(userName || 'fish')}:${type}`;
}

export function encodeClientReconnect(token){
    return `r:${token || ''}`;
}

export function encodeClientPing(n){
    return `p:${n}`;
}

export function encodeClientControl(payload = {}){
    const x = encodeSignedThousand(payload.accel?.x || 0);
    const y = encodeSignedThousand(payload.accel?.y || 0);
    const level = normalizeSpeedLevel(payload.speedLevel);
    const keyboardCruise = payload.cruiseControl === 'keyboard' && level > 0 && level <= REGIME.cruiseMaxSpeedLevel;
    return `c${x}${y}${level > 0 ? `v${level}` : ''}${keyboardCruise ? 'k' : ''}`;
}

export function parseClientMessage(raw){
    const text = String(raw || '');
    const kind = text[0];
    if( kind === 'n' ){
        const [, color, name, type] = text.split(':');
        return {
            type: 'join',
            userColor: `#${normalizeHex(color || '59bcd6')}`,
            userName: decodeName(name || '').slice(0, 24) || 'fish',
            userTier: type === 'p' ? 'paid' : 'free',
        };
    }
    if( kind === 'r' ) return { type: 'reconnect', temporaryConnectionCode: text.slice(2) };
    if( kind === 'q' ) return { type: 'leave' };
    if( kind === 'p' ) return { type: 'ping', n: Number(text.slice(2)) || 0 };
    if( kind === 'c' ){
        const mods = text.slice(9);
        const speedLevel = parseSpeedLevelMod(mods);
        return {
            type: 'input',
            accel: {
                x: decodeSignedThousand(text.slice(1, 5)),
                y: decodeSignedThousand(text.slice(5, 9)),
            },
            speedLevel,
            cruiseControl: mods.includes('k') && speedLevel > 0 && speedLevel <= REGIME.cruiseMaxSpeedLevel ? 'keyboard' : null,
        };
    }
    return { type: 'unknown' };
}

export function encodeIdentity(id, token){
    return `i:${id}:${token || ''}`;
}

export function parseIdentity(message){
    const [, id, token] = String(message || '').split(':');
    return { currentUserFishId: Number(id), temporaryConnectionCode: token || '' };
}

export function encodeEvent(type, data = ''){
    return `e:${type}:${data}`;
}

export function parseEvent(message){
    const parts = String(message || '').split(':');
    return { type: 'event', event: parts[1] || '', data: parts.slice(2).join(':') };
}

export function encodeWorldSize(world){
    return encodeEvent('w', `${round(world.width, 0)}:${round(world.height, 0)}`);
}

// @ds:682570c7 @ds:2afd71a0 @ds:9f50b1be
export function encodeWorldSync(world, previousState = new Map(), absolute = false){
    const previousFishById = previousState?.fish || (previousState instanceof Map ? previousState : new Map());
    const previousShredsById = previousState?.shreds || new Map();
    const nextFishById = new Map();
    const nextShredsById = new Map();
    const rows = [];
    for( const fish of world.fish || [] ){
        const previous = absolute ? null : previousFishById.get(fish.id);
        rows.push(encodeFishRow(fish, previous, absolute));
        nextFishById.set(fish.id, fishSnapshot(fish));
    }
    for( const shred of world.shreds || [] ){
        const previous = absolute ? null : previousShredsById.get(shred.id);
        rows.push(previous ? encodeShredDeltaRow(shred, previous) : encodeShredRow(shred));
        nextShredsById.set(shred.id, shredSnapshot(shred));
    }
    if( !absolute ){
        for( const id of previousFishById.keys() ){
            if( !nextFishById.has(id) ) rows.push(encodeRemovedFishRow(id));
        }
    }
    return {
        message: `${absolute ? 'a|' : '|'}${rows.join('|')}`,
        state: { fish: nextFishById, shreds: nextShredsById },
    };
}

// @ds:ed2b4f19 @ds:d3187816 @ds:9f50b1be
export function encodeShredRow(shred){
    const angle = movingAngle(shred);
    const speed = Math.hypot(shred.vel?.x || 0, shred.vel?.y || 0);
    const layersHex = encodeLayers(shred.remainingLayers);
    return `s${shred.id} ${fixed(shred.size, 3)}:${fixed(shred.geometricArea, 3)}:${fixed(shred.initialGeometricArea ?? shred.geometricArea, 3)}:${normalizeHex(shred.sourceColor || 'd6b84f')}:${layersHex}:${fixed(shred.visualSeed || 0, 3)}:${fixed(shred.decayAge || 0, 3)} ${fixed(shred.pos.x, 5)}:${fixed(shred.pos.y, 5)} ${fixed(angle, 5)}:${fixed(speed, 2)}`;
}

// @ds:ed2b4f19 @ds:d3187816 @ds:9f50b1be
export function encodeShredDeltaRow(shred, previous){
    const angle = movingAngle(shred);
    const speed = Math.hypot(shred.vel?.x || 0, shred.vel?.y || 0);
    const layersHex = encodeLayers(shred.remainingLayers);
    const layers = layersHex === previous.layersHex ? '=' : layersHex;
    return `d${shred.id} ${fixed(shred.pos.x, 5)}:${fixed(shred.pos.y, 5)} ${fixed(angle, 5)}:${fixed(speed, 2)} ${fixed(shred.decayAge || 0, 3)}:${layers}`;
}

// @ds:f51a5030 @ds:a16328a6
export function encodeRemovedFishRow(id){
    return `${id}:n =:=::: 0.00000:0.00000 0.00000:0.00 e`;
}

export function encodeFishRow(fish, previous = null, absolute = false){
    const type = fish.ownerKind === 'user' ? (fish.userTier === 'paid' ? 'p' : 'u') : 'n';
    const eaten = optNumber(fish.eatenFishCount || 0, previous?.eatenFishCount, 0, absolute);
    const size = optNumber(fish.size, previous?.size, 3, absolute);
    const color1 = optText(colorOf(fish), previous?.color1, absolute);
    const color2 = optText(color2Of(fish), previous?.color2, absolute);
    const name = optText(fish.ownerKind === 'user' ? encodeName(fish.userName || '') : '', previous?.name, absolute);
    const hasPrevious = Boolean(previous);
    const posX = absolute || !hasPrevious ? fixed(fish.pos.x, 5) : fixed(fish.pos.x - previous.pos.x, 5);
    const posY = absolute || !hasPrevious ? fixed(fish.pos.y, 5) : fixed(fish.pos.y - previous.pos.y, 5);
    const angle = movingAngle(fish);
    const speed = Math.hypot(fish.vel?.x || 0, fish.vel?.y || 0);
    const state = stateMods(fish);
    return `${fish.id}:${type} ${eaten}:${size}:${color1}:${color2}:${name} ${posX}:${posY} ${fixed(angle, 5)}:${fixed(speed, 2)} ${state}`;
}

// @ds:682570c7 @ds:9f50b1be
export function applyWorldSync(world, message){
    const text = String(message || '');
    const absolute = text.startsWith('a|');
    const rows = text.slice(absolute ? 2 : 1).split('|').filter(Boolean);
    const byId = new Map((world.fish || []).map(fish => [fish.id, fish]));
    const seen = new Set();
    const nextFish = absolute ? [] : [...(world.fish || [])];
    const shredById = new Map((world.shreds || []).map(shred => [shred.id, shred]));
    const nextShreds = [];
    const syncDiagnostics = { absolute, fish: [] };

    for( const row of rows ){
        if( row[0] === 's' || row[0] === 'd' || row[0] === 'k' ){
            const shred = parseShredRow(row, shredById);
            if( shred ) nextShreds.push(shred);
            continue;
        }
        const parsed = parseFishRow(row, byId, absolute);
        if( !parsed ) continue;
        seen.add(parsed.id);
        const existing = byId.get(parsed.id);
        if( absolute && !parsed.eaten ){
            syncDiagnostics.fish.push({
                id: parsed.id,
                ownerKind: parsed.ownerKind,
                clientPos: existing?.pos ? { ...existing.pos } : null,
                clientVel: existing?.vel ? { ...existing.vel } : null,
                serverPos: { ...parsed.pos },
            });
        }
        if( parsed.eaten ){
            if( existing && !absolute ){
                const index = nextFish.indexOf(existing);
                if( index >= 0 ) nextFish.splice(index, 1);
            }
            continue;
        }
        if( existing ){
            Object.assign(existing, parsed);
            existing.pos = parsed.pos;
            existing.vel = parsed.vel;
            if( absolute ) nextFish.push(existing);
        }else{
            nextFish.push(parsed);
        }
    }

    world.fish = absolute ? nextFish.filter(fish => seen.has(fish.id)) : nextFish;
    world.shreds = nextShreds;
    return syncDiagnostics;
}

// @ds:ed2b4f19 @ds:d3187816 @ds:9f50b1be
export function parseShredRow(row, byId = new Map()){
    if( String(row).startsWith('d') ) return parseShredDeltaRow(row, byId);
    const [idText, sizeText, pos, motion] = String(row).split(' ');
    if( !idText || !sizeText || !pos || !motion ) return null;
    const [xText, yText] = pos.split(':');
    const [angleText, speedText] = motion.split(':');
    const angle = Number(angleText) || 0;
    const speed = Number(speedText) || 0;
    if( idText.startsWith('k') ) return parseLegacyChunkAsShred(idText, sizeText, xText, yText, angle, speed);
    if( !idText.startsWith('s') ) return null;
    const [sizePart, areaText, initialAreaText, colorText, layersText, seedText, decayAgeText] = sizeText.split(':');
    const size = Number(sizePart) || 0;
    const geometricArea = Number(areaText) || 0;
    const initialGeometricArea = Number(initialAreaText) || geometricArea;
    return {
        id: Number(idText.slice(1)) || 0,
        pos: { x: Number(xText) || 0, y: Number(yText) || 0 },
        vel: {
            x: Math.cos(angle * Math.PI / 180) * speed,
            y: Math.sin(angle * Math.PI / 180) * speed,
        },
        size,
        radius: size / 2,
        geometricArea,
        initialGeometricArea: Math.max(geometricArea, initialGeometricArea),
        sourceColor: `#${normalizeHex(colorText || 'd6b84f')}`,
        remainingLayers: decodeLayers(layersText),
        visualSeed: Number(seedText) || 0,
        decayAge: Number(decayAgeText) || 0,
    };
}

// @ds:ed2b4f19 @ds:d3187816 @ds:9f50b1be
function parseShredDeltaRow(row, byId){
    const [idText, pos, motion, state] = String(row).split(' ');
    const id = Number(idText.slice(1));
    const previous = byId.get(id);
    if( !Number.isFinite(id) || !previous || !pos || !motion || !state ) return null;
    const [xText, yText] = pos.split(':');
    const [angleText, speedText] = motion.split(':');
    const [decayAgeText, layersText] = state.split(':');
    const angle = Number(angleText) || 0;
    const speed = Number(speedText) || 0;
    return {
        ...previous,
        pos: { x: Number(xText) || 0, y: Number(yText) || 0 },
        vel: {
            x: Math.cos(angle * Math.PI / 180) * speed,
            y: Math.sin(angle * Math.PI / 180) * speed,
        },
        decayAge: Number(decayAgeText) || 0,
        remainingLayers: layersText === '=' ? previous.remainingLayers : decodeLayers(layersText),
    };
}

function parseLegacyChunkAsShred(idText, sizeText, xText, yText, angle, speed){
    const [areaText, initialAreaText] = sizeText.split(':');
    const area = Number(areaText) || 0;
    const initialArea = Number(initialAreaText) || area;
    const size = 2 * Math.sqrt(Math.max(0, area) / Math.PI);
    return {
        id: Number(idText.slice(1)) || 0,
        pos: { x: Number(xText) || 0, y: Number(yText) || 0 },
        vel: {
            x: Math.cos(angle * Math.PI / 180) * speed,
            y: Math.sin(angle * Math.PI / 180) * speed,
        },
        size,
        radius: size / 2,
        geometricArea: area,
        initialGeometricArea: Math.max(area, initialArea),
        sourceColor: '#d6b84f',
        remainingLayers: [...SHRED.layerOrder.flat()],
        visualSeed: 0,
        decayAge: 0,
    };
}

export function parseFishRow(row, byId = new Map(), absolute = false){
    const [idType, meta, pos, motion, mods = ''] = String(row).split(' ');
    if( !idType || !meta || !pos || !motion ) return null;
    const [idText, type] = idType.split(':');
    const id = Number(idText);
    const previous = byId.get(id);
    const [eatenText, sizeText, color1, color2, name] = meta.split(':');
    const [xText, yText] = pos.split(':');
    const [angleText, speedText] = motion.split(':');
    const ownerKind = type === 'n' ? 'npc' : 'user';
    const userTier = type === 'p' ? 'paid' : (ownerKind === 'user' ? 'free' : null);
    const angle = Number(angleText) || 0;
    const speed = Number(speedText) || 0;
    const vx = Math.cos(angle * Math.PI / 180) * speed;
    const vy = Math.sin(angle * Math.PI / 180) * speed;
    const previousFacing = previous?.facing || 1;
    const facing = Math.abs(vx) > FISH.facingThreshold
        ? (vx < 0 ? -1 : 1)
        : previousFacing;
    const speedLevel = parseSpeedLevelMod(mods);
    const burstMode = speedLevel >= REGIME.burstStartSpeedLevel;
    const absolutePos = absolute || !previous;
    const parsed = {
        ...(previous || {}),
        id,
        ownerKind,
        isPlayer: ownerKind === 'user',
        userTier,
        npcRole: ownerKind === 'npc' ? (mods.includes('a') ? 'abandoned-user-fish' : 'prey') : null,
        hue: ownerKind === 'npc' ? 52 : previous?.hue,
        eatenFishCount: parseOptNumber(eatenText, previous?.eatenFishCount || 0),
        size: parseOptNumber(sizeText, previous?.size || 1),
        userColor: color1 === '=' ? previous?.userColor : `#${normalizeHex(color1 || '59bcd6')}`,
        formerUserColor: color2 === '=' ? previous?.formerUserColor : (color2 ? `#${normalizeHex(color2)}` : null),
        userName: name === '=' ? previous?.userName : decodeName(name || ''),
        pos: {
            x: (absolutePos ? 0 : previous.pos.x) + Number(xText),
            y: (absolutePos ? 0 : previous.pos.y) + Number(yText),
        },
        vel: {
            x: vx,
            y: vy,
        },
        mode: burstMode ? 'burst' : 'cruise',
        speedLevel,
        shredEatCueCounter: parseShredCueMod(mods, previous?.shredEatCueCounter || 0),
        fryAge: parseFryAgeMod(mods, ownerKind, previous?.fryAge),
        playerActiveAge: parsePlayerActiveAgeMod(mods, ownerKind, previous?.playerActiveAge || 0),
        eyeFear: mods.includes('f') ? 1 : 0,
        visualScale: previous?.visualScale || 1,
        facing,
        eaten: mods.includes('e'),
    };
    parsed.radius = FISH.baseRadius * Math.sqrt(parsed.size);
    return parsed;
}

function fishSnapshot(fish){
    return {
        id: fish.id,
        pos: { ...fish.pos },
        size: fish.size,
        eatenFishCount: fish.eatenFishCount || 0,
        shredEatCueCounter: fish.shredEatCueCounter || 0,
        color1: colorOf(fish),
        color2: color2Of(fish),
        name: fish.ownerKind === 'user' ? encodeName(fish.userName || '') : '',
    };
}

function shredSnapshot(shred){
    return {
        id: shred.id,
        layersHex: encodeLayers(shred.remainingLayers),
    };
}

function stateMods(fish){
    let mods = '';
    if( fish.ownerKind === 'npc' && fish.npcRole === 'abandoned-user-fish' ) mods += 'a';
    if( (fish.speedLevel || 0) > 0 ) mods += `v${Math.max(1, normalizeSpeedLevel(fish.speedLevel))}`;
    if( (fish.eyeFear || 0) > 0.2 ) mods += 'f';
    if( (fish.shredEatCueCounter || 0) > 0 ) mods += `s${Math.min(999, Math.floor(fish.shredEatCueCounter))}`;
    if( fish.ownerKind === 'user' && fish.fryAge !== null && fish.fryAge !== undefined ){
        mods += `g${encodeAgeTenths(fish.fryAge, 999)}`;
    }
    if( fish.ownerKind === 'user' ){
        mods += `l${encodeAgeTenths(fish.playerActiveAge || 0, 9999)}`;
    }
    return mods || '=';
}

function parseSpeedLevelMod(mods){
    const match = /v(\d{1,2})/.exec(mods || '');
    if( !match ) return 0;
    return normalizeSpeedLevel(match[1]);
}

function normalizeSpeedLevel(level){
    return Math.max(0, Math.min(REGIME.speedLevels, Math.floor(Number(level) || 0)));
}

function parseShredCueMod(mods, previous){
    const match = /s(\d+)/.exec(mods || '');
    return match ? Number(match[1]) : previous;
}

function parseFryAgeMod(mods, ownerKind, previous){
    if( ownerKind !== 'user' ) return null;
    const match = /g(\d+)/.exec(mods || '');
    if( match ) return Number(match[1]) / 10;
    return previous === null || previous === undefined ? null : null;
}

function parsePlayerActiveAgeMod(mods, ownerKind, previous){
    if( ownerKind !== 'user' ) return 0;
    const match = /l(\d+)/.exec(mods || '');
    return match ? Number(match[1]) / 10 : previous;
}

function encodeAgeTenths(value, max){
    return Math.min(max, Math.max(0, Math.round((Number(value) || 0) * 10)));
}

function colorOf(fish){
    return normalizeHex(fish.userColor || (fish.ownerKind === 'npc' ? 'd6b84f' : '59bcd6'));
}

function color2Of(fish){
    return fish.formerUserColor ? normalizeHex(fish.formerUserColor) : '';
}

function optNumber(value, previous, precision, absolute){
    if( !absolute && previous !== undefined && fixed(value, precision) === fixed(previous, precision) ) return '=';
    return fixed(value, precision);
}

function optText(value, previous, absolute){
    if( !absolute && previous !== undefined && value === previous ) return '=';
    return value;
}

function parseOptNumber(value, previous){
    return value === '=' ? previous : Number(value);
}

function movingAngle(fish){
    const x = fish.vel?.x || 0;
    const y = fish.vel?.y || 0;
    if( Math.hypot(x, y) <= 1e-6 ) return 0;
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function encodeSignedThousand(value){
    const n = Math.max(-999, Math.min(999, Math.round(value * 1000)));
    return `${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(3, '0')}`;
}

function decodeSignedThousand(value){
    if( !/^[+-]\d{3}$/.test(value) ) return 0;
    return Number(value) / 1000;
}

function normalizeHex(value){
    const hex = String(value || '').replace(/^#/, '').replace(/[^a-fA-F0-9]/g, '').slice(0, 6);
    return hex.padEnd(6, '0').toLowerCase();
}

function encodeLayers(layers = []){
    let mask = 0;
    const all = SHRED.layerOrder.flat();
    for( let i = 0; i < all.length; i++ ){
        if( layers.includes(all[i]) ) mask |= (1 << i);
    }
    return mask.toString(16);
}

function decodeLayers(value){
    const mask = parseInt(value || '0', 16);
    const all = SHRED.layerOrder.flat();
    return all.filter((_, index) => mask & (1 << index));
}

function bytesToBase64Url(bytes){
    if( typeof Buffer !== 'undefined' ){
        return Buffer.from(bytes).toString('base64url');
    }
    let binary = '';
    for( const byte of bytes ) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(encoded){
    const base64 = String(encoded || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    if( typeof Buffer !== 'undefined' ){
        return Uint8Array.from(Buffer.from(padded, 'base64'));
    }
    const binary = atob(padded);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function fixed(value, precision){
    return Number(value || 0).toFixed(precision);
}

function round(value, precision){
    return Number(value || 0).toFixed(precision);
}
