/**
 * seed-users.ts — create the predefined accounts (no public signup exists).
 *
 * Usage:
 *   1. Provide accounts as a JSON env var (recommended, keeps secrets out of git):
 *        SEED_USERS='[{"email":"me@example.com","name":"Daniel","password":"..."}]' \
 *        DATABASE_URL='postgres://...' npx tsx scripts/seed-users.ts
 *   2. Re-running is safe — existing emails have their password/name updated (upsert).
 *
 * Passwords are stored only as bcrypt hashes.
 */

import bcrypt from "bcryptjs";
import { prisma } from "../lib/db";

type SeedAccount = { email: string; name?: string; password: string };

function loadAccounts(): SeedAccount[] {
  const raw = process.env.SEED_USERS;
  if (!raw) {
    console.error(
      "SEED_USERS env var is not set.\n" +
        `Example:\n  SEED_USERS='[{"email":"me@example.com","name":"Daniel","password":"secret"}]' npx tsx scripts/seed-users.ts`
    );
    process.exit(1);
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("expected a non-empty array");
    return parsed;
  } catch (e) {
    console.error("SEED_USERS is not valid JSON:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

async function main() {
  const accounts = loadAccounts();
  for (const acc of accounts) {
    const email = String(acc.email ?? "").trim().toLowerCase();
    if (!email || !acc.password) {
      console.warn("skipping account with missing email/password:", acc);
      continue;
    }
    const passwordHash = await bcrypt.hash(acc.password, 12);
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash, name: acc.name ?? null },
      create: { email, passwordHash, name: acc.name ?? null },
    });
    console.log("✓ seeded", email);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
