import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import "@/styles/petal.css";

/** Where to go after signing in: the page that asked for it, or the console. */
export function useReturnTo(): string {
  const location = useLocation();
  // ProtectedRoute stashes the pre-login target (e.g. /create?name=X from the
  // share "make one for your name" CTA) as state.from, so the deep-link survives.
  const from = location.state?.from as { pathname?: string; search?: string } | undefined;
  return from?.pathname ? `${from.pathname}${from.search ?? ""}` : "/console";
}

export function Gate({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pp gate">
      <div className="gate__form">
        <Link className="pp-bar__mark" to="/">Petal Pixel</Link>
        <main className="gate__body">
          <h1>{title}</h1>
          {children}
        </main>
      </div>
      <div className="gate__picture">
        <img src="/flowers/dana.webp" alt="" width={800} height={800} />
        <p>Dana grows a dahlia.</p>
      </div>
    </div>
  );
}

export function Field(props: {
  label: string;
  type: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  minLength?: number;
}) {
  const hintId = props.hint ? `${props.autoComplete}-hint` : undefined;
  return (
    <label className="gate__field">
      {props.label}
      <input
        type={props.type}
        autoComplete={props.autoComplete}
        required
        minLength={props.minLength}
        aria-describedby={hintId}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <span id={hintId} className="gate__hint">{props.hint}</span>}
    </label>
  );
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Couldn't reach the sign-in service. Try again shortly.";
}
