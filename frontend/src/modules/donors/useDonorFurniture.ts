import { useEffect, useState } from "react";

import { api } from "../../common/api";
import type { FurnitureView } from "../../common/dto/FurnitureDTO";

// Loads one of the donor's items. `setItem` lets a screen swap in the view an
// action or edit returned, so the page re-renders in its new state.
export function useDonorFurniture(id: string | undefined) {
  const [item, setItem] = useState<FurnitureView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setLoading(true);
    setError("");

    api<FurnitureView>(`/api/furniture/${id}`)
      .then((loaded) => mounted && setItem(loaded))
      .catch(() => mounted && setError("We could not find this donation."))
      .finally(() => mounted && setLoading(false));

    // A match or a cancellation can happen while this page sits open, so pick
    // up the latest state when the donor comes back to the tab.
    function refresh() {
      if (document.visibilityState !== "visible") return;
      api<FurnitureView>(`/api/furniture/${id}`)
        .then((latest) => mounted && setItem(latest))
        .catch(() => {});
    }
    document.addEventListener("visibilitychange", refresh);

    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [id]);

  return { item, setItem, loading, error };
}

// What every stage screen receives. `onChange` takes the view an action returned.
export type StageViewProps = {
  item: FurnitureView;
  onChange: (updated: FurnitureView) => void;
};

export function primaryPhoto(item: FurnitureView) {
  return item.photos?.find((photo) => photo.isPrimary) ?? item.photos?.[0];
}

export function dimensionsLabel(item: FurnitureView) {
  const size = item.dimensionsCm;
  if (!size?.height && !size?.width && !size?.depth) return "";
  return `H ${size.height ?? "–"} cm × W ${size.width ?? "–"} cm × D ${size.depth ?? "–"} cm`;
}
