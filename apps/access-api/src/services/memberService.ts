import { evaluate } from '@guildpass/policy-engine';
import { AccessCheckInput, AccessDecision, MembershipState, RoleContext } from '@guildpass/shared-types';
import { PrismaClient } from '@prisma/client';

/**
 * Normalizes membership state by checking expiry at read time.
 * Returns 'expired' if the membership has a past expiresAt value,
 * otherwise returns the original state.
 */
function getNormalizedMembershipState(
  state: MembershipState | undefined | null,
  expiresAt: Date | null | undefined,
  now: Date = new Date()
): MembershipState {
  const normalizedState = (state || 'invited') as MembershipState;
  
  // If there's no expiresAt, use the stored state as-is
  if (!expiresAt) {
    return normalizedState;
  }
  
  // If expiresAt is in the past, treat as expired
  if (expiresAt < now) {
    return 'expired';
  }
  
  // Otherwise use the stored state
  return normalizedState;
}

export function getMemberService(prisma: PrismaClient) {
  return {
    async getMembershipsByWallet(wallet: string) {
      const w = await prisma.wallet.findUnique({ where: { address: wallet.toLowerCase() } });
      if (!w) return { wallet, communities: [] };
      const members = await prisma.member.findMany({
        where: { walletId: w.id },
        include: { membership: true }
      });
      const communities = members.map(m => ({
        communityId: m.communityId,
        state: getNormalizedMembershipState(m.membership?.state, m.membership?.expiresAt),
        expiresAt: m.membership?.expiresAt?.toISOString() ?? null
      }));
      return { wallet, communities };
    },
    async getProfileByWallet(wallet: string) {
      const w = await prisma.wallet.findUnique({ where: { address: wallet.toLowerCase() } });
      if (!w) return null;
      const m = await prisma.member.findFirst({
        where: { walletId: w.id },
        include: { profile: true, membership: true, roles: true }
      });
      if (!m) return null;
      return {
        wallet,
        communityId: m.communityId,
        profile: {
          id: m.profile?.id ?? '',
          displayName: m.profile?.displayName ?? '',
          bio: m.profile?.bio ?? ''
        },
        membership: {
          state: getNormalizedMembershipState(m.membership?.state, m.membership?.expiresAt),
          expiresAt: m.membership?.expiresAt?.toISOString() ?? null
        },
        roles: m.roles.filter(r => r.active).map(r => r.role)
      };
    },
    async checkAccess(input: AccessCheckInput): Promise<AccessDecision> {
      const wallet = input.wallet.toLowerCase();
      const w = await prisma.wallet.findUnique({ where: { address: wallet } });
      if (!w) {
        return {
          allowed: false,
          code: 'DENY',
          reasons: [{ code: 'NO_WALLET', message: 'Wallet not known' }],
          membershipState: 'invited',
          effectiveRoles: []
        };
      }
      const member = await prisma.member.findFirst({
        where: { walletId: w.id, communityId: input.communityId },
        include: { roles: true, membership: true }
      });
      if (!member) {
        return {
          allowed: false,
          code: 'DENY',
          reasons: [{ code: 'NOT_MEMBER', message: 'Wallet is not a member of community' }],
          membershipState: 'invited',
          effectiveRoles: []
        };
      }
      const policy = await prisma.accessPolicy.findFirst({
        where: { communityId: input.communityId, resource: input.resource }
      });
      const rule = policy ? policy.rule : 'MEMBERS_ONLY';
      const normalizedState = getNormalizedMembershipState(member.membership?.state, member.membership?.expiresAt);
      const ctx: RoleContext = {
        assignments: member.roles.map(r => ({ role: r.role as any, source: r.source as any, active: r.active })),
        membershipState: normalizedState
      };
      const decision = evaluate({
        id: policy?.id ?? 'default',
        communityId: input.communityId,
        resource: input.resource,
        rule: rule as any
      }, ctx);
      return decision;
    },
    async listMembersForAdmin(communityId: string, role?: 'admin' | 'member' | 'contributor') {
      // TODO: add auth to ensure requester is admin
      const members = await prisma.member.findMany({
        where: { communityId },
        include: { wallet: true, membership: true, roles: true, profile: true }
      });
      const list = members
        .map(m => {
          const activeRoles = m.roles.filter(r => r.active).map(r => r.role);
          return {
            wallet: m.wallet.address,
            displayName: m.profile?.displayName ?? null,
            state: getNormalizedMembershipState(m.membership?.state, m.membership?.expiresAt),
            roles: activeRoles
          };
        })
        .filter(item => (role ? item.roles.includes(role) : true));
      return { communityId, members: list };
    }
  };
}
