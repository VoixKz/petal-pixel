import {
    createContext,
    useContext,
    useEffect,
    useState,
    ReactNode,
} from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useFlowerStore } from "@/stores/flowerStore";
import { useNavigate } from "react-router-dom";

interface Profile {
    id: string;
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
}

interface AuthContextType {
    session: Session | null;
    user: User | null;
    profile: Profile | null;
    loading: boolean;
    signUp: (
        email: string,
        password: string,
    ) => Promise<{ error: Error | null }>;
    signIn: (
        email: string,
        password: string,
    ) => Promise<{ error: Error | null }>;
    signInWithOAuth: (
        provider: "google" | "apple",
    ) => Promise<{ error: Error | null }>;
    signOut: () => Promise<void>;
    verifyOtp: (
        email: string,
        token: string,
    ) => Promise<{ error: Error | null }>;
    resendOtp: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchProfile = async (userId: string) => {
        const { data } = await supabase
            .from("profiles")
            .select("*")
            .eq("user_id", userId)
            .single();
        setProfile(data);
    };

    useEffect(() => {
        // Set up auth listener FIRST
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                // Use setTimeout to avoid Supabase deadlock
                setTimeout(() => fetchProfile(session.user.id), 0);
            } else {
                setProfile(null);
            }
            setLoading(false);
        });

        // THEN check existing session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchProfile(session.user.id);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const signUp = async (email: string, password: string) => {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin },
        });
        return { error: error ? new Error(error.message) : null };
    };

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        return { error: error ? new Error(error.message) : null };
    };

    const signInWithOAuth = async (provider: "google" | "apple") => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: window.location.origin,
            },
        });
        return { error: error ? new Error(error.message) : null };
    };

    const signOut = async () => {
        try {
            await supabase.auth.signOut();
        } finally {
            setSession(null);
            setUser(null);
            setProfile(null);
            useFlowerStore.getState().resetFlowerStore();
        }
    };

    const verifyOtp = async (email: string, token: string) => {
        const { error } = await supabase.auth.verifyOtp({
            email,
            token,
            type: "email",
        });
        return { error: error ? new Error(error.message) : null };
    };

    const resendOtp = async (email: string) => {
        const { error } = await supabase.auth.resend({
            type: "signup",
            email,
        });
        return { error: error ? new Error(error.message) : null };
    };

    return (
        <AuthContext.Provider
            value={{
                session,
                user,
                profile,
                loading,
                signUp,
                signIn,
                signInWithOAuth,
                signOut,
                verifyOtp,
                resendOtp,
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