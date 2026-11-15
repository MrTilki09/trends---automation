import { NextResponse } from "next/server";
import { appleAppSiteAssociation } from "@/lib/app-links";
import { getConfig } from "@/lib/config";

/** Served at /.well-known/apple-app-site-association (rewrite in next.config.ts). Must be JSON, no redirect. */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(appleAppSiteAssociation(getConfig()), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
