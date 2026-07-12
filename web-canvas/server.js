// imp/web-canvas/server.js
// Static file server, WebSocket endpoint, authoritative world loop.
// @ds:f359ebf2 @ds:27fa3caa @ds:4bfe0352 @ds:4c7a2b91 @ds:93a64773 @ds:704ab317 @ds:e559831a @ds:e6be3c03

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { SERVER, SYNC, RECONNECT, REGIME, WORLD } from './src/constants.js';
import { makeFish, technicalRadiusOf, updateAbandonedGradient } from './src/fish.js';
import { startUserFryStage } from './src/player.js';
import { makeWorld, findLowestDensitySpawn, formatWorldScale, worldScale } from './src/world.js';
import { maintainPopulation } from './src/prey.js';
import { stepAuthoritativeWorld } from './src/step.js';
import { isLeaveBlockedByUserAttack } from './src/predation.js';
import {
    encodeEvent,
    encodeIdentity,
    encodeObjectRemoval,
    encodeWorldScale,
    encodeWorldSize,
    encodeWorldCycle,
    parseClientMessage,
} from './src/protocol.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const workspaceRoot = normalize(join(root, '..'));
const port = Number(process.env.PORT || SERVER.port);
const appVersion = makeAppVersion(); // @ds:8d13f6a2
const world = makeWorld();
const inputsByClient = new Map();
const sockets = new Map();
const disconnects = new Map();
let nextClientId = 1;
let syncCycle = 0;
let lastWorldSyncState = new Map();
const objectBirthCycles = new Map();
let activeSyncPlan = null;
const performanceStatistics = makePerformanceStatistics();

maintainPopulation({ world }, Math.random);

const server = createServer(async (req, res) =>{
    const url = new URL(req.url, `http://${req.headers.host}`);
    if( url.pathname === '/version.json' ){
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ version: appVersion }));
        return;
    }
    const safePath = normalize(url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '')).replace(/^(\.\.[/\\])+/, '');
    const path = join(root, safePath);
    const allowed = path.startsWith(root);
    if( !allowed ){
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    try{
        const body = await readFile(path);
        res.writeHead(200, { 'content-type': contentType(path) });
        res.end(body);
    }catch{
        res.writeHead(404);
        res.end('Not found');
    }
});

const wss = new WebSocketServer({ server });
wss.on('connection', socket =>{
    const clientId = `c${nextClientId++}`;
    sockets.set(socket, { clientId, fishId: null, temporaryConnectionCode: null });

    socket.on('message', data =>{
        const message = parseClientMessage(data.toString());
        const meta = sockets.get(socket);
        if( !meta ) return;
        if( message.type === 'join' ) handleJoin(socket, meta, message);
        if( message.type === 'reconnect' ) handleReconnectGrace(socket, meta, message);
        if( message.type === 'input' ){
            if( findClientFish(meta) ) inputsByClient.set(meta.clientId, normalizeInput(message));
            else inputsByClient.delete(meta.clientId);
        }
        if( message.type === 'leave' ) handleLeaveGame(socket, meta);
        if( message.type === 'syncAck' ) handleSyncAck(socket, meta, message);
    });

    socket.on('close', () =>{
        const meta = sockets.get(socket);
        sockets.delete(socket);
        if( meta?.fishId ) markDisconnected(meta);
    });
});

// @ds:4bfe0352 @ds:58050922
function handleJoin(socket, meta, message){
    const existing = findClientFish(meta);
    if( existing ){
        updateUserFishProfile(existing, message);
        send(socket, encodeIdentity(meta.fishId, existing.temporaryConnectionCode));
        send(socket, encodeWorldScale(world.scale));
        return;
    }
    inputsByClient.delete(meta.clientId);
    const temporaryConnectionCode = makeCode();
    const fish = makeFish({
        pos: findLowestDensitySpawn(world, Math.random),
        isPlayer: true,
        ownerKind: 'user',
        clientId: meta.clientId,
        temporaryConnectionCode,
        worldScale: world.scale,
        ...normalizedUserProfile(message),
    });
    startUserFryStage(fish, fish.pos, 'join', world.scale);
    world.fish.push(fish);
    meta.fishId = fish.id;
    meta.temporaryConnectionCode = temporaryConnectionCode;
    send(socket, encodeIdentity(meta.fishId, temporaryConnectionCode));
    updateWorldScale();
    send(socket, encodeWorldScale(world.scale));
}

// @ds:4bfe0352 @ds:58050922
function updateUserFishProfile(fish, message){
    Object.assign(fish, normalizedUserProfile(message));
}

