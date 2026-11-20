/**
 * Who is asking: every request under /api carries a session with its account and company. How a
 * session is made (passkey, login key, OIDC) comes with K-203; the app takes it as a function.
 */
/** sessionId names the session itself, so a device can tell which entry of the list it is */
export type Session = { accountId: string; companyId: string; sessionId?: string };
export type Authenticate = (request: Request) => Promise<Session | undefined>;
