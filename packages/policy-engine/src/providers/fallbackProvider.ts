/**
 * Fallback Provider
 * 
 * Runs last in the chain as a safety net.
 * Denies access for any unhandled rule types.
 */

import type { RuleProvider, EvaluationContext, EvaluationResult } from '../types';

/**
 * Provider that denies unhandled rule types
 * Priority: 0 (lowest - runs last)
 */
export class FallbackProvider implements RuleProvider {
  name = 'FallbackProvider';
  priority = 0;

  evaluate(context: EvaluationContext): EvaluationResult {
    const { policy } = context;

    // This provider should only be reached if all other providers abstained
    // which likely means an unknown/unhandled rule type
    return {
      result: 'DENY',
      explanation: `Unhandled or malformed policy rule: ${policy.ruleType}`,
      code: 'RULE_UNHANDLED',
    };
  }
}
