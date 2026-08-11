import { ChangeEvent, FormEvent, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useNavigate } from "react-router-dom";

import Button from "../../common/components/Button";
import FormField from "../../common/components/FormField";
import { api } from "../../common/api";
import { auth, storage } from "../../common/firebase";
import "./FurnitureForm.css";

type Draft = {
  title: string;
  category: string;
  subcategory: string;
  condition: string;
  conditionNotes: string;
  quantity: number;
  widthCm: string;
  depthCm: string;
  heightCm: string;
  neighbourhood: string;
  floor: string;
  hasLift: string;
  fitsInLift: string;
  disassembly: string;
  delivery: string;
  deadlineType: "specific" | "flexible";
  collectionDeadline: string;
  availability: string[];
  contactName: string;
  whatsapp: string;
  safeToUse: boolean;
  offeredFree: boolean;
  contactConsent: boolean;
};

type SelectedPhoto = { id: string; file: File; preview: string };

const initialDraft: Draft = {
  title: "",
  category: "",
  subcategory: "",
  condition: "",
  conditionNotes: "",
  quantity: 1,
  widthCm: "",
  depthCm: "",
  heightCm: "",
  neighbourhood: "",
  floor: "",
  hasLift: "",
  fitsInLift: "",
  disassembly: "",
  delivery: "",
  deadlineType: "flexible",
  collectionDeadline: "",
  availability: [],
  contactName: "",
  whatsapp: "",
  safeToUse: false,
  offeredFree: false,
  contactConsent: false,
};

const neighbourhoods = [
  "Ang Mo Kio",
  "Bedok",
  "Bishan",
  "Bukit Batok",
  "Bukit Merah",
  "Bukit Panjang",
  "Bukit Timah",
  "Choa Chu Kang",
  "Clementi",
  "Geylang",
  "Hougang",
  "Jurong East",
  "Jurong West",
  "Kallang",
  "Marine Parade",
  "Pasir Ris",
  "Punggol",
  "Queenstown",
  "Sembawang",
  "Sengkang",
  "Serangoon",
  "Tampines",
  "Toa Payoh",
  "Woodlands",
  "Yishun",
];

const categoryLabels: Record<string, string> = {
  sofa: "sofa",
  table: "table",
  chair: "chair",
  bed: "bed",
  storage: "storage unit",
  other: "furniture item",
};

