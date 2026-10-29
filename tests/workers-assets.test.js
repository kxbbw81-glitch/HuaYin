const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('wrangler publishes the repo root as the prompthub static worker', () => {
  const wrangler = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8');
  assert.match(wrangler, /"name": "prompthub"/);
  assert.match(wrangler, /"directory": "\."/);
  assert.doesNotMatch(wrangler, /account_id/);
  assert.doesNotMatch(wrangler, /CLOUDFLARE_API_TOKEN|api_token/);
});

test('worker asset uploads skip the git checkout that exceeds the 25 MiB file cap', () => {
  const ignore = fs.readFileSync(path.join(root, '.assetsignore'), 'utf8');
  assert.match(ignore, /^\.git$/m);
  assert.match(ignore, /^node_modules$/m);
  assert.match(ignore, /^\.wrangler$/m);
  assert.match(ignore, /^\.env$/m);
  assert.doesNotMatch(ignore, /^js\/|^css\/|^index\.html|^data\/collections\.json/);
});
