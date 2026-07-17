# Policy Engine

A flexible, extensible access control policy evaluation engine using the Chain of Responsibility pattern.

## Overview

The policy engine evaluates access policies against user role contexts to make authorization decisions. It uses a modular architecture with pluggable "Rule Providers" that can be combined and prioritized to implement complex access control logic.

## Quick Start

### Basic Usage (Backward Compatible API)

```typescript
import { evaluate, explain } from '@guildpass/policy-engine';

// Define a policy
const policy = {
  id: 'policy-1',
  communityId: 'guild-dev',
  resource: 'admin-panel',
  ruleType: 'ADMINS_ONLY',
};

// Define user context
const roleContext = {
  assignments: [
    { role: 'admin', source: 'manual', active: true }
  ],
  membershipState: 'active',
};

// Evaluate
const decision = evaluate(policy, roleContext);
console.log(decision.allowed); // true
console.log(decision.code); // "ALLOW"

// Get human-readable explanation
const explanation = explain(policy, roleContext);
console.log(explanation);
// ALLOWED for ruleType=ADMINS_ONLY
// roles=[admin, contributor, member]
// - MEMBERSHIP_ACTIVE: Membership is active
// - HAS_ADMIN: Admin role grants access
```

### Advanced Usage (PolicyEngine API)

```typescript
import { PolicyEngine, createDefaultEngine } from '@guildpass/policy-engine';
import { MyCustomProvider } from './providers/myCustomProvider';

// Create engine with custom providers
const engine = createDefaultEngine();
engine.addProvider(new MyCustomProvider());

// Evaluate
const decision = engine.evaluate(policy, roleContext);
```

## Built-in Policy Types

### PUBLIC

Allows everyone, regardless of membership or roles.

```typescript
const policy = {
  ruleType: 'PUBLIC',
  // ...
};
// Always returns: { allowed: true, code: 'ALLOW' }
```

### MEMBERS_ONLY

Requires active membership.

```typescript
const policy = {
  ruleType: 'MEMBERS_ONLY',
  // ...
};
// Allowed if: roleContext.membershipState === 'active'
```

### ADMINS_ONLY

Requires admin role.

```typescript
const policy = {
  ruleType: 'ADMINS_ONLY',
  // ...
};
// Allowed if: user has 'admin' role
```

### CONTRIBUTORS_OR_ADMINS

Requires contributor or admin role.

```typescript
const policy = {
  ruleType: 'CONTRIBUTORS_OR_ADMINS',
  // ...
};
// Allowed if: user has 'admin' or 'contributor' role
```

## Role Hierarchy

The engine automatically applies role hierarchy:

```
admin → contributor → member
```

- **admin** role includes **contributor** and **member** permissions
- **contributor** role includes **member** permissions
- **member** role is granted to anyone with active membership

```typescript
// User with admin role
const roleContext = {
  assignments: [{ role: 'admin', source: 'manual', active: true }],
  membershipState: 'active',
};

const roles = resolveEffectiveRoles(roleContext);
// Result: ['admin', 'contributor', 'member']
```

## Architecture

The policy engine uses a **Chain of Responsibility** pattern with three key concepts:

### 1. Rule Providers

Providers evaluate policies and return one of three decisions:
- **ALLOW**: This provider grants access
- **DENY**: This provider denies access
- **ABSTAIN**: This provider has no opinion

```typescript
interface RuleProvider {
  name: string;
  priority: number;
  evaluate(context: EvaluationContext): EvaluationResult;
}
```

### 2. Priority Ordering

Providers execute in priority order (highest first):

| Priority | Provider | Purpose |
|----------|----------|---------|
| 1000 | ValidationProvider | Validate policy structure |
| 200 | StaticPolicyProvider | Handle built-in policy types |
| 0 | FallbackProvider | Deny unhandled rules |

### 3. Conflict Resolution

When multiple providers return decisions, the engine resolves conflicts:

1. If any provider returns **DENY** → Result is **DENY**
2. Else if any provider returns **ALLOW** → Result is **ALLOW**
3. Else (all **ABSTAIN**) → Result is **DENY** (fail-secure)

## Creating Custom Providers

### Example: Time-Based Access

```typescript
import { RuleProvider, EvaluationContext, EvaluationResult } from '@guildpass/policy-engine';

class BusinessHoursProvider implements RuleProvider {
  name = 'BusinessHoursProvider';
  priority = 300;

  evaluate(context: EvaluationContext): EvaluationResult {
    // Only apply to BUSINESS_HOURS_ONLY policies
    if (context.policy.ruleType !== 'BUSINESS_HOURS_ONLY') {
      return {
        result: 'ABSTAIN',
        explanation: 'Not a business hours policy',
      };
    }

    const hour = new Date().getHours();
    const isBusinessHours = hour >= 9 && hour < 17;

    if (isBusinessHours) {
      return {
        result: 'ALLOW',
        explanation: 'Access granted during business hours (9 AM - 5 PM)',
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

// Use the provider
const engine = createDefaultEngine();
engine.addProvider(new BusinessHoursProvider());

const decision = engine.evaluate(
  { ruleType: 'BUSINESS_HOURS_ONLY', /* ... */ },
  roleContext
);
```

