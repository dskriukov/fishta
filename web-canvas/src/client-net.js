// imp/web-canvas/src/client-net.js
// WebSocket client, reconnect code, server snapshots/events.
// @ds:4bfe0352 @ds:93a64773 @ds:e559831a @ds:704ab317 @ds:671e9773 @ds:682570c7 @ds:0aaccaf8 @ds:28d9098a @ds:8c663384

import {
    applyObjectRemoval,
    applyWorldFragment,
    encodeClientControl,
    encodeClientJoin,
    encodeClientPing,
    encodeClientSyncAck,
    encodeClientReconnect,
    parseEvent,
    parseIdentity,
} from './protocol.js';
import { makeWorld } from './world.js';
import { SYNC, WORLD } from './constants.js';
import { technicalRadiusOf } from './fish.js';

// @ds b9e5d274 e6d3b9a1
export function createDangerMapSocket(onFrame){
    let socket = null;
    return {
        open(){
            if( socket && socket.readyState <= WebSocket.OPEN ) return;
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            socket = new WebSocket(`${protocol}//${window.location.host}/danger-map`);
            socket.binaryType = 'blob';
            socket.addEventListener('message', async event => {
                const bitmap = await createImageBitmap(event.data);
                onFrame(bitmap);
            });
        },
        close(){ if( socket && socket.readyState < WebSocket.CLOSING ) socket.close(); socket = null; },
    };
}

