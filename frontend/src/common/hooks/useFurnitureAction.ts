import { useRef, useState } from "react";

import { api, ApiError } from "../api";
import type { FurnitureAction, FurnitureView } from "../dto/FurnitureDTO";

// The one way to run a lifecycle action. Sends the status the screen was showing
// so the server can spot a stale screen, ignores repeat taps while a request is
// in flight, and on a 409 reloads the item instead of failing.
export function useFurnitureAction(
  item: Pick<FurnitureView, "id" | "status">,
  onDone: (updated: FurnitureView) => void,
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function run(action: FurnitureAction, body: { reason?: string } = {}) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");

    try {
      const updated = await api<FurnitureView>(
        `/api/furniture/${item.id}/actions/${action}`,
        {
          method: "POST",
          body: JSON.stringify({ expected_status: item.status, ...body }),
        },
      );
      onDone(updated);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setError("This item was updated elsewhere. Showing the latest version.");
        try {
          onDone(await api<FurnitureView>(`/api/furniture/${item.id}`));
        } catch {
          // Keep the message; the caller still has the old item.
        }
      } else {
        setError(caught instanceof Error ? caught.message : "Something went wrong.");
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return { run, pending, error };
}
