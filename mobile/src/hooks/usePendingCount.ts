import { useEffect, useState, useCallback } from "react";
import { getPendingCount, subscribeToQueueChanges } from "@/lib/queue";

export function usePendingCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    getPendingCount().then(setCount);
  }, []);

  useEffect(() => {
    refresh();
    return subscribeToQueueChanges(refresh);
  }, [refresh]);

  return count;
}
