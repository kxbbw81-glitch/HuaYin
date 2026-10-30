const test = require('node:test');
const assert = require('node:assert/strict');
const importer = require('../scripts/import-apimodels-gpt-image-2-prompts');
const { sourceIdentity } = require('../scripts/grok-x-discovery');

const COMPLETE_PROMPT = 'A frosted amber glass dropper bottle of Lumira brand vitamin C serum stands centered on a wet, polished travertine slab. Soft diffused daylight, warm honey-gold palette, matte white seamless background, 90mm macro lens, shallow depth of field, crisp label focus, dewy luxurious skincare mood.';
const NOW = '2026-10-30T09:00:00.000Z';

function sourceItem(overrides = {}) {
  return {
    id: 'ecommerce-1',
    category: 'ecommerce',
    name_en: 'Frosted Vitamin C Serum Hero',
    name_zh: '磨砂维C精华主图',
    prompt_en: COMPLETE_PROMPT,
    prompt_zh: '一支磨砂琥珀色玻璃滴管精华瓶居中立在湿润抛光的洞石台面上，柔和散射日光，暖蜜金色调，哑光白无缝背景，90mm 微距，浅景深，标签锐利，水润高级护肤氛围。',
    aspect_ratio: '4:5',
    tags: ['skincare', 'serum', 'product'],
    image: 'https://r2.apimodels.app/assets/prompt-gallery/1785070148652_ecommerce-1.png',
    ...overrides
  };
}

test('imports a licensed ecommerce prompt with attribution and sync metadata', () => {
  const result = importer.importPrompts([sourceItem()], [], NOW);
  const item = result.accepted[0];

  assert.equal(result.accepted.length, 1);
  assert.equal(item.id, 'apimodels_gpt_image_2_ecommerce-1');
  assert.equal(item.title, '磨砂维C精华主图');
  assert.equal(item.category, '电商视觉');
  assert.equal(item.commerceType, '产品主图');
  assert.equal(item.prompt, COMPLETE_PROMPT);
  assert.match(item.promptZh, /精华瓶/);
  assert.equal(item.aspectRatio, '4:5');
  assert.equal(item.model, 'GPT Image 2');
  assert.equal(item.image, sourceItem().image);
  assert.equal(item.license, 'CC BY 4.0');
  assert.equal(item.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(item.attribution, 'API Models (apimodels.app)');
  assert.equal(item.sourceRepository, 'apimodels/gpt-image-2-prompts');
  assert.equal(item.sourceUrl, 'https://github.com/apimodels/gpt-image-2-prompts/blob/master/prompts.json#ecommerce-1');
  assert.equal(item.githubSyncedAt, NOW);
  assert.equal(item.domesticSyncedAt, null);
  assert.ok([...item.title].length <= 20);
});

test('rejects short prompts, non-HTTPS media, and non-commerce categories', () => {
  const result = importer.importPrompts([
    sourceItem({ id: 'ecommerce-2', prompt_en: 'too short', image: 'https://r2.apimodels.app/assets/prompt-gallery/short.png' }),
    sourceItem({ id: 'ecommerce-3', image: 'http://r2.apimodels.app/assets/prompt-gallery/plain.png' }),
    sourceItem({ id: 'social-1', category: 'social', image: 'https://r2.apimodels.app/assets/prompt-gallery/social.png' }),
    sourceItem({ id: 'avatar-1', category: 'avatar', image: 'https://r2.apimodels.app/assets/prompt-gallery/avatar.png' })
  ], [], NOW);

  assert.equal(result.accepted.length, 0);
  assert.deepEqual(result.rejected.map(item => item.reason), [
    'prompt shorter than 160 characters',
    'missing HTTPS result media',
    'outside commerce categories',
    'outside commerce categories'
  ]);
});

test('keeps poster and product commerce types and dedupes prompt, source, and media', () => {
  const posterPrompt = `${COMPLETE_PROMPT} Vertical advertising poster for a summer campaign, bold typography, no watermark.`;
  const lifestylePrompt = 'A ceramic pour-over kettle and two stoneware cups sit in a lifestyle product scene, product in use during a slow Sunday breakfast. Linen napkin, window light, realistic steam, oak table, editorial catalog crop, quiet neutral palette, 50mm lens, natural shadows, and enough surrounding detail to rebuild the shot without any poster typography.';
  const first = importer.importPrompts([
    sourceItem({ id: 'poster-1', category: 'poster', name_zh: '夏日广告海报', prompt_en: posterPrompt }),
    sourceItem({ id: 'product-1', category: 'product', name_zh: '厨房场景种草', prompt_en: lifestylePrompt, image: 'https://r2.apimodels.app/assets/prompt-gallery/product-1.png' })
  ], [], NOW);

  assert.deepEqual(first.accepted.map(item => item.commerceType), ['广告海报', '场景种草']);

  const duplicate = importer.importPrompts([
    sourceItem({ id: 'ecommerce-2', image: 'https://r2.apimodels.app/assets/prompt-gallery/ecommerce-2.png' }),
    sourceItem({ id: 'ecommerce-1', prompt_en: `${COMPLETE_PROMPT} Different wording for the same dataset record.`, image: 'https://r2.apimodels.app/assets/prompt-gallery/ecommerce-1b.png' }),
    sourceItem({ id: 'ecommerce-8', prompt_en: `${COMPLETE_PROMPT} Extra unique ending for media dedupe.`, image: 'https://r2.apimodels.app/assets/prompt-gallery/already.png' })
  ], [{
    id: 'existing',
    prompt: COMPLETE_PROMPT,
    sourceUrl: 'https://github.com/apimodels/gpt-image-2-prompts/blob/master/prompts.json#ecommerce-1',
    image: 'https://r2.apimodels.app/assets/prompt-gallery/already.png'
  }], NOW);

  assert.equal(duplicate.accepted.length, 0);
  assert.deepEqual(duplicate.rejected.map(item => item.reason), [
    'duplicate prompt',
    'duplicate source URL',
    'duplicate media'
  ]);
});

test('keeps prompts.json record fragments distinct and still collapses ordinary URL hashes', () => {
  const base = 'https://github.com/apimodels/gpt-image-2-prompts/blob/master/prompts.json';
  assert.notEqual(sourceIdentity(`${base}#ecommerce-1`), sourceIdentity(`${base}#ecommerce-2`));
  assert.equal(
    sourceIdentity('https://x.com/example/status/900#photo'),
    sourceIdentity('https://x.com/example/status/900')
  );
});

test('rejects restricted third-party IP inside an otherwise valid ecommerce row', () => {
  const result = importer.importPrompts([
    sourceItem({
      id: 'ecommerce-4',
      prompt_en: `${COMPLETE_PROMPT} Featuring a Disney princess mascot on the label.`
    })
  ], [], NOW);

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0].reason, 'restricted third-party IP');
});
