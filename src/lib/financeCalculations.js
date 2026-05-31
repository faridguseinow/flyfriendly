const COMPANY_REVENUE_RATE = 0.30;
const CLIENT_PAYOUT_RATE = 0.70;
const DEFAULT_PARTNER_RATE = 0.15;
const GROWTH_PARTNER_RATE = 0.20;
const GROWTH_UNLOCK_COUNT = 10;
const DEFAULT_CURRENCY = "EUR";

function roundMoney(value) {
  return Number(normalizeMoneyAmount(value).toFixed(2));
}

function parseMoneyInput(value) {
  return typeof value === "string"
    ? Number(value.replace(",", ".").trim())
    : Number(value);
}

export function normalizeMoneyAmount(value) {
  const normalized = parseMoneyInput(value);

  return Number.isFinite(normalized) ? normalized : 0;
}

export function calculateCompanyRevenue(compensationAmount) {
  return roundMoney(normalizeMoneyAmount(compensationAmount) * COMPANY_REVENUE_RATE);
}

export function calculateClientPayout(compensationAmount) {
  return roundMoney(normalizeMoneyAmount(compensationAmount) * CLIENT_PAYOUT_RATE);
}

export function calculatePartnerCommission(compensationAmount, partnerRate = DEFAULT_PARTNER_RATE) {
  const normalizedCompensationAmount = roundMoney(compensationAmount);
  const normalizedPartnerRate = normalizeMoneyAmount(partnerRate) > 0
    ? normalizeMoneyAmount(partnerRate)
    : DEFAULT_PARTNER_RATE;
  const companyRevenue = calculateCompanyRevenue(normalizedCompensationAmount);
  const partnerCommission = roundMoney(companyRevenue * normalizedPartnerRate);

  return {
    compensationAmount: normalizedCompensationAmount,
    companyRevenue,
    partnerRate: normalizedPartnerRate,
    partnerCommission,
  };
}

export function resolvePartnerRate(confirmedReferralClientsCount = 0) {
  return Number(confirmedReferralClientsCount || 0) > GROWTH_UNLOCK_COUNT
    ? GROWTH_PARTNER_RATE
    : DEFAULT_PARTNER_RATE;
}

export function calculateClientFinalPayout(calculatedClientPayout, manualClientPayout) {
  const parsedManualClientPayout = parseMoneyInput(manualClientPayout);
  if (manualClientPayout !== null
    && manualClientPayout !== undefined
    && manualClientPayout !== ""
    && Number.isFinite(parsedManualClientPayout)) {
    return roundMoney(parsedManualClientPayout);
  }

  return roundMoney(calculatedClientPayout);
}

export function buildFinanceSnapshot(payload = {}) {
  const compensationAmount = roundMoney(payload.compensationAmount);
  const companyRevenueAmount = calculateCompanyRevenue(compensationAmount);
  const calculatedClientPayoutAmount = calculateClientPayout(compensationAmount);
  const partnerRate = normalizeMoneyAmount(payload.partnerRate) > 0
    ? normalizeMoneyAmount(payload.partnerRate)
    : DEFAULT_PARTNER_RATE;
  const finalClientPayoutAmount = calculateClientFinalPayout(
    calculatedClientPayoutAmount,
    payload.manualClientPayoutAmount,
  );
  const partnerCommissionAmount = roundMoney(companyRevenueAmount * partnerRate);

  return {
    compensationAmount,
    companyRevenueAmount,
    calculatedClientPayoutAmount,
    finalClientPayoutAmount,
    partnerRate,
    partnerCommissionAmount,
    currency: DEFAULT_CURRENCY,
  };
}

export {
  CLIENT_PAYOUT_RATE,
  COMPANY_REVENUE_RATE,
  DEFAULT_CURRENCY,
  DEFAULT_PARTNER_RATE,
  GROWTH_PARTNER_RATE,
  GROWTH_UNLOCK_COUNT,
};
