import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    ReactNode,
} from "react";
import type { User as OidcUser } from "oidc-client-ts";
import { usesPasswordForm, type AuthSession } from "@/integrations/auth";
import * as neon from "@/integrations/auth/neon";
import {
    redirectToSignIn,
    redirectToSignUp,
    signOutOfProvider,
    userManager,
} from "@/integrations/auth/oidc";
import { getMeViaGrpc } from "@/integrations/flowerBackend/client";
import { useFlowerStore } from "@/stores/flowerStore";

interface Profile {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
    created_at: string | null;
}

interface AuthContextType {
    session: AuthSession | null;
    user: AuthSession | null;
    profile: Profile | null;
    loading: boolean;
    signIn: (returnTo: string) => Promise<void>;
    signUp: (returnTo: string) => Promise<void>;
    signInWithPassword: (email: string, password: string) => Promise<void>;
    signUpWithPassword: (name: string, email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function fromOidc(user: OidcUser | null): AuthSession | null {
    if (!user || user.expired) return null;
    return {
        id: user.profile.sub,
        email: user.profile.email ?? null,
        emailVerified: user.profile.email_verified === true,
    };
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<AuthSession | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    // Re-pull the current user's profile so context consumers (sidebar footer,
    // header avatar) reflect an edit made on the Profile page immediately.
    const refreshProfile = useCallback(async () => {
        try {
            const me = await getMeViaGrpc();
            setProfile({
                id: me.userId,
                display_name: me.displayName || null,
                avatar_url: me.avatarUrl || null,
                email: me.email || null,
                created_at: me.createdAt || null,
            });
        } catch (err) {
            console.error("Could not load profile:", err);
        }
    }, []);

    const applySession = useCallback((live: AuthSession | null) => {
        setSession(live);
        if (live) {
            // Cross-user rehydration guard: if the persisted cache belongs to a
            // different user (tab-reuse, different-account login), wipe it before
            // any component renders the stale savedFlowers.
            const { ownerUserId } = useFlowerStore.getState();
            if (ownerUserId && ownerUserId !== live.id) {
                useFlowerStore.getState().resetFlowerStore();
            }
            void refreshProfile();
        } else {
            setProfile(null);
        }
        setLoading(false);
    }, [refreshProfile]);

    useEffect(() => {
        if (usesPasswordForm) {
            neon.restoreSession().then(applySession).catch(() => applySession(null));
            return;
        }

        const onLoaded = (next: OidcUser) => applySession(fromOidc(next));
        const onUnloaded = () => {
            // Session expiry or sign-out in another tab: clear the persisted
            // cache so the next user starts clean.
            applySession(null);
            useFlowerStore.getState().resetFlowerStore();
        };

        userManager.events.addUserLoaded(onLoaded);
        userManager.events.addUserUnloaded(onUnloaded);

        const restore = async () => {
            const stored = await userManager.getUser();
            if (stored?.expired && stored.refresh_token) return userManager.signinSilent();
            return stored;
        };
        restore().then((user) => applySession(fromOidc(user ?? null))).catch(() => applySession(null));

        return () => {
            userManager.events.removeUserLoaded(onLoaded);
            userManager.events.removeUserUnloaded(onUnloaded);
        };
    }, [applySession]);

    const signInWithPassword = async (email: string, password: string) => {
        applySession(await neon.signInWithPassword(email, password));
    };

    const signUpWithPassword = async (name: string, email: string, password: string) => {
        applySession(await neon.signUpWithPassword(name, email, password));
    };

    const signOut = async () => {
        setSession(null);
        setProfile(null);
        useFlowerStore.getState().resetFlowerStore();
        await (usesPasswordForm ? neon.signOut() : signOutOfProvider());
    };

    return (
        <AuthContext.Provider
            value={{
                session,
                user: session,
                profile,
                loading,
                signIn: redirectToSignIn,
                signUp: redirectToSignUp,
                signInWithPassword,
                signUpWithPassword,
                signOut,
                refreshProfile,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
}
