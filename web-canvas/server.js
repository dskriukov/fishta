// imp/web-canvas/server.js
// Static file server, WebSocket endpoint, authoritative world loop.
// @ds:f359ebf2 @ds:27fa3caa @ds:4bfe0352 @ds:93a64773 @ds:704ab317 @ds:e559831a

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { SERVER, SYNC, RECONNECT } from './src/constants.js';
import { makeFish, updateAbandonedGradient } from './src/fish.js';
import { makeWorld, findLowestDensitySpawn, nextWorldSize, scaleWorldEntities } from './src/world.js';
import { maintainPopulation } from './src/prey.js';
import { stepAuthoritativeWorld } from './src/step.js';
import { isLeaveBlockedByUserAttack } from './src/predation.js';
import {
    encodeEvent,
    encodeIdentity,
    encodeWorldSize,
    encodeWorldSync,
    parseClientMessage,
} from './src/protocol.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const workspaceRoot = normalize(join(root, '..'));
const dsAssetRoot = join(workspaceRoot, 'ds', 'assets'); // @ds:df06827a
const port = Number(process.env.PORT || SERVER.port);
const world = makeWorld();
const inputsByClient = new Map();
const sockets = new Map();
const disconnects = new Map();
let nextClientId = 1;
let syncMessageCount = 0;
let lastWorldSyncState = new Map();

maintainPopulation({ world }, Math.random);

const server = createServer(async (req, res) =>{
    const url = new URL(req.url, `http://${req.headers.host}`);
    const safePath = normalize(url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '')).replace(/^(\.\.[/\\])+/, '');
    const assetPath = safePath.startsWith('ds/assets/') ? join(workspaceRoot, safePath) : null;
    const path = assetPath || join(root, safePath);
    const allowed = assetPath ? path.startsWith(dsAssetRoot) : path.startsWith(root);
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
    return {
        accel: message.accel || { x: 0, y: 0 },
        hunt: Boolean(message.hunt),
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
        lastWorldSyncState = new Map();
    }
    stepAuthoritativeWorld({ world }, inputsByClient, 1 / SERVER.tickRate, Math.random);
}

function broadcastWorldSync(){
    const absolute = syncMessageCount % 20 === 0;
    const encoded = encodeWorldSync(world, lastWorldSyncState, absolute);
    lastWorldSyncState = encoded.state;
    syncMessageCount++;
    for( const [socket, meta] of sockets ){
        if( socket.readyState !== socket.OPEN ) continue;
        send(socket, encoded.message);
    }
}

function send(socket, message){
    if( socket.readyState === socket.OPEN ) socket.send(message);
}

function sendWorldSync(socket, absolute){
    const encoded = encodeWorldSync(world, lastWorldSyncState, absolute);
    send(socket, encoded.message);
}

function broadcastEvent(message){
    for( const socket of sockets.keys() ){
        if( socket.readyState === socket.OPEN ) socket.send(message);
    }
}

function makeCode(){
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function contentType(path){
    const ext = extname(path);
    if( ext === '.html' ) return 'text/html; charset=utf-8';
    if( ext === '.css' ) return 'text/css; charset=utf-8';
    if( ext === '.js' ) return 'text/javascript; charset=utf-8';
    return 'application/octet-stream';
}

setInterval(tick, 1000 / SERVER.tickRate);
setInterval(broadcastWorldSync, 1000 / SYNC.snapshotHz);

server.listen(port, () =>{
    console.log(`Fish Eat Fish server: http://localhost:${port}`);
});
