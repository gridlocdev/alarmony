// The tabs run from most used to least (PRD §5.1): Timers, Stopwatch, Alarms, World Clock, on ⌘1–⌘4.
import { describe, expect, it } from 'vitest';
import { TABS } from '../src/app/controller.ts';
import { makeApp } from './helpers.ts';

describe('tabs', () => {
  it('run Timers, Stopwatch, Alarms, World Clock, on ⌘1 to ⌘4', async () => {
    const { catalog } = await makeApp();
    expect(TABS.map((t) => t.title)).toEqual(['Timers', 'Stopwatch', 'Alarms', 'World Clock']);
    expect(TABS.map((t) => catalog.get(`view.${t.id}`)?.shortcuts)).toEqual([
      ['mod+1'],
      ['mod+2'],
      ['mod+3'],
      ['mod+4'],
    ]);
  });

  it('open on Timers the first time', async () => {
    const { app } = await makeApp();
    expect(app.tab.value).toBe('timers');
  });
});
