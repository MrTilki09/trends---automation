#!/usr/bin/env node
// Prints a DASHBOARD_PASSWORD_HASH value for .env. Needs only Node (no npm install):
//   node scripts/hash-password.mjs                 (prompts; the password stays out of shell history)
//   node scripts/hash-password.mjs 'my password'
// Format must match lib/auth/password.ts: scrypt.<salt>.<key>, base64url, 64-byte key.
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

async function readPassword() {
  if (process.argv[2]) return process.argv[2];
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  // Hide what is typed.
  rl._writeToOutput = (s) => {
    if (s.includes("Password")) process.stderr.write(s);
  };
  const pw = await new Promise((resolve) => rl.question("Password: ", resolve));
  rl.close();
  process.stderr.write("\n");
  return pw;
}

const password = await readPassword();
if (!password || password.length < 10) {
  console.error("Use a password of at least 10 characters.");
  process.exit(1);
}
const salt = randomBytes(16);
const key = scryptSync(password, salt, 64);
console.log(`scrypt.${salt.toString("base64url")}.${key.toString("base64url")}`);
