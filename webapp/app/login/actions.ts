"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export async function login(
  _prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/recipes",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Email sau parolă incorectă.";
    }
    // signIn throws a redirect on success — must be re-thrown.
    throw error;
  }
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
