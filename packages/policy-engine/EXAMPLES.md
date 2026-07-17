# Policy Engine Examples

This document provides practical examples of using the refactored policy engine.

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [Custom Providers](#custom-providers)
3. [Integration Patterns](#integration-patterns)
4. [Testing Examples](#testing-examples)

---

## Basic Usage

### Example 1: Evaluating a Public Resource

```typescript
import { evaluate } from '@guildpass/policy-engine';

const policy = {
  id: 'policy-1',
  communityId: 'guild-dev',
  resource: 'landing-page',
  ruleType: 'PUBLIC',
};

const roleContext = {
  assignments: [],
  membershipState: 'expired',
};

const decision = evaluate(policy, roleContext);

console.log(decision);
// {
//   allowed: true,
//   code: 'ALLOW',
//   reasons: [
//     { code: 'MEMBERSHIP_EXPIRED', message: 'Membership is expired' },
//     { code: 'RULE_PUBLIC', message: 'Resource is public' }
//   ],
//   effectiveRoles: [],
//   membershipState: 'expired'
// }
```

### Example 2: Admin-Only Access

```typescript
import { evaluate, explain } from '@guildpass/policy-engine';

const policy = {
  id: 'policy-2',
  communityId: 'guild-dev',
  resource: 'admin-panel',
  ruleType: 'ADMINS_ONLY',
};

// Non-admin user
const nonAdminContext = {
  assignments: [
    { role: 'member', source: 'auto', active: true }
  ],
  membershipState: 'active',
};

const decision1 = evaluate(policy, nonAdminContext);
console.log(decision1.allowed); // false
console.log(explain(policy, nonAdminContext));
// DENIED for ruleType=ADMINS_ONLY
// roles=[member]
// - MEMBERSHIP_ACTIVE: Membership is active
// - NEEDS_ADMIN: Admin role required

// Admin user
const adminContext = {
  assignments: [
    { role: 'admin', source: 'manual', active: true }
  ],
  membershipState: 'active',
};

const decision2 = evaluate(policy, adminContext);
console.log(decision2.allowed); // true
console.log(explain(policy, adminContext));
// ALLOWED for ruleType=ADMINS_ONLY
// roles=[admin, contributor, member]
// - MEMBERSHIP_ACTIVE: Membership is active
// - HAS_ADMIN: Admin role grants access
```

### Example 3: Role Hierarchy

```typescript
import { resolveEffectiveRoles } from '@guildpass/policy-engine';

// Admin automatically gets contributor and member roles
const adminContext = {
  assignments: [
    { role: 'admin', source: 'manual', active: true }
  ],
  membershipState: 'active',
};

const roles = resolveEffectiveRoles(adminContext);
console.log(roles);
// ['admin', 'contributor', 'member']

// Contributor automatically gets member role
const contributorContext = {
  assignments: [
    { role: 'contributor', source: 'manual', active: true }
  ],
  membershipState: 'active',
};

const contributorRoles = resolveEffectiveRoles(contributorContext);
console.log(contributorRoles);
// ['contributor', 'member']
```

---

## Custom Providers

### Example 4: Time-Based Access Provider

```typescript
import {
  PolicyEngine,
  createDefaultEngine,
  RuleProvider,
  EvaluationContext,
  EvaluationResult,
} from '@guildpass/policy-engine';

class BusinessHoursProvider implements RuleProvider {
  name = 'BusinessHoursProvider';
  priority = 300;

  evaluate(context: EvaluationContext): EvaluationResult {
    // Only handle BUSINESS_HOURS_ONLY policies
    if (context.policy.ruleType !== 'BUSINESS_HOURS_ONLY') {
      return {
        result: 'ABSTAIN',
        explanation: 'Not a business hours policy',
      };
    }

    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Check if it's a weekday (Mon-Fri)
    const isWeekday = day >= 1 && day <= 5;
    
    // Check if it's business hours (9 AM - 5 PM)
    const isBusinessHours = hour >= 9 && hour < 17;

    if (isWeekday && isBusinessHours) {
      return {
        result: 'ALLOW',
        explanation: `Access granted during business hours (${hour}:00 on ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]})`,
        code: 'BUSINESS_HOURS_ALLOW',
      };
    }

    return {
      result: 'DENY',
      explanation: `Access denied outside business hours (${hour}:00 on ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]})`,
      code: 'OUTSIDE_BUSINESS_HOURS',
    };
  }
}

// Usage
const engine = createDefaultEngine();
engine.addProvider(new BusinessHoursProvider());

const policy = {
  id: 'policy-3',
  communityId: 'guild-dev',
  resource: 'trading-system',
  ruleType: 'BUSINESS_HOURS_ONLY',
};

const decision = engine.evaluate(policy, roleContext);
console.log(decision.allowed); // Depends on current time
```

