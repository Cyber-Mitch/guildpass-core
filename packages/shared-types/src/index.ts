export type AuditEventDto = {
  id?: string;
  eventType:
    | "ACCESS_CHECK"
    | "MEMBERSHIP_CREATED"
    | "MEMBERSHIP_UPDATED"
    | "MEMBERSHIP_DELETED"
    | "POLICY_EVALUATION"
    | "OTHER";
  walletId?: string | null;
  communityId?: string | null;
  resource?: string | null;
  policyRule?: string | null;
  decision?: string | null;
  reasonCode?: string | null;
  beforeState?: any | null;
  afterState?: any | null;
  createdAt?: string; // ISO datetime
};

// Also optionally export enums for event types
export type EventType =
  | "ACCESS_CHECK"
  | "MEMBERSHIP_CREATED"
  | "MEMBERSHIP_UPDATED"
  | "MEMBERSHIP_DELETED"
  | "POLICY_EVALUATION"
  | "OTHER";
