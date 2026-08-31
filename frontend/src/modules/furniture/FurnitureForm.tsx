import { ChangeEvent, FormEvent, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useNavigate } from "react-router-dom";

import Button from "../../common/components/Button";
import FormField from "../../common/components/FormField";
import { api } from "../../common/api";
import { auth, storage } from "../../common/firebase";
import { useFormConfig } from "../../app/FormConfigContext";
import type { Draft } from "../../common/dto/DraftDTO";
import "./FurnitureForm.css";

type SelectedPhoto = { id: string; file: File; preview: string };

// Mirrors backend/app/validation.py — the backend is the real gate, these
// are here so the donor gets an immediate, specific message instead of a
// round trip to find out "-9999" isn't a valid number of washing machines.
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 20;
const MIN_DIMENSION_CM = 1;
const MAX_DIMENSION_CM = 500;
const MIN_FLOOR = 0;
const MAX_FLOOR = 150;
const MIN_TITLE_LENGTH = 3;
const MAX_TITLE_LENGTH = 120;
const MIN_CONDITION_NOTES_LENGTH = 5;
const MAX_CONDITION_NOTES_LENGTH = 800;
const MAX_CONTACT_NAME_LENGTH = 80;
const WHATSAPP_PATTERN = /^\+?[0-9()\-\s]{7,20}$/;