// @ds:a14c7e52 @ds:b6e39d14 @ia:4a8d0f72
export function createClientNet({ onSnapshot, onEvent, onStatus, onIdentity, onInitialCommunication, onSyncRate, onEventRates, onPerformanceMetrics, initialConnectionCode = '' }){
    let socket = null;
    let currentUserFishId = null;
    let temporaryConnectionCode = String(initialConnectionCode || '');
    let pendingJoinProfile = null;
    let joined = false;
    let pingCounter = 0;
    let lastSyncAt = null;
    let initialCommunicationSettled = false;
    const acknowledgedCycles = new Set();
    const eventTimes = { dynamic: [], control: [] };
    window.setInterval(() => publishEventRates(performance.now()), 250);
    const world = makeWorld();
    const transportState = { currentCycle: null, cycleStartedAt: null, tombstones: new Map() };

    function status(value){
        if( onStatus ) onStatus(value);
    }

    // @ds:34ba255b @ds:93a64773
    function settleInitialCommunication(kind){
        if( initialCommunicationSettled ) return;
        initialCommunicationSettled = true;
        if( onInitialCommunication ) onInitialCommunication({ kind });
    }

    function connect(){
        if( socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) ) return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const connection = new WebSocket(`${protocol}//${window.location.host}`);
        socket = connection;
        status('connecting');
        connection.addEventListener('open', () =>{
            if( socket !== connection ) return;
            status('connected');
            if( temporaryConnectionCode ){
                sendRaw(encodeClientReconnect(temporaryConnectionCode));
            }else if( pendingJoinProfile ){
                sendRaw(encodeClientJoin(pendingJoinProfile));
            }else{
                settleInitialCommunication('new');
            }
        });
        connection.addEventListener('close', () =>{
            if( socket !== connection ) return;
            socket = null;
            status('disconnected');
            if( temporaryConnectionCode || pendingJoinProfile ) window.setTimeout(connect, 600);
        });
        connection.addEventListener('message', event =>{
            if( socket !== connection ) return;
            const text = String(event.data || '');
            if( text[0] === 'i' ){
                const message = parseIdentity(text);
                joined = true;
                currentUserFishId = message.currentUserFishId;
                temporaryConnectionCode = message.temporaryConnectionCode;
                pendingJoinProfile = null;
                settleInitialCommunication('restored');
                if( onIdentity ) onIdentity(message);
                return;
            }
            if( text[0] === 'e' ){
                const message = parseEvent(text);
                if( message.event === 'w' ){
                    const [width, height] = message.data.split(':').map(Number);
                    if( width > 0 && height > 0 ){
                        world.width = width;
                        world.height = height;
                    }
                }
                if( message.event === 'rj' ){
                    clearSessionBinding();
                    settleInitialCommunication('new');
                }
                if( message.event === 'npc' ) message.leaveSucceeded = confirmLeaveSucceeded(Number(message.data));
                if( onEvent ) onEvent(message);
                return;
            }
            if( text[0] === 's' ){
                const scale = Number(text.slice(2));
                if( Number.isFinite(scale) && scale > 0 ){
                    world.scale = scale;
                    applyTechnicalScale();
                }
                publishSnapshot(performance.now(), null);
                return;
            }
            // @ds:4d8c2f1a
            if( text.startsWith('m:') ){
                const worldCalculationMs = Number(text.slice(2));
                if( Number.isFinite(worldCalculationMs) && worldCalculationMs >= 0 && onPerformanceMetrics ) onPerformanceMetrics({ worldCalculationMs });
                return;
            }
            if( text.startsWith('v:') ){
                const [, cycleText, rateText] = text.split(':');
                const cycle = Number(cycleText);
                const rate = Number(rateText);
                if( Number.isInteger(cycle) && Number.isFinite(rate) && rate >= 0 && onSyncRate ) onSyncRate({ cycle, rate });
                return;
            }
            if( text[0] === 'x' ){
                const receivedAt = performance.now();
                const removal = applyObjectRemoval(world, text, transportState, receivedAt);
                publishSnapshot(receivedAt, null);
                if( removal?.object ){
                    window.setTimeout(() =>{
                        const index = removal.collection.indexOf(removal.object);
                        if( index >= 0 && removal.object._syncVisibility?.phase === 'removing' ) removal.collection.splice(index, 1);
                        publishSnapshot(performance.now(), null);
                    }, 110);
                }
                return;
            }
            if( text.startsWith('a:') || text[0] === '|' ){
                const receivedAt = performance.now();
                const elapsedSeconds = lastSyncAt === null ? 0 : (receivedAt - lastSyncAt) / 1000;
                const syncDiagnostics = applyWorldFragment(world, text, transportState, receivedAt);
                if( !syncDiagnostics ) return;
                recordEvents('dynamic', syncDiagnostics.dynamicEvents || 0, receivedAt);
                applyTechnicalScale();
                acknowledgeGlobalAbsoluteCentralCell(syncDiagnostics);
                logAbsolutePositionDrift(syncDiagnostics, elapsedSeconds);
                lastSyncAt = receivedAt;
                publishSnapshot(syncDiagnostics.cycleStartedAt, syncDiagnostics);
            }
        });
    }

    function applyTechnicalScale(){
        const scale = Math.max(1e-6, world.scale || 1);
        for( const fish of world.fish || [] ) fish.radius = technicalRadiusOf(fish.size, scale);
        for( const shred of world.shreds || [] ) shred.radius = (shred.size || 0) / 2;
    }

    // @ds:77faf734
    function acknowledgeGlobalAbsoluteCentralCell(syncDiagnostics){
        const cycle = syncDiagnostics?.cycle;
        if( !syncDiagnostics?.absolute || !Number.isInteger(cycle) || cycle % SYNC.globalAbsoluteEvery !== 0 ) return;
        if( !(syncDiagnostics.fish || []).some(fish => fish.id === currentUserFishId) ) return;
        if( acknowledgedCycles.has(cycle) ) return;
        acknowledgedCycles.add(cycle);
        sendRaw(encodeClientSyncAck(cycle));
        while( acknowledgedCycles.size > 12 ) acknowledgedCycles.delete(acknowledgedCycles.values().next().value);
    }

    function publishSnapshot(receivedAt, syncDiagnostics){
        if( !onSnapshot ) return;
        onSnapshot({
            world: structuredClone(world),
            currentUserFishId,
            receivedAt,
            syncDiagnostics,
        });
    }

    // @ds:e559831a @ds:682570c7
    function logAbsolutePositionDrift(syncDiagnostics, elapsedSeconds){
        if( !syncDiagnostics?.absolute ) return;
        const rows = syncDiagnostics.fish || [];
        const selected = [];
        const userRow = rows.find(row => row.id === currentUserFishId);
        if( userRow ) selected.push({ role: 'user', row: userRow });
        for( const row of rows ){
            if( selected.length >= (userRow ? 3 : 2) ) break;
            if( row.ownerKind === 'npc' ) selected.push({ role: 'npc', row });
        }
        const table = selected
            .filter(item => item.row.clientPos && item.row.clientVel && item.row.serverPos)
            .map(item => driftLogRow(item.role, item.row, elapsedSeconds));
        // if( table.length > 0 ){
        //     console.debug('absolute sync accumulated position error');
        //     console.table(table);
        // }
    }

    function driftLogRow(role, row, elapsedSeconds){
        const predicted = {
            x: wrapValue(row.clientPos.x + row.clientVel.x * elapsedSeconds, world.width),
            y: wrapValue(row.clientPos.y + row.clientVel.y * elapsedSeconds, world.height),
        };
        const errorDx = shortestWrappedDelta(predicted.x, row.serverPos.x, world.width);
        const errorDy = shortestWrappedDelta(predicted.y, row.serverPos.y, world.height);
        return {
            role,
            id: row.id,
            elapsedMs: round(elapsedSeconds * 1000),
            clientBaseX: round(row.clientPos.x),
            clientBaseY: round(row.clientPos.y),
            clientVelX: round(row.clientVel.x),
            clientVelY: round(row.clientVel.y),
            predictedX: round(predicted.x),
            predictedY: round(predicted.y),
            serverAbsX: round(row.serverPos.x),
            serverAbsY: round(row.serverPos.y),
            errorDx: round(errorDx),
            errorDy: round(errorDy),
            errorDistance: round(Math.hypot(errorDx, errorDy)),
        };
    }

    function shortestWrappedDelta(from, to, size){
        let delta = to - from;
        if( !Number.isFinite(size) || size <= 0 ) return delta;
        if( delta > size / 2 ) delta -= size;
        if( delta < -size / 2 ) delta += size;
        return delta;
    }

    function wrapValue(value, size){
        if( !Number.isFinite(size) || size <= 0 ) return value;
        return ((value % size) + size) % size;
    }

    function round(value){
        return Number.isFinite(value) ? Number(value.toFixed(2)) : value;
    }

    function sendRaw(message){
        if( !socket || socket.readyState !== WebSocket.OPEN ) return false;
        socket.send(message);
        return true;
    }

    function recordEvents(kind, count = 1, now = performance.now()){
        const events = eventTimes[kind];
        if( !events || !Number.isFinite(count) || count <= 0 ) return;
        for( let index = 0; index < count; index++ ) events.push(now);
        publishEventRates(now);
    }

    function getEventRates(now = performance.now()){
        const cutoff = now - 1000;
        for( const events of Object.values(eventTimes) ){
            while( events.length > 0 && events[0] < cutoff ) events.shift();
        }
        return {
            dynamic: eventTimes.dynamic.length,
            control: eventTimes.control.length,
        };
    }

    function publishEventRates(now){
        if( onEventRates ) onEventRates(getEventRates(now));
    }

    // @ds:93a64773 @ds:eba75588
    function clearSessionBinding(){
        temporaryConnectionCode = '';
        currentUserFishId = null;
        joined = false;
        pendingJoinProfile = null;
        closeIdleSocket();
    }

    function closeIdleSocket(){
        const connection = socket;
        socket = null;
        if( connection && connection.readyState < WebSocket.CLOSING ) connection.close();
    }

    // @ds:9772e9ac
    function confirmLeaveSucceeded(fishId){
        if( fishId !== currentUserFishId ) return false;
        clearSessionBinding();
        return true;
    }

    if( temporaryConnectionCode ) connect();

    return {
        get currentUserFishId(){ return currentUserFishId; },
        get temporaryConnectionCode(){ return temporaryConnectionCode; },
        get hasRestoreCode(){ return Boolean(temporaryConnectionCode); },
        get isJoined(){ return joined; },
        join(profile){
            pendingJoinProfile = profile;
            connect();
            if( socket?.readyState === WebSocket.OPEN ){
                sendRaw(encodeClientJoin(profile));
            }
        },
        input(payload){
            if( !joined ) return;
            if( sendRaw(encodeClientControl(payload)) ) recordEvents('control');
        },
        // @ds:671e9773
        idle(){
            if( !joined ) return;
            sendRaw(encodeClientPing(++pingCounter));
        },
        // @ds:9772e9ac
        leave(){
            sendRaw('q');
        },
    };
}
