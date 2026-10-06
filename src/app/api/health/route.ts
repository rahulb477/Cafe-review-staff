import { firebaseConfigDiagnostics } from "@/lib/firebaseConfig";

export const dynamic = "force-dynamic";

/**
 * Deployment diagnostics. Reports the Firebase project the Staff App build is
 * wired to and which public variables are missing — never credentials.
 */
export async function GET() {
  return Response.json({
    ok: firebaseConfigDiagnostics.ok,
    service: "cafe-review-staff",
    backend: "firebase",
    firebase: {
      expectedProjectId: firebaseConfigDiagnostics.expectedProjectId,
      projectId: firebaseConfigDiagnostics.projectId,
      projectMatches: firebaseConfigDiagnostics.projectMatches,
      authDomain: firebaseConfigDiagnostics.authDomain,
      configured: firebaseConfigDiagnostics.ok,
      missingKeys: firebaseConfigDiagnostics.missingKeys,
      placeholderKeys: firebaseConfigDiagnostics.placeholderKeys,
    },
    canonicalPaths: [
      "staffUsers/{uid}",
      "clients/{clientId}",
      "customers/{customerId}",
      "customerTokens/{token}",
      "loyaltyAccounts/{customerId}",
      "clients/{clientId}/stampTransactions/{transactionId}",
      "clients/{clientId}/rewardRedemptions/{redemptionId}",
      "clients/{clientId}/notifications/{notificationId}",
    ],
  });
}
