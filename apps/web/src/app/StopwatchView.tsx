import { currentLap, formatStopwatch, lapMarks, stopwatchElapsed } from '@alarmony/core';
import type { CommandCatalog } from '@alarmony/ui';
import type { AppController } from './controller.ts';
import { onMenu } from './ContextMenu.tsx';

const DIAL = 100;
const MINUTE = 60_000;

/** A hand's end on the dial, `share` of the way round from the top. */
function hand(share: number, length: number): { x: number; y: number } {
  const a = share * 2 * Math.PI;
  return { x: DIAL + Math.sin(a) * length, y: DIAL - Math.cos(a) * length };
}

/** The stopwatch: the big time, an analog dial with a lap hand, the buttons and the laps (PRD §8.1). */
export function StopwatchView({
  app,
  catalog,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
}) {
  const sw = app.data.value.stopwatch;
  // A running stopwatch redraws every frame; a stopped one shows what it holds.
  const now = sw.state === 'running' ? Math.max(app.frame.value, app.clock.value) : app.clock.value;
  const elapsed = stopwatchElapsed(sw, now);
  const lap = currentLap(sw, now);
  const marks = lapMarks(sw.laps);
  const running = sw.state === 'running';
  const second = hand((elapsed % MINUTE) / MINUTE, 84);
  const lapHand = hand((lap % MINUTE) / MINUTE, 70);
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const outer = hand(i / 60, 96);
    const inner = hand(i / 60, i % 5 === 0 ? 86 : 91);
    return (
      <line
        key={i}
        x1={inner.x}
        y1={inner.y}
        x2={outer.x}
        y2={outer.y}
        class={i % 5 === 0 ? 'al-tick-major' : 'al-tick'}
      />
    );
  });
  const button = (id: string, label: string, primary = false) => (
    <button
      type="button"
      class={`al-button al-round${primary ? ' al-button-primary' : ''}`}
      data-nav
      disabled={!catalog.isEnabled(catalog.get(id)!)}
      title={catalog.whyDisabled(catalog.get(id)!) ?? undefined}
      onClick={() => catalog.run(id)}
    >
      {label}
    </button>
  );
  return (
    <div class="al-stopwatch">
      <svg class="al-dial" viewBox={`0 0 ${DIAL * 2} ${DIAL * 2}`} aria-hidden="true">
        <circle cx={DIAL} cy={DIAL} r={98} class="al-dial-face" />
        {ticks}
        {sw.laps.length > 0 && <line x1={DIAL} y1={DIAL} x2={lapHand.x} y2={lapHand.y} class="al-hand-lap" />}
        <line x1={DIAL} y1={DIAL} x2={second.x} y2={second.y} class="al-hand" />
        <circle cx={DIAL} cy={DIAL} r={3} class="al-hand-pin" />
        {/* Says what the second hand is, since it only shows once there are laps. */}
        {sw.laps.length > 0 && (
          <text x={DIAL} y={DIAL + 44} class="al-dial-label">
            grey hand: this lap
          </text>
        )}
      </svg>
      <div class="al-big-time" aria-hidden="true">
        {formatStopwatch(elapsed)}
      </div>
      <span class="al-sr">{`Stopwatch ${running ? 'running' : 'stopped'} at ${formatStopwatch(Math.floor(elapsed / 1000) * 1000).replace(/\.\d+$/, '')}`}</span>
      <div class="al-row-buttons">
        {running ? button('stopwatch.lap', 'Lap') : button('stopwatch.reset', 'Reset')}
        {button('stopwatch.toggle', running ? 'Stop' : 'Start', true)}
      </div>
      {(sw.laps.length > 0 || elapsed > 0) && (
        <ol class="al-laps" aria-label="Laps">
          {elapsed > 0 && (
            <li class="al-lap al-lap-current">
              <span>Lap {sw.laps.length + 1}</span>
              <span class="al-num">{formatStopwatch(lap)}</span>
            </li>
          )}
          {sw.laps
            .map((ms, i) => ({ ms, i }))
            .reverse()
            .map(({ ms, i }) => {
              const tag = i === marks.fastest ? 'fastest' : i === marks.slowest ? 'slowest' : '';
              return (
                <li
                  key={i}
                  class={`al-lap${tag ? ` al-lap-${tag}` : ''}`}
                  onContextMenu={onMenu(app, 'lap', String(i))}
                >
                  <span>
                    Lap {i + 1}
                    {tag && <span class="al-lap-tag">{tag === 'fastest' ? 'Fastest' : 'Slowest'}</span>}
                  </span>
                  <span class="al-num">{formatStopwatch(ms)}</span>
                </li>
              );
            })}
        </ol>
      )}
    </div>
  );
}
