"use server";

import { revalidatePath } from "next/cache";
import { assertOwner } from "@/lib/auth/server";
import { resolveReports, setUserBanned } from "@/lib/data/moderation";
import { setCommentHidden } from "@/lib/data/social";
import { getDb } from "@/lib/db/client";

/* Owner actions on the app's report queue (/moderation). */

const id = (formData: FormData, key: string) => {
  const n = Number(formData.get(key));
  if (!Number.isInteger(n) || n <= 0) throw new Error("Invalid input");
  return n;
};

/** Hide the reported comment and close its reports. */
export async function hideCommentAction(formData: FormData): Promise<void> {
  await assertOwner();
  const db = getDb();
  await setCommentHidden(db, id(formData, "commentId"), true);
  await resolveReports(db, id(formData, "reportId"), "actioned");
  revalidatePath("/moderation");
}

/** Put a hidden comment back (e.g. auto-hidden by mistake) and dismiss its reports. */
export async function restoreCommentAction(formData: FormData): Promise<void> {
  await assertOwner();
  const db = getDb();
  await setCommentHidden(db, id(formData, "commentId"), false);
  await resolveReports(db, id(formData, "reportId"), "dismissed");
  revalidatePath("/moderation");
}

export async function dismissReportAction(formData: FormData): Promise<void> {
  await assertOwner();
  await resolveReports(getDb(), id(formData, "reportId"), "dismissed");
  revalidatePath("/moderation");
}

/** Ban (or unban) the author: they can still read, but not comment or react. */
export async function setBannedAction(formData: FormData): Promise<void> {
  await assertOwner();
  const db = getDb();
  const banned = formData.get("banned") === "1";
  await setUserBanned(db, id(formData, "userId"), banned);
  if (banned) await resolveReports(db, id(formData, "reportId"), "actioned");
  revalidatePath("/moderation");
}
