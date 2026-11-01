import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "@/integrations/auth/neon";
import { errorText, Field, Gate } from "./auth/Gate";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem("");
    try {
      await resetPassword(password, token);
      setDone(true);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <Gate title="This link isn't valid">
        <p className="gate__done">Ask for a new reset link and open it from the email.</p>
        <p className="gate__links"><Link to="/forgot-password">Send a new link</Link></p>
      </Gate>
    );
  }

  return (
    <Gate title="Choose a new password">
      {done ? (
        <>
          <p className="gate__done" role="status">Your password is changed.</p>
          <Link className="pp-button" to="/login">Sign in</Link>
        </>
      ) : (
        <form className="gate__fields" onSubmit={(e) => void submit(e)}>
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            hint="At least 8 characters."
            value={password}
            onChange={setPassword}
          />
          {problem && <p className="gate__error" role="alert">{problem}</p>}
          <button className="pp-button" type="submit" disabled={busy}>{busy ? "Saving" : "Save password"}</button>
        </form>
      )}
    </Gate>
  );
}
