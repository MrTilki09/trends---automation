import { NextResponse } from "next/server";
import { assetLinks } from "@/lib/app-links";
import { getConfig } from "@/lib/config";

/** Served at /.well-known/assetlinks.json (rewrite in next.config.ts). Must be JSON, no redirect. */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(assetLinks(getConfig()), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
