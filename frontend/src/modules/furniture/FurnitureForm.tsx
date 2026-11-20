import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useNavigate } from "react-router-dom";

import Button from "../../common/components/Button";
import FormField from "../../common/components/FormField";
import { api } from "../../common/api";
import { auth, storage } from "../../common/firebase";
import { useFormConfig, type FormConfig } from "../../app/FormConfigContext";
import { addDays, todaySgt } from "../../common/dates";
import {
  applicableDetails,
  CONDITION_OPTIONS,
  MIN_COLLECTION_DAYS,
  missingDetail,
  questionsFor,
  specFor,
  type Question,
} from "../../common/donationSpec";
import { CONDITION_LABELS } from "../../common/dto/FurnitureDTO";
import { defaultInitialDraft } from "../../common/config";
import type { Draft } from "../../common/dto/DraftDTO";
import type { FurnitureView } from "../../common/dto/FurnitureDTO";
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
const MAX_BRAND_LENGTH = 80;
const POSTAL_CODE_PATTERN = /^\d{6}$/;

function isValidNumber(value: string) {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

export default function FurnitureForm() {
  const { config, categoryLabels, neighbourhoods, initialDraft } =
    useFormConfig();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(() => ({
    // Client defaults first, so fields an older server config lacks still exist.
    ...defaultInitialDraft(),
    ...initialDraft,
    contactName: auth.currentUser?.displayName ?? "",
  }));
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  // The donor picked "Others" as the item type and is typing their own.
  const [otherType, setOtherType] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // Fill in what the donor's profile already knows, without overwriting typing.
  useEffect(() => {
    api<{ displayName?: string; phone?: string; address?: string }>("/api/donors/me")
      .then((profile) =>
        setDraft((current) => ({
          ...current,
          contactName: current.contactName || profile.displayName || "",
          whatsapp: current.whatsapp || profile.phone || "",
          pickupAddress: current.pickupAddress || profile.address || "",
        })),
      )
      .catch(() => {});
  }, []);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function chooseCategory(category: string) {
    setOtherType(false);
    setDraft((current) => ({
      ...current,
      category,
      // The item types and questions differ per category.
      subcategory: category === current.category ? current.subcategory : "",
      details: category === current.category ? current.details : {},
      title:
        current.title ||
        `Pre-loved ${categoryLabels[category] ?? "furniture item"}`,
    }));
  }

  function updateDetail(key: string, value: string) {
    setDraft((current) => ({
      ...current,
      details: { ...current.details, [key]: value },
    }));
  }

  const spec = specFor(draft.category);
  const questions = draft.category ? questionsFor(draft.category, draft.details) : [];

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
      const requiredFields: Array<keyof FormConfig> = [
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

      if (spec.itemTypes && !draft.subcategory.trim())
        return "Choose the item type.";

      if (
        draft.brand.trim().length > MAX_BRAND_LENGTH ||
        draft.modelNumber.trim().length > MAX_BRAND_LENGTH
      )
        return `Brand and model number must be at most ${MAX_BRAND_LENGTH} characters.`;

      const unanswered = missingDetail(draft.category, draft.details);
      if (unanswered) return `Please answer: ${unanswered}`;

      const badNumber = questions.find(
        (question) =>
          question.kind === "number" &&
          (draft.details[question.key] ?? "").trim() !== "" &&
          !(Number(draft.details[question.key]) > 0),
      );
      if (badNumber) return `${badNumber.label} must be a positive number.`;

      if (
        config.quantity &&
        (!Number.isInteger(draft.quantity) ||
          draft.quantity < MIN_QUANTITY ||
          draft.quantity > MAX_QUANTITY)
      )
        return `Quantity must be a whole number between ${MIN_QUANTITY} and ${MAX_QUANTITY}.`;
    }

    if (step === 2) {
      const requiredFields: Array<Exclude<keyof FormConfig, "photos">> = [
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
      if (missing || !draft.pickupAddress.trim() || !draft.expectedDeliveryDate)
        return "Complete the dimensions, location, access and collection details.";
      if (!POSTAL_CODE_PATTERN.test(draft.postalCode.replace(/\s/g, "")))
        return "Enter the 6-digit postal code for collection.";
      if (draft.expectedDeliveryDate < addDays(todaySgt(), MIN_COLLECTION_DAYS))
        return `The collect-by date must be at least ${MIN_COLLECTION_DAYS} days from today.`;
      if (
        config.deadlineType &&
        draft.deadlineType === "specific" &&
        !draft.collectionDeadline
      )
        return "Choose the collection deadline.";
    }

    if (step === 3) {
      const requiredFields: Array<Exclude<keyof FormConfig, "photos">> = [
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

      if (!draft.deliveryCostAcknowledged)
        return "Please confirm that you'll cover the delivery cost.";

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

      const created = await api<FurnitureView>("/api/furniture", {
        method: "POST",
        body: JSON.stringify({
          pickupAddress: draft.pickupAddress.trim(),
          postalCode: draft.postalCode.replace(/\s/g, ""),
          deliveryCostAcknowledged: draft.deliveryCostAcknowledged,
          expectedDeliveryDate: draft.expectedDeliveryDate,
          title: draft.title,
          category: draft.category,
          subcategory: draft.subcategory.trim() || null,
          brand: draft.brand.trim() || null,
          modelNumber: draft.modelNumber.trim() || null,
          details: applicableDetails(draft.category, draft.details),
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
      navigate(`/donor/furniture/${created.id}`);
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
            <p className="form-kicker">The item</p>
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
              {(config.subcategory || spec.itemTypes) && draft.category && (
                <FormField label="Item type">
                  {spec.itemTypes ? (
                    <select
                      value={
                        otherType
                          ? "Others"
                          : spec.itemTypes.includes(draft.subcategory)
                            ? draft.subcategory
                            : ""
                      }
                      onChange={(event) => {
                        const value = event.target.value;
                        setOtherType(value === "Others");
                        update("subcategory", value === "Others" ? "" : value);
                      }}
                      required
                    >
                      <option value="">Choose one</option>
                      {spec.itemTypes.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={draft.subcategory}
                      onChange={(event) =>
                        update("subcategory", event.target.value)
                      }
                      placeholder="What is it?"
                      maxLength={80}
                    />
                  )}
                </FormField>
              )}
              {otherType && (
                <FormField label="Describe the type">
                  <input
                    value={draft.subcategory}
                    onChange={(event) =>
                      update("subcategory", event.target.value)
                    }
                    placeholder="e.g. day bed, shoe cabinet"
                    maxLength={80}
                    required
                  />
                </FormField>
              )}
              {draft.category && (
                <FormField
                  label={spec.brandRecommended ? "Brand (recommended)" : "Brand (optional)"}
                >
                  <input
                    value={draft.brand}
                    onChange={(event) => update("brand", event.target.value)}
                    maxLength={MAX_BRAND_LENGTH}
                  />
                </FormField>
              )}
              {draft.category && (
                <FormField
                  label={spec.brandRecommended ? "Model number (recommended)" : "Model number (optional)"}
                >
                  <input
                    value={draft.modelNumber}
                    onChange={(event) =>
                      update("modelNumber", event.target.value)
                    }
                    maxLength={MAX_BRAND_LENGTH}
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
                    {CONDITION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
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
            {questions.length > 0 && (
              <div className="form-grid">
                {questions.map((question) => (
                  <DetailQuestion
                    key={question.key}
                    question={question}
                    value={draft.details[question.key] ?? ""}
                    onChange={(value) => updateDetail(question.key, value)}
                  />
                ))}
              </div>
            )}
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
                  {draft.category
                    ? "Please include:"
                    : "Add the front, side and any visible wear."}{" "}
                  Up to five images, 10 MB each.
                </p>
                {draft.category && (
                  <ul className="photo-checklist">
                    {spec.photoChecklist.map((shot) => (
                      <li key={shot}>{shot}</li>
                    ))}
                  </ul>
                )}
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
            <p className="form-kicker">The practical bits</p>
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
              <FormField label="Pick-up address">
                <input
                  value={draft.pickupAddress}
                  maxLength={200}
                  placeholder="e.g. 88 Tampines Road"
                  onChange={(event) =>
                    update("pickupAddress", event.target.value)
                  }
                  required
                />
              </FormField>
              <FormField label="Postal code">
                <input
                  value={draft.postalCode}
                  inputMode="numeric"
                  maxLength={7}
                  placeholder="e.g. 529889"
                  onChange={(event) => update("postalCode", event.target.value)}
                  required
                />
              </FormField>
              <FormField label="Collect by (at least 3 days from today)">
                <input
                  type="date"
                  min={addDays(todaySgt(), MIN_COLLECTION_DAYS)}
                  value={draft.expectedDeliveryDate}
                  onChange={(event) =>
                    update("expectedDeliveryDate", event.target.value)
                  }
                  required
                />
              </FormField>
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
            <p className="form-kicker">Confirm</p>
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
              <label>
                <input
                  type="checkbox"
                  checked={draft.deliveryCostAcknowledged}
                  onChange={(event) =>
                    update("deliveryCostAcknowledged", event.target.checked)
                  }
                />{" "}
                I understand that I&rsquo;ll need to cover the delivery cost for
                the item to reach the recipient.
              </label>
            </div>
            <div className="review-card">
              <span>
                {draft.quantity} ×{" "}
                {CONDITION_LABELS[draft.condition] ?? draft.condition}
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

function DetailQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
}) {
  const label = question.optional ? `${question.label} (optional)` : question.label;
  if (question.kind === "choice") {
    return (
      <FormField label={label}>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={!question.optional}
        >
          <option value="">Choose one</option>
          {question.options?.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </FormField>
    );
  }
  if (question.kind === "number") {
    return (
      <FormField label={question.unit ? `${label} (${question.unit})` : label}>
        <input
          type="number"
          min={0}
          step="any"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={!question.optional}
        />
      </FormField>
    );
  }
  return (
    <div className="wide">
      <FormField label={label}>
        <textarea
          value={value}
          maxLength={500}
          onChange={(event) => onChange(event.target.value)}
        />
      </FormField>
    </div>
  );
}
