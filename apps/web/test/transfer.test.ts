// Import and Export clock.json in the browser (PRD §3.7).
import { describe, expect, it } from 'vitest';
import { addClock, applyOps, serialize } from '@alarmony/core';
import { exportText, importText } from '../src/app/transfer.ts';
import { makeApp } from './helpers.ts';

describe('import', () => {
  it('replaces the clock as one change Undo takes back', async () => {
    const { app } = await makeApp();
    const before = app.data.peek();
    const file = serialize(applyOps(before, addClock(before, 'c9', 'Asia/Tokyo') ?? []));
    expect(importText(app, file)).toBe(true);
    expect(app.data.value.clocks.map((c) => c.zone)).toContain('Asia/Tokyo');
    expect(app.notice.value).toMatchObject({ text: 'Imported clock.json.', action: { label: 'Undo' } });
    app.undo();
    expect(app.data.value).toEqual(before);
  });

  it('says so when the file is the same, and refuses one it can’t read', async () => {
    const { app } = await makeApp();
    expect(importText(app, serialize(app.data.peek()))).toBe(false);
    expect(app.notice.value?.text).toBe('That file is the same as the clock here.');
    expect(importText(app, '{')).toBe(false);
    expect(app.notice.value?.tone).toBe('error');
  });
});

describe('export', () => {
  it('saves the clock as it is now', async () => {
    const { app } = await makeApp();
    expect(await exportText(app)).toBe(serialize(app.data.peek()));
  });
});