function normalizedUserProfile(message){
    return {
        userName: String(message.userName || 'fish').slice(0, 24),
        userColor: String(message.userColor || '#59bcd6').slice(0, 16),
        userTier: message.userTier === 'paid' ? 'paid' : 'free',
    };
}

// @ds:93a64773
function handleReconnectGrace(socket, meta, message){
    const restored = restoreByConnectionCode(meta, message.temporaryConnectionCode);
    if( restored ){
        meta.temporaryConnectionCode = message.temporaryConnectionCode;
        send(socket, encodeIdentity(meta.fishId, message.temporaryConnectionCode));
        send(socket, encodeWorldScale(world.scale));
        return;
    }
    meta.fishId = null;
    meta.temporaryConnectionCode = null;
    inputsByClient.delete(meta.clientId);
    send(socket, encodeEvent('rj', 'expired'));
}

function restoreByConnectionCode(meta, code){
    const fish = world.fish.find(candidate => candidate.temporaryConnectionCode === code && candidate.ownerKind === 'user');
    if( !fish ) return false;
    const disconnect = disconnects.get(fish.id);
    if( !disconnect ) return false;
    inputsByClient.delete(disconnect.clientId);
    releaseClientFish(meta);
    fish.clientId = meta.clientId;
    meta.fishId = fish.id;
    disconnects.delete(fish.id);
    return true;
}

// @ds:704ab317 @ds:8917ad63
function handleLeaveGame(socket, meta){
    const fish = findClientFish(meta);
    if( !fish ) return;
    if( isLeaveBlockedByUserAttack(world, fish) ){
        send(socket, encodeEvent('wrn', fish.id));
        return;
    }
    convertUserFishToNpc(fish);
    meta.fishId = null;
    inputsByClient.delete(meta.clientId);
    send(socket, encodeEvent('npc', fish.id));
}

// @ds:eba75588 @ds:c3708d14
function convertUserFishToNpc(fish){
    fish.ownerKind = 'npc';
    fish.npcRole = 'abandoned-user-fish';
    fish.formerUserColor = fish.userColor;
    fish.userName = '';
    fish.userTier = null;
    fish.clientId = null;
    fish.age = 0; // @ds:a6c9e8b4
    updateAbandonedGradient(fish);
    updateWorldScale();
}

function releaseClientFish(meta){
    const fish = findClientFish(meta);
    if( !fish ) return;
    convertUserFishToNpc(fish);
    disconnects.delete(fish.id);
    meta.fishId = null;
    meta.temporaryConnectionCode = null;
}

function markDisconnected(meta){
    const fish = findClientFish(meta);
    if( !fish ) return;
    inputsByClient.delete(meta.clientId);
    disconnects.set(fish.id, {
        deadline: Date.now() + RECONNECT.graceSeconds * 1000,
        clientId: meta.clientId,
    });
}

function findClientFish(meta){
    return world.fish.find(fish => fish.id === meta.fishId && fish.ownerKind === 'user');
}

function normalizeInput(message){
    const speedLevel = Math.max(0, Math.min(REGIME.speedLevels, Math.floor(Number(message.speedLevel) || 0)));
    return {
        accel: message.accel || { x: 0, y: 0 },
        speedLevel,
        cruiseControl: message.cruiseControl === 'keyboard' && speedLevel > 0 && speedLevel <= REGIME.cruiseMaxSpeedLevel ? 'keyboard' : null,
    };
}

function tick(){
    const now = Date.now();
    for( const [fishId, disconnect] of disconnects ){
        if( now < disconnect.deadline ) continue;
        const fish = world.fish.find(candidate => candidate.id === fishId);
        if( fish ) convertUserFishToNpc(fish);
        inputsByClient.delete(disconnect.clientId);
        disconnects.delete(fishId);
    }

    updateWorldScale();
    const beforeFish = new Set(world.fish.map(fish => fish.id));
    const beforeShreds = new Set(world.shreds.map(shred => shred.id));
    const iterationStartedAt = performance.now();
    stepAuthoritativeWorld({ world }, inputsByClient, 1 / SERVER.tickRate, Math.random);
    performanceStatistics.worldIterationTotalMs += performance.now() - iterationStartedAt;
    performanceStatistics.worldIterationCount++;
    performanceStatistics.controlledObjectTotal += world.fish.length + world.shreds.length;
    broadcastRemovedObjects(beforeFish, beforeShreds);
}

