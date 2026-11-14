import { RateLimiter } from "@/lib/util/rate-limit";

/** Emails sent from the app (sign-up, resend): 5 per IP, then 1 every 10 minutes. */
export const emailLimiter = new RateLimiter(5, 1 / 600);
