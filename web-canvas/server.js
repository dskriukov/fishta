// imp/web-canvas/server.js
// Static file server, WebSocket endpoint, authoritative world loop.
// @ds:f359ebf2 @ds:27fa3caa @ds:4bfe0352 @ds:4c7a2b91 @ds:93a64773 @ds:704ab317 @ds:e559831a @ds:e6be3c03

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { WebSocketServer } from 'ws';
import { SERVER, SYNC, RECONNECT, REGIME, PREY, WORLD } from './src/constants.js';
import { makeFish, technicalRadiusOf, updateAbandonedGradient } from './src/fish.js';
import { startUserFryStage } from './src/player.js';
import { makeWorld, findLowestDensitySpawn, formatWorldScale, worldScale } from './src/world.js';
import { findSafeNpcSpawn, maintainPopulation, sampleSize } from './src/prey.js';
import { stepAuthoritativeWorld } from './src/step.js';
import { isLeaveBlockedByUserAttack } from './src/predation.js';
import { spawnTestShreds } from './src/shred.js';
import { canAddControlledObjects } from './src/world.js';
import { encodeDangerMapPng, encodeFlowMapPng } from './src/danger-map.js';
import {
    encodeEvent,
    encodeIdentity,
    encodeObjectRemoval,
    encodeWorldScale,
    encodeWorldSize,
    encodeWorldCycle,
    encodeClientPing,
    parseClientMessage,
} from './src/protocol.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const workspaceRoot = normalize(join(root, '..'));
const port = Number(process.env.PORT || SERVER.port);
const appVersion = makeAppVersion(); // @ds:8d13f6a2
const world = makeWorld();
const inputsByClient = new Map();
const sockets = new Map();
const dangerMapSockets = new Set();
const flowMapSockets = new Set(); // @fix:6a7b8c9d
const disconnects = new Map();
let nextClientId = 1;
let syncCycle = 0;
let lastWorldSyncState = new Map();
const objectBirthCycles = new Map();
let activeSyncPlan = null;
const performanceStatistics = makePerformanceStatistics();
const eventLoopLag = monitorEventLoopDelay({ resolution: 20 });
eventLoopLag.enable();

// @ds:c1f4a9e2 @ds:d4e8b731
const SYNC_ORDER_MATRICES = {
    '7x7': [
        [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
        [-1, -1], [1, 1], [-1, 1], [1, -1],
        [-2, 0], [2, 0], [0, -2], [0, 2],
        [-2, -1], [2, 1], [-2, 1], [2, -1],
        [-1, -2], [1, 2], [-1, 2], [1, -2],
        [-3, 0], [3, 0], [0, -3], [0, 3],
        [-2, -2], [2, 2], [-2, 2], [2, -2],
        [-3, 1], [3, -1], [-3, -1], [3, 1],
        [-1, -3], [1, 3], [1, -3], [-1, 3],
        [-3, -2], [3, 2], [-3, 2], [3, -2],
        [-2, -3], [2, 3], [-2, 3], [2, -3],
        [-3, 3], [-3, -3], [3, -3], [3, 3],
    ],
};

maintainPopulation({ world }, Math.random);

const server = createServer(async (req, res) =>{
    const url = new URL(req.url, `http://${req.headers.host}`);
    if( req.method === 'POST' && url.pathname === '/test/more-shred' ){
        respondTestPopulation(res, addTestShreds(parseTestAmount(url.searchParams.get('amount'))), 'shreds');
        return;
    }
    if( req.method === 'POST' && url.pathname === '/test/more-fish' ){
        respondTestPopulation(res, addTestFish(parseTestAmount(url.searchParams.get('amount'))), 'fish');
        return;
    }
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

// @fix:7c8d9e0f
function parseTestAmount(value){
    const amount = Math.floor(Number(value));
    return Number.isFinite(amount) ? Math.max(0, Math.min(amount, WORLD.maxControlledObjects)) : 0;
}

// @fix:7c8d9e0f
function respondTestPopulation(res, added, kind){
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ kind, requested: added.requested, added: added.added, total: added.total, capacity: WORLD.maxControlledObjects }));
}

