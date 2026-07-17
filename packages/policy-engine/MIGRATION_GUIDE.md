# Migration Guide: Policy Engine Refactor

This guide helps you understand and adopt the refactored policy engine architecture.

## Overview

The policy engine has been refactored from a monolithic function to a **Chain of Responsibility** architecture. This is a **behavior-preserving refactor** - all existing functionality works exactly the same.

## Do You Need to Change Anything?

**NO** - if you're using the policy engine through the public API (`evaluate`, `explain`, `resolveEffectiveRoles`), your code continues to work without any changes.

**YES** - if you want to add new features (like manual overrides, governance rules, or contribution scoring), you should adopt the new architecture.

---

## For Application Developers (No Changes Required)

### Your Code Still Works

```typescript
// ✅ This code works exactly as before
import { evaluate, explain } from '@guildpass/policy-engine';

const decision = evaluate(policy, roleContext);
const explanation = explain(policy, roleContext);
```

### Nothing to Do

1. ✅ All API signatures unchanged
2. ✅ All return values unchanged
3. ✅ All behavior unchanged
4. ✅ All tests pass without modification

### When to Adopt New Architecture

Consider using the new `PolicyEngine` class if you need to:

- Add custom rule types
- Override existing policies
- Combine multiple rule sources
- Implement feature flags for access control
- Add time-based or context-dependent rules

---

## For Feature Developers (New Features)

### Step 1: Understand the Architecture

The new architecture uses **providers** that evaluate policies:

```typescript
interface RuleProvider {
  name: string;          // Unique identifier
  priority: number;      // Execution order (higher = first)
  evaluate(context): EvaluationResult;
}
```

Each provider returns:
- **ALLOW**: Grant access
- **DENY**: Deny access
- **ABSTAIN**: No opinion (let other providers decide)

### Step 2: Create Your Provider

```typescript
import {
  RuleProvider,
  EvaluationContext,
  EvaluationResult,
} from '@guildpass/policy-engine';

class MyFeatureProvider implements RuleProvider {
  name = 'MyFeatureProvider';
  priority = 500; // Choose appropriate priority

  evaluate(context: EvaluationContext): EvaluationResult {
    // Only handle your rule type
    if (context.policy.ruleType !== 'MY_RULE_TYPE') {
      return {
        result: 'ABSTAIN',
        explanation: 'Not my rule type',
      };
    }

    // Your logic here
    if (shouldAllow(context)) {
      return {
        result: 'ALLOW',
        explanation: 'Feature grants access',
        code: 'MY_FEATURE_ALLOW',
      };
    }

    return {
      result: 'DENY',
      explanation: 'Feature denies access',
      code: 'MY_FEATURE_DENY',
    };
  }
}
```

### Step 3: Register Your Provider

```typescript
import { createDefaultEngine } from '@guildpass/policy-engine';
import { MyFeatureProvider } from './myFeatureProvider';

const engine = createDefaultEngine();
engine.addProvider(new MyFeatureProvider());

// Use the enhanced engine
const decision = engine.evaluate(policy, roleContext);
```

### Step 4: Test Your Provider

```typescript
describe('MyFeatureProvider', () => {
  const provider = new MyFeatureProvider();

  test('abstains for other rule types', () => {
    const context = { policy: { ruleType: 'OTHER' }, /* ... */ };
    const result = provider.evaluate(context);
    expect(result.result).toBe('ABSTAIN');
  });

  test('handles my rule type', () => {
    const context = { policy: { ruleType: 'MY_RULE_TYPE' }, /* ... */ };
    const result = provider.evaluate(context);
    expect(result.result).toMatch(/ALLOW|DENY/);
  });
});
```

---

## Common Migration Scenarios

### Scenario 1: Adding Manual Overrides

**Goal:** Allow admins to manually override any policy decision.

**Implementation:**

