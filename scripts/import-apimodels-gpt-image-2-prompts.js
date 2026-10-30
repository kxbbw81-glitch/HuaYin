const fs = require('node:fs');
const path = require('node:path');
const { classifyCommerceType } = require('./category-rules');
const { normalizeSourceUrl, promptFingerprint, sourceIdentity } = require('./grok-x-discovery');

const MIN_PROMPT_LENGTH = 160;
const REPOSITORY = 'apimodels/gpt-image-2-prompts';
const LICENSE = 'CC BY 4.0';
const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
const ATTRIBUTION = 'API Models (apimodels.app)';
const DATASET_URL = `https://github.com/${REPOSITORY}/blob/master/prompts.json`;
const DEFAULT_CATEGORIES = ['ecommerce', 'product', 'poster'];
const RESTRICTED_IP = /copyrighted characters|disney|dreamworks|pixar|marvel|thanos|spider[-\s]?man|star wars|harry potter|pokemon|nintendo|ghibli|minecraft|league of legends|dragon ball|street fighter|chun[-\s]?li|megan fox|celebrity lookalike|迪士尼|皮克斯|漫威|蜘蛛侠|星球大战|哈利波特|宝可梦|任天堂|吉卜力|我的世界|英雄联盟|街头霸王|春丽/i;

const CATEGORY_TAGS = {
  ecommerce: '产品主图',
  product: '产品摄影',
  poster: '广告海报'
};

function cleanText(value) {
  return String(value || '')
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isHttpsUrl(value) {
  try {
    return new URL(String(value || '')).protocol === 'https:';
  } catch {
    return false;
  }
}

function listItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.prompts)) return payload.prompts;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function allowedCategories(options = {}) {
  const configured = options.categories;
  const values = Array.isArray(configured) && configured.length ? configured : DEFAULT_CATEGORIES;
  return new Set(values.map(item => cleanText(item).toLowerCase()).filter(Boolean));
}

