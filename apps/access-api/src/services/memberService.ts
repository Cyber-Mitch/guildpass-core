import { PrismaClient } from "@prisma/client";
import { logEvent } from "./auditService";

const prisma = new PrismaClient();

// Example existing function signature; keep existing logic and augment logging.
// Replace with your file's exact exports/imports if different.
export async function checkAccess({
  walletId,
  communityId,
  resource,
  policyRule,
}: {
  walletId?: string | null;
  communityId?: string | null;
  resource?: string | null;
  policyRule?: string | null;
}) {
  // Preserve existing access decision logic here.
  // For demonstration, assume evaluation returns this shape:
  // { allowed: boolean, reasonCode: string, details: any }
  // Replace evaluation with real logic.
  let evaluation: { allowed: boolean; reasonCode?: string; details?: any } = {
    allowed: false,
    reasonCode: "NO_RULE_MATCH",
    details: {},
  };

  // ... existing evaluation logic that sets evaluation.allowed and evaluation.reasonCode ...

  // After determining evaluation, persist audit event
  try {
    await logEvent({
      eventType: "ACCESS_CHECK",
      walletId: walletId ?? null,
      communityId: communityId ?? null,
      resource: resource ?? null,
      policyRule: policyRule ?? null,
      decision: evaluation.allowed ? "ALLOW" : "DENY",
      reasonCode: evaluation.reasonCode ?? null,
      beforeState: null,
      afterState: {
        evaluation: evaluation.details ?? null,
      },
    });
  } catch (err) {
    // Never fail access because audit failed. Log error to console or logger.
    console.error("Failed to log access audit event:", err);
  }

  // Return decision in the expected format to caller
  return {
    allowed: evaluation.allowed,
    reasonCode: evaluation.reasonCode,
    details: evaluation.details,
  };
}
