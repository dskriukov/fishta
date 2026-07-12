// 20 synthetic user fish moving continuously around the authoritative world.
// @ds:e559831a @ds:671e9773 @ds:61245206

import WebSocket from 'ws';

const url = process.env.URL || 'ws://localhost:8787';
const clientCount = Number(process.env.CLIENTS || 20);
const reportEveryMs = Number(process.env.REPORT_MS || 5000);
const inputEveryMs = Number(process.env.INPUT_MS || 50);
const clients = [];
const metrics = {
    startedAt: Date.now(),
    opened: 0,
    closed: 0,
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

function send(socket, message){
    if( socket.readyState !== WebSocket.OPEN ) return;
    socket.send(message);
    metrics.sentBytes += Buffer.byteLength(message);
}

function makeClient(index){
    const socket = new WebSocket(url);
    const phase = index / clientCount * Math.PI * 2;
    const name = Buffer.from(`load-${index + 1}`).toString('base64url');
    const startedAt = performance.now();
    let inputTimer = null;

    socket.on('open', () => {
        metrics.opened++;
        send(socket, `n:59bcd6:${name}:u`);
        inputTimer = setInterval(() => {
            const elapsed = (performance.now() - startedAt) / 1000;
            const angle = phase + elapsed * 0.22;
            send(socket, encodeInput(Math.cos(angle), Math.sin(angle), 20));
            metrics.inputMessages++;
        }, inputEveryMs);
    });
    socket.on('message', data => {
        metrics.receivedMessages++;
        metrics.receivedBytes += Buffer.byteLength(data);
    });
    socket.on('error', () => { metrics.errors++; });
    socket.on('close', () => {
        metrics.closed++;
        if( inputTimer ) clearInterval(inputTimer);
    });
    clients.push(socket);
}

function report(){
    const elapsedSeconds = Math.max(1, (Date.now() - metrics.startedAt) / 1000);
    console.log(JSON.stringify({
        elapsedSeconds: Number(elapsedSeconds.toFixed(1)),
        clients: clientCount,
        opened: metrics.opened,
        closed: metrics.closed,
        errors: metrics.errors,
        inputPerSecond: Number((metrics.inputMessages / elapsedSeconds).toFixed(1)),
        receivedMessagesPerSecond: Number((metrics.receivedMessages / elapsedSeconds).toFixed(1)),
        inboundKBps: Number((metrics.receivedBytes / elapsedSeconds / 1024).toFixed(2)),
        outboundKBps: Number((metrics.sentBytes / elapsedSeconds / 1024).toFixed(2)),
    }));
}

function shutdown(signal){
    console.log(`Stopping load test (${signal})`);
    report();
    for( const socket of clients ) socket.close();
    setTimeout(() => process.exit(0), 100);
}

for( let index = 0; index < clientCount; index++ ) makeClient(index);
const reportTimer = setInterval(report, reportEveryMs);
process.once('SIGINT', () => { clearInterval(reportTimer); shutdown('SIGINT'); });
process.once('SIGTERM', () => { clearInterval(reportTimer); shutdown('SIGTERM'); });
console.log(`Load test started: ${clientCount} clients -> ${url}`);
