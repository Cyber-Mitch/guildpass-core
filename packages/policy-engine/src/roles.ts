/**
 * Role Resolution Utilities
 * 
 * Handles role hierarchy and effective role calculation.
 * Extracted from original implementation for reuse across providers.
 */

import type { RoleContext, Role } from '@guildpass/shared-types';

/**
 * Resolves effective roles from a role context
 * 
 * This function:
 * 1. Filters out inactive assignments
 * 2. Filters out expired assignments
 * 3. Adds 'member' role if membership is active
 * 4. Applies role hierarchy (admin -> contributor -> member)
 * 5. Deduplicates roles
 * 
 * @param ctx - The role context containing assignments and membership state
 * @returns Array of effective roles
 */
export function resolveEffectiveRoles(ctx: RoleContext): Role[] {
  const roles: Role[] = [];
  const now = new Date();

  // Process role assignments
  for (const assignment of ctx.assignments) {
    // Skip inactive assignments
    if (!assignment.active) continue;

    // Skip expired assignments
    if (assignment.expiresAt) {
      const expiry = new Date(assignment.expiresAt);
      if (expiry < now) continue;
    }

    roles.push(assignment.role);
  }

  // Add 'member' role if membership is active
  if (ctx.membershipState === 'active') {
    roles.push('member');
  }

  // Apply role hierarchy
  // admin -> contributor -> member
  const effective: Role[] = [...roles];

  if (roles.includes('admin')) {
    effective.push('contributor');
    effective.push('member');
  }

  if (roles.includes('contributor')) {
    effective.push('member');
  }

  // Deduplicate and return
  return unique(effective);
}

/**
 * Utility to deduplicate an array
 */
function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
