import { useState } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function VerifyOtp() {
    const [otp, setOtp] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const { verifyOtp, resendOtp } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const email = (location.state as { email?: string })?.email || "";

    const handleVerify = async () => {
        if (otp.length !== 8) return;
        setIsLoading(true);
        const { error } = await verifyOtp(email, otp);
        setIsLoading(false);
        if (error) {
            toast.error(error.message);
        } else {
            toast.success("Email verified!");
            navigate("/");
        }
    };

    const handleResend = async () => {
        if (!email) {
            toast.error("No email found. Please sign up again.");
            return;
        }
        const { error } = await resendOtp(email);
        if (error) toast.error(error.message);
        else toast.success("Code resent!");
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-sm space-y-6"
            >
                <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto glow-primary">
                        <Mail className="w-6 h-6 text-primary" />
                    </div>
                    <h1 className="text-xl font-bold text-foreground">
                        Verify your email
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        We sent an 8-digit code to{" "}
                        <span className="text-foreground font-medium">
                            {email || "your email"}
                        </span>
                    </p>
                </div>

                <div className="bg-card rounded-xl border border-border p-6 space-y-6">
                    <div className="flex justify-center">
                        <InputOTP maxLength={8} value={otp} onChange={setOtp}>
                            <InputOTPGroup>
                                <InputOTPSlot index={0} />
                                <InputOTPSlot index={1} />
                                <InputOTPSlot index={2} />
                                <InputOTPSlot index={3} />
                                <InputOTPSlot index={4} />
                                <InputOTPSlot index={5} />
                                <InputOTPSlot index={6} />
                                <InputOTPSlot index={7} />
                            </InputOTPGroup>
                        </InputOTP>
                    </div>
                    <button
                        onClick={handleVerify}
                        disabled={isLoading || otp.length !== 8}
                        className="w-full bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {isLoading ? "Verifying…" : "Verify"}
                    </button>
                    <p className="text-center text-xs text-muted-foreground">
                        Didn't receive the code?{" "}
                        <button
                            onClick={handleResend}
                            className="text-primary hover:underline"
                        >
                            Resend
                        </button>
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
