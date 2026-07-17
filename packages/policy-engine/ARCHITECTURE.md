# Policy Engine Architecture

## Overview

The policy engine has been refactored to use a **Chain of Responsibility** pattern with **Rule Providers**. This architecture provides a clean, extensible foundation for adding new rule types (like manual overrides, custom governance rules, and contribution scoring) without creating unmaintainable ad-hoc logic.

## Key Principles

1. **Single Responsibility**: Each rule provider handles one specific type of policy evaluation
2. **Explicit Priorities**: Provider execution order is explicit and configurable via priority values
3. **Unified Conflict Resolution**: A single, testable function resolves conflicts between providers
4. **Fail-Secure Default**: When no provider grants access, the system denies by default
5. **Backward Compatible**: All existing behavior is preserved through the legacy API

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ evaluate(policy, roleContext)                                   │
│ ↓                                                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 1. Resolve Effective Roles (hierarchy + membership)             │
│    - Filter inactive/expired assignments                        │
│    - Apply role hierarchy (admin→contributor→member)            │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Execute Rule Providers (in priority order)                   │
│                                                                  │
│    Priority 1000: ValidationProvider                            │
│    ├─ DENY if policy malformed                                  │
│    └─ ABSTAIN if valid                                          │
│                                                                  │
│    Priority 200: StaticPolicyProvider                           │
│    ├─ Handles PUBLIC, MEMBERS_ONLY, etc.                        │
│    ├─ Returns ALLOW/DENY for known rules                        │
│    └─ ABSTAIN for unknown rules                                 │
│                                                                  │
│    Priority 0: FallbackProvider                                 │
│    └─ DENY any unhandled rule types                             │
│                                                                  │
│    [Future: Priority 800+: Override/Emergency providers]        │
│    [Future: Priority 500-799: Governance rule providers]        │
│    [Future: Priority 300-499: Contribution score providers]     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Conflict Resolution                                          │
│                                                                  │
│    Strategy (with denyOverridesAllow=true):                     │
│    1. If any provider returned DENY → DENY                      │
│    2. Else if any provider returned ALLOW → ALLOW               │
│    3. Else (all abstained) → DENY                               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Build AccessDecision                                         │
│    - allowed: boolean                                           │
│    - code: "ALLOW" | "DENY"                                     │
│    - reasons: DecisionReason[]                                  │
│    - effectiveRoles: Role[]                                     │
│    - membershipState: MembershipState                           │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. RuleProvider Interface

```typescript
export interface RuleProvider {
  name: string;
  priority: number;
  evaluate(context: EvaluationContext): EvaluationResult;
}
```

**Every provider must:**
- Have a unique name (for debugging/management)
- Declare a priority (determines execution order)
- Return one of three decisions: ALLOW, DENY, or ABSTAIN

### 2. Policy Decisions

```typescript
export type PolicyDecision = 'ALLOW' | 'DENY' | 'ABSTAIN';
```

