import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "@/integrations/auth/neon";
import { errorText, Field, Gate } from "./auth/Gate";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem("");
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Gate title="Reset your password">
      {sent ? (
        <p className="gate__done" role="status">
          If {email.trim()} has an account, a reset link is on its way. It works for 15 minutes.
        </p>
      ) : (
        <form className="gate__fields" onSubmit={(e) => void submit(e)}>
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
          {problem && <p className="gate__error" role="alert">{problem}</p>}
          <button className="pp-button" type="submit" disabled={busy}>{busy ? "Sending" : "Send reset link"}</button>
        </form>
      )}
      <p className="gate__links"><Link to="/login">Back to sign in</Link></p>
    </Gate>
  );
}
