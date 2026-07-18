import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Gate the whole app. The authorized() callback in authConfig decides access.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Run on everything except the Auth.js endpoints, Next internals and static assets.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?)).*)",
  ],
};
