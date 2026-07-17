/**
 * Core types for the Chain of Responsibility policy evaluation architecture
 */

import type { RoleContext, AccessPolicy, Role } from '@guildpass/shared-types';

/**
 * The three possible outcomes of a rule provider evaluation
 */
export type PolicyDecision = 'ALLOW' | 'DENY' | 'ABSTAIN';

/**
 * Result of a single rule provider's evaluation
 */
export interface EvaluationResult {
  /** The decision made by this provider */
  result: PolicyDecision;
  /** Human-readable explanation of why this decision was made */
  explanation: string;
  /** Optional reason code for structured logging/auditing */
  code?: string;
}

/**
 * Context provided to all rule providers during evaluation
 */
export interface EvaluationContext {
  /** The policy being evaluated */
  policy: AccessPolicy;
  /** The user's role and membership context */
  roleContext: RoleContext;
  /** The effective roles resolved from the role context */
  effectiveRoles: Role[];
}

/**
 * Interface that all rule providers must implement
 */
export interface RuleProvider {
  /** Unique identifier for this provider (used in logging/debugging) */
  name: string;
  /** 
   * Priority determines execution order (higher = evaluated first)
   * Recommended ranges:
   * - 1000+: System overrides (manual overrides, emergency access)
   * - 500-999: Custom governance rules
   * - 100-499: Static policy rules
   * - 0-99: Default/fallback rules
   */
  priority: number;
  /**
   * Evaluate whether access should be granted based on this provider's rules
   * @returns EvaluationResult with ALLOW, DENY, or ABSTAIN
   */
  evaluate(context: EvaluationContext): EvaluationResult;
}

/**
 * Configuration for the conflict resolution strategy
 */
export interface ResolutionConfig {
  /** 
   * If true, any DENY result will override all ALLOW results
   * This is the secure default for most access control systems
   */
  denyOverridesAllow: boolean;
}