// @fix:7c8d9e0f
function addTestShreds(requested){
    const before = world.shreds.length;
    const created = spawnTestShreds(world, requested, Math.random);
    return { requested, added: created.length, total: world.shreds.length, before };
}

// @fix:7c8d9e0f
function addTestFish(requested){
    const before = world.fish.length;
    let added = 0;
    while( added < requested && canAddControlledObjects(world, 1) ){
        const nominalStartSize = sampleSize(Math.random);
        const fish = makeFish({
            pos: findSafeNpcSpawn(world, nominalStartSize, Math.random),
            size: nominalStartSize,
            hue: 30 + Math.random() * 60,
            ownerKind: 'npc',
            npcRole: 'prey',
            nominalStartSize,
            courage: 50,
            worldScale: world.scale,
        });
        const angle = Math.random() * Math.PI * 2;
        const speed = PREY.maxSpeed * 0.45;
        fish.vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
        fish.heading = { x: Math.cos(angle), y: Math.sin(angle) };
        fish.spawnGrace = 0;
        world.fish.push(fish);
        added++;
    }
    updateWorldScale();
    return { requested, added, total: world.fish.length, before };
}

// @ds e6d3b9a1
const wss = new WebSocketServer({ server });
wss.on('connection', (socket, request) =>{
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if( pathname === '/danger-map' ){
        dangerMapSockets.add(socket);
        socket.on('close', () => dangerMapSockets.delete(socket));
        return;
    }
    if( pathname === '/flow-map' ){
        flowMapSockets.add(socket);
        socket.on('close', () => flowMapSockets.delete(socket));
        return;
    }
    // WebSocket control ping/pong is the liveness heartbeat for the same
    // world-state socket.  It is independent from application messages and
    // does not enter the world-sync protocol.
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    const clientId = `c${nextClientId++}`;
    sockets.set(socket, {
        clientId,
        fishId: null,
        temporaryConnectionCode: null,
        sync: { backlogCycles: 0, backlogStartedAt: 0, needsAbsolute: true },
    });

    socket.on('message', data =>{
        const raw = data.toString();
        // Keep the application RTT marker on the same socket for the
        // diagnostic panel, but dispatch it before parsing any world input.
        if( raw.startsWith('p:') ){
            const counter = Number(raw.slice(2));
            if( Number.isFinite(counter) ) send(socket, encodeClientPing(counter));
            return;
        }
        const message = parseClientMessage(raw);
        const meta = sockets.get(socket);
        if( !meta ) return;
        if( message.type === 'join' ) handleJoin(socket, meta, message);
        if( message.type === 'reconnect' ) handleReconnectGrace(socket, meta, message);
        if( message.type === 'input' ){
            if( findClientFish(meta) ) inputsByClient.set(meta.clientId, normalizeInput(message, Date.now()));
            else inputsByClient.delete(meta.clientId);
        }
        if( message.type === 'leave' ) handleLeaveGame(socket, meta);
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
    fish.lifetimeStartedAt = null; // @fix:c4e8a1b7
    fish.lifetimeMode = null; // @fix:de7b4c19
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

function normalizeInput(message, receivedAt){
    const speedLevel = Math.max(0, Math.min(REGIME.speedLevels, Math.floor(Number(message.speedLevel) || 0)));
    return {
        accel: message.accel || { x: 0, y: 0 },
        speedLevel,
        cruiseControl: message.cruiseControl === 'keyboard' && speedLevel > 0 && speedLevel <= REGIME.cruiseMaxSpeedLevel ? 'keyboard' : null,
        lastControlAt: receivedAt,
    };
}

function tick(){
    const preparationStartedAt = performance.now();
    const now = Date.now();
    for( const [clientId, input] of inputsByClient ){
        if( now - input.lastControlAt > SERVER.controlTimeoutMs ) inputsByClient.delete(clientId);
    }
    for( const [fishId, disconnect] of disconnects ){
        if( now < disconnect.deadline ) continue;
        const fish = world.fish.find(candidate => candidate.id === fishId);
        if( fish ) convertUserFishToNpc(fish);
        inputsByClient.delete(disconnect.clientId);
        disconnects.delete(fishId);
    }
    performanceStatistics.tickPreparationTotalMs += performance.now() - preparationStartedAt;

    const scaleStartedAt = performance.now();
    updateWorldScale();
    performanceStatistics.worldScaleTotalMs += performance.now() - scaleStartedAt;
    const beforeFish = new Set(world.fish.map(fish => fish.id));
    const beforeShreds = new Set(world.shreds.map(shred => shred.id));
    const iterationStartedAt = performance.now();
    stepAuthoritativeWorld({ world }, inputsByClient, 1 / SERVER.tickRate, Math.random);
    performanceStatistics.worldIterationTotalMs += performance.now() - iterationStartedAt;
    performanceStatistics.worldIterationCount++;
    performanceStatistics.controlledObjectTotal += world.fish.length + world.shreds.length;
    const removalStartedAt = performance.now();
    broadcastRemovedObjects(beforeFish, beforeShreds, syncCycle);
    performanceStatistics.removalTotalMs += performance.now() - removalStartedAt;
}

// @ds:e559831a @ds:c39827ed @ds:2afd71a0 @ds:61245206 @fix:9d3f6a71 @fix:d4a7c920
function broadcastWorldSync(forceAbsolute = false){
    if( activeSyncPlan ) performanceStatistics.droppedFragmentCount += activeSyncPlan.remaining;
    const cycle = ++syncCycle;
    const encodedStartedAt = performance.now();
    const encoded = encodeWorldCycle(world, lastWorldSyncState, cycle, objectBirthCycles);
    performanceStatistics.syncEncodeTotalMs += performance.now() - encodedStartedAt;
    lastWorldSyncState = encoded.state;
    performanceStatistics.preparedSyncCycleCount++;
    const planStartedAt = performance.now();
    activeSyncPlan = makeSyncPlan(encoded, cycle, forceAbsolute);
    performanceStatistics.syncPlanTotalMs += performance.now() - planStartedAt;
    runSyncPhases(activeSyncPlan);
    broadcastWorldPerformanceMetric();
}

// @ds:4d8c2f1a
function broadcastWorldPerformanceMetric(){
    const average = performanceStatistics.worldIterationCount
        ? performanceStatistics.worldIterationTotalMs / performanceStatistics.worldIterationCount
        : 0;
    const message = `m:${average.toFixed(3)}`;
    for( const [socket, meta] of sockets ){
        if( socket.readyState !== socket.OPEN || !findClientFish(meta) ) continue;
        socket.send(message);
    }
}

// @ds e6d3b9a1 9a6e4c31 c94d2a8f
function broadcastDangerMap(){
    if( dangerMapSockets.size === 0 ) return;
    const startedAt = performance.now();
    const png = encodeDangerMapPng(world);
    if( !png ) return;
    for( const socket of dangerMapSockets ) if( socket.readyState === socket.OPEN && socket.bufferedAmount <= SYNC.maxSocketBufferedBytes ) socket.send(png, { binary: true });
    performanceStatistics.dangerMapTotalMs += performance.now() - startedAt;
    performanceStatistics.dangerMapCount++;
}

// @fix:6a7b8c9d
function broadcastFlowMap(){
    if( flowMapSockets.size === 0 ) return;
    const startedAt = performance.now();
    const png = encodeFlowMapPng(world);
    if( !png ) return;
    for( const socket of flowMapSockets ) if( socket.readyState === socket.OPEN && socket.bufferedAmount <= SYNC.maxSocketBufferedBytes ) socket.send(png, { binary: true });
    performanceStatistics.flowMapTotalMs += performance.now() - startedAt;
    performanceStatistics.flowMapCount++;
}

// @ds:c39827ed @ds:0a2b6379 @ds:682570c7 @fix:9d3f6a71
function makeSyncPlan(encoded, cycle, forceAbsolute){
    const lookup = new Map(encoded.cells.map(cell => [cell.key, cell]));
    if( world.width % SYNC.cellSize !== 0 || world.height % SYNC.cellSize !== 0 ){
        throw new Error(`World dimensions ${world.width}x${world.height} must be divisible by cell size ${SYNC.cellSize}`);
    }
    const columns = world.width / SYNC.cellSize;
    const rows = world.height / SYNC.cellSize;
    const matrix = syncOrderMatrixFor(columns, rows);
    const phases = [[], [], [], []];
    for( const [socket, meta] of sockets ){
        const fish = findClientFish(meta);
        if( !fish || socket.readyState !== socket.OPEN ) continue;
        const sync = meta.sync ??= { backlogCycles: 0, backlogStartedAt: 0, needsAbsolute: true };
        if( socket.bufferedAmount > 0 ){
            if( sync.backlogCycles === 0 ) sync.backlogStartedAt = performance.now();
            sync.backlogCycles++;
            performanceStatistics.heldClientCycleCount++;
            performanceStatistics.maxSocketBufferedBytes = Math.max(performanceStatistics.maxSocketBufferedBytes, socket.bufferedAmount);
            if( sync.backlogCycles >= SYNC.backlogCyclesBeforeResync ) sync.needsAbsolute = true;
            continue;
        }
        if( sync.backlogCycles > 0 ){
            performanceStatistics.bufferedClientDurationTotalMs += performance.now() - sync.backlogStartedAt;
            performanceStatistics.bufferedClientRecoveryCount++;
            sync.backlogCycles = 0;
            sync.backlogStartedAt = 0;
        }
        const ownX = Math.floor(fish.pos.x / SYNC.cellSize);
        const ownY = Math.floor(fish.pos.y / SYNC.cellSize);
        const clientEntries = [];
        const allAbsolute = forceAbsolute || sync.needsAbsolute || cycle % SYNC.globalAbsoluteEvery === 0;
        matrix.forEach(([dx, dy], matrixIndex) => {
            const phaseIndex = matrixIndex === 0 ? 0 : matrixIndex < 3 ? 1 : matrixIndex < 5 ? 2 : 3;
            const x = (ownX + dx + columns) % columns;
            const y = (ownY + dy + rows) % rows;
            if( !lookup.has(`${x}:${y}`) ) return;
            const entry = { socket, meta, x, y, absolute: allAbsolute || matrixIndex === 0 };
            clientEntries.push(entry);
            phases[phaseIndex].push(entry);
        });
        if( sync.needsAbsolute && clientEntries.length > 0 ) clientEntries[clientEntries.length - 1].completesRecovery = true;
    }
    return { cycle, createdAt: Date.now(), encoded, phases, phase: 0, entryIndex: 0, remaining: phases.reduce((total, phase) => total + phase.length, 0), lookup, cancelled: false };
}

// @ds:c1f4a9e2 @ds:d4e8b731
function syncOrderMatrixFor(columns, rows){
    const key = `${columns}x${rows}`;
    const matrix = SYNC_ORDER_MATRICES[key];
    if( !matrix ) throw new Error(`No synchronization-order matrix registered for ${key}`);
    if( matrix.length !== columns * rows ) throw new Error(`Synchronization-order matrix ${key} must contain ${columns * rows} entries`);
    return matrix;
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
    if( entry.socket.bufferedAmount > 0 ){
        const sync = entry.meta.sync;
        if( sync.backlogCycles === 0 ) sync.backlogStartedAt = performance.now();
        sync.backlogCycles++;
        if( sync.backlogCycles >= SYNC.backlogCyclesBeforeResync ) sync.needsAbsolute = true;
        performanceStatistics.heldClientCycleCount++;
        performanceStatistics.maxSocketBufferedBytes = Math.max(performanceStatistics.maxSocketBufferedBytes, entry.socket.bufferedAmount);
        return;
    }
    const absolute = entry.absolute;
    const cell = plan.lookup.get(`${entry.x}:${entry.y}`);
    if( !cell ) return;
    const prefix = `${absolute ? 'a:' : '|'}${plan.cycle}:${plan.createdAt.toString(36)}:${entry.x}:${entry.y}|`;
    const source = absolute ? plan.encoded.absoluteText : plan.encoded.relativeText;
    const message = `${prefix}${source.slice(absolute ? cell.absoluteStart : cell.relativeStart, absolute ? cell.absoluteEnd : cell.relativeEnd)}`;
    entry.socket.send(message);
    performanceStatistics.syncMessageCount++;
    performanceStatistics.syncByteCount += Buffer.byteLength(message);
    if( entry.completesRecovery ){
        entry.meta.sync.needsAbsolute = false;
        performanceStatistics.fullResynchronizationCount++;
    }
}

// @ds:61245206 @fix:d4a7c920
function makePerformanceStatistics(){
    return {
        windowStartedAt: performance.now(),
        worldIterationCount: 0,
        worldIterationTotalMs: 0,
        tickPreparationTotalMs: 0,
        worldScaleTotalMs: 0,
        removalTotalMs: 0,
        controlledObjectTotal: 0,
        preparedSyncCycleCount: 0,
        droppedFragmentCount: 0,
        phaseCount: 0,
        phaseTotalMs: 0,
        syncEncodeTotalMs: 0,
        syncPlanTotalMs: 0,
        syncMessageCount: 0,
        syncByteCount: 0,
        heldClientCycleCount: 0,
        maxSocketBufferedBytes: 0,
        bufferedClientDurationTotalMs: 0,
        bufferedClientRecoveryCount: 0,
        fullResynchronizationCount: 0,
        dangerMapTotalMs: 0,
        dangerMapCount: 0,
        flowMapTotalMs: 0,
        flowMapCount: 0,
    };
}

// @ds:61245206 @fix:d4a7c920
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
    const averageEncodeMs = performanceStatistics.preparedSyncCycleCount ? performanceStatistics.syncEncodeTotalMs / performanceStatistics.preparedSyncCycleCount : 0;
    const averagePlanMs = performanceStatistics.preparedSyncCycleCount ? performanceStatistics.syncPlanTotalMs / performanceStatistics.preparedSyncCycleCount : 0;
    const averageBufferedMs = performanceStatistics.bufferedClientRecoveryCount ? performanceStatistics.bufferedClientDurationTotalMs / performanceStatistics.bufferedClientRecoveryCount : 0;
    const averagePreparationMs = performanceStatistics.worldIterationCount ? performanceStatistics.tickPreparationTotalMs / performanceStatistics.worldIterationCount : 0;
    const averageScaleMs = performanceStatistics.worldIterationCount ? performanceStatistics.worldScaleTotalMs / performanceStatistics.worldIterationCount : 0;
    const averageRemovalMs = performanceStatistics.worldIterationCount ? performanceStatistics.removalTotalMs / performanceStatistics.worldIterationCount : 0;
    const averageDangerMapMs = performanceStatistics.dangerMapCount ? performanceStatistics.dangerMapTotalMs / performanceStatistics.dangerMapCount : 0;
    const averageFlowMapMs = performanceStatistics.flowMapCount ? performanceStatistics.flowMapTotalMs / performanceStatistics.flowMapCount : 0;
    const eventLoopMeanMs = Number.isFinite(eventLoopLag.mean) ? eventLoopLag.mean / 1e6 : 0;
    const eventLoopMaxMs = Number.isFinite(eventLoopLag.max) ? eventLoopLag.max / 1e6 : 0;
    console.log(
        `[server stats ${((now - performanceStatistics.windowStartedAt) / 1000).toFixed(1)}s] `
        + `prepare=${averagePreparationMs.toFixed(3)}ms; scale=${averageScaleMs.toFixed(3)}ms; world=${averageWorldIterationMs.toFixed(3)}ms; removal=${averageRemovalMs.toFixed(3)}ms; `
        + `encode=${averageEncodeMs.toFixed(3)}ms; plan=${averagePlanMs.toFixed(3)}ms; phase=${averagePhaseMs.toFixed(3)}ms; `
        + `objects=${averageControlledObjects.toFixed(1)}; `
        + `dropped=${averageDroppedFragments.toFixed(2)} fragments/cycle; sent=${performanceStatistics.syncMessageCount} messages/${performanceStatistics.syncByteCount} bytes; `
        + `held=${performanceStatistics.heldClientCycleCount}; buffered=${averageBufferedMs.toFixed(1)}ms/${performanceStatistics.maxSocketBufferedBytes}B; resync=${performanceStatistics.fullResynchronizationCount}; `
        + `dangerMap=${averageDangerMapMs.toFixed(3)}ms; flowMap=${averageFlowMapMs.toFixed(3)}ms; eventLoop=${eventLoopMeanMs.toFixed(3)}ms avg/${eventLoopMaxMs.toFixed(3)}ms max`
    );
    performanceStatistics.windowStartedAt = now;
    performanceStatistics.worldIterationCount = 0;
    performanceStatistics.worldIterationTotalMs = 0;
    performanceStatistics.tickPreparationTotalMs = 0;
    performanceStatistics.worldScaleTotalMs = 0;
    performanceStatistics.removalTotalMs = 0;
    performanceStatistics.controlledObjectTotal = 0;
    performanceStatistics.preparedSyncCycleCount = 0;
    performanceStatistics.droppedFragmentCount = 0;
    performanceStatistics.phaseCount = 0;
    performanceStatistics.phaseTotalMs = 0;
    performanceStatistics.syncEncodeTotalMs = 0;
    performanceStatistics.syncPlanTotalMs = 0;
    performanceStatistics.syncMessageCount = 0;
    performanceStatistics.syncByteCount = 0;
    performanceStatistics.heldClientCycleCount = 0;
    performanceStatistics.maxSocketBufferedBytes = 0;
    performanceStatistics.bufferedClientDurationTotalMs = 0;
    performanceStatistics.bufferedClientRecoveryCount = 0;
    performanceStatistics.fullResynchronizationCount = 0;
    performanceStatistics.dangerMapTotalMs = 0;
    performanceStatistics.dangerMapCount = 0;
    performanceStatistics.flowMapTotalMs = 0;
    performanceStatistics.flowMapCount = 0;
    eventLoopLag.reset();
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
function broadcastRemovedObjects(beforeFish, beforeShreds, removalCycle){
    const liveFish = new Set(world.fish.map(fish => fish.id));
    const liveShreds = new Set(world.shreds.map(shred => shred.id));
    for( const id of beforeFish ){
        if( !liveFish.has(id) ){
            objectBirthCycles.delete(`f${id}`);
            broadcastEvent(encodeObjectRemoval('fish', id, removalCycle));
        }
    }
    for( const id of beforeShreds ){
        if( !liveShreds.has(id) ){
            objectBirthCycles.delete(`s${id}`);
            broadcastEvent(encodeObjectRemoval('shred', id, removalCycle));
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
setInterval(broadcastDangerMap, 1000 / SYNC.snapshotHz);
setInterval(broadcastFlowMap, 1000 / SYNC.snapshotHz);
setInterval(reportPerformanceStatistics, SERVER.performanceStatisticsIntervalMs);
setInterval(() =>{
    for( const socket of sockets.keys() ){
        if( socket.readyState !== socket.OPEN ) continue;
        if( socket.isAlive === false ){
            socket.terminate();
            continue;
        }
        socket.isAlive = false;
        socket.ping();
    }
}, RECONNECT.pingIntervalMs);

server.listen(port, () =>{
    console.log(`Fish Eat Fish server: http://localhost:${port}`);
});