```typescript
class AdminOverrideProvider implements RuleProvider {
  name = 'AdminOverrideProvider';
  priority = 900; // High priority to override other rules

  constructor(private overrideService: OverrideService) {}

  async evaluate(context: EvaluationContext): EvaluationResult {
    const override = await this.overrideService.getOverride(
      context.policy.communityId,
      context.policy.resource
    );

    if (!override) {
      return { result: 'ABSTAIN', explanation: 'No override' };
    }

    if (override.action === 'FORCE_ALLOW') {
      return {
        result: 'ALLOW',
        explanation: `Admin override: ${override.reason}`,
        code: 'ADMIN_OVERRIDE_ALLOW',
      };
    }

    return {
      result: 'DENY',
      explanation: `Admin override: ${override.reason}`,
      code: 'ADMIN_OVERRIDE_DENY',
    };
  }
}

// Register it
const engine = createDefaultEngine();
engine.addProvider(new AdminOverrideProvider(overrideService));
```

### Scenario 2: Integrating Governance Rules

**Goal:** Use the constitutional rule engine for custom governance.

**Implementation:**

```typescript
class GovernanceRuleProvider implements RuleProvider {
  name = 'GovernanceRuleProvider';
  priority = 600;

  constructor(private governanceService: GovernanceService) {}

  async evaluate(context: EvaluationContext): EvaluationResult {
    if (context.policy.ruleType !== 'GOVERNANCE_RULE') {
      return { result: 'ABSTAIN', explanation: 'Not a governance rule' };
    }

    const ruleId = context.policy.params?.ruleId;
    if (!ruleId) {
      return {
        result: 'DENY',
        explanation: 'No governance rule ID provided',
        code: 'MISSING_RULE_ID',
      };
    }

    const result = await this.governanceService.evaluateRule({
      ruleId,
      wallet: context.policy.params?.wallet,
      communityId: context.policy.communityId,
      roleContext: context.roleContext,
    });

    return {
      result: result.allowed ? 'ALLOW' : 'DENY',
      explanation: result.trace.details,
      code: result.allowed ? 'GOVERNANCE_ALLOW' : 'GOVERNANCE_DENY',
    };
  }
}

// Register it
const engine = createDefaultEngine();
engine.addProvider(new GovernanceRuleProvider(governanceService));
```

### Scenario 3: Adding Contribution Score Requirements

**Goal:** Require minimum contribution scores for access.

**Implementation:**

```typescript
class MinContributionProvider implements RuleProvider {
  name = 'MinContributionProvider';
  priority = 400;

  constructor(private scoreService: ContributionScoreService) {}

  async evaluate(context: EvaluationContext): EvaluationResult {
    const minScore = context.policy.params?.minContributionScore;
    
    // Only apply if policy specifies a minimum score
    if (minScore === undefined) {
      return { result: 'ABSTAIN', explanation: 'No score requirement' };
    }

    const wallet = context.policy.params?.wallet;
    if (!wallet) {
      return {
        result: 'DENY',
        explanation: 'Wallet address required',
        code: 'MISSING_WALLET',
      };
    }

    const userScore = await this.scoreService.getScore(
      wallet,
      context.policy.communityId
    );

    if (userScore >= minScore) {
      return {
        result: 'ALLOW',
        explanation: `User score ${userScore} meets minimum ${minScore}`,
        code: 'CONTRIBUTION_THRESHOLD_MET',
      };
    }

    return {
      result: 'DENY',
      explanation: `User score ${userScore} below minimum ${minScore}`,
      code: 'INSUFFICIENT_CONTRIBUTION',
    };
  }
}

// Register it
const engine = createDefaultEngine();
engine.addProvider(new MinContributionProvider(scoreService));
```

---

## Priority Selection Guide

Choose the right priority for your provider:

### Priority Ranges

| Range | Use Case | Examples |
|-------|----------|----------|
| **1000+** | System validation & safety | ValidationProvider, EmergencyLockdown |
| **800-999** | Security & overrides | AdminOverride, IPWhitelist, RateLimit |
| **500-799** | Governance & compliance | GovernanceRules, MultiSigApproval |
| **300-499** | Feature access control | ContributionScore, TimeBasedAccess |
| **100-299** | Static policies | StaticPolicyProvider |
| **0-99** | Fallback & defaults | FallbackProvider |

### How to Choose

