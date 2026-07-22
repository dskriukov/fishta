#!/usr/bin/env node
// Test population client for the local/staging server.
// @fix:7c8d9e0f

const kind = process.argv[2];
const endpointByKind = {
    fish: '/test/more-fish',
    shred: '/test/more-shred',
};
const endpoint = endpointByKind[kind];
if( !endpoint ){
    console.error('Usage: node tools/test-populate.mjs <fish|shred> [amount]');
    process.exit(2);
}

const amount = Math.max(0, Math.floor(Number(process.env.AMOUNT ?? process.argv[3] ?? 0)));
const baseUrl = String(process.env.URL || 'http://localhost:8787').replace(/\/$/, '');
const response = await fetch(`${baseUrl}${endpoint}?amount=${encodeURIComponent(amount)}`, { method: 'POST' });
const body = await response.text();
if( !response.ok ){
    console.error(`test population request failed (${response.status}): ${body}`);
    process.exit(1);
}
console.log(body);
