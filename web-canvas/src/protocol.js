// imp/web-canvas/src/protocol.js
// Compact WebSocket string protocol.
// @ds:839f8cd0 @ds:5a4d3d6d @ds:671e9773 @ds:e6be3c03 @ds:4fad33f8 @ds:682570c7 @ds:ea18a088 @ds:f51a5030 @ds:a16328a6 @ds:ed2b4f19 @ds:a2d5936f @ds:2e91f6d4 @ds:2afd71a0 @ds:9f50b1be

import { FISH, WORLD, REGIME, SHRED, SYNC } from './constants.js';

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

export function encodeClientSyncAck(cycle){
    return `v:${Math.max(0, Math.floor(Number(cycle) || 0))}`;
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
    if( kind === 'v' ) return { type: 'syncAck', cycle: Number(text.slice(2)) || 0 };
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

export function encodeWorldScale(scale){
    return `s:${String(Number(Number(scale || 1).toFixed(3)))}`;
}

// @ds:682570c7 @ds:c39827ed @ds:e047bbdf @ds:6c8c56e7 @ds:2afd71a0 @ds:9f50b1be
export function encodeWorldCycle(world, previousState = new Map(), cycle = 1, birthCycles = new Map()){
    const previousFishById = previousState?.fish || (previousState instanceof Map ? previousState : new Map());
    const previousShredsById = previousState?.shreds || new Map();
    const nextFishById = new Map();
    const nextShredsById = new Map();
    const rowsByCell = new Map();
    for( const fish of world.fish || [] ){
        const cell = cellOf(fish.pos, world);
        const previous = previousFishById.get(fish.id);
        const key = transportId('fish', fish.id);
        const isNew = isNewTransportObject(key, cycle, birthCycles);
        const fullRow = encodeFishRow(fish, null, true, cell);
        const absoluteRow = isNew ? `n${fullRow}` : fullRow;
        const relativeRow = isNew ? absoluteRow : encodeFishRow(fish, previous, false);
        addCellRows(rowsByCell, cell, absoluteRow, relativeRow);
        nextFishById.set(fish.id, fishSnapshot(fish));
    }
    for( const shred of world.shreds || [] ){
        const cell = cellOf(shred.pos, world);
        const previous = previousShredsById.get(shred.id);
        const key = transportId('shred', shred.id);
        const isNew = isNewTransportObject(key, cycle, birthCycles);
        const fullRow = encodeShredRow(shred, cell);
        const absoluteRow = isNew ? `n${fullRow}` : fullRow;
        const relativeRow = isNew || !previous ? absoluteRow : encodeShredDeltaRow(shred, previous);
        addCellRows(rowsByCell, cell, absoluteRow, relativeRow);
        nextShredsById.set(shred.id, shredSnapshot(shred));
    }
    const encoded = encodeCellRowSets(rowsByCell);
    return {
        ...encoded,
        state: { fish: nextFishById, shreds: nextShredsById },
    };
}

// @ds:0aaccaf8
export function encodeObjectRemoval(kind, id, removalCycle = 0){
    const cycle = Number.isInteger(removalCycle) && removalCycle >= 0 ? removalCycle : 0;
    return `x:${cycle}:${kind === 'shred' ? 's' : ''}${id}`;
}

function cellOf(pos, world){
    const columns = Math.max(1, Math.round((world?.width || SYNC.cellSize) / SYNC.cellSize));
    const rows = Math.max(1, Math.round((world?.height || SYNC.cellSize) / SYNC.cellSize));
    return {
        x: ((Math.floor((Number(pos?.x) || 0) / SYNC.cellSize) % columns) + columns) % columns,
        y: ((Math.floor((Number(pos?.y) || 0) / SYNC.cellSize) % rows) + rows) % rows,
    };
}

function transportId(kind, id){
    return `${kind === 'shred' ? 's' : 'f'}${id}`;
}

function isNewTransportObject(key, cycle, birthCycles){
    if( !birthCycles.has(key) ) birthCycles.set(key, cycle);
    return cycle - birthCycles.get(key) < SYNC.newObjectAbsoluteCycles;
}

function addCellRows(rowsByCell, cell, absoluteRow, relativeRow){
    const key = `${cell.x}:${cell.y}`;
    const entry = rowsByCell.get(key) || { key, cellX: cell.x, cellY: cell.y, absoluteRows: [], relativeRows: [] };
    entry.absoluteRows.push(absoluteRow);
    entry.relativeRows.push(relativeRow);
    rowsByCell.set(key, entry);
}

function encodeCellRowSets(rowsByCell){
    const entries = [...rowsByCell.values()].sort((a, b) => a.cellY - b.cellY || a.cellX - b.cellX);
    let absoluteText = '';
    let relativeText = '';
    const cells = [];
    for( const entry of entries ){
        const absoluteRows = entry.absoluteRows.join('|');
        const relativeRows = entry.relativeRows.join('|');
        if( absoluteText ) absoluteText += '|';
        if( relativeText ) relativeText += '|';
        const absoluteStart = absoluteText.length;
        const relativeStart = relativeText.length;
        absoluteText += absoluteRows;
        relativeText += relativeRows;
        cells.push({
            key: entry.key,
            cellX: entry.cellX,
            cellY: entry.cellY,
            absoluteStart,
            absoluteEnd: absoluteText.length,
            relativeStart,
            relativeEnd: relativeText.length,
        });
    }
    return { absoluteText, relativeText, cells };
}

// @ds:ed2b4f19 @ds:d3187816 @ds:9f50b1be
export function encodeShredRow(shred, cell = null){
    const angle = movingAngle(shred);
    const speed = Math.hypot(shred.vel?.x || 0, shred.vel?.y || 0);
    const layersHex = encodeLayers(shred.remainingLayers);
    const pos = encodedPosition(shred.pos, cell);
    return `s${shred.id} ${fixed(shred.size, 3)}:${fixed(shred.geometricArea, 3)}:${fixed(shred.initialGeometricArea ?? shred.geometricArea, 3)}:${normalizeHex(shred.sourceColor || 'd6b84f')}:${layersHex}:${fixed(shred.visualSeed || 0, 3)}:${fixed(shred.decayAge || 0, 3)} ${fixed(pos.x, 5)}:${fixed(pos.y, 5)} ${fixed(angle, 5)}:${fixed(speed, 2)}`;
}

// @ds:ed2b4f19 @ds:d3187816 @ds:9f50b1be
export function encodeShredDeltaRow(shred, previous){
    const angle = movingAngle(shred);
    const speed = Math.hypot(shred.vel?.x || 0, shred.vel?.y || 0);
    const layersHex = encodeLayers(shred.remainingLayers);
    const layers = layersHex === previous.layersHex ? '=' : layersHex;
    return `d${shred.id} ${fixed(shred.pos.x - previous.pos.x, 5)}:${fixed(shred.pos.y - previous.pos.y, 5)} ${fixed(angle, 5)}:${fixed(speed, 2)} ${fixed(shred.decayAge || 0, 3)}:${layers}`;
}

// @ds:f51a5030 @ds:a16328a6
export function encodeFishRow(fish, previous = null, absolute = false, cell = null){
    const type = fish.ownerKind === 'user' ? (fish.userTier === 'paid' ? 'p' : 'u') : 'n';
    const eaten = optNumber(fish.eatenFishCount || 0, previous?.eatenFishCount, 0, absolute);
    const size = optNumber(fish.size, previous?.size, 3, absolute);
    const color1 = optText(colorOf(fish), previous?.color1, absolute);
    const color2 = optText(color2Of(fish), previous?.color2, absolute);
    const name = optText(fish.ownerKind === 'user' ? encodeName(fish.userName || '') : '', previous?.name, absolute);
    const hasPrevious = Boolean(previous);
    const absolutePos = encodedPosition(fish.pos, cell);
    const posX = absolute || !hasPrevious ? fixed(absolutePos.x, 5) : fixed(fish.pos.x - previous.pos.x, 5);
    const posY = absolute || !hasPrevious ? fixed(absolutePos.y, 5) : fixed(fish.pos.y - previous.pos.y, 5);
    const angle = movingAngle(fish);
    const speed = Math.hypot(fish.vel?.x || 0, fish.vel?.y || 0);
    const state = stateMods(fish);
    return `${fish.id}:${type} ${eaten}:${size}:${color1}:${color2}:${name} ${posX}:${posY} ${fixed(angle, 5)}:${fixed(speed, 2)} ${state}`;
}

function encodedPosition(pos, cell){
    if( !cell ) return pos;
    return {
        x: pos.x - cell.x * SYNC.cellSize,
        y: pos.y - cell.y * SYNC.cellSize,
    };
}

// @ds:682570c7 @ds:e047bbdf @ds:6c8c56e7 @ds:28d9098a @ds:8c663384 @ds:9f50b1be
export function applyWorldFragment(world, message, transportState, receivedAt){
    const text = String(message || '');
    const absoluteFragment = text.startsWith('a:');
    const headerStart = absoluteFragment ? 2 : 1;
    const separator = text.indexOf('|', headerStart);
    if( separator < 0 ) return null;
    const [cycleText, cellXText, cellYText] = text.slice(headerStart, separator).split(':');
    const cycle = Number(cycleText);
    const cellX = Number(cellXText);
    const cellY = Number(cellYText);
    if( !Number.isInteger(cycle) || !Number.isFinite(cellX) || !Number.isFinite(cellY) ) return null;
    if( transportState.currentCycle !== null && cycle < transportState.currentCycle ) return null;
    if( cycle > (transportState.currentCycle ?? -1) ) beginTransportCycle(world, transportState, cycle, receivedAt);
    const rows = text.slice(separator + 1).split('|').filter(Boolean);
    const byId = new Map((world.fish || []).map(fish => [fish.id, fish]));
    const shredById = new Map((world.shreds || []).map(shred => [shred.id, shred]));
    const syncDiagnostics = { absolute: absoluteFragment, cycle, cellX, cellY, fish: [], dynamicEvents: 0 };

    for( const sourceRow of rows ){
        if( sourceRow === '~' ) continue;
        const newObject = sourceRow[0] === 'n';
        const row = newObject ? sourceRow.slice(1) : sourceRow;
        const full = absoluteFragment || newObject;
        if( row[0] === 's' || row[0] === 'd' || row[0] === 'k' ){
            const id = shredIdOfRow(row);
            const key = transportId('shred', id);
            let previous = shredById.get(id);
            const removedAtCycle = transportState.tombstones.get(key);
            if( removedAtCycle !== undefined && (!full || cycle <= removedAtCycle) ) continue;
            if( removedAtCycle !== undefined && previous ){
                const index = world.shreds.indexOf(previous);
                if( index >= 0 ) world.shreds.splice(index, 1);
                previous = null;
            }
            if( removedAtCycle !== undefined ) transportState.tombstones.delete(key);
            if( !full && previous?._syncCycle !== cycle - 1 ) continue;
            const shred = parseShredRow(row, shredById, full, cellX, cellY);
            if( !shred ) continue;
            acceptTransportObject(shred, previous, cycle, receivedAt, transportState, key, newObject);
            if( previous ) Object.assign(previous, shred);
            else world.shreds.push(shred);
            syncDiagnostics.dynamicEvents++;
            continue;
        }
        const id = fishIdOfRow(row);
        const key = transportId('fish', id);
        let existing = byId.get(id);
        const removedAtCycle = transportState.tombstones.get(key);
        if( removedAtCycle !== undefined && (!full || cycle <= removedAtCycle) ) continue;
        if( removedAtCycle !== undefined && existing ){
            const index = world.fish.indexOf(existing);
            if( index >= 0 ) world.fish.splice(index, 1);
            existing = null;
        }
        if( removedAtCycle !== undefined ) transportState.tombstones.delete(key);
        if( !full && existing?._syncCycle !== cycle - 1 ) continue;
        const parsed = parseFishRow(row, byId, full, cellX, cellY);
        if( !parsed ) continue;
        if( full ){
            syncDiagnostics.fish.push({
                id: parsed.id,
                ownerKind: parsed.ownerKind,
                clientPos: existing?.pos ? { ...existing.pos } : null,
                clientVel: existing?.vel ? { ...existing.vel } : null,
                serverPos: { ...parsed.pos },
            });
        }
        acceptTransportObject(parsed, existing, cycle, receivedAt, transportState, key, newObject);
        if( existing ){
            Object.assign(existing, parsed);
            existing.pos = parsed.pos;
            existing.vel = parsed.vel;
        }else{
            world.fish.push(parsed);
        }
        syncDiagnostics.dynamicEvents++;
    }
    syncDiagnostics.cycleStartedAt = transportState.cycleStartedAt;
    return syncDiagnostics;
}

// @ds:0aaccaf8 @ds:8c663384
export function applyObjectRemoval(world, message, transportState, receivedAt){
    const payload = String(message || '').slice(2);
    const separator = payload.indexOf(':');
    const removalCycle = separator >= 0 ? Number(payload.slice(0, separator)) : transportState.currentCycle ?? -1;
    const identifier = separator >= 0 ? payload.slice(separator + 1) : payload;
    const shred = identifier.startsWith('s');
    const id = Number(shred ? identifier.slice(1) : identifier);
    if( !Number.isFinite(id) ) return null;
    const key = transportId(shred ? 'shred' : 'fish', id);
    transportState.tombstones.set(key, Number.isInteger(removalCycle) ? removalCycle : transportState.currentCycle ?? -1);
    const collection = shred ? world.shreds : world.fish;
    const object = collection.find(candidate => candidate.id === id);
    if( !object ) return { key, object: null, collection };
    const elapsed = Math.max(0, (receivedAt - (object._syncBaseAt ?? receivedAt)) / 1000);
    object.pos = {
        x: wrapValue(object.pos.x + (object.vel?.x || 0) * elapsed, world.width),
        y: wrapValue(object.pos.y + (object.vel?.y || 0) * elapsed, world.height),
    };
    object.vel = { x: 0, y: 0 };
    startVisibilityTransition(object, 'removing', receivedAt, SYNC.removalFadeSeconds, syncOpacityAt(object, receivedAt));
    return { key, object, collection };
}

export function syncOpacityAt(object, now){
    const transition = object?._syncVisibility;
    if( !transition ) return 1;
    const durationMs = Math.max(1, transition.duration * 1000);
    const t = Math.max(0, Math.min(1, (now - transition.startedAt) / durationMs));
    if( transition.phase === 'visible' ) return 1;
    if( transition.phase === 'hidden' ) return 0;
    if( transition.phase === 'appearing' ) return transition.from + (1 - transition.from) * easeOutCubic(t);
    if( transition.phase === 'fading' ) return transition.from * (1 - easeOutCubic(t));
    if( transition.phase === 'removing' ) return transition.from * (1 - easeOutCubic(t));
    return 1;
}

function beginTransportCycle(world, transportState, cycle, receivedAt){
    for( const object of [...(world.fish || []), ...(world.shreds || [])] ){
        if( object._syncCycle <= cycle - 2 && object._syncVisibility?.phase !== 'removing' ){
            startVisibilityTransition(object, 'fading', receivedAt, SYNC.temporaryFadeSeconds, syncOpacityAt(object, receivedAt));
        }
    }
    transportState.currentCycle = cycle;
    transportState.cycleStartedAt = receivedAt;
}

function acceptTransportObject(object, previous, cycle, receivedAt, transportState, key, newObject){
    const alpha = previous ? syncOpacityAt(previous, receivedAt) : 0;
    object._syncCycle = cycle;
    object._syncBaseAt = transportState.cycleStartedAt;
    if( newObject ) transportState.tombstones.delete(key);
    if( !previous || alpha < 1 ) startVisibilityTransition(object, 'appearing', receivedAt, SYNC.temporaryFadeSeconds, alpha);
    else object._syncVisibility = { phase: 'visible', startedAt: receivedAt, duration: 0, from: 1 };
}

function startVisibilityTransition(object, phase, startedAt, duration, from){
    object._syncVisibility = { phase, startedAt, duration, from: Math.max(0, Math.min(1, from)) };
}

function fishIdOfRow(row){
    return Number(String(row).split(' ')[0].split(':')[0]);
}

function shredIdOfRow(row){
    return Number(String(row).split(' ')[0].slice(1));
}

function easeOutCubic(t){
    return 1 - (1 - t) ** 3;
}

function wrapValue(value, size){
    if( !Number.isFinite(size) || size <= 0 ) return value;
    return ((value % size) + size) % size;
}

// @ds:ed2b4f19 @ds:d3187816 @ds:9f50b1be
export function parseShredRow(row, byId = new Map(), absolute = false, cellX = 0, cellY = 0){
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
        pos: decodePosition(xText, yText, absolute, cellX, cellY),
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
        pos: {
            x: previous.pos.x + (Number(xText) || 0),
            y: previous.pos.y + (Number(yText) || 0),
        },
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

export function parseFishRow(row, byId = new Map(), absolute = false, cellX = 0, cellY = 0){
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
    const speedLevel = parseSpeedLevelMod(mods);
    const burstMode = speedLevel >= REGIME.burstStartSpeedLevel;
    const reverseFacing = mods.includes('r');
    const previousMovementFacing = previous?.movementFacing || previous?.facing || 1;
    const movementFacing = Math.abs(vx) > FISH.facingThreshold
        ? (vx < 0 ? -1 : 1)
        : previousMovementFacing;
    const facing = movementFacing;
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
        pos: absolutePos
            ? decodePosition(xText, yText, true, cellX, cellY)
            : { x: previous.pos.x + Number(xText), y: previous.pos.y + Number(yText) },
        vel: {
            x: vx,
            y: vy,
        },
        mode: burstMode ? 'burst' : 'cruise',
        speedLevel,
        reverseFacing,
        shredEatCueCounter: parseShredCueMod(mods, previous?.shredEatCueCounter || 0),
        fryAge: parseFryAgeMod(mods, ownerKind, previous?.fryAge),
        playerActiveAge: parsePlayerActiveAgeMod(mods, ownerKind, previous?.playerActiveAge || 0),
        lifetimeMode: parseLifetimeModeMod(mods, ownerKind, previous?.lifetimeMode), // @fix:de7b4c19
        eyeFear: mods.includes('f') ? 1 : 0,
        visualScale: previous?.visualScale || 1,
        movementFacing,
        facing,
        eaten: mods.includes('e'),
    };
    parsed.radius = FISH.nominalStartDiameter * WORLD.pixelsPerWorldUnit * Math.sqrt(parsed.size) / 2;
    return parsed;
}

function decodePosition(xText, yText, absolute, cellX, cellY){
    const x = Number(xText) || 0;
    const y = Number(yText) || 0;
    return absolute
        ? { x: cellX * SYNC.cellSize + x, y: cellY * SYNC.cellSize + y }
        : { x, y };
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
        pos: { ...shred.pos },
        layersHex: encodeLayers(shred.remainingLayers),
    };
}

