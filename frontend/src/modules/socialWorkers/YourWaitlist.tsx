import Button from "../../common/components/Button";
import Card from "../../common/components/Card";
import type { FurnitureView } from "../../common/dto/FurnitureDTO";
import { useFurnitureAction } from "../../common/hooks/useFurnitureAction";

// Items the social worker queued for while they were held for another case.
// When one comes back to the pool, the first case in line is matched to it
// automatically (backend/app/lifecycle.py settle_waitlist) and it moves to
// "Your matches". Requests drop after 30 days without a match.
export default function YourWaitlist({
  items,
  onChanged,
}: {
  items: FurnitureView[];
  onChanged: () => void;
}) {
  if (!items.length) return null;

  return (
    <section>
      <div className="page-heading">
        <div>
          <h2>Your waitlist</h2>
          <p>
            Furniture already requested for another household. If it becomes
            free, your case is next in line and we will let you know on
            WhatsApp. Requests close after 30 days.
          </p>
        </div>
      </div>

      <div className="grid">
        {items.map((item) => (
          <WaitlistCard key={item.id} item={item} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}

function WaitlistCard({ item, onChanged }: { item: FurnitureView; onChanged: () => void }) {
  const { run, pending, error } = useFurnitureAction(item, onChanged);
  const photo = item.photos?.find((candidate) => candidate.isPrimary) ?? item.photos?.[0];

  return (
    <Card className="case-card">
      {photo && <img src={photo.url} alt={item.title} className="furniture-card-image" />}
      <span className="muted-text">
        {item.waitlistPosition
          ? `You are #${item.waitlistPosition} of ${item.waitlistLength ?? item.waitlistPosition} waiting`
          : "Waiting"}
      </span>
      <h3>{item.title}</h3>
      {error && <p className="error-text">{error}</p>}
      {item.allowedActions.includes("leave_waitlist") && (
        <Button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => void run("leave_waitlist")}
        >
          {pending ? "Leaving..." : "Leave waitlist"}
        </Button>
      )}
    </Card>
  );
}
