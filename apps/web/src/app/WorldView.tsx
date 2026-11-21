import { useState } from 'preact/hooks';
import {
  clockName,
  compareToHere,
  handAngles,
  isDaytime,
  knownZone,
  moveClockBeside,
  zoneCity,
  type WorldClock,
} from '@alarmony/core';
import { type CommandCatalog } from '@alarmony/ui';
import type { AppController } from './controller.ts';
import { MoreButton, onMenu } from './ContextMenu.tsx';
import { zoneClockTime } from './time.ts';

const TICKS = Array.from({ length: 12 }, (_, i) => i * 30);

/** An analog face: light by day, dark at night in that place (PRD §6.2). */
function Face({ at, zone }: { readonly at: number; readonly zone: string }) {
  const { hour, minute, second } = handAngles(at, zone);
  return (
    <svg
      class={`al-face ${isDaytime(at, zone) ? 'al-face-day' : 'al-face-night'}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <circle class="al-face-rim" cx="50" cy="50" r="48" />
      {TICKS.map((deg) => (
        <line
          key={deg}
          class="al-face-tick"
          x1="50"
          y1="7"
          x2="50"
          y2={deg % 90 ? 11 : 13}
          transform={`rotate(${deg} 50 50)`}
        />
      ))}
      <line class="al-face-hour" x1="50" y1="52" x2="50" y2="27" transform={`rotate(${hour} 50 50)`} />
      <line class="al-face-minute" x1="50" y1="54" x2="50" y2="14" transform={`rotate(${minute} 50 50)`} />
      {/* The second hand sweeps between ticks; at the top of the minute it jumps back without sweeping round. */}
      <line
        class={`al-face-second${second === 0 ? ' al-face-jump' : ''}`}
        x1="50"
        y1="58"
        x2="50"
        y2="12"
        style={{ transform: `rotate(${second}deg)` }}
      />
      <circle class="al-face-pin" cx="50" cy="50" r="2" />
    </svg>
  );
}

/** Where a dragged clock would land: beside which clock, and on which side. */
interface Drop {
  readonly id: string;
  readonly after: boolean;
}

/** Dragging a clock onto another moves it there (PRD §6.1); ⌥↑ and ⌥↓ do the same from the keyboard. */
interface Dragging {
  readonly drop: Drop | null;
  start(id: string): void;
  over(id: string, after: boolean): void;
  end(): void;
  dropOn(id: string, after: boolean): void;
}

/** Whether a pointer at (x, y) is past the middle of the box, along the way the clocks run. */
function pastMiddle(e: DragEvent, list: boolean): boolean {
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return list ? e.clientY > box.top + box.height / 2 : e.clientX > box.left + box.width / 2;
}

function ClockItem({
  app,
  catalog,
  clock,
  list,
  dragging,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
  readonly clock: WorldClock;
  readonly list: boolean;
  readonly dragging: Dragging;
}) {
  const at = app.clock.value;
  const s = app.settings.value;
  const known = knownZone(clock.zone);
  const name = clockName(clock);
  const time = known ? zoneClockTime(at, clock.zone, s.timeFormat, s.showSeconds) : '';
  const day = known ? compareToHere(at, clock.zone, app.zone) : `Unknown time zone ${clock.zone}`;
  const select = () => {
    app.selected.value = clock.id;
  };
  const drop = dragging.drop?.id === clock.id ? ` al-drop-${dragging.drop.after ? 'after' : 'before'}` : '';
  return (
    <li
      class={`al-clock${list ? ' al-clock-row' : ''}${known ? '' : ' al-clock-unknown'}${app.selected.value === clock.id ? ' al-selected' : ''}${drop}`}
      tabIndex={0}
      data-id={clock.id}
      data-nav
      draggable
      onContextMenu={onMenu(app, 'clock', clock.id)}
      onDragStart={(e) => {
        e.dataTransfer?.setData('text/plain', name);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        select();
        dragging.start(clock.id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        dragging.over(clock.id, pastMiddle(e, list));
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragging.dropOn(clock.id, pastMiddle(e, list));
      }}
      onDragEnd={() => dragging.end()}
      aria-label={known ? `${name}, ${time}, ${day}` : `${name}, ${day}`}
      onFocusIn={select}
      onClick={select}
      onDblClick={() => {
        select();
        catalog.run('clock.rename');
      }}
    >
      {!list && known && <Face at={at} zone={clock.zone} />}
      <div class="al-clock-text" aria-hidden="true">
        <span class="al-clock-name">{name}</span>
        {clock.label && <span class="al-clock-city">{zoneCity(clock.zone)}</span>}
        <span class="al-clock-day">{day}</span>
      </div>
      {known && (
        <span class="al-clock-time al-num" aria-hidden="true">
          {time}
        </span>
      )}
      <MoreButton app={app} kind="clock" id={clock.id} name={name} />
    </li>
  );
}

/** The World Clock tab: one card (or row) per place, in the file's order (PRD §6.2). */
export function WorldView({
  app,
  catalog,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
}) {
  const clocks = app.data.value.clocks;
  const list = app.settings.value.worldView === 'list';
  const [moving, setMoving] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const dragging: Dragging = {
    drop,
    start: (id) => setMoving(id),
    over: (id, after) => {
      if (moving && (drop?.id !== id || drop.after !== after)) setDrop({ id, after });
    },
    end: () => {
      setMoving(null);
      setDrop(null);
    },
    dropOn: (id, after) => {
      if (moving) app.edit(moveClockBeside(app.data.peek(), moving, id, after), 'Move');
      dragging.end();
    },
  };
  if (clocks.length === 0)
    return (
      <div class="al-empty">
        <p>No clocks.</p>
        <button
          type="button"
          class="al-button al-button-primary"
          data-nav
          onClick={() => catalog.run('clock.add')}
        >
          Add Clock
        </button>
      </div>
    );
  return (
    <ul class={list ? 'al-clock-list' : 'al-clock-grid'} aria-label="World clocks">
      {clocks.map((c) => (
        <ClockItem key={c.id} app={app} catalog={catalog} clock={c} list={list} dragging={dragging} />
      ))}
      <li class={list ? 'al-add-row' : 'al-add-card al-clock-add'}>
        <button type="button" class="al-add-button" data-nav onClick={() => catalog.run('clock.add')}>
          + Add Clock
        </button>
      </li>
    </ul>
  );
}
