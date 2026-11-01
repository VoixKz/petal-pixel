import { UserManager, WebStorageStateStore } from "oidc-client-ts";

export const oidcAuthority =
  import.meta.env.VITE_OIDC_AUTHORITY || "http://localhost:8180/realms/petal-pixel";

export const userManager = new UserManager({
  authority: oidcAuthority,
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID || "petal-pixel",
  redirect_uri: `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: `${window.location.origin}/login`,
  scope: "openid email profile",
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  automaticSilentRenew: true,
});

/** Where to change the password. The provider owns credentials, not this app. */
export const accountSecurityUrl = `${oidcAuthority}/account/#/account-security/signing-in`;

export async function getAccessToken(): Promise<string | null> {
  const user = await userManager.getUser();
  return user && !user.expired ? user.access_token : null;
}

export async function getSignedInUserId(): Promise<string | null> {
  const user = await userManager.getUser();
  return user && !user.expired ? user.profile.sub : null;
}

export function redirectToSignIn(returnTo: string): Promise<void> {
  return userManager.signinRedirect({ state: { returnTo } });
}

export function redirectToSignUp(returnTo: string): Promise<void> {
  return userManager.signinRedirect({ state: { returnTo }, prompt: "create" });
}

/** The return target travels through a redirect, so never trust it as a URL. */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

/** Finishes the redirect back from the provider and returns the page to open. */
export async function completeSignIn(): Promise<string> {
  const user = await userManager.signinRedirectCallback();
  return safeReturnPath((user.state as { returnTo?: unknown } | undefined)?.returnTo);
}

export async function signOutOfProvider(): Promise<void> {
  try {
    await userManager.signoutRedirect();
  } catch {
    // Provider unreachable: still end the session on this device.
    await userManager.removeUser();
  }
}
