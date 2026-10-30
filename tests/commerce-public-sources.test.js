const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sync = require('../scripts/sync-public-commerce-sources');

const COMPLETE_PROMPT = 'Create a premium vertical product campaign for a glass perfume bottle on a polished stone pedestal. Preserve the exact bottle silhouette and label, add controlled window light, realistic reflections, soft botanical shadows, a pale neutral background, refined luxury styling, shallow depth of field, crisp material detail, balanced negative space, and no watermark or distorted typography. Image ratio 4:5.';

function gptSource(overrides = {}) {
  return {
    id: 'gpt-commerce',
    enabled: true,
    adapter: 'awesome-gpt-image-2',
    name: 'GPT commerce source',
    dataUrl: 'https://example.com/cases.json',
    license: 'MIT',
    licenseUrl: 'https://example.com/license',
    sourceCategory: 'Products & E-commerce',
    maxItemsPerRun: 20,
    ...overrides
  };
}

function aiartSource(overrides = {}) {
  return {
    id: 'aiart-commerce',
    enabled: true,
    adapter: 'awesome-aiart-pics-prompts',
    name: 'AI Art commerce source',
    dataUrl: 'https://example.com/prompts.md',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    maxItemsPerRun: 20,
    ...overrides
  };
}

function gptPayload(overrides = {}) {
  return JSON.stringify({
    cases: [{
      id: 900,
      title: '薄荷玫瑰香水电商图',
      image: '/images/case900.jpg',
      sourceLabel: '@example',
      sourceUrl: 'https://x.com/example/status/900',
      githubUrl: 'https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-2.md#case-900',
      prompt: COMPLETE_PROMPT,
      category: 'Products & E-commerce',
      styles: ['Realistic'],
      scenes: ['Commerce'],
      ...overrides
    }]
  });
}

function commerceMarkdown({ title = '香水产品广告', prompt = COMPLETE_PROMPT } = {}) {
  return `### [${title}](https://aiart.pics/prompt/perfume-campaign)\n\n**作者**: [@Example](https://x.com/example)\n\n**来源**: [X](https://x.com/example/status/901)\n\n<img src="https://img1.aiart.pics/images/prompts/20260101/perfume-campaign.jpg" width="500" alt="${title}">\n\n\`\`\`\nPrompt: ${prompt}\n\`\`\`\n`;
}

test('imports only complete licensed e-commerce prompt media from approved sources', () => {
  const result = sync.importApprovedCommerceSources({
    sources: [gptSource(), aiartSource()],
    sourceContents: {
      'gpt-commerce': gptPayload(),
      'aiart-commerce': commerceMarkdown({
        title: '护肤精华产品广告',
        prompt: COMPLETE_PROMPT.replace('glass perfume bottle', 'limited-edition skincare serum bottle')
      })
    },
    collections: [],
    now: '2026-08-04T00:00:00.000Z'
  });

  assert.equal(result.accepted.length, 2);
  assert.deepEqual(result.accepted.map(item => item.category), ['电商视觉', '电商视觉']);
  assert.deepEqual(result.accepted.map(item => item.collectionOrigin), ['approved-public-commerce', 'approved-public-commerce']);
  assert.ok(result.accepted.every(item => item.sourceLicenseVerified));
  assert.ok(result.accepted.every(item => item.commerceType));
});

test('rejects sources without a reusable license and globally deduplicates accepted items', () => {
  const invalid = sync.importApprovedCommerceSources({
    sources: [gptSource({ licenseUrl: '' })],
    sourceContents: { 'gpt-commerce': gptPayload() },
    collections: [],
    now: '2026-08-04T00:00:00.000Z'
  });
  assert.equal(invalid.accepted.length, 0);
  assert.match(invalid.rejected[0].reason, /missing source metadata/);

  const duplicate = sync.importApprovedCommerceSources({
    sources: [gptSource()],
    sourceContents: { 'gpt-commerce': gptPayload() },
    collections: [{ id: 'existing', prompt: COMPLETE_PROMPT, sourceUrl: 'https://example.com/old', image: 'https://example.com/old.jpg' }],
    now: '2026-08-04T00:00:00.000Z'
  });
  assert.equal(duplicate.accepted.length, 0);
  assert.ok(duplicate.rejected.some(item => item.reason === 'duplicate prompt'));
});

function apimodelsSource(overrides = {}) {
  return {
    id: 'apimodels-gpt-image-2-prompts-commerce',
    enabled: true,
    adapter: 'apimodels-gpt-image-2-prompts',
    name: 'apimodels GPT Image 2 Prompts (ecommerce/product/poster)',
    dataUrl: 'https://raw.githubusercontent.com/apimodels/gpt-image-2-prompts/master/prompts.json',
    license: 'CC BY 4.0',
    licenseUrl: 'https://github.com/apimodels/gpt-image-2-prompts/blob/master/LICENSE',
    sourceCategories: ['ecommerce', 'product', 'poster'],
    maxItemsPerRun: 20,
    ...overrides
  };
}

function apimodelsItem(id, overrides = {}) {
  return {
    id,
    category: 'ecommerce',
    name_en: `Hero ${id}`,
    name_zh: `主图${id}`,
    prompt_en: `${COMPLETE_PROMPT} Unique record ${id}.`,
    prompt_zh: `中文提示词 ${id}`,
    aspect_ratio: '4:5',
    tags: ['product'],
    image: `https://r2.apimodels.app/assets/prompt-gallery/${id}.png`,
    ...overrides
  };
}