### Example 5: IP Whitelist Provider

```typescript
import {
  RuleProvider,
  EvaluationContext,
  EvaluationResult,
} from '@guildpass/policy-engine';

class IPWhitelistProvider implements RuleProvider {
  name = 'IPWhitelistProvider';
  priority = 800; // High priority for security checks

  private whitelist: Set<string>;

  constructor(allowedIPs: string[]) {
    this.whitelist = new Set(allowedIPs);
  }

  evaluate(context: EvaluationContext): EvaluationResult {
    const params = context.policy.params as any;

    // Only apply if policy requires IP check
    if (!params?.requiresIPCheck) {
      return {
        result: 'ABSTAIN',
        explanation: 'No IP whitelist check required',
      };
    }

    const clientIP = params.clientIP as string;

    if (!clientIP) {
      return {
        result: 'DENY',
        explanation: 'Client IP not provided',
        code: 'MISSING_CLIENT_IP',
      };
    }

    if (this.whitelist.has(clientIP)) {
      return {
        result: 'ALLOW',
        explanation: `Client IP ${clientIP} is whitelisted`,
        code: 'IP_WHITELISTED',
      };
    }

    return {
      result: 'DENY',
      explanation: `Client IP ${clientIP} is not whitelisted`,
      code: 'IP_NOT_WHITELISTED',
    };
  }
}

// Usage
const engine = createDefaultEngine();
engine.addProvider(new IPWhitelistProvider([
  '192.168.1.1',
  '10.0.0.1',
  '172.16.0.1',
]));

const policy = {
  id: 'policy-4',
  communityId: 'guild-dev',
  resource: 'sensitive-data',
  ruleType: 'ADMIN_ONLY',
  params: {
    requiresIPCheck: true,
    clientIP: '192.168.1.1',
  },
};

const decision = engine.evaluate(policy, adminContext);
// Both admin role AND IP whitelist must pass
```

### Example 6: Rate Limiting Provider

```typescript
class RateLimitProvider implements RuleProvider {
  name = 'RateLimitProvider';
  priority = 850; // High priority

  private attempts: Map<string, { count: number; resetAt: Date }> = new Map();

  constructor(
    private maxAttempts: number = 100,
    private windowMinutes: number = 60
  ) {}

  evaluate(context: EvaluationContext): EvaluationResult {
    const params = context.policy.params as any;

    // Only apply if rate limiting is enabled
    if (!params?.rateLimited) {
      return {
        result: 'ABSTAIN',
        explanation: 'Rate limiting not enabled',
      };
    }

    const userId = params.userId as string;
    if (!userId) {
      return {
        result: 'DENY',
        explanation: 'User ID required for rate limiting',
        code: 'MISSING_USER_ID',
      };
    }

    const now = new Date();
    const userAttempts = this.attempts.get(userId);

    // Initialize or reset if window expired
    if (!userAttempts || userAttempts.resetAt < now) {
      this.attempts.set(userId, {
        count: 1,
        resetAt: new Date(now.getTime() + this.windowMinutes * 60 * 1000),
      });

      return {
        result: 'ALLOW',
        explanation: `Rate limit: 1/${this.maxAttempts} attempts`,
        code: 'RATE_LIMIT_OK',
      };
    }

    // Increment attempts
    userAttempts.count++;

    if (userAttempts.count > this.maxAttempts) {
      return {
        result: 'DENY',
        explanation: `Rate limit exceeded: ${userAttempts.count}/${this.maxAttempts} attempts`,
        code: 'RATE_LIMIT_EXCEEDED',
      };
    }

    return {
      result: 'ALLOW',
      explanation: `Rate limit: ${userAttempts.count}/${this.maxAttempts} attempts`,
      code: 'RATE_LIMIT_OK',
    };
  }
}

// Usage
const engine = createDefaultEngine();
engine.addProvider(new RateLimitProvider(100, 60)); // 100 requests per hour

const policy = {
  id: 'policy-5',
  communityId: 'guild-dev',
  resource: 'api-endpoint',
  ruleType: 'PUBLIC',
  params: {
    rateLimited: true,
    userId: 'user-123',
  },
};

const decision = engine.evaluate(policy, roleContext);
```

