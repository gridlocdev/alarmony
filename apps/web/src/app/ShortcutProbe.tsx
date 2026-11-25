import { useCallback, useRef, useState } from 'preact/hooks';
import { isMac, startKeyProbe, type CommandCatalog } from '@alarmony/ui';
import { whatKeyDoes } from './shortcuts.ts';

interface Answer {
  readonly label: string;
  readonly titles: readonly string[];
}

/**
 * "Press a Shortcut" in the Keyboard Shortcuts window (PRD §14): press keys and see which command each runs.
 * Esc or **Stop** leaves; closing the window does too.
 */
export function ShortcutProbe({ catalog }: { readonly catalog: CommandCatalog }) {
  const [on, setOn] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const stopProbe = useRef<(() => void) | null>(null);
  // The mode lives exactly as long as its box: the listener starts when the box appears and comes off when it
  // goes, whether the mode ended or the whole window closed.
  const box = useCallback(
    (el: HTMLDivElement | null) => {
      stopProbe.current?.();
      stopProbe.current = null;
      if (!el) return;
      stopProbe.current = startKeyProbe(window, {
        onKey: (e) => setAnswer(whatKeyDoes(catalog, e, isMac)),
        onMenuCommand: (id) => {
          const c = catalog.get(id);
          setAnswer({
            label: c ? catalog.keys(c).join(' ') : id,
            titles: c ? [c.title.replace(/…$/, '')] : [],
          });
        },
        onLeave: () => setOn(false),
      });
      // The button the mode started from is gone: keep focus in the window, so Esc still reaches it.
      el.querySelector('button')?.focus();
    },
    [catalog],
  );
  if (!on)
    return (
      <p class="al-probe">
        <button
          type="button"
          class="al-button"
          onClick={() => {
            setAnswer(null);
            setOn(true);
          }}
        >
          Press a Shortcut…
        </button>{' '}
        <span class="al-muted">See what a key does without doing it.</span>
      </p>
    );
  return (
    <div ref={box} class="al-probe al-probe-on" role="status" aria-live="polite">
      <p>
        {answer ? (
          <>
            <kbd>{answer.label}</kbd>{' '}
            {answer.titles.length > 0 ? (
              <>
                runs <strong>{answer.titles.join(' or ')}</strong>.
              </>
            ) : (
              'runs no command.'
            )}
          </>
        ) : (
          'Press a key to see what it does. Esc leaves.'
        )}
      </p>
      <button type="button" class="al-button" onClick={() => setOn(false)}>
        Stop
      </button>
    </div>
  );
}
