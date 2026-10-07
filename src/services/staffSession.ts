import type { StaffSession } from "./types";

/**
 * A business listener may start only after auth UID, staff registry and client
 * record have all resolved to one matching canonical session.
 */
export function isClientReadySession(
  session: StaffSession | null | undefined,
  authenticatedUid: string | null | undefined
): boolean {
  if (!session || typeof authenticatedUid !== "string" || !authenticatedUid.trim()) return false;
  const clientId = session.clientId;
  return (
    session.uid === authenticatedUid &&
    typeof clientId === "string" &&
    clientId.trim().length > 0 &&
    session.staffRecord?.clientId === clientId &&
    session.clientRecord?.clientId === clientId
  );
}