**Decision meanings:**
- **ALLOW**: This provider grants access
- **DENY**: This provider explicitly denies access
- **ABSTAIN**: This provider has no opinion (doesn't apply to this policy type)

### 3. Evaluation Context

```typescript
export interface EvaluationContext {
  policy: AccessPolicy;
  roleContext: RoleContext;
  effectiveRoles: Role[];
}
```

All providers receive the same context with:
- The policy being evaluated
- The user's role context (assignments + membership state)
- Pre-computed effective roles (including hierarchy)

### 4. PolicyEngine

The orchestrator that:
1. Manages the provider chain
2. Executes providers in priority order
3. Resolves conflicts
4. Builds the final decision

```typescript
const engine = new PolicyEngine([
  new ValidationProvider(),      // Priority: 1000
  new StaticPolicyProvider(),    // Priority: 200
  new FallbackProvider(),        // Priority: 0
]);

const decision = engine.evaluate(policy, roleContext);
```

## Built-in Providers

### ValidationProvider (Priority: 1000)

**Purpose:** Validate policy structure before evaluation

**Behavior:**
- DENY if policy.params is not null and not a plain object
- ABSTAIN if validation passes

**Why run first?** Catches malformed policies early, preventing downstream errors.

### StaticPolicyProvider (Priority: 200)

**Purpose:** Handle the four original static policy types

**Supported Rules:**
- `PUBLIC` → ALLOW
- `MEMBERS_ONLY` → ALLOW if active membership
- `ADMINS_ONLY` → ALLOW if admin role
- `CONTRIBUTORS_OR_ADMINS` → ALLOW if admin or contributor role

**Behavior:**
- Returns ALLOW or DENY for known rule types
- ABSTAIN for unknown rule types

### FallbackProvider (Priority: 0)

**Purpose:** Fail-secure safety net for unhandled rules

**Behavior:**
- DENY with reason "Unhandled or malformed policy rule"
- Only reached if all other providers abstained

**Why run last?** Ensures unknown rule types are denied rather than accidentally allowed.

## Conflict Resolution

The `resolveConflicts()` function implements the decision strategy:

```typescript
function resolveConflicts(
  results: EvaluationResult[],
  config: ResolutionConfig = { denyOverridesAllow: true }
): { decision: 'ALLOW' | 'DENY'; explanation: string }
```

**Default Strategy (denyOverridesAllow: true):**

1. **If any DENY exists** → Result is DENY
2. **Else if any ALLOW exists** → Result is ALLOW  
3. **Else (all ABSTAIN)** → Result is DENY (fail-secure)

This strategy ensures security: an explicit denial overrides any permissions.

## Priority Ranges

Recommended priority ranges for different provider types:

| Priority Range | Provider Type | Examples |
|---------------|---------------|----------|
| 1000+ | Validation & Safety | ValidationProvider, EmergencyLockdown |
| 800-999 | Manual Overrides | AdminOverrideProvider, TemporaryAccess |
| 500-799 | Governance Rules | ConstitutionalRuleProvider, MultiSigApproval |
| 300-499 | Contribution Scoring | MinContributionProvider, ReputationGate |
| 100-299 | Static Policies | StaticPolicyProvider |
| 0-99 | Fallback & Default | FallbackProvider |

Higher priority = evaluated first.

## Adding Custom Providers

### Example 1: Override Provider

```typescript
class AdminOverrideProvider implements RuleProvider {
  name = 'AdminOverrideProvider';
  priority = 900; // High priority

  evaluate(context: EvaluationContext): EvaluationResult {
    // Check if an admin override exists for this resource
    const override = this.getOverride(
      context.policy.communityId,
      context.policy.resource
    );

    if (!override) {
      return { result: 'ABSTAIN', explanation: 'No override found' };
    }

    if (override.action === 'ALLOW') {
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

  private getOverride(communityId: string, resource: string) {
    // Query database for overrides
    // ...
  }
}
```

### Example 2: Contribution Score Provider

```typescript
class MinContributionProvider implements RuleProvider {
  name = 'MinContributionProvider';
  priority = 400; // Above static policies

  evaluate(context: EvaluationContext): EvaluationResult {
    const params = context.policy.params as any;
    if (!params?.minContributionScore) {
      return { result: 'ABSTAIN', explanation: 'No contribution requirement' };
    }

    const userScore = this.getUserScore(context.roleContext);
    const required = params.minContributionScore;

    if (userScore >= required) {
      return {
        result: 'ALLOW',
        explanation: `User score ${userScore} meets minimum ${required}`,
        code: 'CONTRIBUTION_THRESHOLD_MET',
      };
    }

    return {
      result: 'DENY',
      explanation: `User score ${userScore} below minimum ${required}`,
      code: 'INSUFFICIENT_CONTRIBUTION',
    };
  }

  private getUserScore(roleContext: RoleContext): number {
    // Calculate or fetch user's contribution score
    // ...
  }
}
```

### Example 3: Governance Rule Provider

```typescript
class GovernanceRuleProvider implements RuleProvider {
  name = 'GovernanceRuleProvider';
  priority = 600; // High priority for governance

  evaluate(context: EvaluationContext): EvaluationResult {
    if (context.policy.ruleType !== 'GOVERNANCE_RULE') {
      return { result: 'ABSTAIN', explanation: 'Not a governance rule' };
    }

    // Fetch and evaluate governance rule AST
    const rule = this.getGovernanceRule(context.policy.params?.ruleId);
    if (!rule) {
      return { result: 'DENY', explanation: 'Governance rule not found' };
    }

    const govContext = this.buildGovernanceContext(context);
    const result = evaluateGovernanceRule(rule.ast, govContext);

    if (result.allowed) {
      return {
        result: 'ALLOW',
        explanation: result.trace.details,
        code: 'GOVERNANCE_RULE_ALLOW',
      };
    }

    return {
      result: 'DENY',
      explanation: result.trace.details,
      code: 'GOVERNANCE_RULE_DENY',
    };
  }

  private getGovernanceRule(ruleId: string) {
    // Fetch from database
    // ...
  }

  private buildGovernanceContext(context: EvaluationContext) {
    // Convert evaluation context to governance context
    // ...
  }
}
```

## Integration Points

### Adding to Default Engine

```typescript
import { createDefaultEngine } from '@guildpass/policy-engine';
import { MyCustomProvider } from './providers/myCustomProvider';

const engine = createDefaultEngine();
engine.addProvider(new MyCustomProvider());

// Use the enhanced engine
const decision = engine.evaluate(policy, roleContext);
```

### Creating Custom Engine

```typescript
import { PolicyEngine } from '@guildpass/policy-engine';
import {
  ValidationProvider,
  StaticPolicyProvider,
  FallbackProvider,
} from '@guildpass/policy-engine';

const engine = new PolicyEngine([
  new ValidationProvider(),
  new AdminOverrideProvider(),
  new GovernanceRuleProvider(),
  new MinContributionProvider(),
  new StaticPolicyProvider(),
  new FallbackProvider(),
]);
```

## Testing Strategy

### Unit Tests

Test each provider in isolation:

```typescript
describe('MyCustomProvider', () => {
  const provider = new MyCustomProvider();

  test('returns ALLOW when condition met', () => {
    const context = createTestContext({ /* ... */ });
    const result = provider.evaluate(context);
    expect(result.result).toBe('ALLOW');
  });

  test('returns ABSTAIN for non-applicable policies', () => {
    const context = createTestContext({ ruleType: 'OTHER' });
    const result = provider.evaluate(context);
    expect(result.result).toBe('ABSTAIN');
  });
});
```

### Integration Tests

Test the full chain:

```typescript
describe('Policy Engine Integration', () => {
  test('override provider overrides static policy', () => {
    const engine = new PolicyEngine([
      new ValidationProvider(),
      new OverrideProvider(), // Higher priority
      new StaticPolicyProvider(),
    ]);

    // Even though static policy would DENY,
    // override provider should ALLOW
    const decision = engine.evaluate(policy, context);
    expect(decision.allowed).toBe(true);
  });
});
```

### Backward Compatibility Tests

The original test suite (`policy.test.ts`) ensures backward compatibility. All tests must pass without modification.

## Migration Guide

### For Consumers

**No changes required!** The legacy `evaluate()` and `explain()` functions work exactly as before:

```typescript
import { evaluate, explain } from '@guildpass/policy-engine';

// Same API as before
const decision = evaluate(policy, roleContext);
const explanation = explain(policy, roleContext);
```

### For Extenders

**Use the new architecture** to add features:

```typescript
// Old way (before refactor): Modify evaluate() function directly
// ❌ Would create unmaintainable if/else chains

// New way: Create a provider
class MyFeatureProvider implements RuleProvider {
  name = 'MyFeatureProvider';
  priority = 500;
  
  evaluate(context: EvaluationContext): EvaluationResult {
    // Your logic here
  }
}

// Add to engine
const engine = createDefaultEngine();
engine.addProvider(new MyFeatureProvider());
```

## Benefits

### 1. **Separation of Concerns**
Each provider focuses on one rule type or concern.

### 2. **Explicit Precedence**
Priority numbers make execution order clear and configurable.

### 3. **Easy Testing**
Providers can be tested in isolation, and full chains can be integration-tested.

### 4. **Clean Extension**
Adding new features doesn't require modifying existing code.

### 5. **Fail-Secure**
The architecture defaults to DENY, ensuring security even if providers have bugs.

### 6. **Transparent Reasoning**
Every decision includes detailed reasons from all participating providers.

### 7. **Backward Compatible**
Existing code continues to work without modification.

## Future Enhancements

### 1. Async Providers

```typescript
interface AsyncRuleProvider extends RuleProvider {
  evaluateAsync(context: EvaluationContext): Promise<EvaluationResult>;
}
```

Support providers that need to query external services or databases.

### 2. Provider Middleware

```typescript
class LoggingMiddleware {
  wrap(provider: RuleProvider): RuleProvider {
    return {
      ...provider,
      evaluate: (ctx) => {
        const result = provider.evaluate(ctx);
        console.log(`${provider.name}: ${result.result}`);
        return result;
      },
    };
  }
}
```

Add cross-cutting concerns like logging, metrics, or caching.

### 3. Conditional Providers

```typescript
class ConditionalProvider implements RuleProvider {
  constructor(
    private condition: (ctx: EvaluationContext) => boolean,
    private provider: RuleProvider
  ) {}

  evaluate(ctx: EvaluationContext): EvaluationResult {
    if (!this.condition(ctx)) {
      return { result: 'ABSTAIN', explanation: 'Condition not met' };
    }
    return this.provider.evaluate(ctx);
  }
}
```

Providers that only activate under certain conditions.

### 4. Provider Composition

```typescript
class CompositeProvider implements RuleProvider {
  constructor(
    private combinator: 'AND' | 'OR',
    private providers: RuleProvider[]
  ) {}

  evaluate(ctx: EvaluationContext): EvaluationResult {
    // Combine multiple providers with boolean logic
  }
}
```

Compose multiple providers into logical groups.

## Conclusion

This refactor establishes a solid architectural foundation for future policy engine enhancements while maintaining complete backward compatibility. The Chain of Responsibility pattern provides clear extension points and explicit conflict resolution, preventing the ad-hoc "check before/after" patterns that would otherwise emerge.
