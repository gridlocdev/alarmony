/**
 * Before the app starts in the browser: the folder picked last time needs the browser's permission again, and
 * the browser only asks after a click (PRD §3.7).
 */
export function FolderGate(props: { readonly name: string; readonly choose: (open: boolean) => void }) {
  return (
    <main class="al-gate">
      <h1>Alarmony</h1>
      <p>Your clock is in the folder “{props.name}”. Your browser asks before Alarmony opens it again.</p>
      <div class="al-gate-buttons">
        <button
          type="button"
          class="al-button al-button-primary"
          autoFocus
          onClick={() => props.choose(true)}
        >
          Open “{props.name}”
        </button>
        <button type="button" class="al-button" onClick={() => props.choose(false)}>
          Use This Browser Instead
        </button>
      </div>
    </main>
  );
}
