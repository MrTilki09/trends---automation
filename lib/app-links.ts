import type { AppConfig } from "./config";

/** The mobile app's name (working name: Trend Feed) and its URL scheme. */
export const APP_NAME = "Surfaced";
export const APP_SCHEME = "surfaced";

/*
 * App links for the Surfaced app: a shared story is https://<this domain>/topic/:id. With the app
 * installed, iOS (Universal Links) and Android (App Links) open it in the app; otherwise the browser
 * shows the public /topic/:id page. The phones check that this domain vouches for the app through
 * the two /.well-known files below.
 */

/** Paths the app handles. Keep in sync with the app's app.config.ts (intentFilters). */
export const APP_LINK_PATHS = ["/topic/*"];

/** apple-app-site-association: which iOS app may open which paths of this domain. */
export function appleAppSiteAssociation(cfg: Pick<AppConfig, "APP_IOS_TEAM_ID" | "APP_IOS_BUNDLE_ID">) {
  const appID = cfg.APP_IOS_TEAM_ID && cfg.APP_IOS_BUNDLE_ID ? `${cfg.APP_IOS_TEAM_ID}.${cfg.APP_IOS_BUNDLE_ID}` : null;
  return {
    applinks: {
      details: appID ? [{ appIDs: [appID], components: APP_LINK_PATHS.map((p) => ({ "/": p })) }] : [],
    },
  };
}

/** assetlinks.json: which Android app (package + signing certificate) may open links on this domain. */
export function assetLinks(cfg: Pick<AppConfig, "APP_ANDROID_PACKAGE" | "APP_ANDROID_SHA256">) {
  if (!cfg.APP_ANDROID_PACKAGE || cfg.APP_ANDROID_SHA256.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: cfg.APP_ANDROID_PACKAGE,
        sha256_cert_fingerprints: cfg.APP_ANDROID_SHA256.map((f) => f.toUpperCase()),
      },
    },
  ];
}
