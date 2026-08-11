import { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../common/api";
import Button from "../../common/components/Button";
import FormField from "../../common/components/FormField";
export default function CaseForm() {
  const navigate = useNavigate();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    await api("/api/cases", {
      method: "POST",
      body: JSON.stringify({
        household: { summary: d.get("household") },
        location: { city: "ReFurbish", district: d.get("district") },
        priority: d.get("priority"),
        delivery: {
          hasLift: d.get("hasLift") === "yes",
          transportAvailable: d.get("transport") === "yes",
        },
        needs: [{ category: d.get("category") }],
      }),
    });
    navigate("/workspace");
  }
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h1>New household case.</h1>
          <p>Record only what is necessary for a safe, practical match.</p>
        </div>
      </div>
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Household summary">
            <input
              name="household"
              placeholder="Parent with two children"
              required
            />
          </FormField>
          <FormField label="Neighbourhood">
            <input name="district" required />
          </FormField>
          <FormField label="Furniture needed">
            <select name="category">
              <option>sofa</option>
              <option>table</option>
              <option>chair</option>
              <option>bed</option>
              <option>storage</option>
            </select>
          </FormField>
          <FormField label="Priority">
            <select name="priority">
              <option>standard</option>
              <option>high</option>
              <option>urgent</option>
            </select>
          </FormField>
          <FormField label="Lift access">
            <select name="hasLift">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </FormField>
          <FormField label="Collection transport">
            <select name="transport">
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </FormField>
        </div>
        <div className="actions">
          <Button>Create case</Button>
        </div>
      </form>
    </main>
  );
}
