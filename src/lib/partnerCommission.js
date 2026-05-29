export const PARTNER_REVENUE_SHARE_RATE = 0.30;
export const PARTNER_STARTER_RATE = 15;
export const PARTNER_GROWTH_RATE = 20;
export const PARTNER_GROWTH_UNLOCK_COUNT = 11;

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

export function getPartnerCommissionRate(paidReferralClientsCount = 0) {
  return Number(paidReferralClientsCount || 0) >= PARTNER_GROWTH_UNLOCK_COUNT
    ? PARTNER_GROWTH_RATE
    : PARTNER_STARTER_RATE;
}

export function getPartnerCommissionTier(paidReferralClientsCount = 0) {
  const paidCount = Number(paidReferralClientsCount || 0);
  const rate = getPartnerCommissionRate(paidCount);
  const unlocked = rate === PARTNER_GROWTH_RATE;

  return {
    key: unlocked ? "growth" : "starter",
    name: unlocked ? "Growth" : "Starter",
    rate,
    paidCount,
    nextUnlockCount: PARTNER_GROWTH_UNLOCK_COUNT,
    progressLabel: `${Math.min(paidCount, PARTNER_GROWTH_UNLOCK_COUNT)} / ${PARTNER_GROWTH_UNLOCK_COUNT}`,
    unlocked,
  };
}

export function calculatePartnerCommission(compensationAmount, commissionRate = PARTNER_STARTER_RATE) {
  const compensation = Number(compensationAmount || 0);
  if (compensation <= 0) {
    return {
      companyRevenue: 0,
      partnerCommission: 0,
    };
  }

  const companyRevenue = roundMoney(compensation * PARTNER_REVENUE_SHARE_RATE);
  const partnerCommission = roundMoney(companyRevenue * (Number(commissionRate || 0) / 100));

  return {
    companyRevenue,
    partnerCommission,
  };
}

export function calculatePartnerCommissionFromRevenue(companyRevenueAmount, commissionRate = PARTNER_STARTER_RATE) {
  const companyRevenue = roundMoney(companyRevenueAmount);
  if (companyRevenue <= 0) {
    return {
      companyRevenue: 0,
      partnerCommission: 0,
    };
  }

  return {
    companyRevenue,
    partnerCommission: roundMoney(companyRevenue * (Number(commissionRate || 0) / 100)),
  };
}
