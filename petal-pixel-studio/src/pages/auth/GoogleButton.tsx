import { useState } from "react";
import { signInWithGoogle } from "@/integrations/auth/neon";
import { errorText } from "./Gate";

export function GoogleButton({ returnTo, onError }: { returnTo: string; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      await signInWithGoogle(returnTo);
    } catch (err) {
      setBusy(false);
      onError(errorText(err));
    }
  };

  return (
    <button type="button" className="pp-button pp-button--quiet" disabled={busy} onClick={() => void start()}>
      Continue with Google
    </button>
  );
}
