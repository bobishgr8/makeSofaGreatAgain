import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../common/api";
import LoadingSpinner from "../../common/components/LoadingSpinner";
import StatusBadge from "../../common/components/StatusBadge";
import type { Furniture } from "./FurnitureDTO";
import type { DonorProfile } from "../donors/DonorProfileDTO";


export default function FurnitureDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [donor, setDonor] = useState<DonorProfile | null>(null);
  const [item, setItem] = useState<Furniture | null>(null);
  const [loading, setLoading] = useState(true);
    
  useEffect(() => {
    if (!id) return;

    api<Furniture>(`/api/furniture/${id}`)
        .then(async (furniture) => {
        setItem(furniture);

        if (furniture.donorId) {
            const donorProfile = await api<DonorProfile>(
            `/api/donors/me/${furniture.donorId}`
            );

            setDonor(donorProfile);
        }
        })
        .catch(() => {
        setItem(null);
        setDonor(null);
        })
        .finally(() => setLoading(false));
    }, [id]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!item) {
    return (
      <main className="page">
        <h1>Furniture not found.</h1>
      </main>
    );
  }

  const primaryPhoto =
    item.photos?.find((photo) => photo.isPrimary) ??
    item.photos?.[0];

  const dimensions = item.dimensionsCm;

  const dimensionLabel =
    dimensions?.width != null &&
    dimensions?.height != null &&
    dimensions?.depth != null
      ? `${dimensions.width} × ${dimensions.height} × ${dimensions.depth} cm`
      : null;

  return (
    <main className="page furniture-details-page">
      {primaryPhoto && (
        <img
          src={primaryPhoto.url}
          alt={item.title}
          className="furniture-details-image"
        />
      )}

      <section className="furniture-details-section">
        <div className="furniture-details-heading">
          <div>
            <h1>{item.title}</h1>

            <p>
              {item.subcategory ?? item.category}
            </p>
          </div>

          <StatusBadge status={item.status} />
        </div>

        <p>
          {item.location?.district ?? "ReFurbish network"}
        </p>

        {item.conditionNotes && (
          <p>{item.conditionNotes}</p>
        )}
      </section>

      <section className="furniture-details-section">
        <h2>Item details</h2>

        {dimensionLabel && (
          <DetailRow
            label="Dimensions"
            value={dimensionLabel}
          />
        )}

        <DetailRow
          label="Quantity"
          value={String(item.quantity)}
        />

        <DetailRow
          label="Condition"
          value={item.condition}
        />
      </section>

      <section className="furniture-details-section">
        <h2>Collection</h2>

        <DetailRow
          label="Availability"
          value={item.collection?.availability?.join(", ")}
        />

        <DetailRow
          label="Floor"
          value={
            item.collection?.floor != null
              ? String(item.collection.floor)
              : undefined
          }
        />

        <DetailRow
          label="Lift"
          value={
            item.collection?.hasLift == null
              ? undefined
              : item.collection.hasLift
                ? "Available"
                : "No lift"
          }
        />

        <DetailRow
          label="Fits in lift"
          value={item.collection?.fitsInLift}
        />

        <DetailRow
          label="Disassembly"
          value={item.collection?.disassembly}
        />

        <DetailRow
          label="Delivery"
          value={
            item.collection?.donorCanDeliver == null
              ? undefined
              : item.collection.donorCanDeliver
                ? "Donor can deliver"
                : "Collection required"
          }
        />
      </section>

      <section className="furniture-details-section">
        <h2>Safety</h2>

        <DetailRow
          label="Confirmed safe"
          value={
            item.safety?.donorConfirmedSafe
              ? "Yes"
              : "Not confirmed"
          }
        />

        <DetailRow
          label="Offered free"
          value={
            item.safety?.offeredFree
              ? "Yes"
              : "No"
          }
        />
      </section>

      <section className="furniture-details-section">
        <h2>Donor</h2>

        {donor ? (
            <>
            <DetailRow
                label="Name"
                value={donor.displayName}
            />

            <DetailRow
                label="Phone"
                value={
                donor.consent?.contactAllowed
                    ? donor.phone
                    : "Contact not permitted"
                }
            />

            <DetailRow
                label="Preferred contact"
                value={donor.preferredContactMethod}
            />
            </>
        ) : (
            <p>Donor details unavailable.</p>
        )}
        </section>
    </main>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  if (!value) return null;

  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}