test('admits the apimodels adapter and caps a licensed ecommerce batch', () => {
  const source = apimodelsSource({ maxItemsPerRun: 2 });
  assert.equal(sync.validateSource(source).valid, true);
  assert.match(sync.validateSource(apimodelsSource({ adapter: 'unlicensed-scraper' })).reason, /unsupported source adapter/);

  const result = sync.importApprovedCommerceSources({
    sources: [source],
    sourceContents: {
      'apimodels-gpt-image-2-prompts-commerce': JSON.stringify([
        apimodelsItem('ecommerce-1'),
        apimodelsItem('ecommerce-2'),
        apimodelsItem('ecommerce-3'),
        apimodelsItem('social-1', { category: 'social' }),
        apimodelsItem('ecommerce-4', { prompt_en: 'too short' }),
        apimodelsItem('ecommerce-5', { image: 'http://insecure.example/item.png' })
      ])
    },
    collections: [],
    now: '2026-10-30T09:00:00.000Z'
  });

  assert.equal(result.accepted.length, 2);
  assert.deepEqual(result.accepted.map(item => item.id), [
    'apimodels_gpt_image_2_ecommerce-1',
    'apimodels_gpt_image_2_ecommerce-2'
  ]);
  assert.ok(result.accepted.every(item => item.category === '电商视觉'));
  assert.ok(result.accepted.every(item => item.commerceType === '产品主图'));
  assert.ok(result.accepted.every(item => item.collectionOrigin === 'approved-public-commerce'));
  assert.ok(result.accepted.every(item => item.license === 'CC BY 4.0'));
  assert.ok(result.accepted.every(item => item.attribution === 'API Models (apimodels.app)'));
  assert.ok(result.accepted.every(item => item.sourceLicenseUrl === source.licenseUrl));
  assert.ok(result.accepted.every(item => item.githubSyncedAt === '2026-10-30T09:00:00.000Z'));
  assert.ok(result.accepted.every(item => item.domesticSyncedAt === null));
  assert.ok(result.accepted.every(item => item.prompt.length >= 160));
  assert.ok(result.accepted.every(item => item.image.startsWith('https://')));
  assert.ok(result.rejected.some(item => item.reason === 'source run limit reached'));
  assert.ok(result.rejected.some(item => item.reason === 'outside commerce categories'));
  assert.ok(result.rejected.some(item => item.reason === 'prompt shorter than 160 characters'));
  assert.ok(result.rejected.some(item => item.reason === 'missing HTTPS result media'));
});

test('rejects an apimodels row when license, attribution, or an existing prompt fails admission', () => {
  const mismatched = sync.importApprovedCommerceSources({
    sources: [apimodelsSource({ license: 'MIT' })],
    sourceContents: {
      'apimodels-gpt-image-2-prompts-commerce': JSON.stringify([apimodelsItem('ecommerce-1')])
    },
    collections: [],
    now: '2026-10-30T09:00:00.000Z'
  });
  assert.equal(mismatched.accepted.length, 0);
  assert.equal(mismatched.rejected[0].reason, 'source license mismatch');

  const duplicate = sync.importApprovedCommerceSources({
    sources: [apimodelsSource()],
    sourceContents: {
      'apimodels-gpt-image-2-prompts-commerce': JSON.stringify([
        apimodelsItem('ecommerce-1'),
        apimodelsItem('ecommerce-2')
      ])
    },
    collections: [{
      id: 'already',
      prompt: apimodelsItem('ecommerce-1').prompt_en,
      sourceUrl: 'https://example.com/existing',
      image: 'https://example.com/existing.jpg'
    }],
    now: '2026-10-30T09:00:00.000Z'
  });
  assert.equal(duplicate.accepted.length, 1);
  assert.equal(duplicate.accepted[0].id, 'apimodels_gpt_image_2_ecommerce-2');
  assert.ok(duplicate.rejected.some(item => item.reason === 'duplicate prompt'));

  const missingAttribution = sync.validateCollection({
    prompt: COMPLETE_PROMPT,
    image: 'https://r2.apimodels.app/assets/prompt-gallery/ecommerce-1.png',
    images: ['https://r2.apimodels.app/assets/prompt-gallery/ecommerce-1.png'],
    sourceUrl: 'https://github.com/apimodels/gpt-image-2-prompts/blob/master/prompts.json#ecommerce-1',
    license: 'CC BY 4.0',
    title: '磨砂维C精华主图',
    category: '电商视觉',
    commerceType: '产品主图'
  }, apimodelsSource());
  assert.equal(missingAttribution, 'missing attribution');
});

test('registers the apimodels CC BY source in the approved commerce config', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'commerce-public-sources.json'), 'utf8'));
  const source = config.sources.find(item => item.id === 'apimodels-gpt-image-2-prompts-commerce');
  assert.equal(source.adapter, 'apimodels-gpt-image-2-prompts');
  assert.equal(source.enabled, true);
  assert.equal(source.license, 'CC BY 4.0');
  assert.equal(source.licenseUrl, 'https://github.com/apimodels/gpt-image-2-prompts/blob/master/LICENSE');
  assert.equal(source.dataUrl, 'https://raw.githubusercontent.com/apimodels/gpt-image-2-prompts/master/prompts.json');
  assert.deepEqual(source.sourceCategories, ['ecommerce', 'product', 'poster']);
  assert.equal(source.maxItemsPerRun, 20);
  assert.equal(sync.validateSource(source).valid, true);
});

test('does not import a non-commerce public example', () => {
  const result = sync.importApprovedCommerceSources({
    sources: [aiartSource()],
    sourceContents: {
      'aiart-commerce': commerceMarkdown({ title: '晨光城市人像', prompt: COMPLETE_PROMPT.replace('product campaign for a glass perfume bottle', 'editorial portrait of a woman') })
    },
    collections: [],
    now: '2026-08-04T00:00:00.000Z'
  });
  assert.equal(result.accepted.length, 0);
  assert.ok(result.rejected.some(item => item.reason === 'not an e-commerce prompt'));
});
