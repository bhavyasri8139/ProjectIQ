import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/**
 * Keeps dashboard, document list and backend health in sync.
 * Polls quickly (2 s) while documents are indexing or the analysis is running,
 * and slowly (8 s) otherwise, so uploads and incremental refreshes show up live.
 */
export function useWorkspace() {
  const [dashboard, setDashboard] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [health, setHealth] = useState(null);
  const [offline, setOffline] = useState(false);
  const busy = useRef(false);
  const hidden = useRef(new Set()); // ids deleted locally, hidden until the server confirms

  const refresh = useCallback(async () => {
    try {
      const [dash, docs] = await Promise.all([api.dashboard(), api.documents()]);
      const serverIds = new Set(docs.map((d) => d.id));
      hidden.current.forEach((id) => { if (!serverIds.has(id)) hidden.current.delete(id); });
      setDashboard(dash);
      setDocuments(docs.filter((d) => !hidden.current.has(d.id)));
      setOffline(false);
      busy.current = dash.state.status === "running" || dash.documents.processing > 0;
      return dash;
    } catch {
      setOffline(true);
      busy.current = false;
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const tick = async () => {
      await refresh();
      if (!cancelled) timer = setTimeout(tick, busy.current ? 2000 : 8000);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const data = await api.health();
        if (!cancelled) setHealth(data);
      } catch {
        if (!cancelled) setHealth(null);
      }
    };
    check();
    const id = setInterval(check, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Optimistic updates: the screen reacts immediately; the next poll confirms with the server.
  const removeLocal = useCallback((id) => {
    hidden.current.add(id);
    setDocuments((old) => old.filter((d) => d.id !== id));
  }, []);
  const patchLocal = useCallback((id, fields) => {
    setDocuments((old) => old.map((d) => (d.id === id ? { ...d, ...fields } : d)));
  }, []);

  return { dashboard, documents, health, offline, refresh, removeLocal, patchLocal };
}