1. **Higher = More Important**: Higher priority providers execute first
2. **Overrides Go High**: If your provider should override static policies, use 800+
3. **Features Go Middle**: Feature-based access control typically uses 300-799
4. **Static Policies**: The built-in static policies use priority 200
5. **Fallback Goes Last**: Default/fallback providers should use 0-99

---

## Testing Strategy

### Unit Test Your Provider

```typescript
describe('MyProvider', () => {
  const provider = new MyProvider();

  test('returns ABSTAIN for irrelevant policies', () => {
    const context = createTestContext({ ruleType: 'OTHER' });
    const result = provider.evaluate(context);
    expect(result.result).toBe('ABSTAIN');
  });

  test('returns ALLOW when conditions met', () => {
    const context = createTestContext({
      ruleType: 'MY_TYPE',
      // ... conditions that should allow
    });
    const result = provider.evaluate(context);
    expect(result.result).toBe('ALLOW');
  });

  test('returns DENY when conditions not met', () => {
    const context = createTestContext({
      ruleType: 'MY_TYPE',
      // ... conditions that should deny
    });
    const result = provider.evaluate(context);
    expect(result.result).toBe('DENY');
  });
});
```

### Integration Test with Engine

```typescript
describe('PolicyEngine with MyProvider', () => {
  test('combines multiple providers correctly', () => {
    const engine = new PolicyEngine([
      new ValidationProvider(),
      new MyProvider(),
      new StaticPolicyProvider(),
      new FallbackProvider(),
    ]);

    const decision = engine.evaluate(policy, roleContext);
    
    // Assert expected behavior
    expect(decision.allowed).toBe(true);
    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ code: 'MY_PROVIDER_CODE' })
    );
  });

  test('priority ordering works correctly', () => {
    // Test that your provider's priority is respected
  });
});
```

### Test Conflict Resolution

```typescript
describe('Conflict Resolution', () => {
  test('DENY overrides ALLOW', () => {
    const allowProvider = createMockProvider('ALLOW');
    const denyProvider = createMockProvider('DENY');

    const engine = new PolicyEngine([allowProvider, denyProvider]);
    const decision = engine.evaluate(policy, roleContext);

    expect(decision.allowed).toBe(false);
  });
});
```

---

## Rollout Strategy

### Phase 1: Validate Backward Compatibility

1. Deploy the refactored package
2. Run existing test suite
3. Monitor production for any regressions
4. Confirm all existing behavior works

**Expected outcome:** Zero changes in behavior

### Phase 2: Add First Custom Provider

1. Implement your first custom provider
2. Deploy with default engine + your provider
3. Monitor decision logs
4. Validate your provider works as expected

**Expected outcome:** New functionality works, existing functionality unchanged

### Phase 3: Gradual Feature Rollout

1. Add additional providers one at a time
2. Use feature flags to control provider activation
3. Monitor metrics for each new provider
4. Roll back if issues detected

**Expected outcome:** Controlled, safe feature additions

### Phase 4: Full Adoption

1. All new features use provider pattern
2. Document custom providers for team
3. Create provider templates for common patterns
4. Train team on architecture

**Expected outcome:** Team fully utilizing new architecture

---

## Troubleshooting

### Issue: Provider Never Executes

**Symptom:** Your provider's `evaluate()` method is never called.

**Solution:** Check that:
1. Provider is added to the engine: `engine.addProvider(myProvider)`
2. Provider name is unique (no duplicates)
3. Engine instance being used is the one with your provider

### Issue: Wrong Decision Made

**Symptom:** Expected ALLOW but got DENY (or vice versa).

**Solution:** 
1. Check priority ordering: `engine.getProviders()`
2. Check if another provider is overriding your decision
3. Remember: DENY overrides ALLOW by default
4. Use logging to see all provider results

### Issue: Provider Throws Error

**Symptom:** PolicyEngine catches and logs provider errors.

**Solution:**
1. Add try-catch in your provider's `evaluate()` method
2. Return ABSTAIN on error instead of throwing
3. Log errors for debugging
4. Test your provider with edge cases

### Issue: Performance Degradation

**Symptom:** Policy evaluation is slow.

