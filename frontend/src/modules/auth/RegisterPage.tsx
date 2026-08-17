import { SubmitEventHandler, useState } from "react";
import {createUserWithEmailAndPassword, signInWithPopup, signInAnonymously, updateProfile,} from "firebase/auth";
import { serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

import {auth, db, googleProvider,} from "../../common/firebase";

import Button from "../../common/components/Button";
import FormField from "../../common/components/FormField";
const API_URL = import.meta.env.VITE_API_URL;
type UserRole = "donor" | "social_worker";

export default function RegisterPage() {
  const navigate = useNavigate();

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit: SubmitEventHandler<HTMLFormElement> = async (event) => {
  event.preventDefault();

  const data = new FormData(event.currentTarget);

  const name = String(data.get("name"));
  const email = String(data.get("email"));
  const password = String(data.get("password"));
  const role = String(data.get("role")) as UserRole;

  try {
    // 1. Create Firebase Auth account
    const result = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );

    const user = result.user;

    // 2. Set Firebase display name
    await updateProfile(user, {
      displayName: name,
    });

    // 3. Get token to prove identity to Flask
    const idToken = await user.getIdToken();

    // 4. Ask Flask to assign the custom role
    const response = await fetch(`${API_URL}/auth/set-role`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idToken,
        role,
      }),
    });

    if (!response.ok) {
      const body = await response.json();

      throw new Error(
        body.error ?? "Could not assign role",
      );
    }

    // 5. Force Firebase to get a token containing the new claims
    await user.getIdToken(true);

    // Debug
    const tokenResult = await user.getIdTokenResult();

    console.log("===== REGISTRATION DEBUG =====");
    console.log("UID:", user.uid);
    console.log("Email:", user.email);
    console.log("Role:", tokenResult.claims.role);
    console.log("Approval:", tokenResult.claims.approval);
    console.log("==============================");

    // 6. Done
    navigate("/furniture");
  } catch (err) {
    console.error("Registration error:", err);
    }
  };

  async function registerWithGoogle() {
    setError("");
    setLoading(true);

    try {
      const result = await signInWithPopup(
        auth,
        googleProvider,
      );

      const user = result.user;

      /*
        Google doesn't know whether this person should be
        a donor or social worker.

        So here I'm defaulting Google registrations to donor.

        Better UX:
        redirect them to an account-type selection page.
      */
      const role: UserRole = "donor";

      console.log("GOOGLE USER:", user);
      console.log("ROLE:", role);

      navigate("/donor");
    } catch (err) {
      console.error("Google registration error:", err);
      setError("Could not continue with Google.");
    } finally {
      setLoading(false);
    }
  }

  async function continueAnonymously() {
    setError("");
    setLoading(true);

    try {
      const result = await signInAnonymously(auth);

      const user = result.user;

      console.log("ANONYMOUS USER:", user);
      console.log("ROLE: guest");

      navigate("/workspace");
    } catch (err) {
      console.error("Anonymous login error:", err);
      setError("Could not continue as guest.");
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <main className="page">
      <div className="page-heading">
        <h1>Join ReFurbish.</h1>
      </div>

      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Name">
            <input
              name="name"
              autoComplete="name"
              required
            />
          </FormField>

          <FormField label="Email">
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </FormField>
          
          
          <FormField label="Password">
            <input
              name="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </FormField>

          <FormField label="Account type">
            <select name="role" required>
              <option value="donor">
                Furniture donor
              </option>

              <option value="social_worker">
                Social worker
              </option>
            </select>
          </FormField>
        </div>

        {error && (
          <p className="error">
            {error}
          </p>
        )}

        <div className="actions">
          <Button disabled={loading}>
            {loading
              ? "Creating account..."
              : "Create account"}
          </Button>

          <button
            type="button"
            className="button secondary"
            onClick={registerWithGoogle}
            disabled={loading}
          >
            Continue with Google
          </button>

          <button
            type="button"
            className="button secondary"
            onClick={continueAnonymously}
            disabled={loading}
          >
            Continue as guest
          </button>
        </div>
      </form>
    </main>
  );
}