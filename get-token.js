// get-token.js
const fs = require('fs');
const crypto = require('crypto');

const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const payload = Buffer.from(JSON.stringify({
  iss: process.env.SF_CONSUMER_KEY,       // Consumer Key de la Connected App
  sub: process.env.SF_USERNAME,           // Username Salesforce
  aud: 'https://test.salesforce.com',    // ou https://test.salesforce.com pour sandbox
  exp: now + 300                           // expire dans 5 minutes
})).toString('base64url');

const privateKey = fs.readFileSync('assets/server.key', 'utf8');
const sign = crypto.createSign('RSA-SHA256');
sign.update(`${header}.${payload}`);
const signature = sign.sign(privateKey, 'base64url');

console.log(`\n✅ JWT assertion :\n${header}.${payload}.${signature}\n`);