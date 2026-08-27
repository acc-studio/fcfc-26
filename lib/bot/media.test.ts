import { describe, it, expect } from 'vitest';
import { classifyFiles } from './media';

describe('classifyFiles', () => {
  it('maps common video extensions to video', () => {
    expect(classifyFiles(['/t/1.mp4', '/t/2.MOV', '/t/3.webm', '/t/4.mkv']).map(m => m.kind))
      .toEqual(['video', 'video', 'video', 'video']);
  });

  it('maps image extensions to photo and .gif to animation', () => {
    const items = classifyFiles(['/t/a.jpg', '/t/b.PNG', '/t/c.webp', '/t/d.gif']);
    expect(items.map(m => m.kind)).toEqual(['photo', 'photo', 'photo', 'animation']);
  });

  it('drops files with unrecognized extensions', () => {
    expect(classifyFiles(['/t/info.json', '/t/thumb.txt', '/t/clip.mp4']).map(m => m.path))
      .toEqual(['/t/clip.mp4']);
  });

  it('preserves input order (carousel ordering matters)', () => {
    expect(classifyFiles(['/t/002.jpg', '/t/001.mp4']).map(m => m.path))
      .toEqual(['/t/002.jpg', '/t/001.mp4']);
  });

  it('returns [] for no files', () => {
    expect(classifyFiles([])).toEqual([]);
  });
});