### Example 7: Maintenance Mode Provider

```typescript
class MaintenanceModeProvider implements RuleProvider {
  name = 'MaintenanceModeProvider';
  priority = 950; // Very high priority

  constructor(private isMaintenanceMode: () => boolean) {}

  evaluate(context: EvaluationContext): EvaluationResult {
    if (!this.isMaintenanceMode()) {
      return {
        result: 'ABSTAIN',
        explanation: 'System not in maintenance mode',
      };
    }

    // Allow admins during maintenance
    if (context.effectiveRoles.includes('admin')) {
      return {
        result: 'ALLOW',
        explanation: 'Admin access allowed during maintenance',
        code: 'MAINTENANCE_ADMIN_BYPASS',
      };
    }

    // Deny everyone else
    return {
      result: 'DENY',
      explanation: 'System is in maintenance mode',
      code: 'MAINTENANCE_MODE',
    };
  }
}

// Usage
let maintenanceMode = false;

const engine = createDefaultEngine();
engine.addProvider(
  new MaintenanceModeProvider(() => maintenanceMode)
);

// Enable maintenance mode
maintenanceMode = true;

// Non-admin users are blocked
const decision1 = engine.evaluate(publicPolicy, memberContext);
console.log(decision1.allowed); // false
console.log(decision1.reasons); // MAINTENANCE_MODE

// Admin users can still access
const decision2 = engine.evaluate(publicPolicy, adminContext);
console.log(decision2.allowed); // true
console.log(decision2.reasons); // MAINTENANCE_ADMIN_BYPASS
```

---

## Integration Patterns

### Example 8: Using with Express.js Middleware

```typescript
import express from 'express';
import { PolicyEngine, createDefaultEngine } from '@guildpass/policy-engine';

const app = express();
const engine = createDefaultEngine();

// Middleware to enforce policy
function enforcePolicy(policyGetter: (req: express.Request) => AccessPolicy) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const policy = policyGetter(req);
    
    // Extract role context from authenticated user
    const roleContext = {
      assignments: req.user?.roles || [],
      membershipState: req.user?.membershipState || 'expired',
    };

    const decision = engine.evaluate(policy, roleContext);

    if (decision.allowed) {
      next();
    } else {
      res.status(403).json({
        error: 'Access denied',
        reasons: decision.reasons,
      });
    }
  };
}

// Usage
app.get('/admin/users',
  enforcePolicy((req) => ({
    id: 'admin-users',
    communityId: req.params.communityId,
    resource: 'admin-users',
    ruleType: 'ADMINS_ONLY',
  })),
  (req, res) => {
    // Admin-only handler
    res.json({ users: [] });
  }
);

app.get('/members/profile',
  enforcePolicy((req) => ({
    id: 'member-profile',
    communityId: req.params.communityId,
    resource: 'member-profile',
    ruleType: 'MEMBERS_ONLY',
  })),
  (req, res) => {
    // Members-only handler
    res.json({ profile: {} });
  }
);
```

### Example 9: Caching Policy Decisions

```typescript
class CachedPolicyEngine {
  private cache: Map<string, { decision: AccessDecision; expiresAt: Date }> = new Map();

  constructor(
    private engine: PolicyEngine,
    private ttlSeconds: number = 60
  ) {}

  evaluate(policy: AccessPolicy, roleContext: RoleContext): AccessDecision {
    const cacheKey = this.buildCacheKey(policy, roleContext);
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > new Date()) {
      return cached.decision;
    }

    const decision = this.engine.evaluate(policy, roleContext);
    
    this.cache.set(cacheKey, {
      decision,
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000),
    });

    return decision;
  }

  private buildCacheKey(policy: AccessPolicy, roleContext: RoleContext): string {
    return JSON.stringify({
      policyId: policy.id,
      roles: roleContext.assignments.map(a => a.role).sort(),
      membershipState: roleContext.membershipState,
    });
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// Usage
const engine = createDefaultEngine();
const cachedEngine = new CachedPolicyEngine(engine, 60);

const decision = cachedEngine.evaluate(policy, roleContext);
// Subsequent calls within 60 seconds will use cached result
```

