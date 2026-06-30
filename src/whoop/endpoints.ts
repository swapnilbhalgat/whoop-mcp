// WHOOP OAuth + API endpoints.
export const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_API_BASE = "https://api.prod.whoop.com/developer";

// WHOOP v2 data endpoints. Verify/extend against https://developer.whoop.com/api
export const V2 = {
  recovery: "/v2/recovery",
  sleep: "/v2/activity/sleep",
  workout: "/v2/activity/workout",
  cycle: "/v2/cycle",
  profile: "/v2/user/profile/basic",
  body: "/v2/user/measurement/body",
} as const;
