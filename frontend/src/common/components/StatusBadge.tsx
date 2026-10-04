import { STAGE_LABELS, type DonorStage } from "../dto/FurnitureDTO";

// Stroke paths on a 24px grid, drawn in currentColor so the badge stays neutral.
const STAGE_ICONS: Record<DonorStage, string> = {
  submitted: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6",
  matched: "M8 12l3 3 5-6M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  to_deliver: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  in_delivery: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM1 11h3",
  delivered: "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3",
  cancelled: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15 9l-6 6M9 9l6 6",
};

type Props =
  | { stage: DonorStage; status?: never }
  | { status: string; stage?: never };

export default function StatusBadge(props: Props) {
  if (props.stage) {
    return (
      <span className={`status status-stage-${props.stage.replaceAll("_", "-")}`}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={STAGE_ICONS[props.stage]} />
        </svg>
        {STAGE_LABELS[props.stage]}
      </span>
    );
  }

  const status = props.status;
  return (
    <span className={`status status-${status.replaceAll("_", "-")}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