**Solution:**
1. Profile your providers to find slow ones
2. Add caching for expensive operations
3. Make providers async if they do I/O
4. Consider removing providers with low value

---

## Best Practices

### 1. Always Abstain for Irrelevant Policies

```typescript
// ✅ Good
evaluate(context: EvaluationContext): EvaluationResult {
  if (context.policy.ruleType !== 'MY_TYPE') {
    return { result: 'ABSTAIN', explanation: 'Not applicable' };
  }
  // ...
}

// ❌ Bad - handling policies you don't understand
evaluate(context: EvaluationContext): EvaluationResult {
  // Tries to handle all policies - dangerous!
  return { result: 'ALLOW', explanation: 'Whatever' };
}
```

### 2. Provide Clear, Actionable Explanations

```typescript
// ✅ Good
return {
  result: 'DENY',
  explanation: 'User contribution score 45 is below required minimum 100',
  code: 'INSUFFICIENT_CONTRIBUTION',
};

// ❌ Bad - vague explanation
return {
  result: 'DENY',
  explanation: 'Not allowed',
  code: 'ERROR',
};
```

### 3. Handle Edge Cases

```typescript
evaluate(context: EvaluationContext): EvaluationResult {
  // ✅ Check for required parameters
  if (!context.policy.params?.requiredField) {
    return {
      result: 'ABSTAIN', // or DENY depending on semantics
      explanation: 'Required parameter missing',
    };
  }

  // ✅ Handle null/undefined gracefully
  const value = context.policy.params.value ?? defaultValue;

  // ✅ Validate inputs
  if (typeof value !== 'number' || value < 0) {
    return {
      result: 'DENY',
      explanation: 'Invalid parameter value',
      code: 'INVALID_PARAMETER',
    };
  }

  // Your logic...
}
```

### 4. Make Providers Testable

```typescript
// ✅ Good - inject dependencies
class MyProvider implements RuleProvider {
  constructor(
    private externalService: ExternalService,
    private config: MyConfig
  ) {}
}

// Testing is easy
const mockService = createMockService();
const provider = new MyProvider(mockService, testConfig);

// ❌ Bad - hard-coded dependencies
class MyProvider implements RuleProvider {
  evaluate(context) {
    const result = ExternalService.getInstance().query(); // Hard to test!
  }
}
```

### 5. Use TypeScript for Safety

```typescript
// ✅ Good - properly typed
interface MyPolicyParams {
  minScore: number;
  maxAttempts: number;
}

evaluate(context: EvaluationContext): EvaluationResult {
  const params = context.policy.params as MyPolicyParams;
  
  if (params.minScore < 0) { /* ... */ }
}

// ❌ Bad - any types
evaluate(context: EvaluationContext): EvaluationResult {
  const params = context.policy.params as any;
  const minScore = params.whatever; // Typo won't be caught!
}
```

---

## Getting Help

### Documentation

- **[README.md](./README.md)** - Package overview and quick start
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Detailed architecture documentation
- **[EXAMPLES.md](./EXAMPLES.md)** - More provider examples
- **[REFACTOR_SUMMARY.md](./REFACTOR_SUMMARY.md)** - What changed and why

### Common Questions

**Q: Do I have to use the new architecture?**  
A: No. The legacy API (`evaluate`, `explain`) works exactly as before.

**Q: Can I mix old and new approaches?**  
A: Yes. The old API uses the new architecture internally.

**Q: What if I don't understand a provider's priority?**  
A: See the priority ranges table above. When in doubt, start with 500.

**Q: Can providers be async?**  
A: Not yet, but async support is planned for a future version.

**Q: How do I debug provider execution?**  
A: Use `engine.getProviders()` to see order, or wrap the engine in a logging wrapper.

---

## Conclusion

The policy engine refactor provides a clean, extensible architecture while maintaining 100% backward compatibility. You can adopt it gradually:

1. **Phase 0**: Do nothing (everything works)
2. **Phase 1**: Add your first custom provider
3. **Phase 2**: Migrate features to providers over time
4. **Phase 3**: Full adoption of new patterns

The architecture is ready for manual overrides, governance rules, and contribution scoring without creating unmaintainable code.
