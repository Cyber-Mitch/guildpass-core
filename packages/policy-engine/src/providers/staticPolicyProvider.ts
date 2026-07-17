/**
 * Static Policy Provider
 * 
 * Implements the original four static policy types:
 * - PUBLIC
 * - MEMBERS_ONLY
 * - ADMINS_ONLY
 * - CONTRIBUTORS_OR_ADMINS
 */

import type { RuleProvider, EvaluationContext, EvaluationResult } from '../types';

/**
 * Provider for static policy rule types
 * Priority: 200 (mid-range for base policies)
 */
export class StaticPolicyProvider implements RuleProvider {
  name = 'StaticPolicyProvider';
  priority = 200;

  evaluate(context: EvaluationContext): EvaluationResult {
    const { policy, roleContext, effectiveRoles } = context;
    const has = (role: string) => effectiveRoles.includes(role as any);

    switch (policy.ruleType) {
      case 'PUBLIC':
        return {
          result: 'ALLOW',
          explanation: 'Resource is public',
          code: 'RULE_PUBLIC',
        };

      case 'MEMBERS_ONLY':
        if (roleContext.membershipState !== 'active') {
          return {
            result: 'DENY',
            explanation: 'Requires active membership',
            code: 'NEEDS_ACTIVE',
          };
        }
        return {
          result: 'ALLOW',
          explanation: 'Active membership grants access',
          code: 'HAS_ACTIVE_MEMBERSHIP',
        };

      case 'ADMINS_ONLY':
        if (!has('admin')) {
          return {
            result: 'DENY',
            explanation: 'Admin role required',
            code: 'NEEDS_ADMIN',
          };
        }
        return {
          result: 'ALLOW',
          explanation: 'Admin role grants access',
          code: 'HAS_ADMIN',
        };

      case 'CONTRIBUTORS_OR_ADMINS':
        if (has('admin') || has('contributor')) {
          return {
            result: 'ALLOW',
            explanation: 'Contributor or admin grants access',
            code: 'HAS_REQUIRED_ROLE',
          };
        }
        return {
          result: 'DENY',
          explanation: 'Contributor or admin required',
          code: 'NEEDS_CONTRIBUTOR_OR_ADMIN',
        };

      default:
        // ABSTAIN on unknown rule types (let other providers handle or fail)
        return {
          result: 'ABSTAIN',
          explanation: `Static policy provider does not handle rule type: ${policy.ruleType}`,
          code: 'STATIC_PROVIDER_ABSTAIN',
        };
    }
  }
}
