import Card from "../../common/components/Card";
import StatusBadge from "../../common/components/StatusBadge";
export type Furniture = {
  id: string;
  title: string;
  category: string;
  condition: string;
  status: string;
  location?: { district?: string };
  conditionNotes?: string;
};
export default function FurnitureCard({ item }: { item: Furniture }) {
  return (
    <Card>
      <StatusBadge status={item.condition} />
      <h2>{item.title}</h2>
      <p>
        {item.category} · {item.location?.district ?? "ReFurbish network"}
      </p>
      <small>{item.conditionNotes}</small>
    </Card>
  );
}
