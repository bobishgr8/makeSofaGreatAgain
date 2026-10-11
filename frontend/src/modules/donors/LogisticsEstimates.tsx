import { useFormConfig } from "../../app/FormConfigContext";

// Indicative prices from the server's static list; no provider is contacted.
export default function LogisticsEstimates() {
  const { logisticsEstimates } = useFormConfig();

  if (!logisticsEstimates.length) return null;

  return (
    <section className="logistics-estimates">
      <h2>Estimated logistics cost</h2>
      <ul>
        {logisticsEstimates.map((estimate) => (
          <li key={estimate.provider}>
            <strong>{estimate.provider}</strong>
            <div>
              <span>~ {estimate.priceRange}</span>
              <small>{estimate.timing}</small>
            </div>
          </li>
        ))}
      </ul>
      <p className="donor-item-note">Excludes manpower cost.</p>
    </section>
  );
}
