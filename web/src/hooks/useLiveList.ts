import { useEffect, useRef, useState, useCallback } from "react";
import { pb } from "@/lib/pb";
import { isAutoCancel } from "@/lib/pbErrors";
import type { RecordModel } from "pocketbase";

// Fetches an initial page via getList, then subscribes to the collection's
// realtime topic to keep it current - PocketBase's realtime events are
// governed by the same viewRule as the REST API (see
// 1740000300_superadmin_web_access.js), so this only ever sees what the
// logged-in superadmin's own listRule/viewRule would already allow anyway.
//
// Kept deliberately simple: re-fetches the whole first page on any create/
// update/delete event rather than patching the array in place. For the
// data volumes this app deals with (one venue, a handful of counters) a
// full re-fetch is imperceptible and a lot less code to get wrong than
// hand-rolling optimistic list patching.
export function useLiveList<T extends RecordModel>(
  collection: string,
  options: { filter?: string; sort?: string; perPage?: number; enabled?: boolean; expand?: string } = {}
) {
  const { filter, sort, perPage = 100, enabled = true, expand } = options;
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  // See lib/pbErrors.ts - PocketBase's default cancel key ignores filters,
  // so two useLiveList calls against the same collection with different
  // filters (e.g. useOpenConflicts' flagged/resolved queries) would
  // otherwise cancel each other out. Keying by collection+filter+sort
  // keeps that from happening, while still letting a *stale* in-flight
  // call to this exact same query get superseded by a newer one, which is
  // the behavior we do want.
  const requestKey = `livelist:${collection}:${filter ?? ""}:${sort ?? ""}`;

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await pb.collection(collection).getList<T>(1, perPage, {
        filter: filterRef.current,
        sort,
        expand,
        requestKey,
      });
      setItems(res.items);
      setError(null);
    } catch (err) {
      if (isAutoCancel(err)) return; // superseded by a newer call - not a real error
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, perPage, sort, enabled, expand, requestKey]);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    reload();

    let unsub: (() => void) | undefined;
    let cancelled = false;
    pb.collection(collection)
      .subscribe("*", () => reload(), expand ? { expand } : undefined)
      .then((fn) => {
        if (cancelled) fn();
        else unsub = fn;
      })
      .catch(() => {
        // Realtime subscription failing (e.g. briefly disconnected) isn't
        // fatal - the initial getList above still ran, this list just
        // won't self-update until a manual reload() or remount.
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, reload, enabled]);

  return { items, loading, error, reload };
}
