/*
 * Word filter for user text (App Store guideline 1.2 / Play UGC policy: "a method for filtering
 * objectionable material"). Deliberately small and conservative: slurs and the most explicit terms in
 * English and Turkish, matched as whole words after folding case, Turkish letters and simple leetspeak.
 * Everything else is handled by reports + the owner's moderation queue.
 */

const BLOCKED = [
  // English
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "retard",
  "kike",
  "spic",
  "chink",
  "tranny",
  "cunt",
  "motherfucker",
  // Turkish
  "orospu",
  "orospucocugu",
  "amk",
  "amina",
  "aminakoyim",
  "siktir",
  "sikerim",
  "yarrak",
  "pezevenk",
  "ibne",
  "gavat",
];

const FOLD: Record<string, string> = {
  ı: "i",
  İ: "i",
  ş: "s",
  ğ: "g",
  ü: "u",
  ö: "o",
  ç: "c",
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/** Lowercases, folds Turkish letters and leetspeak, and drops repeated letters ("siiiktir" → "siktir"). */
export function foldText(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[ıİşğüöç013457@$]/g, (c) => FOLD[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\p{L})\1{2,}/gu, "$1");
}

const BLOCKED_SET = new Set(BLOCKED);

export function checkText(text: string): { ok: true } | { ok: false; error: string } {
  // Join single letters split by dots, dashes or spaces ("s.i.k.t.i.r" → "siktir") before splitting words.
  const folded = foldText(text).replace(/(?<=(?:^|[^a-z])[a-z])[\s.\-_*]+(?=[a-z](?:[^a-z]|$))/g, "");
  const words = folded.split(/[^\p{L}]+/u).filter(Boolean);
  const hit = words.some((w) => BLOCKED_SET.has(w));
  return hit ? { ok: false, error: "Please keep it civil: that comment contains words we don't allow." } : { ok: true };
}
