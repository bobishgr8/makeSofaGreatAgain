import { useState } from "react";
import type { SubmitEventHandler } from "react";

import { api } from "../../common/api";
import Button from "../../common/components/Button";
import Card from "../../common/components/Card";
import FormField from "../../common/components/FormField";

export type SocialWorkerProfile = {
  id: string;
  organisation?: string;
  whatsapp?: string;
};

// A matched donor sees the organisation and connects on this number, so both
// are needed before the first request.
export default function ProfilePrompt({
  profile,
  onSaved,
}: {
  profile: SocialWorkerProfile | null;
  onSaved: (profile: SocialWorkerProfile) => void;
}) {
  const [organisation, setOrganisation] = useState(profile?.organisation ?? "");
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      onSaved(
        await api<SocialWorkerProfile>("/api/social-workers/me", {
          method: "PATCH",
          body: JSON.stringify({ organisation, whatsapp }),
        }),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "We couldn't save your details.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h2>Before you request furniture.</h2>

      <p className="muted-text">
        A donor sees your organisation's name when you are matched, and
        messages you on this WhatsApp number.
      </p>

      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Organisation">
            <input
              value={organisation}
              maxLength={100}
              placeholder="Sunrise Charity"
              onChange={(event) => setOrganisation(event.target.value)}
              required
            />
          </FormField>

          <FormField label="WhatsApp number, with country code">
            <input
              value={whatsapp}
              inputMode="tel"
              placeholder="65 9123 4567"
              onChange={(event) => setWhatsapp(event.target.value)}
              required
            />
          </FormField>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="actions">
          <Button disabled={saving}>
            {saving ? "Saving..." : "Save details"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
