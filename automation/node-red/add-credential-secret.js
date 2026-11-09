const fs = require('fs');
const path = process.argv[2];
if (!path) throw new Error('Usage: node add-credential-secret.js /data/settings.js');
const source = fs.readFileSync(path, 'utf8');
const active = source.split(/\r?\n/).filter(line => /^\s*credentialSecret\s*:/.test(line));
if (active.length) {
  if (active.length !== 1 || !active[0].includes('process.env.NODE_RED_CREDENTIAL_SECRET')) {
    throw new Error('Found an existing active credentialSecret setting; refusing to overwrite it');
  }
  console.log('credentialSecret already configured from environment');
  process.exit(0);
}
const marker = /(^module\.exports\s*=\s*\{\s*\r?\n)/m;
const matches = source.match(marker);
if (!matches || source.match(new RegExp(marker.source, 'gm'))?.length !== 1) {
  throw new Error('Expected one module.exports settings object; refusing edit');
}
const updated = source.replace(marker, '$1    credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET,\n');
const temp = `${path}.automation-tmp`;
fs.writeFileSync(temp, updated, { mode: 0o600 });
fs.renameSync(temp, path);
console.log('Added environment-backed credentialSecret');
