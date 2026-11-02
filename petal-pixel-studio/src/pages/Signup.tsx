import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usesPasswordForm } from "@/integrations/auth";
import { errorText, Field, Gate, useReturnTo } from "./auth/Gate";
import { GoogleButton } from "./auth/GoogleButton";

function PasswordSignUp() {
  const { signUpWithPassword, session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = useReturnTo();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate(returnTo, { replace: true });
  }, [session, navigate, returnTo]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem("");
    try {
      await signUpWithPassword(name.trim(), email.trim(), password);
    } catch (err) {
      setProblem(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Gate title="Start your garden">
      <form className="gate__fields" onSubmit={(e) => void submit(e)}>
        <Field label="Name" type="text" autoComplete="name" value={name} onChange={setName} />
        <Field label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          hint="At least 8 characters."
          value={password}
          onChange={setPassword}
        />
        {problem && <p className="gate__error" role="alert">{problem}</p>}
        <button className="pp-button" type="submit" disabled={busy}>{busy ? "Creating account" : "Create account"}</button>
      </form>
      <div className="gate__or">
        <GoogleButton returnTo={returnTo} onError={setProblem} />
      </div>
      <p className="gate__links">
        <Link to="/login" state={location.state}>I already have an account</Link>
      </p>
    </Gate>
  );
}

function RedirectSignUp() {
  const { signUp } = useAuth();
  const location = useLocation();
  const returnTo = useReturnTo();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      await signUp(returnTo);
    } catch {
      setBusy(false);
      toast.error("Couldn't reach the sign-in service. Try again shortly.");
    }
  };

  return (
    <Gate title="Start your garden">
      <button className="pp-button" type="button" disabled={busy} onClick={() => void start()}>
        {busy ? "Opening sign-up…" : "Create account"}
      </button>
      <p className="gate__links">
        <Link to="/login" state={location.state}>Sign in</Link>
      </p>
    </Gate>
  );
}

export default function Signup() {
  return usesPasswordForm ? <PasswordSignUp /> : <RedirectSignUp />;
}
