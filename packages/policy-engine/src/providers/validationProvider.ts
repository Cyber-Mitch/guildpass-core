/**
 * Validation Provider
 * 
 * Runs first in the chain to validate policy structure.
 * Denies access immediately if policy is malformed.
 */

import type { RuleProvider, EvaluationContext, EvaluationResult } from '../types';

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Provider that validates policy structure before evaluation
 * Priority: 1000 (highest - runs first)
 */
export class ValidationProvider implements RuleProvider {
  name = 'ValidationProvider';
  priority = 1000;

  evaluate(context: EvaluationContext): EvaluationResult {
    const { policy } = context;

    // Validate params if present
    if (policy.params != null && !isPlainObject(policy.params)) {
      return {
        result: 'DENY',
        explanation: 'Malformed policy: Policy params must be a JSON object',
        code: 'MALFORMED_POLICY',
      };
    }

    // Validation passed, abstain to let other providers decide
    return {
      result: 'ABSTAIN',
      explanation: 'Policy validation passed',
      code: 'VALIDATION_PASSED',
    };
  }
}
