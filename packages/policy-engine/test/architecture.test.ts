/**
 * Tests for the Chain of Responsibility architecture
 * 
 * These tests verify:
 * 1. The PolicyEngine class works correctly
 * 2. Rule providers can be added/removed dynamically
 * 3. Priority ordering is respected
 * 4. Conflict resolution works as expected
 * 5. Custom providers can be implemented
 */

import { PolicyEngine } from '../src/engine';
import { ValidationProvider, StaticPolicyProvider, FallbackProvider } from '../src/providers';
import type { RuleProvider, EvaluationContext, EvaluationResult } from '../src/types';
import type { AccessPolicy, RoleContext } from '@guildpass/shared-types';

describe('PolicyEngine Architecture', () => {
  const baseCtx: RoleContext = {
    assignments: [],
    membershipState: 'active',
  };

  function policy(ruleType: string): AccessPolicy {
    return {
      id: '1',
      communityId: 'c1',
      resource: 'res',
      ruleType,
    };
  }

  describe('Provider Management', () => {
    test('creates engine with providers', () => {
      const engine = new PolicyEngine([
        new ValidationProvider(),
        new StaticPolicyProvider(),
      ]);

      const providers = engine.getProviders();
      expect(providers).toHaveLength(2);
    });

    test('sorts providers by priority (highest first)', () => {
      const lowPriority: RuleProvider = {
        name: 'Low',
        priority: 10,
        evaluate: () => ({ result: 'ABSTAIN', explanation: 'low' }),
      };

      const highPriority: RuleProvider = {
        name: 'High',
        priority: 100,
        evaluate: () => ({ result: 'ABSTAIN', explanation: 'high' }),
      };

      const engine = new PolicyEngine([lowPriority, highPriority]);
      const providers = engine.getProviders();

      expect(providers[0].name).toBe('High');
      expect(providers[1].name).toBe('Low');
    });

    test('adds provider dynamically', () => {
      const engine = new PolicyEngine([new StaticPolicyProvider()]);
      
      const customProvider: RuleProvider = {
        name: 'Custom',
        priority: 500,
        evaluate: () => ({ result: 'ABSTAIN', explanation: 'custom' }),
      };

      engine.addProvider(customProvider);
      const providers = engine.getProviders();

      expect(providers).toHaveLength(2);
      expect(providers.some(p => p.name === 'Custom')).toBe(true);
    });

    test('removes provider by name', () => {
      const engine = new PolicyEngine([
        new ValidationProvider(),
        new StaticPolicyProvider(),
      ]);

      const removed = engine.removeProvider('ValidationProvider');
      expect(removed).toBe(true);
      expect(engine.getProviders()).toHaveLength(1);
    });

    test('returns false when removing non-existent provider', () => {
      const engine = new PolicyEngine([new StaticPolicyProvider()]);
      const removed = engine.removeProvider('NonExistent');
      expect(removed).toBe(false);
    });
  });

  describe('Evaluation Chain', () => {
    test('executes providers in priority order', () => {
      const executionOrder: string[] = [];

      const provider1: RuleProvider = {
        name: 'First',
        priority: 100,
        evaluate: () => {
          executionOrder.push('First');
          return { result: 'ABSTAIN', explanation: 'first' };
        },
      };

      const provider2: RuleProvider = {
        name: 'Second',
        priority: 50,
        evaluate: () => {
          executionOrder.push('Second');
          return { result: 'ABSTAIN', explanation: 'second' };
        },
      };

      const engine = new PolicyEngine([provider2, provider1]);
      engine.evaluate(policy('TEST'), baseCtx);

      expect(executionOrder).toEqual(['First', 'Second']);
    });

    test('all providers are called even if one returns ALLOW', () => {
      let provider2Called = false;

      const provider1: RuleProvider = {
        name: 'AllowProvider',
        priority: 100,
        evaluate: () => ({ result: 'ALLOW', explanation: 'allowed' }),
      };

      const provider2: RuleProvider = {
        name: 'CheckProvider',
        priority: 50,
        evaluate: () => {
          provider2Called = true;
          return { result: 'ABSTAIN', explanation: 'checked' };
        },
      };

      const engine = new PolicyEngine([provider1, provider2]);
      engine.evaluate(policy('TEST'), baseCtx);

      expect(provider2Called).toBe(true);
    });

    test('handles provider errors gracefully', () => {
      const errorProvider: RuleProvider = {
        name: 'ErrorProvider',
        priority: 100,
        evaluate: () => {
          throw new Error('Provider error');
        },
      };

      const goodProvider: RuleProvider = {
        name: 'GoodProvider',
        priority: 50,
        evaluate: () => ({ result: 'ALLOW', explanation: 'good' }),
      };

      const engine = new PolicyEngine([errorProvider, goodProvider]);
      const decision = engine.evaluate(policy('TEST'), baseCtx);

      // Should still work despite error
      expect(decision.allowed).toBe(true);
    });
  });

  describe('Conflict Resolution', () => {
    test('DENY overrides ALLOW when denyOverridesAllow is true', () => {
      const allowProvider: RuleProvider = {
        name: 'Allow',
        priority: 100,
        evaluate: () => ({ result: 'ALLOW', explanation: 'allow' }),
      };

      const denyProvider: RuleProvider = {
        name: 'Deny',
        priority: 50,
        evaluate: () => ({ result: 'DENY', explanation: 'deny' }),
      };

      const engine = new PolicyEngine(
        [allowProvider, denyProvider],
        { denyOverridesAllow: true }
      );

      const decision = engine.evaluate(policy('TEST'), baseCtx);
      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe('DENY');
    });

    test('ALLOW is granted if any provider allows', () => {
      const abstainProvider: RuleProvider = {
        name: 'Abstain',
        priority: 100,
        evaluate: () => ({ result: 'ABSTAIN', explanation: 'abstain' }),
      };

      const allowProvider: RuleProvider = {
        name: 'Allow',
        priority: 50,
        evaluate: () => ({ result: 'ALLOW', explanation: 'allow' }),
      };

      const engine = new PolicyEngine([abstainProvider, allowProvider]);
      const decision = engine.evaluate(policy('TEST'), baseCtx);

      expect(decision.allowed).toBe(true);
      expect(decision.code).toBe('ALLOW');
    });

    test('defaults to DENY if all providers abstain', () => {
      const abstainProvider1: RuleProvider = {
        name: 'Abstain1',
        priority: 100,
        evaluate: () => ({ result: 'ABSTAIN', explanation: 'abstain1' }),
      };

      const abstainProvider2: RuleProvider = {
        name: 'Abstain2',
        priority: 50,
        evaluate: () => ({ result: 'ABSTAIN', explanation: 'abstain2' }),
      };

      const engine = new PolicyEngine([abstainProvider1, abstainProvider2]);
      const decision = engine.evaluate(policy('TEST'), baseCtx);

      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe('DENY');
    });
  });

  describe('Custom Provider Implementation', () => {
    test('can implement time-based access provider', () => {
      class BusinessHoursProvider implements RuleProvider {
        name = 'BusinessHoursProvider';
        priority = 300;

        evaluate(context: EvaluationContext): EvaluationResult {
          if (context.policy.ruleType !== 'BUSINESS_HOURS_ONLY') {
            return { result: 'ABSTAIN', explanation: 'Not a business hours policy' };
          }

          const hour = new Date().getHours();
          const isBusinessHours = hour >= 9 && hour < 17;

          if (isBusinessHours) {
            return {
              result: 'ALLOW',
              explanation: 'Access granted during business hours',
              code: 'BUSINESS_HOURS_ALLOW',
            };
          }

          return {
            result: 'DENY',
            explanation: 'Access denied outside business hours',
            code: 'OUTSIDE_BUSINESS_HOURS',
          };
        }
      }

      const engine = new PolicyEngine([
        new BusinessHoursProvider(),
        new FallbackProvider(),
      ]);

      const decision = engine.evaluate(
        policy('BUSINESS_HOURS_ONLY'),
        baseCtx
      );

      // Result depends on current time
      expect(decision.code).toMatch(/ALLOW|DENY/);
    });

    test('can implement IP whitelist provider', () => {
      class IPWhitelistProvider implements RuleProvider {
        name = 'IPWhitelistProvider';
        priority = 800;
        private whitelist = ['192.168.1.1', '10.0.0.1'];

        evaluate(context: EvaluationContext): EvaluationResult {
          const params = context.policy.params as any;
          if (!params?.requiresIPWhitelist) {
            return { result: 'ABSTAIN', explanation: 'No IP whitelist required' };
          }

          const clientIP = params.clientIP as string;
          if (this.whitelist.includes(clientIP)) {
            return {
              result: 'ALLOW',
              explanation: `IP ${clientIP} is whitelisted`,
              code: 'IP_WHITELISTED',
            };
          }

          return {
            result: 'DENY',
            explanation: `IP ${clientIP} is not whitelisted`,
            code: 'IP_NOT_WHITELISTED',
          };
        }
      }

      const engine = new PolicyEngine([new IPWhitelistProvider()]);

      const decision = engine.evaluate(
        {
          ...policy('CUSTOM'),
          params: { requiresIPWhitelist: true, clientIP: '192.168.1.1' },
        },
        baseCtx
      );

      expect(decision.allowed).toBe(true);
      expect(decision.reasons.some(r => r.code === 'IP_WHITELISTED')).toBe(true);
    });
  });

  describe('Integration with Default Providers', () => {
    test('ValidationProvider runs first', () => {
      const engine = new PolicyEngine([
        new ValidationProvider(),
        new StaticPolicyProvider(),
        new FallbackProvider(),
      ]);

      // Test malformed policy
      const decision = engine.evaluate(
        { ...policy('PUBLIC'), params: 'not-an-object' as any },
        baseCtx
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reasons.some(r => r.code === 'MALFORMED_POLICY')).toBe(true);
    });

    test('StaticPolicyProvider handles known rules', () => {
      const engine = new PolicyEngine([
        new ValidationProvider(),
        new StaticPolicyProvider(),
        new FallbackProvider(),
      ]);

      const decision = engine.evaluate(policy('PUBLIC'), baseCtx);

      expect(decision.allowed).toBe(true);
      expect(decision.reasons.some(r => r.code === 'RULE_PUBLIC')).toBe(true);
    });

    test('FallbackProvider handles unknown rules', () => {
      const engine = new PolicyEngine([
        new ValidationProvider(),
        new StaticPolicyProvider(),
        new FallbackProvider(),
      ]);

      const decision = engine.evaluate(policy('UNKNOWN_RULE'), baseCtx);

      expect(decision.allowed).toBe(false);
      expect(decision.reasons.some(r => r.code === 'RULE_UNHANDLED')).toBe(true);
    });
  });

  describe('Context and Metadata', () => {
    test('includes membership state in reasons', () => {
      const engine = new PolicyEngine([new StaticPolicyProvider()]);

      const decision = engine.evaluate(policy('PUBLIC'), {
        assignments: [],
        membershipState: 'suspended',
      });

      expect(decision.reasons.some(r => r.code === 'MEMBERSHIP_SUSPENDED')).toBe(true);
      expect(decision.membershipState).toBe('suspended');
    });

    test('includes effective roles in decision', () => {
      const engine = new PolicyEngine([new StaticPolicyProvider()]);

      const decision = engine.evaluate(policy('PUBLIC'), {
        assignments: [{ role: 'admin', source: 'manual', active: true }],
        membershipState: 'active',
      });

      expect(decision.effectiveRoles).toContain('admin');
      expect(decision.effectiveRoles).toContain('contributor');
      expect(decision.effectiveRoles).toContain('member');
    });
  });
});
