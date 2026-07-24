import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCandidates, extractKeywords, parseFeedItems } from '../src/index.js';

const sampleRss = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>요뜨 테스트 뉴스</title>
    <item>
      <title><![CDATA[AI 영상 생성 도구, 크리에이터 사이에서 급부상]]></title>
      <link>https://example.com/news/ai-video</link>
      <pubDate>Thu, 23 Jul 2026 09:00:00 +0900</pubDate>
    </item>
  </channel>
</rss>`;

test('parseFeedItems extracts RSS items', () => {
  const items = parseFeedItems(sampleRss, 'https://example.com/rss');

  assert.equal(items.length, 1);
  assert.equal(items[0].sourceName, '요뜨 테스트 뉴스');
  assert.equal(items[0].sourceUrl, 'https://example.com/news/ai-video');
});

test('extractKeywords returns normalized keyword candidates', () => {
  const keywords = extractKeywords('AI 영상 생성 도구, 크리에이터 사이에서 급부상');

  assert.ok(keywords.some((item) => item.normalizedKeyword === 'ai'));
  assert.ok(keywords.some((item) => item.normalizedKeyword.includes('영상')));
});

test('buildCandidates maps feed items to Supabase rows', () => {
  const items = parseFeedItems(sampleRss, 'https://example.com/rss');
  const candidates = buildCandidates(items, 'https://example.com/rss');

  assert.ok(candidates.length > 0);
  assert.equal(candidates[0].source_type, 'news_rss');
  assert.equal(candidates[0].source_url, 'https://example.com/news/ai-video');
});