export default function FurnitureForm() {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(() => ({
    ...initialDraft,
    contactName: auth.currentUser?.displayName ?? "",
  }));
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function chooseCategory(category: string) {
    setDraft((current) => ({
      ...current,
      category,
      title:
        current.title ||
        `Pre-loved ${categoryLabels[category] ?? "furniture item"}`,
    }));
  }

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    setError("");
    const files = Array.from(event.target.files ?? []);
    if (photos.length + files.length > 5)
      return setError("You can add up to five photos.");
    const invalid = files.find(
      (file) => !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024,
    );
    if (invalid)
      return setError("Each photo must be an image smaller than 10 MB.");
    setPhotos((current) => [
      ...current,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      })),
    ]);
    event.target.value = "";
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((photo) => photo.id !== id);
    });
  }

  function toggleAvailability(value: string) {
    update(
      "availability",
      draft.availability.includes(value)
        ? draft.availability.filter((item) => item !== value)
        : [...draft.availability, value],
    );
  }

  function validateStep() {
    if (
      step === 1 &&
      (!draft.title ||
        !draft.category ||
        !draft.condition ||
        !draft.conditionNotes ||
        !photos.length)
    )
      return "Add the item details, an honest condition note and at least one photo.";
    if (
      step === 2 &&
      (!draft.widthCm ||
        !draft.depthCm ||
        !draft.heightCm ||
        !draft.neighbourhood ||
        !draft.floor ||
        !draft.hasLift ||
        !draft.delivery ||
        !draft.availability.length)
    )
      return "Complete the dimensions, location, access and collection details.";
    if (
      step === 2 &&
      draft.deadlineType === "specific" &&
      !draft.collectionDeadline
    )
      return "Choose the collection deadline.";
    if (
      step === 3 &&
      (!draft.contactName ||
        !draft.whatsapp ||
        !draft.safeToUse ||
        !draft.offeredFree ||
        !draft.contactConsent)
    )
      return "Confirm your contact details and all three declarations.";
    return "";
  }

  function next() {
    const message = validateStep();
    if (message) return setError(message);
    setError("");
    setStep((current) => Math.min(3, current + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = validateStep();
    if (message) return setError(message);
    const user = auth.currentUser;
    if (!user)
      return setError("Please log in before submitting your donation.");

    setSubmitting(true);
    setError("");
    try {
      const uploadedPhotos = await Promise.all(
        photos.map(async (photo, index) => {
          const extension = photo.file.name.split(".").pop() ?? "jpg";
          const storageRef = ref(
            storage,
            `furniture/${user.uid}/${crypto.randomUUID()}.${extension}`,
          );
          await uploadBytes(storageRef, photo.file, {
            contentType: photo.file.type,
          });
          return {
            url: await getDownloadURL(storageRef),
            isPrimary: index === 0,
          };
        }),
      );

      await api("/api/donors/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: draft.contactName,
          phone: draft.whatsapp,
          preferredContactMethod: "whatsapp",
          consent: { contactAllowed: draft.contactConsent },
        }),
      });

      await api("/api/furniture", {
        method: "POST",
        body: JSON.stringify({
          title: draft.title,
          category: draft.category,
          subcategory: draft.subcategory || null,
          condition: draft.condition,
          conditionNotes: draft.conditionNotes,
          quantity: draft.quantity,
          dimensionsCm: {
            width: Number(draft.widthCm),
            depth: Number(draft.depthCm),
            height: Number(draft.heightCm),
          },
          photos: uploadedPhotos,
          location: { city: "ReFurbish", district: draft.neighbourhood },
          collection: {
            floor: Number(draft.floor),
            hasLift: draft.hasLift === "yes",
            fitsInLift: draft.fitsInLift || "not_sure",
            disassembly: draft.disassembly || "not_sure",
            donorCanDeliver: draft.delivery !== "no",
            deliveryArea: draft.delivery,
            deadlineType: draft.deadlineType,
            availableUntil:
              draft.deadlineType === "specific"
                ? draft.collectionDeadline
                : null,
            availability: draft.availability,
          },
          safety: {
            donorConfirmedSafe: draft.safeToUse,
            offeredFree: draft.offeredFree,
          },
        }),
      });
      navigate("/donor", {
        state: { message: "Donation submitted for review." },
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We could not submit the donation.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="donation-page">
      <header className="donation-heading">
        <div>
          <p className="donation-kicker">Give an item</p>
          <h1>Let it be useful somewhere else.</h1>
          <p>
            Just the practical things a new household needs to know. No sales
            pitch required.
          </p>
        </div>
        <div className="step-progress" aria-label={`Step ${step} of 3`}>
          <span>Step {step} of 3</span>
          <div>
            {[1, 2, 3].map((value) => (
              <i className={value <= step ? "active" : ""} key={value} />
            ))}
          </div>
        </div>
      </header>

      <form className="donation-form" onSubmit={submit}>
        {step === 1 && (
          <section>
            <p className="form-kicker">01 · The item</p>
            <h2>What are you passing on?</h2>
            <div className="form-grid">
              <FormField label="Category">
                <select
                  value={draft.category}
                  onChange={(event) => chooseCategory(event.target.value)}
                  required
                >
                  <option value="">Choose one</option>
                  <option value="sofa">Sofa</option>
                  <option value="table">Table</option>
                  <option value="chair">Chair</option>
                  <option value="bed">Bed or mattress</option>
                  <option value="storage">Storage</option>
                  <option value="other">Other</option>
                </select>
              </FormField>
              <FormField label="Type or subtype">
                <input
                  value={draft.subcategory}
                  onChange={(event) =>
                    update("subcategory", event.target.value)
                  }
                  placeholder="e.g. three-seater, dining, wardrobe"
                />
              </FormField>
              <div className="wide">
                <FormField label="Listing title">
                  <input
                    value={draft.title}
                    onChange={(event) => update("title", event.target.value)}
                    required
                  />
                </FormField>
              </div>
              <FormField label="Condition">
                <select
                  value={draft.condition}
                  onChange={(event) => update("condition", event.target.value)}
                  required
                >
                  <option value="">Choose one</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="usable">Usable</option>
                  <option value="repair_needed">Needs minor repair</option>
                </select>
              </FormField>
              <FormField label="Quantity">
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={draft.quantity}
                  onChange={(event) =>
                    update("quantity", Number(event.target.value))
                  }
                />
              </FormField>
              <div className="wide">
                <FormField label="Honest condition note">
                  <textarea
                    value={draft.conditionNotes}
                    onChange={(event) =>
                      update("conditionNotes", event.target.value)
                    }
                    placeholder="Mention visible wear, stains, repairs or missing pieces."
                    required
                  />
                </FormField>
              </div>
            </div>
            <div className="photo-field">
              <strong>Photos</strong>
              <p>
                Add the front, side and any visible wear. Up to five images, 10
                MB each.
              </p>
              <div className="photo-grid">
                {photos.map((photo, index) => (
                  <figure key={photo.id}>
                    <img
                      src={photo.preview}
                      alt={`Selected furniture ${index + 1}`}
                    />
                    {index === 0 && <figcaption>Primary</figcaption>}
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      aria-label={`Remove photo ${index + 1}`}
                    >
                      ×
                    </button>
                  </figure>
                ))}
                {photos.length < 5 && (
                  <label className="photo-add">
                    ＋<span>Add photos</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={addPhotos}
                    />
                  </label>
                )}
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <p className="form-kicker">02 · The practical bits</p>
            <h2>Will it fit—and can it move?</h2>
            <div className="form-grid three">
              <FormField label="Width (cm)">
                <input
                  type="number"
                  min="1"
                  value={draft.widthCm}
                  onChange={(event) => update("widthCm", event.target.value)}
                  required
                />
              </FormField>
              <FormField label="Depth (cm)">
                <input
                  type="number"
                  min="1"
                  value={draft.depthCm}
                  onChange={(event) => update("depthCm", event.target.value)}
                  required
                />
              </FormField>
              <FormField label="Height (cm)">
                <input
                  type="number"
                  min="1"
                  value={draft.heightCm}
                  onChange={(event) => update("heightCm", event.target.value)}
                  required
                />
              </FormField>
            </div>
            <div className="form-grid">
              <FormField label="Neighbourhood">
                <select
                  value={draft.neighbourhood}
                  onChange={(event) =>
                    update("neighbourhood", event.target.value)
                  }
                  required
                >
                  <option value="">Choose one</option>
                  {neighbourhoods.map((area) => (
                    <option key={area}>{area}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Floor">
                <input
                  type="number"
                  min="1"
                  value={draft.floor}
                  onChange={(event) => update("floor", event.target.value)}
                  required
                />
              </FormField>
              <FormField label="Lift available">
                <select
                  value={draft.hasLift}
                  onChange={(event) => update("hasLift", event.target.value)}
                  required
                >
                  <option value="">Choose one</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </FormField>
              <FormField label="Fits inside lift">
                <select
                  value={draft.fitsInLift}
                  onChange={(event) => update("fitsInLift", event.target.value)}
                >
                  <option value="">Not sure</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </FormField>
              <FormField label="Can it be dismantled?">
                <select
                  value={draft.disassembly}
                  onChange={(event) =>
                    update("disassembly", event.target.value)
                  }
                >
                  <option value="not_sure">Not sure</option>
                  <option value="already">Already dismantled</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </FormField>
              <FormField label="Can you help deliver?">
                <select
                  value={draft.delivery}
                  onChange={(event) => update("delivery", event.target.value)}
                  required
                >
                  <option value="">Choose one</option>
                  <option value="network">Yes, across our network</option>
                  <option value="local">Yes, near my area</option>
                  <option value="maybe">Possibly—contact me</option>
                  <option value="no">No, collection only</option>
                </select>
              </FormField>
            </div>
            <fieldset className="choice-field">
              <legend>Collection deadline</legend>
              <label>
                <input
                  type="radio"
                  checked={draft.deadlineType === "flexible"}
                  onChange={() => update("deadlineType", "flexible")}
                />{" "}
                Flexible
              </label>
              <label>
                <input
                  type="radio"
                  checked={draft.deadlineType === "specific"}
                  onChange={() => update("deadlineType", "specific")}
                />{" "}
                Specific date
              </label>
              {draft.deadlineType === "specific" && (
                <input
                  type="date"
                  value={draft.collectionDeadline}
                  onChange={(event) =>
                    update("collectionDeadline", event.target.value)
                  }
                />
              )}
            </fieldset>
            <fieldset className="choice-field">
              <legend>Preferred collection times</legend>
              {[
                "Weekday daytime",
                "Weekday evening",
                "Saturday",
                "Sunday",
                "Flexible",
              ].map((value) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={draft.availability.includes(value)}
                    onChange={() => toggleAvailability(value)}
                  />{" "}
                  {value}
                </label>
              ))}
            </fieldset>
          </section>
        )}

        {step === 3 && (
          <section>
            <p className="form-kicker">03 · Confirm</p>
            <h2>Who should coordinate the handover?</h2>
            <div className="privacy-note">
              <strong>Your exact address is not published.</strong>
              <p>
                Only the neighbourhood is used for matching. Precise handover
                details can be shared after you accept a match.
              </p>
            </div>
            <div className="form-grid">
              <FormField label="Contact name">
                <input
                  value={draft.contactName}
                  onChange={(event) =>
                    update("contactName", event.target.value)
                  }
                  required
                />
              </FormField>
              <FormField label="WhatsApp number">
                <input
                  type="tel"
                  value={draft.whatsapp}
                  onChange={(event) => update("whatsapp", event.target.value)}
                  placeholder="+65 9123 4567"
                  required
                />
              </FormField>
            </div>
            <div className="declarations">
              <label>
                <input
                  type="checkbox"
                  checked={draft.safeToUse}
                  onChange={(event) =>
                    update("safeToUse", event.target.checked)
                  }
                />{" "}
                The item is safe and usable as described.
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.offeredFree}
                  onChange={(event) =>
                    update("offeredFree", event.target.checked)
                  }
                />{" "}
                The item is offered without charge.
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.contactConsent}
                  onChange={(event) =>
                    update("contactConsent", event.target.checked)
                  }
                />{" "}
                I agree to be contacted about collection and handover.
              </label>
            </div>
            <div className="review-card">
              <span>
                {draft.quantity} × {draft.condition}
              </span>
              <h3>{draft.title}</h3>
              <p>
                {draft.neighbourhood} · {draft.widthCm} × {draft.depthCm} ×{" "}
                {draft.heightCm} cm · {photos.length} photo
                {photos.length === 1 ? "" : "s"}
              </p>
            </div>
          </section>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          {step > 1 && (
            <button
              type="button"
              className="back-button"
              onClick={() => {
                setError("");
                setStep(step - 1);
              }}
            >
              ← Back
            </button>
          )}{" "}
          {step < 3 ? (
            <Button type="button" onClick={next}>
              Continue →
            </Button>
          ) : (
            <Button type="submit" disabled={submitting}>
              {submitting ? "Uploading and submitting…" : "Submit donation"}
            </Button>
          )}
        </div>
      </form>
    </main>
  );
}
