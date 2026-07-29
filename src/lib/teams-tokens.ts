/**
 * In-memory one-time token store for Teams SSO handoff.
 * The OAuth callback (running in the popup) generates a token,
 * the Teams iframe exchanges it for a session cookie via POST /api/auth/teams-token.
 * Tokens expire after 90 seconds and are deleted on first use.
 */

interface TeamsTokenData {
  userId:    string;
  role:      string;
  firstName: string;
  lastName:  string;
  expiresAt: number;
}

const store = new Map<string, TeamsTokenData>();

export function storeTeamsToken(token: string, data: Omit<TeamsTokenData, "expiresAt">): void {
  purgeExpired();
  store.set(token, { ...data, expiresAt: Date.now() + 90_000 });
}

export function consumeTeamsToken(token: string): TeamsTokenData | null {
  purgeExpired();
  const data = store.get(token);
  if (!data) return null;
  store.delete(token);
  if (Date.now() > data.expiresAt) return null;
  return data;
}

function purgeExpired(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now > v.expiresAt) store.delete(k);
  }
}
