// A fixed VAPID key for tests only (K-602); public on purpose, like the loop's release test key.
// A real installation makes its own on the first push (notifications/vapid.ts, loadVapid).
import type { VapidJwk } from "../notifications/vapid.ts";

export const TEST_VAPID_JWK: VapidJwk = {
  kty: "EC",
  crv: "P-256",
  d: "IrlZRoXuoK3vkpc0-CSaDdgfJcoyT6bt_7T_gyuFQiw",
  x: "ggeteUxVwnR9fhRpQpU4JRMz6AiMs0eXCX0xZ4Jui6U",
  y: "TIN6d48WMZdxNFexbScY_p8IcUPIMsDQ78ZcLjitsBA",
};
