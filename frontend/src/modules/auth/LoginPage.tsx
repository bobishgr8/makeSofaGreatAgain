import { useState } from "react";
import type { SubmitEventHandler } from "react";
import { signInWithEmailAndPassword, signInWithPopup, signInAnonymously, User} from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import { auth, googleProvider } from "../../common/firebase";

import Button from "../../common/components/Button";
import FormField from "../../common/components/FormField";
const API_URL = import.meta.env.VITE_API_URL;

type UserRole = "donor" | "social_worker" | "admin";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  /**
   * Ask the backend to assign a role.
   *
   * Use this only for roles that are safe to assign automatically.
   * In our login flow that means "donor".
   */
  async function assignRole(user: User, role: UserRole) {
    const idToken = await user.getIdToken();

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
      throw new Error("Could not assign user role");
    }

    // Force Firebase to fetch a new token containing
    // the newly-added custom claim.
    await user.getIdToken(true);
  }

  /**
   * Called after Firebase successfully authenticates a user.
   */
  async function finishLogin(
    user: User,
    defaultRole?: UserRole,
  ) {
    let tokenResult = await user.getIdTokenResult();

    let role = tokenResult.claims.role as UserRole | undefined;

    console.log("===== AUTH DEBUG =====");
    console.log("User:", user);
    console.log("UID:", user.uid);
    console.log("Email:", user.email);
    console.log("Anonymous:", user.isAnonymous);
    console.log(
      "Providers:",
      user.providerData.map((provider) => provider.providerId),
    );
    console.log("Existing role:", role);

    /*
     * Google and anonymous users default to donor.
     *
     * We only do this if their Firebase token does not
     * already contain a role.
     */
    if (!role && defaultRole) {
      await assignRole(user, defaultRole);

      // Read refreshed claims
      tokenResult = await user.getIdTokenResult(true);

      role = tokenResult.claims.role as UserRole | undefined;
    }

    console.log("Resolved role:", role);
    console.log("Claims:", tokenResult.claims);
    console.log("======================");

    /*
     * Email/password accounts should have received
     * their role during registration.
     *
     * If they don't have one, something is wrong with
     * registration rather than login.
     */
    if (!role) {
      throw new Error("This account does not have a role assigned.");
    }

    navigate("/furniture");
  }

  const submit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    const data = new FormData(event.currentTarget);

    const email = String(data.get("email"));
    const password = String(data.get("password"));

    try {
      const result = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );

      // Email/password users should already have a role
      // assigned during registration.
      await finishLogin(result.user);
    } catch (err) {
      console.error("Login error:", err);

      setError(
        err instanceof Error &&
          err.message === "This account does not have a role assigned."
          ? "Your account does not have a role assigned."
          : "We could not log you in. Check your details.",
      );
    } finally {
      setLoading(false);
    }
  };

  async function loginWithGoogle() {
    setError("");
    setLoading(true);

    try {
      const result = await signInWithPopup(
        auth,
        googleProvider,
      );

      // New Google users default to donor.
      // Existing users keep their existing claim.
      await finishLogin(result.user, "donor");
    } catch (err) {
      console.error("Google login error:", err);

      setError("Could not log in with Google.");
    } finally {
      setLoading(false);
    }
  }

  async function loginAnonymously() {
    setError("");
    setLoading(true);

    try {
      const result = await signInAnonymously(auth);

      // Anonymous users are donors, not guests.
      await finishLogin(result.user, "donor");
    } catch (err) {
      console.error("Anonymous login error:", err);

      setError("Could not continue anonymously.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="page-heading">
        <h1>Welcome back.</h1>
      </div>

      <form
        className="form"
        onSubmit={submit}
      >
        <div className="form-grid">
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
              autoComplete="current-password"
              required
            />
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
              ? "Logging in..."
              : "Log in"}
          </Button>

          <button
            type="button"
            className="button secondary"
            onClick={loginWithGoogle}
            disabled={loading}
          >
            Continue with Google
          </button>

          <button
            type="button"
            className="button secondary"
            onClick={loginAnonymously}
            disabled={loading}
          >
            Continue anonymously
          </button>

          <Link
            className="button secondary"
            to="/register"
          >
            Create account
          </Link>
        </div>
      </form>
    </main>
  );
}