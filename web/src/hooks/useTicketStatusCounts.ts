import { useCallback, useEffect, useState } from "react";
import { pb } from "@/lib/pb";
import { isAutoCancel } from "@/lib/pbErrors";
import type { TicketStatus } from "@/lib/types";

// PocketBase's ListResult carries `totalItems` even for perPage=1, so this
// gets an exact count per status with three cheap requests instead of
// pulling every ticket record just to .length them - matters once a venue
// has thousands of tickets, not just a handful.
export function useTicketStatusCounts() {
  const [counts, setCounts] = useState<Record<TicketStatus, number>>({
    valid: 0,
    redeemed: 0,
    void: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      // Distinct requestKey per call - these three fire in the same tick,
      // and PocketBase's default auto-cancel key is method+path only (see
      // lib/pbErrors.ts), so without this they'd cancel each other out
      // despite having different filters.
      const [valid, redeemed, voided] = await Promise.all([
        pb.collection("tickets").getList(1, 1, {
          filter: 'status = "valid"',
          requestKey: "count:tickets:valid",
        }),
        pb.collection("tickets").getList(1, 1, {
          filter: 'status = "redeemed"',
          requestKey: "count:tickets:redeemed",
        }),
        pb.collection("tickets").getList(1, 1, {
          filter: 'status = "void"',
          requestKey: "count:tickets:void",
        }),
      ]);
      setCounts({
        valid: valid.totalItems,
        redeemed: redeemed.totalItems,
        void: voided.totalItems,
      });
      setError(null);
    } catch (err) {
      // reload() is fired-and-forgotten from the effect below (and from
      // realtime callbacks) - it must never throw, or an unawaited
      // rejection becomes an unhandled promise rejection in the browser.
      // A cancelled request just means a newer call already won; anything
      // else is a real failure worth surfacing, but still just as state,
      // not a throw.
      if (!isAutoCancel(err)) {
        setError(err instanceof Error ? err.message : "Failed to load ticket counts");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    let unsub: (() => void) | undefined;
    let cancelled = false;
    pb.collection("tickets")
      .subscribe("*", () => reload())
      .then((fn) => {
        if (cancelled) fn();
        else unsub = fn;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [reload]);

  return { counts, loading, error, reload };
}