### Example 10: Logging and Metrics

```typescript
class LoggingPolicyEngine {
  constructor(private engine: PolicyEngine) {}

  evaluate(policy: AccessPolicy, roleContext: RoleContext): AccessDecision {
    const startTime = Date.now();
    
    console.log('[PolicyEngine] Evaluating policy', {
      policyId: policy.id,
      ruleType: policy.ruleType,
      resource: policy.resource,
      roles: roleContext.assignments.map(a => a.role),
    });

    const decision = this.engine.evaluate(policy, roleContext);
    
    const duration = Date.now() - startTime;

    console.log('[PolicyEngine] Decision made', {
      policyId: policy.id,
      allowed: decision.allowed,
      code: decision.code,
      duration: `${duration}ms`,
      reasons: decision.reasons.map(r => r.code),
    });

    // Send metrics to monitoring service
    this.recordMetrics({
      policy: policy.ruleType,
      decision: decision.code,
      duration,
    });

    return decision;
  }

  private recordMetrics(metrics: any): void {
    // Send to Prometheus, DataDog, etc.
  }
}

// Usage
const engine = createDefaultEngine();
const loggingEngine = new LoggingPolicyEngine(engine);

const decision = loggingEngine.evaluate(policy, roleContext);
// [PolicyEngine] Evaluating policy { policyId: 'policy-1', ... }
// [PolicyEngine] Decision made { policyId: 'policy-1', allowed: true, ... }
```

---

## Testing Examples

### Example 11: Unit Testing a Custom Provider

```typescript
import { describe, test, expect } from 'jest';
import { BusinessHoursProvider } from './businessHoursProvider';
import type { EvaluationContext } from '@guildpass/policy-engine';

describe('BusinessHoursProvider', () => {
  const provider = new BusinessHoursProvider();

  const createContext = (ruleType: string): EvaluationContext => ({
    policy: {
      id: '1',
      communityId: 'c1',
      resource: 'res',
      ruleType,
    },
    roleContext: {
      assignments: [],
      membershipState: 'active',
    },
    effectiveRoles: [],
  });

  test('abstains for non-business-hours policies', () => {
    const context = createContext('PUBLIC');
    const result = provider.evaluate(context);
    
    expect(result.result).toBe('ABSTAIN');
  });

  test('denies access outside business hours', () => {
    // Mock date to be outside business hours
    const saturday = new Date('2024-01-06T10:00:00'); // Saturday
    jest.useFakeTimers();
    jest.setSystemTime(saturday);

    const context = createContext('BUSINESS_HOURS_ONLY');
    const result = provider.evaluate(context);
    
    expect(result.result).toBe('DENY');
    expect(result.code).toBe('OUTSIDE_BUSINESS_HOURS');

    jest.useRealTimers();
  });

  test('allows access during business hours', () => {
    // Mock date to be during business hours
    const tuesday = new Date('2024-01-09T14:00:00'); // Tuesday 2 PM
    jest.useFakeTimers();
    jest.setSystemTime(tuesday);

    const context = createContext('BUSINESS_HOURS_ONLY');
    const result = provider.evaluate(context);
    
    expect(result.result).toBe('ALLOW');
    expect(result.code).toBe('BUSINESS_HOURS_ALLOW');

    jest.useRealTimers();
  });
});
```

### Example 12: Integration Testing

```typescript
import { PolicyEngine } from '@guildpass/policy-engine';
import { ValidationProvider } from '@guildpass/policy-engine';
import { StaticPolicyProvider } from '@guildpass/policy-engine';
import { BusinessHoursProvider } from './businessHoursProvider';
import { IPWhitelistProvider } from './ipWhitelistProvider';

describe('PolicyEngine Integration', () => {
  test('combines multiple providers correctly', () => {
    const engine = new PolicyEngine([
      new ValidationProvider(),
      new IPWhitelistProvider(['192.168.1.1']),
      new BusinessHoursProvider(),
      new StaticPolicyProvider(),
    ]);

    const policy = {
      id: 'policy-1',
      communityId: 'guild-dev',
      resource: 'trading-api',
      ruleType: 'BUSINESS_HOURS_ONLY',
      params: {
        requiresIPCheck: true,
        clientIP: '192.168.1.1',
      },
    };

    const roleContext = {
      assignments: [],
      membershipState: 'active',
    };

    // During business hours with whitelisted IP
    const tuesday = new Date('2024-01-09T14:00:00');
    jest.useFakeTimers();
    jest.setSystemTime(tuesday);

    const decision = engine.evaluate(policy, roleContext);
    
    // Both providers must approve
    expect(decision.allowed).toBe(true);
    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ code: 'IP_WHITELISTED' })
    );
    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ code: 'BUSINESS_HOURS_ALLOW' })
    );

    jest.useRealTimers();
  });
});
```

