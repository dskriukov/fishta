// imp/web-canvas/src/client-net.js
// WebSocket client, reconnect code, server snapshots/events.
// @ds:4bfe0352 @ds:93a64773 @ds:e559831a @ds:704ab317 @ds:671e9773

import {
    applyWorldSync,
    encodeClientControl,
    encodeClientJoin,
    encodeClientPing,
    encodeClientReconnect,
    parseEvent,
    parseIdentity,
} from './protocol.js';
import { makeWorld } from './world.js';

export function createClientNet({ onSnapshot, onEvent, onStatus, onIdentity }){
    let socket = null;
    let currentUserFishId = null;
    let temporaryConnectionCode = window.sessionStorage.getItem('fish.connectionCode') || '';
    let joined = false;
    let pingCounter = 0;
    let lastSyncAt = null;
    const world = makeWorld();

    function status(value){
        if( onStatus ) onStatus(value);
    }

    function connect(){
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}`);
        status('connecting');
        socket.addEventListener('open', () =>{
            status('connected');
            if( temporaryConnectionCode ){
                sendRaw(encodeClientReconnect(temporaryConnectionCode));
            }
        });
        socket.addEventListener('close', () =>{
            status('disconnected');
            window.setTimeout(connect, 600);
        });
        socket.addEventListener('message', event =>{
            const text = String(event.data || '');
            if( text[0] === 'i' ){
                const message = parseIdentity(text);
                joined = true;
                currentUserFishId = message.currentUserFishId;
                temporaryConnectionCode = message.temporaryConnectionCode;
                window.sessionStorage.setItem('fish.connectionCode', temporaryConnectionCode);
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
                if( message.event === 'rj' ) clearSessionBinding();
                if( message.event === 'npc' ) message.leaveSucceeded = confirmLeaveSucceeded(Number(message.data));
                if( onEvent ) onEvent(message);
                return;
            }
            if( text[0] === 'a' || text[0] === '|' ){
                const receivedAt = performance.now();
                const elapsedSeconds = lastSyncAt === null ? 0 : (receivedAt - lastSyncAt) / 1000;
                const syncDiagnostics = applyWorldSync(world, text);
                logAbsolutePositionDrift(syncDiagnostics, elapsedSeconds);
                lastSyncAt = receivedAt;
                if( onSnapshot ){
                    onSnapshot({
                        world: structuredClone(world),
                        currentUserFishId,
                        receivedAt,
                        syncDiagnostics,
                    });
                }
            }
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
        if( table.length > 0 ){
            console.debug('absolute sync accumulated position error');
            console.table(table);
        }
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

    // @ds:93a64773 @ds:eba75588
    function clearSessionBinding(){
        window.sessionStorage.removeItem('fish.connectionCode');
        temporaryConnectionCode = '';
        currentUserFishId = null;
        joined = false;
    }

    // @ds:9772e9ac
    function confirmLeaveSucceeded(fishId){
        if( fishId !== currentUserFishId ) return false;
        clearSessionBinding();
        return true;
    }

    connect();

    return {
        get currentUserFishId(){ return currentUserFishId; },
        get temporaryConnectionCode(){ return temporaryConnectionCode; },
        get isJoined(){ return joined; },
        join(profile){
            sendRaw(encodeClientJoin(profile));
        },
        input(payload){
            if( !joined ) return;
            sendRaw(encodeClientControl(payload));
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