function slugId(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function normalizeTitle(item) {
  const title = cleanText(item.name_zh);
  if (title && [...title].length <= 20) return title;
  const english = cleanText(item.name_en);
  if (english && [...english].length <= 20) return english;
  return [...(title || english || '电商视觉提示词')].slice(0, 20).join('');
}

function normalizeAspectRatio(value) {
  const direct = cleanText(value).replace(/\s+/g, '');
  return /^\d{1,2}:\d{1,2}$/.test(direct) ? direct : '';
}

function buildTags(item) {
  return [...new Set([
    '电商视觉',
    'GPT Image 2',
    CATEGORY_TAGS[cleanText(item.category).toLowerCase()] || cleanText(item.category),
    ...(Array.isArray(item.tags) ? item.tags : [])
  ].map(cleanText).filter(Boolean))].slice(0, 8);
}

function commerceTypeFor(item, prompt, tags) {
  if (cleanText(item.category).toLowerCase() === 'poster') return '广告海报';
  return classifyCommerceType({ title: item.name_zh || item.name_en, prompt, tags }) || '产品主图';
}

function mediaUrls(item) {
  return [item?.image, ...(Array.isArray(item?.images) ? item.images : [])]
    .map(value => normalizeSourceUrl(value))
    .filter(Boolean);
}

function toCollection(item, prompt, promptZh, now) {
  const slug = slugId(item.id);
  const image = cleanText(item.image);
  const sourceUrl = `${DATASET_URL}#${slug}`;
  const tags = buildTags(item);
  const commerceType = commerceTypeFor(item, prompt, tags);
  return {
    id: `apimodels_gpt_image_2_${slug}`,
    title: normalizeTitle(item),
    prompt,
    ...(promptZh ? { promptZh } : {}),
    category: '电商视觉',
    commerceType,
    tags,
    model: 'GPT Image 2',
    mediaType: 'image',
    image,
    images: [image],
    rawImages: [image],
    referenceImages: [],
    aspectRatio: normalizeAspectRatio(item.aspect_ratio),
    source: REPOSITORY,
    sourceUrl,
    url: sourceUrl,
    archiveUrl: DATASET_URL,
    sourceRepository: REPOSITORY,
    license: LICENSE,
    licenseUrl: LICENSE_URL,
    attribution: ATTRIBUTION,
    domain: 'github.com',
    date: now.slice(0, 10),
    timestamp: Date.parse(now),
    collectedAt: now,
    githubSyncedAt: now,
    domesticSyncedAt: null
  };
}

function importPrompts(payload, collections, now = new Date().toISOString(), options = {}) {
  const categories = allowedCategories(options);
  const existingPrompts = new Set(collections.map(item => promptFingerprint(item.prompt)).filter(Boolean));
  const existingSources = new Set(collections.map(item => sourceIdentity(item.sourceUrl || item.url)).filter(Boolean));
  const existingIds = new Set(collections.map(item => cleanText(item.id)).filter(Boolean));
  const existingMedia = new Set(collections.flatMap(mediaUrls));
  const accepted = [];
  const rejected = [];

  for (const item of listItems(payload)) {
    const category = cleanText(item?.category).toLowerCase();
    const slug = slugId(item?.id);
    if (!categories.has(category)) {
      rejected.push({ id: item?.id, reason: 'outside commerce categories' });
      continue;
    }
    if (!slug) {
      rejected.push({ id: item?.id, reason: 'missing prompt id' });
      continue;
    }

    const prompt = cleanText(item.prompt_en);
    const promptZh = cleanText(item.prompt_zh);
    if (prompt.length < MIN_PROMPT_LENGTH) {
      rejected.push({ id: item.id, reason: 'prompt shorter than 160 characters' });
      continue;
    }
    if (!isHttpsUrl(item.image)) {
      rejected.push({ id: item.id, reason: 'missing HTTPS result media' });
      continue;
    }
    if (RESTRICTED_IP.test([item.name_en, item.name_zh, prompt, promptZh].filter(Boolean).join('\n'))) {
      rejected.push({ id: item.id, reason: 'restricted third-party IP' });
      continue;
    }

    const collection = toCollection(item, prompt, promptZh, now);
    const fingerprint = promptFingerprint(collection.prompt);
    const sourceKey = sourceIdentity(collection.sourceUrl);
    const images = mediaUrls(collection);
    if (existingIds.has(collection.id)) {
      rejected.push({ id: item.id, reason: 'duplicate id' });
      continue;
    }
    if (existingPrompts.has(fingerprint)) {
      rejected.push({ id: item.id, reason: 'duplicate prompt' });
      continue;
    }
    if (existingSources.has(sourceKey)) {
      rejected.push({ id: item.id, reason: 'duplicate source URL' });
      continue;
    }
    if (images.some(image => existingMedia.has(image))) {
      rejected.push({ id: item.id, reason: 'duplicate media' });
      continue;
    }

    existingIds.add(collection.id);
    existingPrompts.add(fingerprint);
    existingSources.add(sourceKey);
    images.forEach(image => existingMedia.add(image));
    accepted.push(collection);
  }

  return { accepted, rejected };
}

function parseArgs(argv) {
  const projectRoot = path.join(__dirname, '..');
  const options = {
    input: path.join(projectRoot, 'staging', 'apimodels-gpt-image-2-prompts.json'),
    collections: path.join(projectRoot, 'data', 'collections.json'),
    apply: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--input') options.input = path.resolve(argv[++index]);
    else if (argv[index] === '--collections') options.collections = path.resolve(argv[++index]);
    else if (argv[index] === '--apply') options.apply = true;
  }
  return options;
}

function run(argv = process.argv) {
  const options = parseArgs(argv);
  const sourcePayload = JSON.parse(fs.readFileSync(options.input, 'utf8'));
  const destinationPayload = JSON.parse(fs.readFileSync(options.collections, 'utf8'));
  const collections = Array.isArray(destinationPayload) ? destinationPayload : destinationPayload.collections;
  const now = new Date().toISOString();
  const result = importPrompts(sourcePayload, collections, now);
  if (options.apply && result.accepted.length) {
    destinationPayload.collections = [...result.accepted, ...collections];
    destinationPayload.updatedAt = now;
    fs.writeFileSync(options.collections, `${JSON.stringify(destinationPayload, null, 2)}\n`);
  }
  const rejectedByReason = result.rejected.reduce((counts, item) => {
    counts[item.reason] = (counts[item.reason] || 0) + 1;
    return counts;
  }, {});
  const summary = {
    sourceItems: listItems(sourcePayload).length,
    accepted: result.accepted.length,
    rejected: result.rejected.length,
    rejectedByReason,
    applied: options.apply
  };
  console.log(JSON.stringify(summary, null, 2));
  return { ...result, summary };
}

if (require.main === module) run();

module.exports = {
  ATTRIBUTION,
  DEFAULT_CATEGORIES,
  LICENSE,
  MIN_PROMPT_LENGTH,
  importPrompts,
  normalizeTitle,
  toCollection
};
