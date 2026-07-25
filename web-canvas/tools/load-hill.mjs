#!/usr/bin/env node
// Ramp synthetic user fish up and back down to measure a load hill.
// @fix:7c8d9e0f

import WebSocket from 'ws';

const url = process.env.URL || 'ws://localhost:8787';
const maxFish = Math.max(1, Math.min(20, Math.floor(Number(process.env.MAX_FISH || 20))));
const stepMs = Math.max(20, Number(process.env.STEP_MS || 200));
const holdMs = Math.max(0, Number(process.env.HOLD_MS || 4000));
const inputEveryMs = Math.max(20, Number(process.env.INPUT_MS || 50));
const reportEveryMs = Math.max(200, Number(process.env.REPORT_MS || 1000));
const clients = [];
const metrics = {
    startedAt: Date.now(),
    opened: 0,
    closed: 0,
    added: 0,
    removed: 0,
    sentBytes: 0,
    receivedBytes: 0,
    receivedMessages: 0,
    inputMessages: 0,
    errors: 0,
};

function encodeSignedThousand(value){
    const n = Math.max(-999, Math.min(999, Math.round(value * 1000)));
    return `${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(3, '0')}`;
}

function encodeInput(x, y, speedLevel = 20){
    return `c${encodeSignedThousand(x)}${encodeSignedThousand(y)}v${speedLevel}`;
}

// @fix:7c8d9e0f
function colorForClient(index){
    const hue = (index * 137.508) % 360;
    const saturation = 68 / 100;
    const lightness = 58 / 100;
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const hp = hue / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let red = 0, green = 0, blue = 0;
    if( hp < 1 ) [red, green, blue] = [c, x, 0];
    else if( hp < 2 ) [red, green, blue] = [x, c, 0];
    else if( hp < 3 ) [red, green, blue] = [0, c, x];
    else if( hp < 4 ) [red, green, blue] = [0, x, c];
    else if( hp < 5 ) [red, green, blue] = [x, 0, c];
    else [red, green, blue] = [c, 0, x];
    const m = lightness - c / 2;
    const channel = value => Math.max(0, Math.min(255, Math.round((value + m) * 255)))
        .toString(16).padStart(2, '0');
    return `${channel(red)}${channel(green)}${channel(blue)}`;
}

function send(client, message){
    if( client.socket.readyState !== WebSocket.OPEN ) return false;
    client.socket.send(message);
    metrics.sentBytes += Buffer.byteLength(message);
    return true;
}

function sleep(durationMs){
    return new Promise(resolve => setTimeout(resolve, durationMs));
}

function makeClient(index){
    const socket = new WebSocket(url);
    const client = {
        index,
        socket,
        inputTimer: null,
        phase: index / Math.max(1, maxFish) * Math.PI * 2,
        removed: false,
    };
    const startedAt = performance.now();
    const name = Buffer.from(`load-hill-${index + 1}`).toString('base64url');
    const color = colorForClient(index);

    socket.on('message', data => {
        metrics.receivedMessages++;
        metrics.receivedBytes += Buffer.byteLength(data);
        if( client.removing && String(data).startsWith('e:npc:') ) client.npcResolved?.();
    });
    socket.on('error', () => { metrics.errors++; });
    socket.on('close', () => {
        metrics.closed++;
        if( client.inputTimer ) clearInterval(client.inputTimer);
        client.inputTimer = null;
    });

    client.open = new Promise((resolve, reject) => {
        socket.once('open', () => {
            metrics.opened++;
            send(client, `n:${color}:${name}:u`);
            client.inputTimer = setInterval(() => {
                const elapsed = (performance.now() - startedAt) / 1000;
                const angle = client.phase + elapsed * 0.22;
                if( send(client, encodeInput(Math.cos(angle), Math.sin(angle), 20)) ) metrics.inputMessages++;
            }, inputEveryMs);
            resolve(client);
        });
        socket.once('error', reject);
    });
    return client;
}

async function addFish(index){
    const client = makeClient(index);
    clients.push(client);
    await client.open;
    metrics.added++;
    console.log(`[load-hill] added ${metrics.added}/${maxFish}`);
}

async function removeFish(client){
    if( !client || client.removed ) return;
    client.removing = true;
    if( client.inputTimer ) clearInterval(client.inputTimer);
    client.inputTimer = null;
    const removed = new Promise(resolve => {
        let settled = false;
        const finish = () => {
            if( settled ) return;
            settled = true;
            client.npcResolved = null;
            resolve();
        };
        client.npcResolved = finish;
        setTimeout(finish, Math.max(500, stepMs * 2));
    });
    send(client, 'q');
    await removed;
    client.removed = true;
    metrics.removed++;
    if( client.socket.readyState === WebSocket.OPEN ) client.socket.close();
    console.log(`[load-hill] removed ${metrics.removed}/${maxFish}`);
}

function report(){
    const elapsedSeconds = Math.max(1, (Date.now() - metrics.startedAt) / 1000);
    console.log(JSON.stringify({
        elapsedSeconds: Number(elapsedSeconds.toFixed(1)),
        target: maxFish,
        active: metrics.added - metrics.removed,
        added: metrics.added,
        removed: metrics.removed,
        opened: metrics.opened,
        closed: metrics.closed,
        errors: metrics.errors,
        inputPerSecond: Number((metrics.inputMessages / elapsedSeconds).toFixed(1)),
        receivedMessagesPerSecond: Number((metrics.receivedMessages / elapsedSeconds).toFixed(1)),
        inboundKBps: Number((metrics.receivedBytes / elapsedSeconds / 1024).toFixed(2)),
        outboundKBps: Number((metrics.sentBytes / elapsedSeconds / 1024).toFixed(2)),
    }));
}

async function shutdown(){
    for( const client of clients ){
        if( client.inputTimer ) clearInterval(client.inputTimer);
        if( client.socket.readyState === WebSocket.OPEN ) client.socket.close();
    }
    await sleep(100);
    process.exit(0);
}

const reportTimer = setInterval(report, reportEveryMs);
process.once('SIGINT', async () => { clearInterval(reportTimer); await shutdown(); });
process.once('SIGTERM', async () => { clearInterval(reportTimer); await shutdown(); });

try{
    console.log(`[load-hill] starting: ${maxFish} synthetic users -> ${url}`);
    for( let index = 0; index < maxFish; index++ ){
        if( index > 0 ) await sleep(stepMs);
        await addFish(index);
    }
    console.log(`[load-hill] holding ${maxFish} users for ${holdMs}ms`);
    await sleep(holdMs);
    for( let index = clients.length - 1; index >= 0; index-- ){
        if( index < clients.length - 1 ) await sleep(stepMs);
        await removeFish(clients[index]);
    }
    clearInterval(reportTimer);
    report();
    console.log('[load-hill] complete');
}catch(error){
    clearInterval(reportTimer);
    console.error(`[load-hill] failed: ${error?.message || error}`);
    await shutdown();
}
