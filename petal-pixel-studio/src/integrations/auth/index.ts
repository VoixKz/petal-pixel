import * as neon from "./neon";
import * as oidc from "./oidc";

export type { AuthSession } from "./types";

/** True on the hosted site, where people sign in on our own form. */
export const usesPasswordForm = Boolean(neon.neonAuthUrl);

export function getAccessToken(): Promise<string | null> {
  return usesPasswordForm ? neon.getAccessToken() : oidc.getAccessToken();
}

export function getSignedInUserId(): Promise<string | null> {
  return usesPasswordForm ? neon.getSignedInUserId() : oidc.getSignedInUserId();
}
