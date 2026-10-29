const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const extensionDir = path.join(root, 'extension');
const zipPath = path.join(root, 'PromptHub-Extension-v3.32.0.zip');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function listExtensionFiles(dir, prefix = '') {
  const names = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) names.push(...listExtensionFiles(full, rel));
    else if (entry.isFile()) names.push(rel);
  }
  return names.sort();
}

function readZip(buffer) {
  const files = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.slice(nameStart, nameStart + nameLength).toString('utf8');
    const dataStart = nameStart + nameLength + extraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : zlib.inflateRawSync(compressed);
    if (!name.endsWith('/')) files.set(name, data);
    offset = dataStart + compressedSize;
  }
  return files;
}

test('the published extension zip matches extension/ at version 3.32.0', () => {
  assert.equal(fs.existsSync(zipPath), true);
  const sourceFiles = listExtensionFiles(extensionDir);
  const zip = readZip(fs.readFileSync(zipPath));
  assert.deepEqual([...zip.keys()].sort(), sourceFiles);

  const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.version, '3.32.0');
  assert.equal(JSON.parse(zip.get('manifest.json').toString('utf8')).version, '3.32.0');

  for (const name of sourceFiles) {
    const sourceHash = sha256(fs.readFileSync(path.join(extensionDir, name)));
    assert.equal(sha256(zip.get(name)), sourceHash, name);
  }
});
