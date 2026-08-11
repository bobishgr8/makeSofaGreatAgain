import { FormEvent, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../../common/firebase";
import Button from "../../common/components/Button";
import FormField from "../../common/components/FormField";

export default function LoginPage() {
  const [error, setError] = useState("");
  const navigate = useNavigate();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      await signInWithEmailAndPassword(
        auth,
        String(data.get("email")),
        String(data.get("password")),
      );
      navigate("/workspace");
    } catch {
      setError("We could not log you in. Check your details.");
    }
  }
  return (
    <main className="page">
      <div className="page-heading">
        <h1>Welcome back.</h1>
      </div>
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Email">
            <input name="email" type="email" required />
          </FormField>
          <FormField label="Password">
            <input name="password" type="password" required />
          </FormField>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <Button>Log in</Button>
          <Link className="button secondary" to="/register">
            Create account
          </Link>
        </div>
      </form>
    </main>
  );
}
