import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usesPasswordForm } from "@/integrations/auth";
import { errorText, Field, Gate, useGateTitle, useReturnTo } from "./auth/Gate";
import { GoogleButton } from "./auth/GoogleButton";

function PasswordSignIn() {
  const { signInWithPassword, session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = useReturnTo();
  const title = useGateTitle("Sign in");
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
      await signInWithPassword(email.trim(), password);
    } catch (err) {
      setProblem(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Gate title={title}>
      <form className="gate__fields" onSubmit={(e) => void submit(e)}>
        <Field label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
        <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
        {problem && <p className="gate__error" role="alert">{problem}</p>}
        <button className="pp-button" type="submit" disabled={busy}>{busy ? "Signing in" : "Sign in"}</button>
      </form>
      <div className="gate__or">
        <GoogleButton returnTo={returnTo} onError={setProblem} />
      </div>
      <p className="gate__links">
        <Link to="/signup" state={location.state}>Create an account</Link>
        <Link to="/forgot-password">Forgot password?</Link>
      </p>
    </Gate>
  );
}

function RedirectSignIn() {
  const { signIn } = useAuth();
  const location = useLocation();
  const returnTo = useReturnTo();
  const title = useGateTitle("Sign in");
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      await signIn(returnTo);
    } catch {
      setBusy(false);
      toast.error("Couldn't reach the sign-in service. Try again shortly.");
    }
  };

  return (
    <Gate title={title}>
      <button className="pp-button" type="button" disabled={busy} onClick={() => void start()}>
        {busy ? "Opening sign-in…" : "Sign In"}
      </button>
      <p className="gate__links">
        <Link to="/signup" state={location.state}>Sign up</Link>
      </p>
    </Gate>
  );
}

export default function Login() {
  return usesPasswordForm ? <PasswordSignIn /> : <RedirectSignIn />;
}
