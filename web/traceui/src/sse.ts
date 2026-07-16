// SSE subscription to the frozen /api/v1/events stream. The server broadcasts
// a `changed` frame (carrying the scan as_of) whenever any source changes;
// the client refetches the live list and open surfaces in place. Reconnects
// with capped exponential backoff, mirroring the current UI.
interface ChangedEvent {
  as_of: string;
}

export interface ChangedHandlers {
  onChanged: (asOf: string) => void;
  onStatus: (state: "connecting" | "live" | "paused") => void;
}

export function subscribeChanged(handlers: ChangedHandlers): () => void {
  let retryMs = 1000;
  let retryTimer: number | undefined;
  let stopped = false;
  let stream: EventSource | undefined;
  const connect = (): void => {
    if (stopped) return;
    const es = new EventSource("/api/v1/events");
    stream = es;
    es.addEventListener("open", () => {
      retryMs = 1000;
      handlers.onStatus("live");
    });
    es.addEventListener("changed", (ev: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(ev.data) as ChangedEvent;
        handlers.onChanged(parsed.as_of);
      } catch {
        // Malformed frame: skip it; the next one arrives shortly.
      }
    });
    es.addEventListener("error", () => {
      handlers.onStatus("paused");
      es.close();
      retryTimer = window.setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 30000);
    });
  };
  connect();
  return () => {
    stopped = true;
    window.clearTimeout(retryTimer);
    stream?.close();
  };
}
