import { useState } from "react";
import type { SubmitEventHandler } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../../common/api";
import { useFormConfig } from "../../app/FormConfigContext";

import Button from "../../common/components/Button";
import FormField from "../../common/components/FormField";


export default function CaseForm() {
  const navigate = useNavigate();
  const { config, categoryLabels, neighbourhoods } = useFormConfig();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    const data = new FormData(event.currentTarget);

    try {
      await api("/api/cases", {
        method: "POST",
        body: JSON.stringify({
          household: {
            summary: String(data.get("household")),
          },

          location: {
            city: "ReFurbish",

            district:
              config.neighbourhood && data.has("district")
                ? String(data.get("district"))
                : "",
          },

          priority: String(data.get("priority")),

          delivery: {
            hasLift:
              config.hasLift && data.has("hasLift")
                ? data.get("hasLift") === "yes"
                : false,

            transportAvailable:
              config.delivery && data.has("transport")
                ? data.get("transport") === "yes"
                : false,
          },

          needs:
            config.category && data.has("category")
              ? [
                  {
                    category: String(data.get("category")),
                    // Only the sizes that were filled in. Items too big for
                    // a fully described space are never suggested.
                    maxDimensionsCm: Object.fromEntries(
                      (["width", "depth", "height"] as const)
                        .map((side) => [side, Number(data.get(`space-${side}`))])
                        .filter(([, size]) => Number(size) > 0),
                    ),
                  },
                ]
              : [],
        }),
      });

      navigate("/workspace");
    } catch (err) {
      console.error("Failed to create case:", err);

      setError(
        "We couldn't create this case. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h1>New household case.</h1>

          <p>
            Record only what is necessary for a safe,
            practical match.
          </p>
        </div>
      </div>

      <form
        className="form"
        onSubmit={submit}
      >
        <div className="form-grid">
          {/* Case-specific field */}
          <FormField label="Household summary">
            <input
              name="household"
              placeholder="Parent with two children"
              required
            />
          </FormField>

          {/* Shared: neighbourhood */}
          {config.neighbourhood && (
            <FormField label="Neighbourhood">
              <select
                name="district"
                required
              >
                <option value="">
                  Select neighbourhood
                </option>

                {neighbourhoods.map((neighbourhood) => (
                  <option
                    key={neighbourhood}
                    value={neighbourhood}
                  >
                    {neighbourhood}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          {/* Shared: category */}
          {config.category && (
            <FormField label="Furniture needed">
              <select
                name="category"
                required
              >
                <option value="">
                  Select furniture
                </option>

                {Object.entries(categoryLabels).map(
                  ([value, label]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {label}
                    </option>
                  ),
                )}
              </select>
            </FormField>
          )}

          {/* Case-specific: the space the furniture has to fit in */}
          {config.category &&
            (["width", "depth", "height"] as const).map((side) => (
              <FormField
                key={side}
                label={`Space available: ${side} (cm, optional)`}
              >
                <input
                  name={`space-${side}`}
                  type="number"
                  min="1"
                />
              </FormField>
            ))}

          {/* Case-specific field */}
          <FormField label="Priority">
            <select
              name="priority"
              required
            >
              <option value="standard">
                Standard
              </option>

              <option value="high">
                High
              </option>

              <option value="urgent">
                Urgent
              </option>
            </select>
          </FormField>

          {/* Shared: lift */}
          {config.hasLift && (
            <FormField label="Lift access">
              <select
                name="hasLift"
                required
              >
                <option value="yes">
                  Yes
                </option>

                <option value="no">
                  No
                </option>
              </select>
            </FormField>
          )}

          {/* Shared: delivery / transport */}
          {config.delivery && (
            <FormField label="Collection transport">
              <select
                name="transport"
                required
              >
                <option value="no">
                  No
                </option>

                <option value="yes">
                  Yes
                </option>
              </select>
            </FormField>
          )}
        </div>

        {error && (
          <p className="error">
            {error}
          </p>
        )}

        <div className="actions">
          <Button disabled={loading}>
            {loading
              ? "Creating case..."
              : "Create case"}
          </Button>
        </div>
      </form>
    </main>
  );
}