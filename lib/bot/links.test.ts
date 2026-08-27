import { describe, it, expect } from 'vitest';
import { extractLinks, MAX_LINKS_PER_MESSAGE } from './links';

// A minimal Telegram message stub — only the fields extractLinks reads.
const msg = (over: Partial<Parameters<typeof extractLinks>[0]>) =>
  ({ message_id: 1, chat: { id: -100 }, ...over }) as Parameters<typeof extractLinks>[0];

describe('extractLinks — platform recognition', () => {
  it('recognizes an Instagram reel', () => {
    expect(extractLinks(msg({ text: 'look https://www.instagram.com/reel/Cabc123/' })))
      .toEqual([{ platform: 'instagram', url: 'https://www.instagram.com/reel/Cabc123/' }]);
  });

  it('recognizes an Instagram post and instagr.am short host', () => {
    expect(extractLinks(msg({ text: 'https://instagram.com/p/Cxyz/ and https://instagr.am/p/Cxyz2/' })))
      .toEqual([
        { platform: 'instagram', url: 'https://instagram.com/p/Cxyz/' },
        { platform: 'instagram', url: 'https://instagr.am/p/Cxyz2/' },
      ]);
  });

  it('recognizes Reddit comments, share, and redd.it/v.redd.it hosts', () => {
    const links = extractLinks(msg({
      text: [
        'https://www.reddit.com/r/aww/comments/abc123/title/',
        'https://old.reddit.com/r/aww/s/shareId',
        'https://v.redd.it/xyz789',
        'https://redd.it/abc123',
      ].join('\n'),
    }));
    expect(links.map(l => l.platform)).toEqual(['reddit', 'reddit', 'reddit', 'reddit']);
  });

  it('recognizes TikTok full and vm/vt short links', () => {
    const links = extractLinks(msg({
      text: 'https://www.tiktok.com/@user/video/7123 https://vm.tiktok.com/ZAbc/ https://vt.tiktok.com/ZXyz/',
    }));
    expect(links.map(l => l.platform)).toEqual(['tiktok', 'tiktok', 'tiktok']);
  });

  it('recognizes twitter.com and x.com status links', () => {
    const links = extractLinks(msg({
      text: 'https://twitter.com/jack/status/20 https://x.com/jack/status/21',
    }));
    expect(links.map(l => l.platform)).toEqual(['twitter', 'twitter']);
  });
});

describe('extractLinks — noise handling', () => {
  it('ignores unsupported hosts', () => {
    expect(extractLinks(msg({ text: 'https://youtube.com/watch?v=x https://example.com/foo' })))
      .toEqual([]);
  });

  it('returns [] when there is no text or caption', () => {
    expect(extractLinks(msg({}))).toEqual([]);
  });

  it('does not treat an instagram.com profile root as media', () => {
    expect(extractLinks(msg({ text: 'https://instagram.com/someuser' }))).toEqual([]);
  });

  it('strips trailing punctuation that is not part of the URL', () => {
    expect(extractLinks(msg({ text: '(see https://x.com/jack/status/22).' })))
      .toEqual([{ platform: 'twitter', url: 'https://x.com/jack/status/22' }]);
  });
});

describe('extractLinks — entities and captions', () => {
  it('reads a URL hidden behind a text_link entity', () => {
    const links = extractLinks(msg({
      text: 'click here',
      entities: [{ type: 'text_link', offset: 0, length: 10, url: 'https://www.tiktok.com/@u/video/9' }],
    }));
    expect(links).toEqual([{ platform: 'tiktok', url: 'https://www.tiktok.com/@u/video/9' }]);
  });

  it('reads links from a media caption and its caption_entities', () => {
    const links = extractLinks(msg({
      caption: 'https://reddit.com/r/x/comments/c1/t/',
      caption_entities: [{ type: 'text_link', offset: 0, length: 3, url: 'https://instagram.com/reel/C9/' }],
    }));
    expect(links.map(l => l.platform).sort()).toEqual(['instagram', 'reddit']);
  });
});

describe('extractLinks — dedupe and cap', () => {
  it('de-duplicates the same URL appearing twice', () => {
    expect(extractLinks(msg({ text: 'https://x.com/a/status/1 https://x.com/a/status/1' })))
      .toEqual([{ platform: 'twitter', url: 'https://x.com/a/status/1' }]);
  });

  it(`caps the result at MAX_LINKS_PER_MESSAGE (${MAX_LINKS_PER_MESSAGE})`, () => {
    const many = Array.from({ length: 6 }, (_, i) => `https://x.com/a/status/${i}`).join(' ');
    expect(extractLinks(msg({ text: many })).length).toBe(MAX_LINKS_PER_MESSAGE);
  });
});
