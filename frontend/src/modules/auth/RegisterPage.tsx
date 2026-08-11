import { FormEvent } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../../common/firebase";
import Button from "../../common/components/Button";
import FormField from "../../common/components/FormField";
export default function RegisterPage() {
  const navigate = useNavigate();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    await createUserWithEmailAndPassword(
      auth,
      String(d.get("email")),
      String(d.get("password")),
    );
    navigate("/donor");
  }
  return (
    <main className="page">
      <div className="page-heading">
        <h1>Join ReFurbish.</h1>
      </div>
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Name">
            <input name="name" required />
          </FormField>
          <FormField label="Email">
            <input name="email" type="email" required />
          </FormField>
          <FormField label="Password">
            <input name="password" type="password" minLength={8} required />
          </FormField>
          <FormField label="Account type">
            <select name="role">
              <option value="donor">Furniture donor</option>
              <option value="social_worker">Social worker</option>
            </select>
          </FormField>
        </div>
        <div className="actions">
          <Button>Create account</Button>
        </div>
      </form>
    </main>
  );
}
