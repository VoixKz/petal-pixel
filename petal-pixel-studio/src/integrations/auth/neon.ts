// Sign-in on the hosted site, through Managed Better Auth. Local Docker and the
// e2e tests keep using Keycloak (oidc.ts), so they run without a network.
import type { AuthSession } from "./types";

interface AuthFailure {
  code?: string;
  status?: number;
  message?: string;
}

interface Result<T> {
  data: T | null;
  error: AuthFailure | null;
}

interface NeonClient {
  getSession(): Promise<Result<{ user?: { id: string; email?: string; emailVerified?: boolean } }>>;
  token(): Promise<Result<{ token?: string }>>;
  signIn: {
    email(input: { email: string; password: string }): Promise<Result<unknown>>;
    social(input: { provider: "google"; callbackURL: string }): Promise<Result<unknown>>;
  };
  signUp: { email(input: { name: string; email: string; password: string }): Promise<Result<unknown>> };
  signOut(): Promise<unknown>;
  requestPasswordReset(input: { email: string; redirectTo: string }): Promise<Result<unknown>>;
  resetPassword(input: { newPassword: string; token: string }): Promise<Result<unknown>>;
}

const SERVICE_DOWN = "Couldn't reach the sign-in service. Try again shortly.";
const WRONG_PASSWORD = "That email and password don't match.";

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: WRONG_PASSWORD,
  INVALID_PASSWORD: WRONG_PASSWORD,
  invalid_credentials: WRONG_PASSWORD,
  USER_ALREADY_EXISTS: "There is already an account with this email. Sign in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "There is already an account with this email. Sign in instead.",
  user_already_exists: "There is already an account with this email. Sign in instead.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters.",
  INVALID_TOKEN: "This reset link has expired. Ask for a new one.",
};

/** Server text can name internals, so only known failures reach the person. */
export function authErrorMessage(error: AuthFailure | null | undefined): string {
  if (error?.status === 429) return "Too many attempts. Wait a minute and try again.";
  return (error?.code && MESSAGES[error.code]) || SERVICE_DOWN;
}

/** A path keeps auth on this site's origin, so Safari treats its cookie as first-party. */
export function resolveAuthUrl(value: string | undefined, origin: string): string {
  if (!value) return "";
  return value.startsWith("/") ? `${origin}${value}` : value;
}

export const neonAuthUrl = resolveAuthUrl(import.meta.env.VITE_NEON_AUTH_URL, window.location.origin);

let loading: Promise<NeonClient> | null = null;

function client(): Promise<NeonClient> {
  loading ??= import("@neon/auth").then(({ createAuthClient }) => createAuthClient(neonAuthUrl) as unknown as NeonClient);
  return loading;
}

let token: { value: string; expiresAt: number } | null = null;

function expiryOf(jwt: string): number {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp * 1000;
  } catch {
    return 0;
  }
}

export async function restoreSession(): Promise<AuthSession | null> {
  const { data } = await (await client()).getSession();
  if (!data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, emailVerified: data.user.emailVerified === true };
}

/** A guest must never be blocked by the auth service: growing a flower needs no token. */
export async function getAccessToken(): Promise<string | null> {
  if (token && token.expiresAt - Date.now() > 30_000) return token.value;
  try {
    if (!(await restoreSession())) return null;
    const { data } = await (await client()).token();
    token = data?.token ? { value: data.token, expiresAt: expiryOf(data.token) } : null;
    return token?.value ?? null;
  } catch {
    return null;
  }
}

export async function getSignedInUserId(): Promise<string | null> {
  try {
    return (await restoreSession())?.id ?? null;
  } catch {
    return null;
  }
}

function unwrap<T>(result: Result<T>): T | null {
  if (result.error) throw new Error(authErrorMessage(result.error));
  return result.data;
}

export async function signInWithPassword(email: string, password: string): Promise<AuthSession | null> {
  unwrap(await (await client()).signIn.email({ email, password }));
  return restoreSession();
}

export async function signUpWithPassword(name: string, email: string, password: string): Promise<AuthSession | null> {
  unwrap(await (await client()).signUp.email({ name, email, password }));
  return restoreSession();
}

/** Leaves the page; Google sends the person back to returnTo. */
export async function signInWithGoogle(returnTo: string): Promise<void> {
  unwrap(await (await client()).signIn.social({ provider: "google", callbackURL: `${window.location.origin}${returnTo}` }));
}

export async function requestPasswordReset(email: string): Promise<void> {
  unwrap(await (await client()).requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` }));
}

export async function resetPassword(newPassword: string, resetToken: string): Promise<void> {
  unwrap(await (await client()).resetPassword({ newPassword, token: resetToken }));
}

export async function signOut(): Promise<void> {
  token = null;
  await (await client()).signOut();
}
