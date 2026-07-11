// imp/web-canvas/server.js
// Static file server, WebSocket endpoint, authoritative world loop.
// @ds:f359ebf2 @ds:27fa3caa @ds:4bfe0352 @ds:4c7a2b91 @ds:93a64773 @ds:704ab317 @ds:e559831a @ds:e6be3c03

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { SERVER, SYNC, RECONNECT, REGIME } from './src/constants.js';
import { makeFish, updateAbandonedGradient } from './src/fish.js';
import { startUserFryStage } from './src/player.js';
import { makeWorld, findLowestDensitySpawn, nextWorldSize, scaleWorldEntities } from './src/world.js';
import { maintainPopulation } from './src/prey.js';
import { stepAuthoritativeWorld } from './src/step.js';
import { isLeaveBlockedByUserAttack } from './src/predation.js';
import {
    encodeEvent,
    encodeIdentity,
    encodeObjectRemoval,
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
const fragmentQueues = new Map();
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
    });

    socket.on('close', () =>{
        const meta = sockets.get(socket);
        sockets.delete(socket);
        fragmentQueues.delete(socket);
        if( meta?.fishId ) markDisconnected(meta);
    });
});

// @ds:4bfe0352 @ds:58050922
function handleJoin(socket, meta, message){
    const existing = findClientFish(meta);
    if( existing ){
        updateUserFishProfile(existing, message);
        send(socket, encodeIdentity(meta.fishId, existing.temporaryConnectionCode));
        send(socket, encodeWorldSize(world));
        sendWorldSync(socket, true);
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
        ...normalizedUserProfile(message),
    });
    startUserFryStage(fish, fish.pos, 'join');
    world.fish.push(fish);
    meta.fishId = fish.id;
    meta.temporaryConnectionCode = temporaryConnectionCode;
    send(socket, encodeIdentity(meta.fishId, temporaryConnectionCode));
    send(socket, encodeWorldSize(world));
    sendWorldSync(socket, true);
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
        send(socket, encodeWorldSize(world));
        sendWorldSync(socket, true);
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

    const userCount = world.fish.filter(fish => fish.ownerKind === 'user').length;
    const nextSize = nextWorldSize(userCount, world);
    if( nextSize.width !== world.width || nextSize.height !== world.height ){
        scaleWorldEntities(world, nextSize);
        broadcastEvent(encodeWorldSize(world));
    }
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
    const preparationStartedAt = performance.now();
    const cycle = ++syncCycle;
    const encoded = encodeWorldCycle(world, lastWorldSyncState, cycle, objectBirthCycles);
    lastWorldSyncState = encoded.state;
    performanceStatistics.preparedSyncCycleCount++;
    for( const [socket, meta] of sockets ){
        if( socket.readyState !== socket.OPEN ) continue;
        queueWorldFragments(socket, meta, encoded, cycle, forceAbsolute, preparationStartedAt);
    }
}

// @ds:c39827ed @ds:682570c7 @ds:61245206
function queueWorldFragments(socket, meta, encoded, cycle, forceAbsolute = false, preparationStartedAt){
    const fish = findClientFish(meta);
    if( !fish ) return;
    const ordered = [...encoded.cells].sort((a, b) => cellDistanceSquared(a, fish) - cellDistanceSquared(b, fish));
    const ownCellX = Math.floor(fish.pos.x / SYNC.cellSize);
    const ownCellY = Math.floor(fish.pos.y / SYNC.cellSize);
    ordered.sort((a, b) => Number(!(a.cellX === ownCellX && a.cellY === ownCellY)) - Number(!(b.cellX === ownCellX && b.cellY === ownCellY)));
    const allAbsolute = forceAbsolute || cycle % SYNC.globalAbsoluteEvery === 0;
    const messages = ordered.map((cell, index) =>{
        const absolute = allAbsolute || index < SYNC.nearestAbsoluteCells;
        const source = absolute ? encoded.absoluteText : encoded.relativeText;
        const start = absolute ? cell.absoluteStart : cell.relativeStart;
        const end = absolute ? cell.absoluteEnd : cell.relativeEnd;
        return `${absolute ? 'a:' : '|'}${cycle}:${cell.cellX}:${cell.cellY}|${source.slice(start, end)}`;
    });
    const previousQueue = fragmentQueues.get(socket);
    if( previousQueue ) performanceStatistics.droppedFragmentCount += previousQueue.messages.length;
    const generation = (previousQueue?.generation || 0) + 1;
    fragmentQueues.set(socket, { generation, messages, preparationStartedAt });
    flushFragmentQueue(socket, generation);
}

// @ds:61245206
function flushFragmentQueue(socket, generation){
    const queue = fragmentQueues.get(socket);
    if( !queue || queue.generation !== generation || socket.readyState !== socket.OPEN ) return;
    const message = queue.messages.shift();
    if( message ) socket.send(message);
    if( message && queue.messages.length === 0 ){
        performanceStatistics.completedClientSessionTotalMs += performance.now() - queue.preparationStartedAt;
        performanceStatistics.completedClientSessionCount++;
    }
    if( queue.messages.length > 0 ) setImmediate(() => flushFragmentQueue(socket, generation));
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
        completedClientSessionCount: 0,
        completedClientSessionTotalMs: 0,
    };
}

// @ds:61245206
function reportPerformanceStatistics(){
    const now = performance.now();
    const averageWorldIterationMs = performanceStatistics.worldIterationCount
        ? performanceStatistics.worldIterationTotalMs / performanceStatistics.worldIterationCount
        : 0;
    const averageSessionMs = performanceStatistics.completedClientSessionCount
        ? performanceStatistics.completedClientSessionTotalMs / performanceStatistics.completedClientSessionCount
        : null;
    const averageControlledObjects = performanceStatistics.worldIterationCount
        ? performanceStatistics.controlledObjectTotal / performanceStatistics.worldIterationCount
        : 0;
    const averageDroppedFragments = performanceStatistics.preparedSyncCycleCount
        ? performanceStatistics.droppedFragmentCount / performanceStatistics.preparedSyncCycleCount
        : 0;
    console.log(
        `[server stats ${((now - performanceStatistics.windowStartedAt) / 1000).toFixed(1)}s] `
        + `world=${averageWorldIterationMs.toFixed(3)}ms/iteration; `
        + `session=${averageSessionMs === null ? 'n/a' : `${averageSessionMs.toFixed(3)}ms/client`}; `
        + `objects=${averageControlledObjects.toFixed(1)}; `
        + `dropped=${averageDroppedFragments.toFixed(2)} fragments/cycle`
    );
    performanceStatistics.windowStartedAt = now;
    performanceStatistics.worldIterationCount = 0;
    performanceStatistics.worldIterationTotalMs = 0;
    performanceStatistics.controlledObjectTotal = 0;
    performanceStatistics.preparedSyncCycleCount = 0;
    performanceStatistics.droppedFragmentCount = 0;
    performanceStatistics.completedClientSessionCount = 0;
    performanceStatistics.completedClientSessionTotalMs = 0;
}

function cellDistanceSquared(cell, fish){
    const x = (cell.cellX + 0.5) * SYNC.cellSize;
    const y = (cell.cellY + 0.5) * SYNC.cellSize;
    const dx = shortestDelta(fish.pos.x, x, world.width);
    const dy = shortestDelta(fish.pos.y, y, world.height);
    return dx * dx + dy * dy;
}

function shortestDelta(from, to, size){
    let delta = to - from;
    if( delta > size / 2 ) delta -= size;
    if( delta < -size / 2 ) delta += size;
    return delta;
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

function sendWorldSync(){
    broadcastWorldSync(true);
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