### Example 13: Testing Conflict Resolution

```typescript
describe('Conflict Resolution', () => {
  test('DENY overrides ALLOW', () => {
    const allowProvider: RuleProvider = {
      name: 'AllowProvider',
      priority: 100,
      evaluate: () => ({
        result: 'ALLOW',
        explanation: 'Allow provider grants access',
      }),
    };

    const denyProvider: RuleProvider = {
      name: 'DenyProvider',
      priority: 50,
      evaluate: () => ({
        result: 'DENY',
        explanation: 'Deny provider blocks access',
      }),
    };

    const engine = new PolicyEngine([allowProvider, denyProvider]);
    const decision = engine.evaluate(policy, roleContext);

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('DENY');
  });

  test('defaults to DENY when all abstain', () => {
    const abstainProvider: RuleProvider = {
      name: 'AbstainProvider',
      priority: 100,
      evaluate: () => ({
        result: 'ABSTAIN',
        explanation: 'No opinion',
      }),
    };

    const engine = new PolicyEngine([abstainProvider]);
    const decision = engine.evaluate(policy, roleContext);

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('DENY');
  });
});
```

---

## Best Practices

### 1. Provider Naming

Use descriptive, unique names:

```typescript
// Good
name = 'IPWhitelistProvider'
name = 'BusinessHoursProvider'
name = 'AdminOverrideProvider'

// Avoid
name = 'Provider'
name = 'Custom'
name = 'MyProvider'
```

### 2. Priority Selection

Follow the recommended ranges:

```typescript
// System/Safety: 1000+
priority = 1000 // ValidationProvider
priority = 950  // MaintenanceModeProvider

// Overrides: 800-999
priority = 900  // AdminOverrideProvider
priority = 850  // RateLimitProvider

// Governance: 500-799
priority = 600  // GovernanceRuleProvider

// Features: 300-499
priority = 400  // ContributionScoreProvider
priority = 300  // BusinessHoursProvider

// Static: 100-299
priority = 200  // StaticPolicyProvider

// Fallback: 0-99
priority = 0    // FallbackProvider
```

### 3. Abstain Appropriately

Only handle policies you understand:

```typescript
evaluate(context: EvaluationContext): EvaluationResult {
  // ALWAYS abstain for irrelevant policies
  if (context.policy.ruleType !== 'MY_RULE_TYPE') {
    return {
      result: 'ABSTAIN',
      explanation: 'Not applicable to this policy type',
    };
  }

  // Your logic here...
}
```

### 4. Provide Clear Explanations

```typescript
// Good
return {
  result: 'DENY',
  explanation: 'Client IP 192.168.1.100 is not whitelisted',
  code: 'IP_NOT_WHITELISTED',
};

// Avoid
return {
  result: 'DENY',
  explanation: 'No',
  code: 'ERR',
};
```

### 5. Handle Errors Gracefully

```typescript
evaluate(context: EvaluationContext): EvaluationResult {
  try {
    // Your logic
  } catch (error) {
    console.error('Provider error:', error);
    
    // Abstain on error to let other providers decide
    return {
      result: 'ABSTAIN',
      explanation: 'Provider encountered an error',
      code: 'PROVIDER_ERROR',
    };
  }
}
```

---

## Conclusion

These examples demonstrate the flexibility and power of the refactored policy engine. The Chain of Responsibility pattern makes it easy to:

- Add new rule types without modifying existing code
- Combine multiple policies with clear precedence
- Test providers in isolation
- Build complex access control logic from simple components

For more details, see [ARCHITECTURE.md](./ARCHITECTURE.md) and [README.md](./README.md).
