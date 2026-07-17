/**
 * Policy Engine - Chain of Responsibility Architecture
 * 
 * This module provides a unified, extensible policy evaluation system using
 * the Chain of Responsibility pattern with Rule Providers.
 * 
 * Key components:
 * - RuleProvider: Interface for pluggable evaluation rules
 * - PolicyEngine: Orchestrates provider execution and conflict resolution
 * - Built-in providers: Validation, Static Policies, Fallback
 * 
 * Backward compatibility:
 * - Legacy evaluate() and explain() functions are maintained
 * - All existing behavior is preserved
 */

import type { AccessPolicy, RoleContext, AccessDecision } from '@guildpass/shared-types';
import { PolicyEngine, createDefaultEngine } from './engine';
import { resolveEffectiveRoles } from './roles';

// Export new architecture components
export * from './types';
export * from './engine';
export * from './resolution';
export * from './roles';
export * from './providers';

// Create default engine instance for backward compatibility
const defaultEngine = createDefaultEngine();

/**
 * Evaluate an access policy (backward compatible function)
 * 
 * This function maintains the exact same signature and behavior as the original
 * implementation, but now uses the Chain of Responsibility architecture internally.
 * 
 * @param policy - The access policy to evaluate
 * @param ctx - The user's role context
 * @returns AccessDecision with allow/deny and reasons
 */
export function evaluate(policy: AccessPolicy, ctx: RoleContext): AccessDecision {
  return defaultEngine.evaluate(policy, ctx);
}

/**
 * Generate human-readable explanation of policy evaluation (backward compatible)
 * 
 * @param policy - The access policy to evaluate
 * @param ctx - The user's role context
 * @returns Multi-line string explaining the decision
 */
export function explain(policy: AccessPolicy, ctx: RoleContext): string {
  const decision = evaluate(policy, ctx);
  const status = decision.allowed ? 'ALLOWED' : 'DENIED';
  const paramsString = policy.params
    ? ` params=${JSON.stringify(policy.params)}`
    : '';
  const lines = [
    `${status} for ruleType=${policy.ruleType}${paramsString}`,
    `roles=[${(decision.effectiveRoles || []).join(', ')}]`,
    ...decision.reasons.map((r) => `- ${r.code}: ${r.message}`),
  ];
  return lines.join('\n');
}

// Re-export resolveEffectiveRoles for backward compatibility
export { resolveEffectiveRoles };