// @ds:e559831a @ds:c39827ed @ds:2afd71a0 @ds:61245206
function broadcastWorldSync(forceAbsolute = false){
    if( activeSyncPlan ) performanceStatistics.droppedFragmentCount += activeSyncPlan.remaining;
    const cycle = ++syncCycle;
    const encoded = encodeWorldCycle(world, lastWorldSyncState, cycle, objectBirthCycles);
    lastWorldSyncState = encoded.state;
    performanceStatistics.preparedSyncCycleCount++;
    activeSyncPlan = makeSyncPlan(encoded, cycle, forceAbsolute);
    runSyncPhases(activeSyncPlan);
}

// @ds:c39827ed @ds:0a2b6379 @ds:682570c7
function makeSyncPlan(encoded, cycle, forceAbsolute){
    const lookup = new Map(encoded.cells.map(cell => [cell.key, cell]));
    const columns = Math.round(world.width / SYNC.cellSize);
    const rows = Math.round(world.height / SYNC.cellSize);
    const phases = [[], [], [], []];
    const offsets = [
        [[0, 0]],
        [[-1, 0], [1, 0]],
        [[0, -1], [0, 1]],
        [],
    ];
    for( let dy = -2; dy <= 2; dy++ ){
        for( let dx = -2; dx <= 2; dx++ ){
            if( Math.abs(dx) <= 1 && Math.abs(dy) <= 1 ){
                if( dx === 0 || dy === 0 ) continue;
            }
            offsets[3].push([dx, dy]);
        }
    }
    for( const [socket, meta] of sockets ){
        const fish = findClientFish(meta);
        if( !fish || socket.readyState !== socket.OPEN ) continue;
        const ownX = Math.floor(fish.pos.x / SYNC.cellSize);
        const ownY = Math.floor(fish.pos.y / SYNC.cellSize);
        offsets.forEach((phaseOffsets, phaseIndex) => phaseOffsets.forEach(([dx, dy]) => {
            const x = (ownX + dx + columns) % columns;
            const y = (ownY + dy + rows) % rows;
            const cell = lookup.get(`${x}:${y}`);
            if( !cell && phaseIndex !== 1 ) return;
            phases[phaseIndex].push({ socket, meta, x, y });
        }));
    }
    return { cycle, encoded, forceAbsolute, phases, phase: 0, entryIndex: 0, remaining: phases.reduce((total, phase) => total + phase.length, 0), lookup, cancelled: false };
}

function runSyncPhases(plan){
    if( activeSyncPlan !== plan || plan.cancelled || plan.phase >= plan.phases.length ) return;
    const startedAt = performance.now();
    const entries = plan.phases[plan.phase];
    const deadline = startedAt + SYNC.deliveryBudgetMs;
    while( plan.entryIndex < entries.length && (plan.entryIndex === 0 || performance.now() < deadline) ){
        const entry = entries[plan.entryIndex++];
        sendPlanFragment(plan, entry);
        plan.remaining--;
    }
    performanceStatistics.phaseTotalMs += performance.now() - startedAt;
    if( plan.entryIndex < entries.length ){
        setImmediate(() => runSyncPhases(plan));
        return;
    }
    performanceStatistics.phaseCount++;
    plan.phase++;
    plan.entryIndex = 0;
    if( plan.phase < plan.phases.length ) setImmediate(() => runSyncPhases(plan));
    else activeSyncPlan = null;
}

function sendPlanFragment(plan, entry){
    if( entry.socket.readyState !== entry.socket.OPEN ) return;
    if( entry.socket.bufferedAmount > SYNC.maxSocketBufferedBytes ) return;
    const absolute = plan.forceAbsolute || plan.cycle % SYNC.globalAbsoluteEvery === 0 || plan.phase === 0;
    const cell = plan.lookup.get(`${entry.x}:${entry.y}`);
    const prefix = `${absolute ? 'a:' : '|'}${plan.cycle}:${entry.x}:${entry.y}|`;
    const source = absolute ? plan.encoded.absoluteText : plan.encoded.relativeText;
    const message = cell ? `${prefix}${source.slice(absolute ? cell.absoluteStart : cell.relativeStart, absolute ? cell.absoluteEnd : cell.relativeEnd)}` : `${prefix}~`;
    entry.socket.send(message);
    entry.meta.syncCycles ??= new Map();
    const stat = entry.meta.syncCycles.get(plan.cycle) || { firstSentAt: performance.now(), bytes: 0 };
    stat.bytes += Buffer.byteLength(message);
    entry.meta.syncCycles.set(plan.cycle, stat);
}

// @ds:61245206
function makePerformanceStatistics(){
    return {
        windowStartedAt: performance.now(),
        worldIterationCount: 0,
        worldIterationTotalMs: 0,
        controlledObjectTotal: 0,
        preparedSyncCycleCount: 0,
        droppedFragmentCount: 0,
        phaseCount: 0,
        phaseTotalMs: 0,
        syncAckCount: 0,
    };
}