function stateMods(fish){
    let mods = '';
    if( fish.ownerKind === 'npc' && fish.npcRole === 'abandoned-user-fish' ) mods += 'a';
    if( (fish.speedLevel || 0) > 0 ) mods += `${fish.reverseFacing ? 'r' : 'v'}${Math.max(1, normalizeSpeedLevel(fish.speedLevel))}`;
    if( (fish.eyeFear || 0) > 0.2 ) mods += 'f';
    if( (fish.shredEatCueCounter || 0) > 0 ) mods += `s${Math.min(999, Math.floor(fish.shredEatCueCounter))}`;
    if( fish.ownerKind === 'user' && fish.fryAge !== null && fish.fryAge !== undefined ){
        mods += `g${encodeAgeTenths(fish.fryAge, 999)}`;
    }
    if( fish.ownerKind === 'user' ){
        mods += `l${encodeAgeTenths(fish.playerActiveAge || 0, 9999)}`;
        mods += `t${fish.lifetimeMode === 'lowSize' ? 1 : fish.lifetimeMode === 'highSize' ? 2 : 0}`; // @fix:de7b4c19
    }
    return mods || '=';
}

function parseSpeedLevelMod(mods){
    const match = /[vr](\d{1,2})/.exec(mods || '');
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

// @fix:de7b4c19
function parseLifetimeModeMod(mods, ownerKind, previous){
    if( ownerKind !== 'user' ) return null;
    const match = /t([012])/.exec(mods || '');
    if( !match ) return previous ?? null;
    return match[1] === '1' ? 'lowSize' : match[1] === '2' ? 'highSize' : null;
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