### Example: IP Whitelist

```typescript
class IPWhitelistProvider implements RuleProvider {
  name = 'IPWhitelistProvider';
  priority = 800;
  
  private whitelist = ['192.168.1.1', '10.0.0.1'];

  evaluate(context: EvaluationContext): EvaluationResult {
    const params = context.policy.params as any;
    
    // Only apply if policy requires IP check
    if (!params?.requiresIPWhitelist) {
      return { result: 'ABSTAIN', explanation: 'No IP check required' };
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
```

### Example: Admin Override

```typescript
class AdminOverrideProvider implements RuleProvider {
  name = 'AdminOverrideProvider';
  priority = 900; // High priority to override other rules

  async evaluate(context: EvaluationContext): EvaluationResult {
    // Check database for admin overrides
    const override = await this.db.getOverride(
      context.policy.communityId,
      context.policy.resource
    );

    if (!override) {
      return { result: 'ABSTAIN', explanation: 'No override found' };
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
```

## API Reference

### Functions

#### evaluate(policy, roleContext)

Evaluates an access policy against a role context.

**Parameters:**
- `policy: AccessPolicy` - The policy to evaluate
- `roleContext: RoleContext` - User's roles and membership state

**Returns:** `AccessDecision`
- `allowed: boolean` - Whether access is granted
- `code: 'ALLOW' | 'DENY'` - Decision code
- `reasons: DecisionReason[]` - Detailed reasons for decision
- `effectiveRoles?: Role[]` - Resolved user roles
- `membershipState?: MembershipState` - User's membership state

#### explain(policy, roleContext)

Generates human-readable explanation of policy evaluation.

**Parameters:**
- `policy: AccessPolicy`
- `roleContext: RoleContext`

**Returns:** `string` - Multi-line explanation

#### resolveEffectiveRoles(roleContext)

Resolves effective roles including hierarchy and membership state.

**Parameters:**
- `roleContext: RoleContext`

**Returns:** `Role[]` - Array of effective roles

### Classes

#### PolicyEngine

Orchestrates policy evaluation with multiple providers.

**Constructor:**
```typescript
new PolicyEngine(
  providers?: RuleProvider[],
  resolutionConfig?: ResolutionConfig
)
```

**Methods:**

- `evaluate(policy, roleContext): AccessDecision` - Evaluate a policy
- `addProvider(provider): void` - Add a provider to the chain
- `removeProvider(name): boolean` - Remove a provider by name
- `getProviders(): ReadonlyArray<RuleProvider>` - Get all providers

#### createDefaultEngine()

Creates a PolicyEngine with built-in providers.

**Returns:** `PolicyEngine` with:
- ValidationProvider (priority: 1000)
- StaticPolicyProvider (priority: 200)
- FallbackProvider (priority: 0)

## Types

### AccessPolicy

```typescript
interface AccessPolicy {
  id: string;
  communityId: string;
  resource: string;
  ruleType: string;
  params?: Record<string, unknown> | null;
}
```

### RoleContext

```typescript
interface RoleContext {
  assignments: RoleAssignment[];
  membershipState: MembershipState;
}

interface RoleAssignment {
  role: Role;
  source: 'manual' | 'auto';
  active: boolean;
  expiresAt?: string | Date | null;
}

type MembershipState = 'invited' | 'active' | 'expired' | 'suspended';
type Role = 'admin' | 'member' | 'contributor';
```

### EvaluationContext

```typescript
interface EvaluationContext {
  policy: AccessPolicy;
  roleContext: RoleContext;
  effectiveRoles: Role[];
}
```

### PolicyDecision

```typescript
type PolicyDecision = 'ALLOW' | 'DENY' | 'ABSTAIN';
```

### EvaluationResult

```typescript
interface EvaluationResult {
  result: PolicyDecision;
  explanation: string;
  code?: string;
}
```

## Testing

Run the test suite:

```bash
npm test
```

The test suite includes:
- Backward compatibility tests (all original behavior preserved)
- Architecture tests (provider chain, conflict resolution)
- Unit tests for each built-in provider
- Integration tests for the full evaluation pipeline

## Migration Guide

### From Previous Version

**No changes required!** The refactor is fully backward compatible:

```typescript
// This code continues to work exactly as before
import { evaluate, explain } from '@guildpass/policy-engine';

const decision = evaluate(policy, roleContext);
const explanation = explain(policy, roleContext);
```

### Adopting New Architecture

To use the new extensibility features:

```typescript
import { PolicyEngine, createDefaultEngine } from '@guildpass/policy-engine';
import { MyCustomProvider } from './providers/myCustomProvider';

// Option 1: Extend default engine
const engine = createDefaultEngine();
engine.addProvider(new MyCustomProvider());

// Option 2: Create custom engine from scratch
const engine = new PolicyEngine([
  new ValidationProvider(),
  new MyCustomProvider(),
  new StaticPolicyProvider(),
  new FallbackProvider(),
]);

// Use the engine
const decision = engine.evaluate(policy, roleContext);
```

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Detailed architecture documentation
- **[Examples](./examples/)** - More example providers and use cases

## License

Part of the GuildPass project.