// @ds:61245206
function reportPerformanceStatistics(){
    const now = performance.now();
    const averageWorldIterationMs = performanceStatistics.worldIterationCount
        ? performanceStatistics.worldIterationTotalMs / performanceStatistics.worldIterationCount
        : 0;
    const averagePhaseMs = performanceStatistics.phaseCount ? performanceStatistics.phaseTotalMs / performanceStatistics.phaseCount : 0;
    const averageControlledObjects = performanceStatistics.worldIterationCount
        ? performanceStatistics.controlledObjectTotal / performanceStatistics.worldIterationCount
        : 0;
    const averageDroppedFragments = performanceStatistics.preparedSyncCycleCount
        ? performanceStatistics.droppedFragmentCount / performanceStatistics.preparedSyncCycleCount
        : 0;
    console.log(
        `[server stats ${((now - performanceStatistics.windowStartedAt) / 1000).toFixed(1)}s] `
        + `world=${averageWorldIterationMs.toFixed(3)}ms/iteration; `
        + `phase=${averagePhaseMs.toFixed(3)}ms; `
        + `objects=${averageControlledObjects.toFixed(1)}; `
        + `dropped=${averageDroppedFragments.toFixed(2)} fragments/cycle; acks=${performanceStatistics.syncAckCount}`
    );
    performanceStatistics.windowStartedAt = now;
    performanceStatistics.worldIterationCount = 0;
    performanceStatistics.worldIterationTotalMs = 0;
    performanceStatistics.controlledObjectTotal = 0;
    performanceStatistics.preparedSyncCycleCount = 0;
    performanceStatistics.droppedFragmentCount = 0;
    performanceStatistics.phaseCount = 0;
    performanceStatistics.phaseTotalMs = 0;
    performanceStatistics.syncAckCount = 0;
}

function handleSyncAck(socket, meta, message){
    const stat = meta.syncCycles?.get(message.cycle);
    if( !stat ) return;
    stat.ackAt = performance.now();
    stat.bufferedAmount = socket.bufferedAmount;
    performanceStatistics.syncAckCount++;
}

function updateWorldScale(){
    const userCount = world.fish.filter(fish => fish.ownerKind === 'user').length;
    const scale = worldScale(userCount);
    const changed = scale !== world.scale;
    world.userCount = userCount;
    world.scale = scale;
    for( const fish of world.fish ) fish.radius = technicalRadiusOf(fish.size, scale);
    for( const shred of world.shreds ) shred.radius = (shred.size || 0) / 2 / WORLD.pixelsPerWorldUnit / scale;
    if( changed ) broadcastEvent(encodeWorldScale(formatWorldScale(scale)));
}

// @ds:0aaccaf8
function broadcastRemovedObjects(beforeFish, beforeShreds){
    const liveFish = new Set(world.fish.map(fish => fish.id));
    const liveShreds = new Set(world.shreds.map(shred => shred.id));
    for( const id of beforeFish ){
        if( !liveFish.has(id) ){
            objectBirthCycles.delete(`f${id}`);
            broadcastEvent(encodeObjectRemoval('fish', id));
        }
    }
    for( const id of beforeShreds ){
        if( !liveShreds.has(id) ){
            objectBirthCycles.delete(`s${id}`);
            broadcastEvent(encodeObjectRemoval('shred', id));
        }
    }
}

function send(socket, message){
    if( socket.readyState === socket.OPEN ) socket.send(message);
}

function broadcastEvent(message){
    for( const socket of sockets.keys() ){
        if( socket.readyState === socket.OPEN ) socket.send(message);
    }
}

function makeCode(){
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// @ds:8d13f6a2
function makeAppVersion(){
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    let digest = 'nogit';
    try{
        digest = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
            cwd: workspaceRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim() || digest;
    }catch{
        // Keep the launch-date version usable outside a git checkout.
    }
    return `${stamp}-${digest}`;
}

function contentType(path){
    const ext = extname(path);
    if( ext === '.html' ) return 'text/html; charset=utf-8';
    if( ext === '.css' ) return 'text/css; charset=utf-8';
    if( ext === '.js' ) return 'text/javascript; charset=utf-8';
    if( ext === '.svg' ) return 'image/svg+xml; charset=utf-8';
    return 'application/octet-stream';
}

setInterval(tick, 1000 / SERVER.tickRate);
setInterval(broadcastWorldSync, 1000 / SYNC.snapshotHz);
setInterval(reportPerformanceStatistics, SERVER.performanceStatisticsIntervalMs);

server.listen(port, () =>{
    console.log(`Fish Eat Fish server: http://localhost:${port}`);
});
