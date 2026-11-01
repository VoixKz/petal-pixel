import {
    createContext,
    useContext,
    useEffect,
    useState,
    ReactNode,
} from "react";
import type { User as OidcUser } from "oidc-client-ts";
import {
    redirectToSignIn,
    redirectToSignUp,
    signOutOfProvider,
    userManager,
} from "@/integrations/auth/oidc";
import { getMeViaGrpc } from "@/integrations/flowerBackend/client";
import { useFlowerStore } from "@/stores/flowerStore";

interface AuthUser {
    id: string;
    email: string | null;
    emailVerified: boolean;
}

interface Profile {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
    created_at: string | null;
}

interface AuthContextType {
    session: OidcUser | null;
    user: AuthUser | null;
    profile: Profile | null;
    loading: boolean;
    signIn: (returnTo: string) => Promise<void>;
    signUp: (returnTo: string) => Promise<void>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toAuthUser(session: OidcUser): AuthUser {
    return {
        id: session.profile.sub,
        email: session.profile.email ?? null,
        emailVerified: session.profile.email_verified === true,
    };
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<OidcUser | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const user = session ? toAuthUser(session) : null;

    // Re-pull the current user's profile so context consumers (sidebar footer,
    // header avatar) reflect an edit made on the Profile page immediately.
    const refreshProfile = async () => {
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
    };

    useEffect(() => {
        const applySession = (next: OidcUser | null) => {
            const live = next && !next.expired ? next : null;
            setSession(live);
            if (live) {
                // Cross-user rehydration guard: if the persisted cache belongs to a
                // different user (tab-reuse, different-account login), wipe it before
                // any component renders the stale savedFlowers.
                const { ownerUserId } = useFlowerStore.getState();
                if (ownerUserId && ownerUserId !== live.profile.sub) {
                    useFlowerStore.getState().resetFlowerStore();
                }
                void refreshProfile();
            } else {
                setProfile(null);
            }
            setLoading(false);
        };

        const onUnloaded = () => {
            // Session expiry or sign-out in another tab: clear the persisted
            // cache so the next user starts clean.
            applySession(null);
            useFlowerStore.getState().resetFlowerStore();
        };

        userManager.events.addUserLoaded(applySession);
        userManager.events.addUserUnloaded(onUnloaded);

        const restore = async () => {
            const stored = await userManager.getUser();
            if (stored?.expired && stored.refresh_token) return userManager.signinSilent();
            return stored;
        };
        restore().then(applySession).catch(() => applySession(null));

        return () => {
            userManager.events.removeUserLoaded(applySession);
            userManager.events.removeUserUnloaded(onUnloaded);
        };
    }, []);

    const signOut = async () => {
        setSession(null);
        setProfile(null);
        useFlowerStore.getState().resetFlowerStore();
        await signOutOfProvider();
    };

    return (
        <AuthContext.Provider
            value={{
                session,
                user,
                profile,
                loading,
                signIn: redirectToSignIn,
                signUp: redirectToSignUp,
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
