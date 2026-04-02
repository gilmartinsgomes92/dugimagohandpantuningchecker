import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type AccountProfile = {
  id: string;
  email: string | null;
  marketingOptIn: boolean;
  marketingOptInAt: string | null;
  marketingOptInSource: string | null;
  reportCredits: number;
  planSlug: string | null;
  planStatus: string | null;
  planRenewsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AccountProfileRow = {
  id: string;
  email: string | null;
  marketing_opt_in: boolean | null;
  marketing_opt_in_at: string | null;
  marketing_opt_in_source: string | null;
  report_credits: number | null;
  plan_slug: string | null;
  plan_status: string | null;
  plan_renews_at: string | null;
  created_at: string;
  updated_at: string;
};

type EnsureUserProfileOptions = {
  marketingOptIn?: boolean;
  marketingOptInSource?: string;
};

export type BillingAccessStatus = {
  requiresEntitlement: boolean;
  hasActivePlan: boolean;
  hasReportCredits: boolean;
  canCreateCertifiedReports: boolean;
};

const REQUIRE_CERTIFIED_ENTITLEMENT = import.meta.env.VITE_CERTIFIED_REPORTS_REQUIRE_ENTITLEMENT === 'true';

export const wixBillingLinks = {
  buyCredits: import.meta.env.VITE_WIX_BUY_CREDITS_URL || '',
  playerPlan: import.meta.env.VITE_WIX_PLAYER_PLAN_URL || '',
  makerPlan: import.meta.env.VITE_WIX_MAKER_PLAN_URL || '',
};

function mapAccountProfile(row: AccountProfileRow): AccountProfile {
  return {
    id: row.id,
    email: row.email,
    marketingOptIn: Boolean(row.marketing_opt_in),
    marketingOptInAt: row.marketing_opt_in_at,
    marketingOptInSource: row.marketing_opt_in_source,
    reportCredits: Math.max(0, row.report_credits ?? 0),
    planSlug: row.plan_slug,
    planStatus: row.plan_status,
    planRenewsAt: row.plan_renews_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getBillingAccessStatus(profile: AccountProfile | null): BillingAccessStatus {
  const normalizedStatus = profile?.planStatus?.toLowerCase() ?? '';
  const hasActivePlan = normalizedStatus === 'active' || normalizedStatus === 'trialing';
  const hasReportCredits = (profile?.reportCredits ?? 0) > 0;

  return {
    requiresEntitlement: REQUIRE_CERTIFIED_ENTITLEMENT,
    hasActivePlan,
    hasReportCredits,
    canCreateCertifiedReports: !REQUIRE_CERTIFIED_ENTITLEMENT || hasActivePlan || hasReportCredits,
  };
}

export function formatPlanName(planSlug: string | null | undefined) {
  if (!planSlug) return 'No active plan';

  return planSlug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function ensureUserProfile(user: User, options: EnsureUserProfileOptions = {}) {
  if (!supabase) {
    return { ok: false as const, error: 'Supabase is not configured.' };
  }

  const payload: Record<string, unknown> = {
    id: user.id,
    email: user.email ?? null,
  };

  if (typeof options.marketingOptIn === 'boolean') {
    payload.marketing_opt_in = options.marketingOptIn;
    payload.marketing_opt_in_at = options.marketingOptIn ? new Date().toISOString() : null;
    payload.marketing_opt_in_source = options.marketingOptIn
      ? options.marketingOptInSource ?? 'app_signup'
      : null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select(
      'id, email, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source, report_credits, plan_slug, plan_status, plan_renews_at, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    return {
      ok: false as const,
      error: error?.message ?? 'Could not ensure account profile.',
    };
  }

  return {
    ok: true as const,
    profile: mapAccountProfile(data as AccountProfileRow),
  };
}

export async function getAccountProfile(user: User) {
  if (!supabase) {
    return { ok: false as const, error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, email, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source, report_credits, plan_slug, plan_status, plan_renews_at, created_at, updated_at',
    )
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    return { ok: false as const, error: error.message };
  }

  if (!data) {
    return ensureUserProfile(user);
  }

  return {
    ok: true as const,
    profile: mapAccountProfile(data as AccountProfileRow),
  };
}

export async function updateMarketingPreference(user: User, marketingOptIn: boolean) {
  if (!supabase) {
    return { ok: false as const, error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      email: user.email ?? null,
      marketing_opt_in: marketingOptIn,
      marketing_opt_in_at: marketingOptIn ? new Date().toISOString() : null,
      marketing_opt_in_source: marketingOptIn ? 'account_preferences' : null,
    })
    .eq('id', user.id)
    .select(
      'id, email, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source, report_credits, plan_slug, plan_status, plan_renews_at, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    return {
      ok: false as const,
      error: error?.message ?? 'Could not update email preferences.',
    };
  }

  return {
    ok: true as const,
    profile: mapAccountProfile(data as AccountProfileRow),
  };
}

export async function consumeCertifiedReportCredit(user: User, verificationId: string) {
  if (!supabase) {
    return { ok: false as const, error: 'Supabase is not configured.' };
  }

  const profileResult = await getAccountProfile(user);
  if (!profileResult.ok) {
    return { ok: false as const, error: profileResult.error };
  }

  const profile = profileResult.profile;
  const billingStatus = getBillingAccessStatus(profile);

  if (!billingStatus.requiresEntitlement || billingStatus.hasActivePlan) {
    return { ok: true as const, profile, consumed: false };
  }

  const eventKey = `certified-report:${verificationId}`;

  const { data: existingEvent, error: existingEventError } = await supabase
    .from('billing_events')
    .select('id')
    .eq('user_id', user.id)
    .eq('event_key', eventKey)
    .maybeSingle();

  if (existingEventError) {
    return { ok: false as const, error: existingEventError.message };
  }

  if (existingEvent) {
    return { ok: true as const, profile, consumed: false };
  }

  if ((profile.reportCredits ?? 0) <= 0) {
    return { ok: false as const, error: 'No certified report credits are available for this account.' };
  }

  const nextCredits = Math.max(0, profile.reportCredits - 1);

  const { data: updatedProfile, error: updateError } = await supabase
    .from('profiles')
    .update({ report_credits: nextCredits })
    .eq('id', user.id)
    .eq('report_credits', profile.reportCredits)
    .select(
      'id, email, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source, report_credits, plan_slug, plan_status, plan_renews_at, created_at, updated_at',
    )
    .single();

  if (updateError || !updatedProfile) {
    return {
      ok: false as const,
      error: updateError?.message ?? 'Could not reserve a certified report credit.',
    };
  }

  const { error: billingEventError } = await supabase.from('billing_events').insert({
    user_id: user.id,
    event_type: 'certified_report_credit_used',
    event_key: eventKey,
    source: 'app',
    metadata: {
      verificationId,
      remainingCredits: nextCredits,
    },
  });

  if (billingEventError) {
    return { ok: false as const, error: billingEventError.message };
  }

  return {
    ok: true as const,
    profile: mapAccountProfile(updatedProfile as AccountProfileRow),
    consumed: true,
  };
}
