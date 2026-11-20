import { FormEvent, useEffect, useState } from "react";

import { useAuth } from "../../app/AuthProvider";
import { api } from "../../common/api";
import Button from "../../common/components/Button";
import Card from "../../common/components/Card";
import FormField from "../../common/components/FormField";
import LoadingSpinner from "../../common/components/LoadingSpinner";
import "../../common/styles/pages.css";

// EPIC 11: the profile. A donor keeps only a WhatsApp number and an optional
// default pick-up address (Figma note); a social worker their organisation
// and WhatsApp number, which a matched donor sees.
export default function ProfilePage() {
  const { role, user } = useAuth();

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">Profile</p>
          <h1>
            Your <span className="page-underline">details</span>
          </h1>
          <p>{user?.email}</p>
        </div>
      </div>
      <div className="page-stack">
        {role === "social_worker" ? <SocialWorkerProfileForm /> : <DonorProfileForm />}
      </div>
    </main>
  );
}

type DonorProfile = {
  displayName?: string;
  phone?: string;
  address?: string;
  consent?: { contactAllowed?: boolean };
};

function DonorProfileForm() {
  const [form, setForm] = useState({ displayName: "", phone: "", address: "", contactAllowed: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<DonorProfile>("/api/donors/me")
      .then((profile) =>
        setForm({
          displayName: profile.displayName ?? "",
          phone: profile.phone ?? "",
          address: profile.address ?? "",
          contactAllowed: profile.consent?.contactAllowed ?? true,
        }),
      )
      .catch(() => setMessage("We couldn't load your details."))
      .finally(() => setLoading(false));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await api("/api/donors/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: form.displayName.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          consent: { contactAllowed: form.contactAllowed },
        }),
      });
      setMessage("Saved.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "We couldn't save your details.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <form className="profile-form" onSubmit={save}>
        <FormField label="Name">
          <input
            value={form.displayName}
            maxLength={80}
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
          />
        </FormField>
        <FormField label="WhatsApp number">
          <input
            type="tel"
            value={form.phone}
            placeholder="+65 9123 4567"
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            required
          />
        </FormField>
        <FormField label="Default pick-up address (optional)">
          <input
            value={form.address}
            maxLength={200}
            placeholder="Used to fill in your next donation"
            onChange={(event) => setForm({ ...form, address: event.target.value })}
          />
        </FormField>
        <label>
          <input
            type="checkbox"
            checked={form.contactAllowed}
            onChange={(event) => setForm({ ...form, contactAllowed: event.target.checked })}
          />{" "}
          Send me updates about my donations on WhatsApp
        </label>
        {message && <p className="muted-text">{message}</p>}
        <div className="actions">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save details"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

type SocialWorkerProfile = { organisation?: string; whatsapp?: string };

function SocialWorkerProfileForm() {
  const [form, setForm] = useState({ organisation: "", whatsapp: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<SocialWorkerProfile>("/api/social-workers/me")
      .then((profile) =>
        setForm({ organisation: profile.organisation ?? "", whatsapp: profile.whatsapp ?? "" }),
      )
      .catch(() => setMessage("We couldn't load your details."))
      .finally(() => setLoading(false));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await api("/api/social-workers/me", {
        method: "PATCH",
        body: JSON.stringify({ organisation: form.organisation, whatsapp: form.whatsapp }),
      });
      setMessage("Saved.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "We couldn't save your details.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <form className="profile-form" onSubmit={save}>
        <p className="muted-text">
          A donor sees your organisation&rsquo;s name when you are matched, and messages you on
          this WhatsApp number.
        </p>
        <FormField label="Organisation">
          <input
            value={form.organisation}
            maxLength={100}
            onChange={(event) => setForm({ ...form, organisation: event.target.value })}
            required
          />
        </FormField>
        <FormField label="WhatsApp number (with country code)">
          <input
            type="tel"
            value={form.whatsapp}
            placeholder="+65 9123 4567"
            onChange={(event) => setForm({ ...form, whatsapp: event.target.value })}
            required
          />
        </FormField>
        {message && <p className="muted-text">{message}</p>}
        <div className="actions">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save details"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
