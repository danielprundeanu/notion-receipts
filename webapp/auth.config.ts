import type { NextAuthConfig } from "next-auth";

// Edge-safe config (no Prisma / bcrypt) — imported by middleware.ts.
// The real Credentials provider lives in auth.ts (Node runtime).
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname === "/login";

      if (isOnLogin) {
        // Already-authenticated users shouldn't sit on the login page.
        if (isLoggedIn) return Response.redirect(new URL("/recipes", nextUrl));
        return true;
      }

      // Everything else requires a session.
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