function isValidNumber(value: string) {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

export default function FurnitureForm() {
  const { config, categoryLabels, neighbourhoods, initialDraft } =
    useFormConfig();
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
    if (step === 1) {
      const requiredFields: Array<keyof Draft | "photos"> = [
        "title",
        "category",
        "condition",
        "conditionNotes",
        "photos",
      ];
      const missing = requiredFields.some((field) => {
        if (!config[field]) return false;
        if (field === "photos") return photos.length === 0;
        const value = draft[field];
        return (
          value === "" ||
          value === false ||
          value === null ||
          value === undefined
        );
      });
      if (missing)
        return "Add the item details, an honest condition note and at least one photo.";

      if (
        config.title &&
        (draft.title.trim().length < MIN_TITLE_LENGTH ||
          draft.title.trim().length > MAX_TITLE_LENGTH)
      )
        return `Listing title must be between ${MIN_TITLE_LENGTH} and ${MAX_TITLE_LENGTH} characters.`;

      if (
        config.conditionNotes &&
        (draft.conditionNotes.trim().length < MIN_CONDITION_NOTES_LENGTH ||
          draft.conditionNotes.trim().length > MAX_CONDITION_NOTES_LENGTH)
      )
        return `Condition note must be between ${MIN_CONDITION_NOTES_LENGTH} and ${MAX_CONDITION_NOTES_LENGTH} characters.`;

      if (
        config.quantity &&
        (!Number.isInteger(draft.quantity) ||
          draft.quantity < MIN_QUANTITY ||
          draft.quantity > MAX_QUANTITY)
      )
        return `Quantity must be a whole number between ${MIN_QUANTITY} and ${MAX_QUANTITY}.`;
    }

    if (step === 2) {
      const requiredFields: Array<keyof Draft> = [
        "widthCm",
        "depthCm",
        "heightCm",
        "neighbourhood",
        "floor",
        "hasLift",
        "delivery",
        "availability",
      ];
      const missing = requiredFields.some((field) => {
        if (!config[field]) return false;
        const value = draft[field];
        return (
          value === "" ||
          value === false ||
          value === null ||
          value === undefined ||
          (Array.isArray(value) && value.length === 0)
        );
      });
      if (missing)
        return "Complete the dimensions, location, access and collection details.";

      const dimensionFields: Array<[keyof Draft, string]> = [
        ["widthCm", "Width"],
        ["depthCm", "Depth"],
        ["heightCm", "Height"],
      ];
      for (const [field, label] of dimensionFields) {
        const value = draft[field] as string;
        if (!config[field] || value === "") continue;
        if (
          !isValidNumber(value) ||
          Number(value) < MIN_DIMENSION_CM ||
          Number(value) > MAX_DIMENSION_CM
        )
          return `${label} must be a number between ${MIN_DIMENSION_CM} and ${MAX_DIMENSION_CM} cm.`;
      }

      if (config.floor && draft.floor !== "") {
        if (
          !isValidNumber(draft.floor) ||
          !Number.isInteger(Number(draft.floor)) ||
          Number(draft.floor) < MIN_FLOOR ||
          Number(draft.floor) > MAX_FLOOR
        )
          return `Floor must be a whole number between ${MIN_FLOOR} and ${MAX_FLOOR}.`;
      }

      if (
        config.deadlineType &&
        draft.deadlineType === "specific" &&
        !draft.collectionDeadline
      )
        return "Choose the collection deadline.";
    }

    if (step === 3) {
      const requiredFields: Array<keyof Draft> = [
        "contactName",
        "whatsapp",
        "safeToUse",
        "offeredFree",
        "contactConsent",
      ];
      const missing = requiredFields.some((field) => {
        if (!config[field]) return false;
        const value = draft[field];
        return (
          value === "" ||
          value === false ||
          value === null ||
          value === undefined
        );
      });
      if (missing)
        return "Confirm your contact details and all three declarations.";

      if (config.contactName && draft.contactName.trim().length > MAX_CONTACT_NAME_LENGTH)
        return `Contact name must be at most ${MAX_CONTACT_NAME_LENGTH} characters.`;

      if (config.whatsapp && !WHATSAPP_PATTERN.test(draft.whatsapp.trim()))
        return "Enter a valid WhatsApp number, e.g. +65 9123 4567.";
    }

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
            petHousehold: draft.petHousehold,
            smokingHousehold: draft.smokingHousehold,
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
              {config.category && (
                <FormField label="Category">
                  <select
                    value={draft.category}
                    onChange={(event) => chooseCategory(event.target.value)}
                    required>
                    <option value="">Choose one</option>
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
              {config.subcategory && (
                <FormField label="Type or subtype">
                  <input
                    value={draft.subcategory}
                    onChange={(event) =>
                      update("subcategory", event.target.value)
                    }
                    placeholder="e.g. three-seater, dining, wardrobe"
                    maxLength={80}
                  />
                </FormField>
              )}
              {config.title && (
                <div className="wide">
                  <FormField label="Listing title">
                    <input
                      value={draft.title}
                      onChange={(event) => update("title", event.target.value)}
                      required
                      minLength={MIN_TITLE_LENGTH}
                      maxLength={MAX_TITLE_LENGTH}
                    />
                  </FormField>
                </div>
              )}
              {config.condition && (
                <FormField label="Condition">
                  <select
                    value={draft.condition}
                    onChange={(event) =>
                      update("condition", event.target.value)
                    }
                    required
                  >
                    <option value="">Choose one</option>
                    <option value="excellent">Excellent</option>
                    <option value="good">Good</option>
                    <option value="usable">Usable</option>
                    <option value="repair_needed">Needs minor repair</option>
                  </select>
                </FormField>
              )}
              {config.quantity && (
                <FormField label="Quantity">
                  <input
                    type="number"
                    min={MIN_QUANTITY}
                    max={MAX_QUANTITY}
                    step={1}
                    value={draft.quantity}
                    onChange={(event) =>
                      update("quantity", Number(event.target.value))
                    }
                  />
                </FormField>
              )}
              {config.conditionNotes && (
                <div className="wide">
                  <FormField label="Honest condition note">
                    <textarea
                      value={draft.conditionNotes}
                      onChange={(event) =>
                        update("conditionNotes", event.target.value)
                      }
                      placeholder="Mention visible wear, stains, repairs or missing pieces."
                      minLength={MIN_CONDITION_NOTES_LENGTH}
                      maxLength={MAX_CONDITION_NOTES_LENGTH}
                      required
                    />
                  </FormField>
                </div>
              )}
            </div>
            {(config.petHousehold || config.smokingHousehold) && (
              <fieldset className="choice-field">
                <legend>Household disclosures</legend>
                {config.petHousehold && (
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.petHousehold}
                      onChange={(event) =>
                        update("petHousehold", event.target.checked)
                      }
                    />{" "}
                    This item came from a home with pets
                  </label>
                )}
                {config.smokingHousehold && (
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.smokingHousehold}
                      onChange={(event) =>
                        update("smokingHousehold", event.target.checked)
                      }
                    />{" "}
                    This item came from a smoking household
                  </label>
                )}
              </fieldset>
            )}
            {config.photos && (
              <div className="photo-field">
                <strong>Photos</strong>
                <p>
                  Add the front, side and any visible wear. Up to five images,
                  10 MB each.
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
            )}
          </section>
        )}

        {step === 2 && (
          <section>
            <p className="form-kicker">02 · The practical bits</p>
            <h2>Will it fit—and can it move?</h2>
            <div className="form-grid three">
              {config.widthCm && (
                <FormField label="Width (cm)">
                  <input
                    type="number"
                    min={MIN_DIMENSION_CM}
                    max={MAX_DIMENSION_CM}
                    value={draft.widthCm}
                    onChange={(event) => update("widthCm", event.target.value)}
                    required
                  />
                </FormField>
              )}
              {config.depthCm && (
                <FormField label="Depth (cm)">
                  <input
                    type="number"
                    min={MIN_DIMENSION_CM}
                    max={MAX_DIMENSION_CM}
                    value={draft.depthCm}
                    onChange={(event) => update("depthCm", event.target.value)}
                    required
                  />
                </FormField>
              )}
              {config.heightCm && (
                <FormField label="Height (cm)">
                  <input
                    type="number"
                    min={MIN_DIMENSION_CM}
                    max={MAX_DIMENSION_CM}
                    value={draft.heightCm}
                    onChange={(event) => update("heightCm", event.target.value)}
                    required
                  />
                </FormField>
              )}
            </div>
            <div className="form-grid">
              {config.neighbourhood && (
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
              )}
              {config.floor && (
                <FormField label="Floor">
                  <input
                    type="number"
                    min={MIN_FLOOR}
                    max={MAX_FLOOR}
                    value={draft.floor}
                    onChange={(event) => update("floor", event.target.value)}
                    required
                  />
                </FormField>
              )}
              {config.hasLift && (
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
              )}
              {config.fitsInLift && (
                <FormField label="Fits inside lift">
                  <select
                    value={draft.fitsInLift}
                    onChange={(event) =>
                      update("fitsInLift", event.target.value)
                    }
                  >
                    <option value="">Not sure</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </FormField>
              )}
              {config.disassembly && (
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
              )}
              {config.delivery && (
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
              )}
            </div>
            {config.deadlineType && (
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
                {draft.deadlineType === "specific" &&
                  config.collectionDeadline && (
                    <input
                      type="date"
                      value={draft.collectionDeadline}
                      onChange={(event) =>
                        update("collectionDeadline", event.target.value)
                      }
                    />
                  )}
              </fieldset>
            )}
            {config.availability && (
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
            )}
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
              {config.contactName && (
                <FormField label="Contact name">
                  <input
                    value={draft.contactName}
                    onChange={(event) =>
                      update("contactName", event.target.value)
                    }
                    maxLength={MAX_CONTACT_NAME_LENGTH}
                    required
                  />
                </FormField>
              )}
              {config.whatsapp && (
                <FormField label="WhatsApp number">
                  <input
                    type="tel"
                    value={draft.whatsapp}
                    onChange={(event) => update("whatsapp", event.target.value)}
                    placeholder="+65 9123 4567"
                    pattern={WHATSAPP_PATTERN.source}
                    title="e.g. +65 9123 4567"
                    required
                  />
                </FormField>
              )}
            </div>
            <div className="declarations">
              {config.safeToUse && (
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
              )}
              {config.offeredFree && (
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
              )}
              {config.contactConsent && (
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
              )}
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
