/** The signed-in person, whichever provider signed them in. */
export interface AuthSession {
  id: string;
  email: string | null;
  emailVerified: boolean;
}
