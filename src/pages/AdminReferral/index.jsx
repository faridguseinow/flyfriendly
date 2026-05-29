import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeDollarSign,
  CheckCircle2,
  Copy,
  FilterX,
  Link2,
  RefreshCcw,
  Search,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  approvePartnerApplication,
  fetchReferralControlCenterData,
  rejectPartnerApplication,
  updatePartnerPortalStatus,
} from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import { AdminKpiCard, AdminPageHeader, AdminSidePanel, AdminStatusBadge } from "../../admin/components/AdminUi.jsx";
import { buildPublicReferralLink } from "../../lib/referralLink.js";
import "./style.scss";

const tabs = [
  { key: "applications", label: "Applications" },
  { key: "partners", label: "Referral Users" },
  { key: "customers", label: "Referred Customers" },
  { key: "commissions", label: "Commissions" },
  { key: "payouts", label: "Payouts" },
  { key: "activity", label: "Activity" },
];

const activeCaseStatuses = [
  "documents_pending",
  "ready_to_submit",
  "submitted_to_airline",
  "awaiting_response",
  "approved",
  "payment_processing",
  "under_review",
];

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatCurrency(value, currency = "EUR") {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  return `${amount.toFixed(0)} ${currency || "EUR"}`;
}

function normalizeLabel(value) {
  return String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getInitials(name, fallback = "") {
  const source = String(name || fallback || "").trim();
  if (!source) return "RF";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function getAudienceBucket(value) {
  const amount = Number(String(value || "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return "unknown";
  if (amount < 10000) return "under_10k";
  if (amount < 50000) return "10k_50k";
  if (amount < 100000) return "50k_100k";
  return "100k_plus";
}

function getStatusTone(status) {
  const value = String(status || "").toLowerCase();
  if (["approved", "active", "paid", "done", "converted"].includes(value)) return "success";
  if (["rejected", "cancelled", "failed"].includes(value)) return "danger";
  if (["pending", "pending_review", "pending_payout", "suspended", "under_review"].includes(value)) return "warning";
  if (["referred", "lead_created", "case_created"].includes(value)) return "info";
  return "neutral";
}

function isPendingLike(status) {
  return ["pending", "pending_review", "under_review"].includes(String(status || "").toLowerCase());
}

function isApprovedLike(status) {
  return ["approved", "active", "paid", "done", "completed"].includes(String(status || "").toLowerCase());
}

function toDateMs(value) {
  return value ? new Date(value).getTime() : 0;
}

function matchesDateRange(value, dateRange) {
  if (!value) return !dateRange.from && !dateRange.to;
  const target = new Date(value).getTime();
  const from = dateRange.from ? new Date(`${dateRange.from}T00:00:00`).getTime() : null;
  const to = dateRange.to ? new Date(`${dateRange.to}T23:59:59`).getTime() : null;
  if (from && target < from) return false;
  if (to && target > to) return false;
  return true;
}

function partnerMatchesRecord(record, partner) {
  const label = String(record?.referral_partner_label || "").toLowerCase();
  return record?.referral_partner_id === partner?.id
    || (label && [partner?.referral_code, partner?.name, partner?.public_name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase() === label));
}

function buildPartnerLabel(partner) {
  return partner?.public_name || partner?.name || partner?.referral_code || "Referral user";
}

function getPartnerReferralUrl(partner) {
  return buildPublicReferralLink(partner?.referral_link || partner?.referral_code || "");
}

function copyText(value) {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
  navigator.clipboard.writeText(value).catch(() => null);
  return true;
}

function getRowReference(value, prefix) {
  return value || `${prefix} — ${String(prefix).slice(0, 0)}`;
}

function SummaryGrid({ items = [] }) {
  return (
    <div className="admin-referral-page__summary-grid">
      {items.map((item) => (
        <article key={item.label} className="admin-card admin-card-compact admin-referral-page__summary-card">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.meta ? <small>{item.meta}</small> : null}
        </article>
      ))}
    </div>
  );
}

function EmptyState({ label }) {
  return <div className="admin-referral-page__state">{label}</div>;
}

export default function AdminReferral() {
  const { hasPermission } = useAdminAuth();
  const [moduleData, setModuleData] = useState(null);
  const [activeTab, setActiveTab] = useState("applications");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [secondaryFilter, setSecondaryFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [applicationReview, setApplicationReview] = useState({
    commission_rate: "",
    notes: "",
    rejection_reason: "",
  });
  const [partnerActionNotes, setPartnerActionNotes] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const canManageApplications = hasPermission("partner_applications.manage");
  const canEditPartners = hasPermission("partners.edit");
  const canEditFinance = hasPermission("finance.edit");
  const drawerLabels = {
    application: "Applications",
    partner: "Referral Users",
    customer: "Referred Customers",
    commission: "Commissions",
    payout: "Payouts",
    activity: "Activity",
  };

  const activateRowOnKeyDown = (handler) => (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handler();
  };

  const loadData = async () => {
    setError("");
    setIsLoading(true);
    try {
      const next = await fetchReferralControlCenterData();
      setModuleData(next);
    } catch (nextError) {
      setError(nextError.message || "Could not load referral control center.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeoutId = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const partnersById = useMemo(
    () => new Map((moduleData?.partners || []).map((item) => [item.id, item])),
    [moduleData?.partners],
  );

  const customersById = useMemo(
    () => new Map((moduleData?.customers || []).map((item) => [item.id, item])),
    [moduleData?.customers],
  );

  const leadsById = useMemo(
    () => new Map((moduleData?.leads || []).map((item) => [item.id, item])),
    [moduleData?.leads],
  );

  const casesById = useMemo(
    () => new Map((moduleData?.cases || []).map((item) => [item.id, item])),
    [moduleData?.cases],
  );

  const applications = useMemo(() => {
    const rows = (moduleData?.applications || []).map((item) => ({
      ...item,
      displayName: item.full_name || item.public_name || item.email || `Application ${String(item.id || "").slice(0, 8)}`,
      statusOrder: item.status === "pending" ? 0 : 1,
      submittedAt: item.created_at,
    }));

    return [...rows].sort((left, right) => {
      if (left.statusOrder !== right.statusOrder) return left.statusOrder - right.statusOrder;
      return toDateMs(right.created_at) - toDateMs(left.created_at);
    });
  }, [moduleData?.applications]);

  const referredCustomers = useMemo(() => {
    const commissions = moduleData?.commissions || [];
    const financeByCaseId = new Map((moduleData?.finance || []).map((item) => [item.case_id, item]));
    const referralRows = (moduleData?.referrals || []).length
      ? moduleData.referrals
      : (moduleData?.leads || [])
        .filter((item) => item.referral_partner_id)
        .map((lead) => ({
          id: `lead-${lead.id}`,
          partner_id: lead.referral_partner_id,
          customer_id: lead.customer_id || null,
          lead_id: lead.id,
          case_id: null,
          referral_code: lead.source_details?.referral_code || "",
          status: "lead_created",
          attribution_meta: {
            client_name: lead.full_name || null,
            client_email: lead.email || null,
            client_phone: lead.phone || null,
            route_from: lead.departure_airport || null,
            route_to: lead.arrival_airport || null,
            airline: lead.airline || null,
            issue_type: lead.disruption_type || null,
          },
          created_at: lead.created_at,
          updated_at: lead.updated_at || lead.created_at,
        }));

    return referralRows.map((item) => {
      const lead = item.lead_id ? leadsById.get(item.lead_id) || null : null;
      const caseRow = item.case_id
        ? casesById.get(item.case_id) || null
        : (moduleData?.cases || []).find((entry) => entry.lead_id && lead?.id && entry.lead_id === lead.id) || null;
      const partner = partnersById.get(item.partner_id)
        || (lead?.referral_partner_id ? partnersById.get(lead.referral_partner_id) : null)
        || (caseRow?.referral_partner_id ? partnersById.get(caseRow.referral_partner_id) : null)
        || null;
      const customer = item.customer_id
        ? customersById.get(item.customer_id) || null
        : (caseRow?.customer_id ? customersById.get(caseRow.customer_id) || null : null)
          || (lead?.customer_id ? customersById.get(lead.customer_id) || null : null);
      const commission = commissions.find((entry) => (item.case_id && entry.case_id === item.case_id) || (item.lead_id && entry.lead_id === item.lead_id)) || null;
      const financeRow = caseRow?.id ? financeByCaseId.get(caseRow.id) || null : null;
      const customerName = customer?.full_name
        || item.attribution_meta?.client_name
        || lead?.full_name
        || customer?.email
        || lead?.email
        || `Customer ${String(customer?.id || item.id || "").slice(0, 8)}`;
      const customerEmail = customer?.email || item.attribution_meta?.client_email || lead?.email || "—";

      return {
        id: item.id,
        partner,
        customer,
        lead,
        caseRow,
        commission,
        financeRow,
        createdAt: item.created_at || lead?.created_at || caseRow?.created_at || null,
        customerName,
        customerEmail,
        customerPhone: customer?.phone || item.attribution_meta?.client_phone || lead?.phone || "—",
        referralCode: item.referral_code || item.attribution_meta?.partner_referral_code || partner?.referral_code || "—",
        partnerLabel: buildPartnerLabel(partner),
        leadReference: lead?.lead_code || "—",
        caseReference: caseRow?.case_code || "—",
        caseStatus: caseRow?.status || item.attribution_meta?.case_status || item.status || "pending",
        routeLabel: [caseRow?.route_from || item.attribution_meta?.route_from || lead?.departure_airport, caseRow?.route_to || item.attribution_meta?.route_to || lead?.arrival_airport].filter(Boolean).join(" → ") || "—",
        airline: caseRow?.airline || item.attribution_meta?.airline || lead?.airline || "—",
        disruptionType: item.attribution_meta?.issue_type || lead?.disruption_type || "—",
        estimatedCompensation: caseRow?.estimated_compensation || 0,
        commissionStatus: commission?.status || item.attribution_meta?.referral_commission_status || "—",
        commissionAmount: Number(commission?.amount || item.attribution_meta?.referral_commission_amount || 0),
        payoutStatus: financeRow?.payment_status || caseRow?.payout_status || item.attribution_meta?.payout_status || "—",
        sourceUrl: item.source_url || "—",
      };
    }).sort((left, right) => toDateMs(right.createdAt) - toDateMs(left.createdAt));
  }, [casesById, customersById, leadsById, moduleData, partnersById]);

  const partnerRows = useMemo(() => {
    return (moduleData?.partners || []).map((partner) => {
      const partnerCustomers = referredCustomers.filter((item) => item.partner?.id === partner.id);
      const linkedCases = (moduleData?.cases || []).filter((item) => partnerMatchesRecord(item, partner));
      const linkedLeads = (moduleData?.leads || []).filter((item) => item.referral_partner_id === partner.id);
      const linkedCommissions = (moduleData?.commissions || []).filter((item) => item.partner_id === partner.id);
      const linkedPayouts = (moduleData?.payouts || []).filter((item) => item.partner_id === partner.id);
      const earnedCommission = linkedCommissions
        .filter((item) => item.status !== "cancelled")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const pendingPayout = linkedPayouts
        .filter((item) => !["paid", "cancelled"].includes(String(item.status || "").toLowerCase()))
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const paidPayout = linkedPayouts
        .filter((item) => String(item.status || "").toLowerCase() === "paid")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const activeCasesCount = linkedCases.filter((item) => activeCaseStatuses.includes(String(item.status || "").toLowerCase())).length;
      const successfulCases = linkedCommissions.filter((item) => ["approved", "paid"].includes(String(item.status || "").toLowerCase())).length;
      const uniqueCustomers = new Set(partnerCustomers.map((item) => item.customer?.id || item.customerEmail).filter(Boolean));
      const lastActivityAt = [
        partner.updated_at,
        ...linkedLeads.map((item) => item.updated_at || item.created_at),
        ...linkedCases.map((item) => item.updated_at || item.created_at),
        ...linkedCommissions.map((item) => item.paid_at || item.approved_at || item.created_at),
        ...linkedPayouts.map((item) => item.paid_at || item.updated_at || item.created_at),
      ].filter(Boolean).sort((left, right) => toDateMs(right) - toDateMs(left))[0] || null;

      return {
        ...partner,
        displayName: buildPartnerLabel(partner),
        initials: getInitials(buildPartnerLabel(partner), partner.contact_email || partner.referral_code),
        linkedCases,
        linkedLeads,
        linkedCommissions,
        linkedPayouts,
        partnerCustomers,
        referredCustomersCount: uniqueCustomers.size,
        activeCasesCount,
        successfulCases,
        earnedCommission,
        pendingPayout,
        paidPayout,
        lastActivityAt,
        conversionRate: partnerCustomers.length ? `${Math.round((successfulCases / partnerCustomers.length) * 100)}%` : "—",
      };
    }).sort((left, right) => {
      const activityDelta = toDateMs(right.lastActivityAt) - toDateMs(left.lastActivityAt);
      if (activityDelta) return activityDelta;
      return toDateMs(right.created_at) - toDateMs(left.created_at);
    });
  }, [moduleData?.cases, moduleData?.commissions, moduleData?.leads, moduleData?.partners, moduleData?.payouts, referredCustomers]);

  const commissionRows = useMemo(() => {
    return (moduleData?.commissions || []).map((item) => {
      const partner = partnersById.get(item.partner_id) || null;
      const relatedReferral = referredCustomers.find((entry) => entry.commission?.id === item.id)
        || referredCustomers.find((entry) => (item.case_id && entry.caseRow?.id === item.case_id) || (item.lead_id && entry.lead?.id === item.lead_id))
        || null;
      return {
        ...item,
        partner,
        partnerLabel: buildPartnerLabel(partner),
        customerName: relatedReferral?.customerName || relatedReferral?.customer?.full_name || item.case_id || item.lead_id || "—",
        caseReference: relatedReferral?.caseReference || casesById.get(item.case_id)?.case_code || "—",
        leadReference: relatedReferral?.leadReference || leadsById.get(item.lead_id)?.lead_code || "—",
      };
    }).sort((left, right) => toDateMs(right.created_at) - toDateMs(left.created_at));
  }, [casesById, leadsById, moduleData?.commissions, partnersById, referredCustomers]);

  const payoutRows = useMemo(() => {
    return (moduleData?.payouts || []).map((item) => {
      const partner = partnersById.get(item.partner_id) || null;
      const relatedReferral = referredCustomers.find((entry) => item.case_id && entry.caseRow?.id === item.case_id) || null;
      return {
        ...item,
        partner,
        partnerLabel: buildPartnerLabel(partner),
        customerName: relatedReferral?.customerName || "—",
        caseReference: relatedReferral?.caseReference || casesById.get(item.case_id)?.case_code || "—",
      };
    }).sort((left, right) => toDateMs(right.created_at) - toDateMs(left.created_at));
  }, [casesById, moduleData?.payouts, partnersById, referredCustomers]);

  const activityRows = useMemo(() => {
    const events = [];

    applications.forEach((item) => {
      events.push({
        id: `application-submitted-${item.id}`,
        type: "Application submitted",
        status: item.status,
        title: item.displayName,
        description: `${item.email || "No email"} • ${item.primary_platform || "Platform not set"}`,
        occurredAt: item.created_at,
      });
      if (item.reviewed_at && item.status === "approved") {
        events.push({
          id: `application-approved-${item.id}`,
          type: "Application approved",
          status: item.status,
          title: item.displayName,
          description: item.reviewer?.full_name || item.reviewer?.email || "Reviewed by admin",
          occurredAt: item.reviewed_at,
        });
      }
      if (item.reviewed_at && item.status === "rejected") {
        events.push({
          id: `application-rejected-${item.id}`,
          type: "Application rejected",
          status: item.status,
          title: item.displayName,
          description: item.rejection_reason || "Rejected by admin",
          occurredAt: item.reviewed_at,
        });
      }
    });

    referredCustomers.slice(0, 400).forEach((item) => {
      events.push({
        id: `referral-${item.id}`,
        type: "Referral captured",
        status: item.caseStatus,
        title: item.customerName,
        description: `${item.partnerLabel} • ${item.leadReference}`,
        occurredAt: item.createdAt,
      });
    });

    commissionRows.forEach((item) => {
      events.push({
        id: `commission-created-${item.id}`,
        type: "Commission created",
        status: item.status,
        title: item.partnerLabel,
        description: `${formatCurrency(item.amount, item.currency)} • ${item.caseReference}`,
        occurredAt: item.created_at,
      });
      if (item.paid_at) {
        events.push({
          id: `commission-paid-${item.id}`,
          type: "Commission paid",
          status: item.status,
          title: item.partnerLabel,
          description: `${formatCurrency(item.amount, item.currency)} • ${item.caseReference}`,
          occurredAt: item.paid_at,
        });
      }
    });

    payoutRows.forEach((item) => {
      events.push({
        id: `payout-created-${item.id}`,
        type: "Payout created",
        status: item.status,
        title: item.partnerLabel,
        description: `${formatCurrency(item.amount, item.currency)} • ${item.payment_reference || "Reference pending"}`,
        occurredAt: item.created_at,
      });
      if (item.paid_at) {
        events.push({
          id: `payout-paid-${item.id}`,
          type: "Payout paid",
          status: "paid",
          title: item.partnerLabel,
          description: `${formatCurrency(item.amount, item.currency)} • ${item.payment_reference || "Reference pending"}`,
          occurredAt: item.paid_at,
        });
      }
    });

    partnerRows.forEach((item) => {
      if (item.approved_at) {
        events.push({
          id: `partner-approved-${item.id}`,
          type: "Referral user approved",
          status: item.portal_status || "approved",
          title: item.displayName,
          description: item.referral_code || "Referral code pending",
          occurredAt: item.approved_at,
        });
      }
      if (item.suspended_at) {
        events.push({
          id: `partner-suspended-${item.id}`,
          type: "Referral user suspended",
          status: item.portal_status || "suspended",
          title: item.displayName,
          description: item.referral_code || "Referral code pending",
          occurredAt: item.suspended_at,
        });
      }
    });

    return events
      .filter((item) => item.occurredAt)
      .sort((left, right) => toDateMs(right.occurredAt) - toDateMs(left.occurredAt));
  }, [applications, commissionRows, partnerRows, payoutRows, referredCustomers]);

  const metrics = useMemo(() => {
    const pendingApplications = applications.filter((item) => item.status === "pending").length;
    const approvedUsers = partnerRows.filter((item) => item.portal_status === "approved").length;
    const activeReferredCases = partnerRows.reduce((sum, item) => sum + item.activeCasesCount, 0);
    const totalEarned = commissionRows
      .filter((item) => item.status !== "cancelled")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pendingPayouts = payoutRows
      .filter((item) => !["paid", "cancelled"].includes(String(item.status || "").toLowerCase()))
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const paidPayouts = payoutRows
      .filter((item) => String(item.status || "").toLowerCase() === "paid")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const converted = referredCustomers.filter((item) => item.caseReference !== "—").length;
    const conversionRate = referredCustomers.length ? `${Math.round((converted / referredCustomers.length) * 100)}%` : "—";

    return {
      pendingApplications,
      approvedUsers,
      referredCustomers: referredCustomers.length,
      activeReferredCases,
      totalEarned,
      pendingPayouts,
      paidPayouts,
      conversionRate,
    };
  }, [applications, commissionRows, partnerRows, payoutRows, referredCustomers]);

  const currentRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (activeTab === "applications") {
      return applications.filter((item) => {
        const matchesSearch = !query || [
          item.displayName,
          item.email,
          item.public_name,
          item.primary_platform,
          item.country,
        ].some((value) => String(value || "").toLowerCase().includes(query));
        const matchesStatus = statusFilter === "all" || item.status === statusFilter;
        const matchesPlatform = secondaryFilter === "all" || item.primary_platform === secondaryFilter;
        return matchesSearch && matchesStatus && matchesPlatform && matchesDateRange(item.created_at, dateRange);
      });
    }

    if (activeTab === "partners") {
      return partnerRows.filter((item) => {
        const matchesSearch = !query || [
          item.displayName,
          item.contact_email,
          item.contact_name,
          item.referral_code,
        ].some((value) => String(value || "").toLowerCase().includes(query));
        const matchesStatus = statusFilter === "all" || String(item.portal_status || "approved") === statusFilter;
        return matchesSearch && matchesStatus && matchesDateRange(item.created_at, dateRange);
      });
    }

    if (activeTab === "customers") {
      return referredCustomers.filter((item) => {
        const matchesSearch = !query || [
          item.customerName,
          item.customerEmail,
          item.partnerLabel,
          item.referralCode,
          item.leadReference,
          item.caseReference,
        ].some((value) => String(value || "").toLowerCase().includes(query));
        const matchesStatus = statusFilter === "all" || String(item.caseStatus || "").toLowerCase() === statusFilter;
        const matchesPartner = secondaryFilter === "all" || item.partner?.id === secondaryFilter;
        return matchesSearch && matchesStatus && matchesPartner && matchesDateRange(item.createdAt, dateRange);
      });
    }

    if (activeTab === "commissions") {
      return commissionRows.filter((item) => {
        const matchesSearch = !query || [
          item.partnerLabel,
          item.customerName,
          item.caseReference,
          item.leadReference,
        ].some((value) => String(value || "").toLowerCase().includes(query));
        const matchesStatus = statusFilter === "all" || item.status === statusFilter;
        const matchesPartner = secondaryFilter === "all" || item.partner_id === secondaryFilter;
        return matchesSearch && matchesStatus && matchesPartner && matchesDateRange(item.created_at, dateRange);
      });
    }

    if (activeTab === "payouts") {
      return payoutRows.filter((item) => {
        const matchesSearch = !query || [
          item.partnerLabel,
          item.customerName,
          item.caseReference,
          item.payment_reference,
        ].some((value) => String(value || "").toLowerCase().includes(query));
        const matchesStatus = statusFilter === "all" || item.status === statusFilter;
        const matchesPartner = secondaryFilter === "all" || item.partner_id === secondaryFilter;
        return matchesSearch && matchesStatus && matchesPartner && matchesDateRange(item.created_at, dateRange);
      });
    }

    return activityRows.filter((item) => {
      const matchesSearch = !query || [
        item.title,
        item.type,
        item.description,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = statusFilter === "all" || item.type === statusFilter;
      return matchesSearch && matchesStatus && matchesDateRange(item.occurredAt, dateRange);
    });
  }, [activeTab, activityRows, applications, commissionRows, dateRange, partnerRows, payoutRows, referredCustomers, search, secondaryFilter, statusFilter]);

  const selectedItem = useMemo(() => {
    if (!selectedRecord) return null;
    return currentRows.find((item) => item.id === selectedRecord.id)
      || applications.find((item) => item.id === selectedRecord.id)
      || partnerRows.find((item) => item.id === selectedRecord.id)
      || referredCustomers.find((item) => item.id === selectedRecord.id)
      || commissionRows.find((item) => item.id === selectedRecord.id)
      || payoutRows.find((item) => item.id === selectedRecord.id)
      || activityRows.find((item) => item.id === selectedRecord.id)
      || null;
  }, [activityRows, applications, commissionRows, currentRows, partnerRows, payoutRows, referredCustomers, selectedRecord]);

  useEffect(() => {
    setStatusFilter(activeTab === "applications" ? "pending" : "all");
    setSecondaryFilter("all");
    setSearch("");
    setDateRange({ from: "", to: "" });
    setSelectedRecord(null);
    setDrawerOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (selectedRecord?.type === "application" && selectedItem) {
      setApplicationReview({
        commission_rate: selectedItem.commission_rate || "",
        notes: "",
        rejection_reason: selectedItem.rejection_reason || "",
      });
    }

    if (selectedRecord?.type === "partner" && selectedItem) {
      setPartnerActionNotes(selectedItem.notes || "");
    }
  }, [selectedItem, selectedRecord]);

  const openRecord = (type, id) => {
    setSelectedRecord({ type, id });
    setDrawerOpen(true);
  };

  const closeDrawer = () => setDrawerOpen(false);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter(activeTab === "applications" ? "pending" : "all");
    setSecondaryFilter("all");
    setDateRange({ from: "", to: "" });
  };

  const handleApprove = async () => {
    if (!selectedItem || selectedRecord?.type !== "application") return;
    if (!window.confirm(`Approve referral application for ${selectedItem.displayName}?`)) return;
    setIsSaving(true);
    setError("");
    try {
      await approvePartnerApplication(selectedItem.id, {
        commission_rate: applicationReview.commission_rate ? Number(applicationReview.commission_rate) : undefined,
        notes: applicationReview.notes || undefined,
      });
      await loadData();
      setToast({ type: "success", message: "Referral application approved." });
      setDrawerOpen(false);
    } catch (nextError) {
      setError(nextError.message || "Could not approve application.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedItem || selectedRecord?.type !== "application") return;
    if (!String(applicationReview.rejection_reason || "").trim()) {
      setError("Rejection reason is required.");
      return;
    }
    if (!window.confirm(`Reject referral application for ${selectedItem.displayName}?`)) return;
    setIsSaving(true);
    setError("");
    try {
      await rejectPartnerApplication(selectedItem.id, applicationReview.rejection_reason);
      await loadData();
      setToast({ type: "success", message: "Referral application rejected." });
      setDrawerOpen(false);
    } catch (nextError) {
      setError(nextError.message || "Could not reject application.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePartnerStatusChange = async (nextStatus) => {
    if (!selectedItem || selectedRecord?.type !== "partner") return;
    const label = nextStatus === "suspended" ? "suspend" : "reactivate";
    if (!window.confirm(`${label[0].toUpperCase()}${label.slice(1)} ${selectedItem.displayName}?`)) return;
    setIsSaving(true);
    setError("");
    try {
      await updatePartnerPortalStatus(selectedItem.id, nextStatus, partnerActionNotes);
      await loadData();
      setToast({ type: "success", message: nextStatus === "suspended" ? "Referral user suspended." : "Referral user reactivated." });
    } catch (nextError) {
      setError(nextError.message || "Could not update referral user status.");
    } finally {
      setIsSaving(false);
    }
  };

  const primaryStatusOptions = useMemo(() => {
    if (activeTab === "applications") {
      return [
        { value: "all", label: "All statuses" },
        { value: "pending", label: "Pending" },
        { value: "approved", label: "Approved" },
        { value: "rejected", label: "Rejected" },
        { value: "cancelled", label: "Cancelled" },
      ];
    }
    if (activeTab === "partners") {
      return [
        { value: "all", label: "All partner states" },
        { value: "approved", label: "Approved" },
        { value: "suspended", label: "Suspended" },
        { value: "rejected", label: "Rejected" },
      ];
    }
    if (activeTab === "customers") {
      const caseStatuses = Array.from(new Set(referredCustomers.map((item) => String(item.caseStatus || "").toLowerCase()).filter(Boolean))).sort();
      return [{ value: "all", label: "All case states" }, ...caseStatuses.map((item) => ({ value: item, label: normalizeLabel(item) }))];
    }
    if (activeTab === "commissions") {
      const statuses = Array.from(new Set(commissionRows.map((item) => item.status).filter(Boolean))).sort();
      return [{ value: "all", label: "All commission states" }, ...statuses.map((item) => ({ value: item, label: normalizeLabel(item) }))];
    }
    if (activeTab === "payouts") {
      const statuses = Array.from(new Set(payoutRows.map((item) => item.status).filter(Boolean))).sort();
      return [{ value: "all", label: "All payout states" }, ...statuses.map((item) => ({ value: item, label: normalizeLabel(item) }))];
    }
    const activityTypes = Array.from(new Set(activityRows.map((item) => item.type).filter(Boolean))).sort();
    return [{ value: "all", label: "All activity types" }, ...activityTypes.map((item) => ({ value: item, label: item }))];
  }, [activeTab, activityRows, commissionRows, payoutRows, referredCustomers]);

  const secondaryOptions = useMemo(() => {
    if (activeTab === "applications") {
      const values = Array.from(new Set(applications.map((item) => item.primary_platform).filter(Boolean))).sort();
      return [{ value: "all", label: "All platforms" }, ...values.map((item) => ({ value: item, label: item }))];
    }
    if (["customers", "commissions", "payouts"].includes(activeTab)) {
      return [{ value: "all", label: "All referral users" }, ...partnerRows.map((item) => ({ value: item.id, label: item.displayName }))];
    }
    return [];
  }, [activeTab, applications, partnerRows]);

  const renderApplicationsTable = () => (
    <div className="admin-referral-page__table admin-table">
      <div className="admin-referral-page__table-head">
        <span>Applicant</span>
        <span>Platform</span>
        <span>Audience</span>
        <span>Country</span>
        <span>Submitted</span>
        <span>Status</span>
        <span>Actions</span>
      </div>
      {currentRows.map((item) => (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          className={`admin-referral-page__row admin-list-row${selectedItem?.id === item.id && drawerOpen ? " is-active" : ""}`}
          onClick={() => openRecord("application", item.id)}
          onKeyDown={activateRowOnKeyDown(() => openRecord("application", item.id))}
        >
          <span className="admin-referral-page__cell admin-referral-page__person" data-label="Applicant">
            <span className="admin-referral-page__avatar">{getInitials(item.displayName, item.email)}</span>
            <span>
              <strong>{item.displayName}</strong>
              <small>{item.email || "—"}</small>
            </span>
          </span>
          <span className="admin-referral-page__cell" data-label="Platform">
            <strong>{item.primary_platform || "—"}</strong>
            <small>{item.public_name || "No public name"}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Audience">
            <strong>{item.audience_size || "—"}</strong>
            <small>{normalizeLabel(getAudienceBucket(item.audience_size))}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Country">{item.country || "—"}</span>
          <span className="admin-referral-page__cell" data-label="Submitted">{formatDate(item.created_at)}</span>
          <span className="admin-referral-page__cell" data-label="Status">
            <AdminStatusBadge tone={getStatusTone(item.status)}>{normalizeLabel(item.status)}</AdminStatusBadge>
          </span>
          <span className="admin-referral-page__actions-cell" data-label="Actions" onClick={(event) => event.stopPropagation()}>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" type="button" onClick={() => openRecord("application", item.id)}>View</button>
          </span>
        </div>
      ))}
    </div>
  );

  const renderPartnersTable = () => (
    <div className="admin-referral-page__table admin-table">
      <div className="admin-referral-page__table-head">
        <span>Referral user</span>
        <span>Link</span>
        <span>Performance</span>
        <span>Commission</span>
        <span>Last activity</span>
        <span>Status</span>
        <span>Actions</span>
      </div>
      {currentRows.map((item) => (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          className={`admin-referral-page__row admin-list-row${selectedItem?.id === item.id && drawerOpen ? " is-active" : ""}`}
          onClick={() => openRecord("partner", item.id)}
          onKeyDown={activateRowOnKeyDown(() => openRecord("partner", item.id))}
        >
          <span className="admin-referral-page__cell admin-referral-page__person" data-label="Referral user">
            <span className="admin-referral-page__avatar">{item.initials}</span>
            <span>
              <strong>{item.displayName}</strong>
              <small>{item.contact_email || item.contact_name || "No primary contact"}</small>
            </span>
          </span>
          <span className="admin-referral-page__cell" data-label="Link">
            <strong>{item.referral_code || "—"}</strong>
            <small className="admin-referral-page__truncate">{getPartnerReferralUrl(item) || "Referral link not configured"}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Performance">
            <strong>{item.referredCustomersCount} customers</strong>
            <small>{item.activeCasesCount} active cases • {item.successfulCases} successful</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Commission">
            <strong>{formatCurrency(item.earnedCommission)}</strong>
            <small>Pending payout {formatCurrency(item.pendingPayout)}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Last activity">{formatDateTime(item.lastActivityAt)}</span>
          <span className="admin-referral-page__cell" data-label="Status">
            <AdminStatusBadge tone={getStatusTone(item.portal_status || "approved")}>{normalizeLabel(item.portal_status || "approved")}</AdminStatusBadge>
          </span>
          <span className="admin-referral-page__actions-cell" data-label="Actions" onClick={(event) => event.stopPropagation()}>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" type="button" onClick={() => openRecord("partner", item.id)}>View</button>
          </span>
        </div>
      ))}
    </div>
  );

  const renderCustomersTable = () => (
    <div className="admin-referral-page__table admin-table">
      <div className="admin-referral-page__table-head">
        <span>Customer</span>
        <span>Referred by</span>
        <span>Lead / case</span>
        <span>Route</span>
        <span>Compensation</span>
        <span>Commission</span>
        <span>Actions</span>
      </div>
      {currentRows.map((item) => (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          className={`admin-referral-page__row admin-list-row${selectedItem?.id === item.id && drawerOpen ? " is-active" : ""}`}
          onClick={() => openRecord("customer", item.id)}
          onKeyDown={activateRowOnKeyDown(() => openRecord("customer", item.id))}
        >
          <span className="admin-referral-page__cell admin-referral-page__person" data-label="Customer">
            <span className="admin-referral-page__avatar">{getInitials(item.customerName, item.customerEmail)}</span>
            <span>
              <strong>{item.customerName}</strong>
              <small>{item.customerEmail}</small>
            </span>
          </span>
          <span className="admin-referral-page__cell" data-label="Referred by">
            <div className="admin-referral-page__badge-stack">
              <AdminStatusBadge tone="info">Referred</AdminStatusBadge>
              <small>{item.partnerLabel} • {item.referralCode}</small>
            </div>
          </span>
          <span className="admin-referral-page__cell" data-label="Lead / case">
            <strong>{item.leadReference}</strong>
            <small>{item.caseReference !== "—" ? item.caseReference : "Case not created yet"}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Route">
            <strong>{item.routeLabel}</strong>
            <small>{item.airline}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Compensation">
            <strong>{formatCurrency(item.estimatedCompensation)}</strong>
            <small>{normalizeLabel(item.caseStatus)}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Commission">
            <strong>{formatCurrency(item.commissionAmount)}</strong>
            <small>{normalizeLabel(item.commissionStatus)}</small>
          </span>
          <span className="admin-referral-page__actions-cell" data-label="Actions" onClick={(event) => event.stopPropagation()}>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" type="button" onClick={() => openRecord("customer", item.id)}>View</button>
          </span>
        </div>
      ))}
    </div>
  );

  const renderCommissionsTable = () => (
    <div className="admin-referral-page__table admin-table">
      <div className="admin-referral-page__table-head">
        <span>Referral user</span>
        <span>Customer / case</span>
        <span>Amount</span>
        <span>Rate</span>
        <span>Status</span>
        <span>Created</span>
        <span>Actions</span>
      </div>
      {currentRows.map((item) => (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          className={`admin-referral-page__row admin-list-row${selectedItem?.id === item.id && drawerOpen ? " is-active" : ""}`}
          onClick={() => openRecord("commission", item.id)}
          onKeyDown={activateRowOnKeyDown(() => openRecord("commission", item.id))}
        >
          <span className="admin-referral-page__cell" data-label="Referral user">
            <strong>{item.partnerLabel}</strong>
            <small>{item.partner?.referral_code || "—"}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Customer / case">
            <strong>{item.customerName}</strong>
            <small>{item.caseReference !== "—" ? item.caseReference : item.leadReference}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Amount">
            <strong>{formatCurrency(item.amount, item.currency)}</strong>
            <small>{item.currency || "EUR"}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Rate">
            <strong>{item.commission_rate ? `${Number(item.commission_rate)}%` : "—"}</strong>
            <small>{item.source_amount ? `From ${formatCurrency(item.source_amount, item.currency)}` : "Source amount not configured"}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Status">
            <AdminStatusBadge tone={getStatusTone(item.status)}>{normalizeLabel(item.status)}</AdminStatusBadge>
          </span>
          <span className="admin-referral-page__cell" data-label="Created">{formatDate(item.created_at)}</span>
          <span className="admin-referral-page__actions-cell" data-label="Actions" onClick={(event) => event.stopPropagation()}>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" type="button" onClick={() => openRecord("commission", item.id)}>View</button>
          </span>
        </div>
      ))}
    </div>
  );

  const renderPayoutsTable = () => (
    <div className="admin-referral-page__table admin-table">
      <div className="admin-referral-page__table-head">
        <span>Referral user</span>
        <span>Customer / case</span>
        <span>Amount</span>
        <span>Method / reference</span>
        <span>Status</span>
        <span>Created</span>
        <span>Actions</span>
      </div>
      {currentRows.map((item) => (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          className={`admin-referral-page__row admin-list-row${selectedItem?.id === item.id && drawerOpen ? " is-active" : ""}`}
          onClick={() => openRecord("payout", item.id)}
          onKeyDown={activateRowOnKeyDown(() => openRecord("payout", item.id))}
        >
          <span className="admin-referral-page__cell" data-label="Referral user">
            <strong>{item.partnerLabel}</strong>
            <small>{item.partner?.referral_code || "—"}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Customer / case">
            <strong>{item.customerName}</strong>
            <small>{item.caseReference}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Amount">
            <strong>{formatCurrency(item.amount, item.currency)}</strong>
            <small>{item.currency || "EUR"}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Method / reference">
            <strong>{item.payout_method || "Not configured"}</strong>
            <small>{item.payment_reference || "Reference pending"}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Status">
            <AdminStatusBadge tone={getStatusTone(item.status)}>{normalizeLabel(item.status)}</AdminStatusBadge>
          </span>
          <span className="admin-referral-page__cell" data-label="Created">{formatDate(item.created_at)}</span>
          <span className="admin-referral-page__actions-cell" data-label="Actions" onClick={(event) => event.stopPropagation()}>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" type="button" onClick={() => openRecord("payout", item.id)}>View</button>
          </span>
        </div>
      ))}
    </div>
  );

  const renderActivityTable = () => (
    <div className="admin-referral-page__table admin-table">
      <div className="admin-referral-page__table-head">
        <span>Event</span>
        <span>Subject</span>
        <span>Detail</span>
        <span>Status</span>
        <span>Occurred</span>
        <span>Actions</span>
      </div>
      {currentRows.map((item) => (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          className={`admin-referral-page__row admin-list-row${selectedItem?.id === item.id && drawerOpen ? " is-active" : ""}`}
          onClick={() => openRecord("activity", item.id)}
          onKeyDown={activateRowOnKeyDown(() => openRecord("activity", item.id))}
        >
          <span className="admin-referral-page__cell" data-label="Event">
            <strong>{item.type}</strong>
          </span>
          <span className="admin-referral-page__cell" data-label="Subject">
            <strong>{item.title}</strong>
          </span>
          <span className="admin-referral-page__cell" data-label="Detail">
            <small>{item.description}</small>
          </span>
          <span className="admin-referral-page__cell" data-label="Status">
            <AdminStatusBadge tone={getStatusTone(item.status)}>{normalizeLabel(item.status)}</AdminStatusBadge>
          </span>
          <span className="admin-referral-page__cell" data-label="Occurred">{formatDateTime(item.occurredAt)}</span>
          <span className="admin-referral-page__actions-cell" data-label="Actions" onClick={(event) => event.stopPropagation()}>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" type="button" onClick={() => openRecord("activity", item.id)}>View</button>
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="admin-page admin-referral-page">
      <AdminPageHeader
        title="Referral"
        subtitle="Control center for partner applications, approved referral users, referred customers, commissions, payouts, and activity."
        breadcrumbs={[
          { label: "Admin", path: "/admin" },
          { label: "People" },
          { label: "Referral" },
        ]}
      />

      {toast ? (
        <div className={`admin-referral-page__toast is-${toast.type}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}
      {error ? <p className="admin-message is-error">{error}</p> : null}
      {moduleData && !moduleData.supportsPartnersModuleV1 ? (
        <p className="admin-message">
          Referral partner schema is not available yet. Run `008_referral_partners_module_v1.sql` in Supabase to unlock the referral control center.
        </p>
      ) : null}

      <section className="admin-referral-page__kpis">
        <AdminKpiCard label="Pending applications" value={isLoading ? "—" : metrics.pendingApplications} icon={UserPlus} />
        <AdminKpiCard label="Approved referral users" value={isLoading ? "—" : metrics.approvedUsers} icon={Users} />
        <AdminKpiCard label="Referred customers" value={isLoading ? "—" : metrics.referredCustomers} icon={Link2} />
        <AdminKpiCard label="Active referred cases" value={isLoading ? "—" : metrics.activeReferredCases} icon={Activity} />
        <AdminKpiCard label="Total earned commission" value={isLoading ? "—" : formatCurrency(metrics.totalEarned)} icon={BadgeDollarSign} />
        <AdminKpiCard label="Pending payouts" value={isLoading ? "—" : formatCurrency(metrics.pendingPayouts)} icon={Wallet} />
        <AdminKpiCard label="Paid payouts" value={isLoading ? "—" : formatCurrency(metrics.paidPayouts)} icon={Wallet} />
        <AdminKpiCard label="Conversion rate" value={isLoading ? "—" : metrics.conversionRate} icon={CheckCircle2} />
      </section>

      <section className="admin-referral-page__tabs admin-card admin-card-compact">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`admin-referral-page__tab${activeTab === tab.key ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </section>

      <section className="admin-referral-page__toolbar admin-card admin-card-compact">
        <label className="admin-referral-page__search">
          <Search size={16} />
          <input
            className="admin-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              activeTab === "applications"
                ? "Search name, email, public name"
                : activeTab === "partners"
                  ? "Search referral user, email, code"
                  : activeTab === "customers"
                    ? "Search customer, referral code, case"
                    : activeTab === "commissions"
                      ? "Search partner, customer, case"
                      : activeTab === "payouts"
                        ? "Search partner, customer, reference"
                        : "Search referral activity"
            }
          />
        </label>

        <select className="admin-select admin-filter-control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          {primaryStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>

        {secondaryOptions.length ? (
          <select className="admin-select admin-filter-control" value={secondaryFilter} onChange={(event) => setSecondaryFilter(event.target.value)}>
            {secondaryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : null}

        <input className="admin-input admin-filter-control" type="date" value={dateRange.from} onChange={(event) => setDateRange((current) => ({ ...current, from: event.target.value }))} />
        <input className="admin-input admin-filter-control" type="date" value={dateRange.to} onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))} />

        <button className="admin-btn admin-btn-ghost admin-btn-sm" type="button" onClick={clearFilters}>
          <FilterX size={14} />
          <span>Clear</span>
        </button>
      </section>

      <section className="admin-card admin-referral-page__table-card">
        <header className="admin-referral-page__section-head">
          <div>
            <span className="admin-referral-page__eyebrow">{tabs.find((tab) => tab.key === activeTab)?.label}</span>
            <h3>{currentRows.length} records</h3>
          </div>
        </header>

        {isLoading ? (
          <EmptyState label="Loading referral workspace..." />
        ) : !currentRows.length ? (
          <EmptyState label={`No ${tabs.find((tab) => tab.key === activeTab)?.label.toLowerCase()} match the current filters.`} />
        ) : activeTab === "applications" ? renderApplicationsTable()
          : activeTab === "partners" ? renderPartnersTable()
            : activeTab === "customers" ? renderCustomersTable()
              : activeTab === "commissions" ? renderCommissionsTable()
                : activeTab === "payouts" ? renderPayoutsTable()
                  : renderActivityTable()}
      </section>

      <AdminSidePanel
        open={drawerOpen && Boolean(selectedItem)}
        className="admin-referral-page__drawer"
        eyebrow={selectedRecord ? drawerLabels[selectedRecord.type] || "Referral" : "Referral"}
        title={
          selectedRecord?.type === "application" ? selectedItem?.displayName
            : selectedRecord?.type === "partner" ? selectedItem?.displayName
              : selectedRecord?.type === "customer" ? selectedItem?.customerName
                : selectedRecord?.type === "commission" ? selectedItem?.partnerLabel
                  : selectedRecord?.type === "payout" ? selectedItem?.partnerLabel
                    : selectedItem?.type || selectedItem?.title || "Referral detail"
        }
        subtitle={
          selectedRecord?.type === "application" ? selectedItem?.email
            : selectedRecord?.type === "partner" ? selectedItem?.referral_code
              : selectedRecord?.type === "customer" ? selectedItem?.customerEmail
                : selectedRecord?.type === "commission" ? selectedItem?.caseReference
                  : selectedRecord?.type === "payout" ? selectedItem?.payment_reference || selectedItem?.caseReference
                    : selectedItem?.description || ""
        }
        onClose={closeDrawer}
        withOverlay
        overlayClassName="admin-referral-page__overlay"
        overlayLabel="Close referral detail drawer"
      >
        {selectedRecord?.type === "application" && selectedItem ? (
          <div className="admin-referral-page__drawer-body">
            <SummaryGrid items={[
              { label: "Applicant", value: selectedItem.displayName },
              { label: "Status", value: normalizeLabel(selectedItem.status) },
              { label: "Primary platform", value: selectedItem.primary_platform || "—" },
              { label: "Submitted", value: formatDateTime(selectedItem.created_at) },
            ]} />

            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Applicant profile</h3>
              <div className="admin-referral-page__meta-grid">
                <article><strong>Full name</strong><span>{selectedItem.displayName}</span></article>
                <article><strong>Email</strong><span>{selectedItem.email || "—"}</span></article>
                <article><strong>Phone</strong><span>{selectedItem.phone || "—"}</span></article>
                <article><strong>Country</strong><span>{selectedItem.country || "—"}</span></article>
                <article><strong>Preferred language</strong><span>{selectedItem.preferred_language || "—"}</span></article>
                <article><strong>Public name</strong><span>{selectedItem.public_name || "—"}</span></article>
              </div>
            </section>

            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Social / audience</h3>
              <div className="admin-referral-page__meta-grid">
                <article><strong>Website</strong><span>{selectedItem.website_url || "—"}</span></article>
                <article><strong>Instagram</strong><span>{selectedItem.instagram_url || "—"}</span></article>
                <article><strong>TikTok</strong><span>{selectedItem.tiktok_url || "—"}</span></article>
                <article><strong>YouTube</strong><span>{selectedItem.youtube_url || "—"}</span></article>
                <article><strong>Audience size</strong><span>{selectedItem.audience_size || "—"}</span></article>
                <article><strong>Audience countries</strong><span>{selectedItem.audience_countries || "—"}</span></article>
                <article><strong>Niche</strong><span>{selectedItem.niche || "—"}</span></article>
                <article><strong>Content links</strong><span>{selectedItem.content_links || "—"}</span></article>
              </div>
            </section>

            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Motivation / bio</h3>
              <p>{selectedItem.motivation || "No motivation text supplied."}</p>
              <div className="admin-referral-page__badge-stack">
                <AdminStatusBadge tone={selectedItem.consent_accepted ? "success" : "warning"}>{selectedItem.consent_accepted ? "Consent accepted" : "Consent missing"}</AdminStatusBadge>
                {selectedItem.reviewed_at ? <small>Reviewed {formatDateTime(selectedItem.reviewed_at)}</small> : null}
              </div>
            </section>

            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Review decision</h3>
              <div className="admin-referral-page__form-grid">
                <label>
                  <span>Commission rate (%)</span>
                  <input className="admin-input" type="number" min="0" step="0.01" value={applicationReview.commission_rate} onChange={(event) => setApplicationReview((current) => ({ ...current, commission_rate: event.target.value }))} />
                </label>
                <label>
                  <span>Referral link</span>
                  <input className="admin-input" type="text" value="Generated automatically" readOnly disabled />
                </label>
                <label className="admin-referral-page__form-span">
                  <span>Approval notes</span>
                  <textarea className="admin-input" value={applicationReview.notes} onChange={(event) => setApplicationReview((current) => ({ ...current, notes: event.target.value }))} />
                </label>
                <label className="admin-referral-page__form-span">
                  <span>Rejection reason</span>
                  <textarea className="admin-input" value={applicationReview.rejection_reason} onChange={(event) => setApplicationReview((current) => ({ ...current, rejection_reason: event.target.value }))} />
                </label>
              </div>
              <div className="admin-referral-page__drawer-actions">
                <button className="admin-btn admin-btn-primary" type="button" disabled={!canManageApplications || isSaving || isApprovedLike(selectedItem.status)} onClick={handleApprove}>
                  <CheckCircle2 size={14} />
                  <span>Approve application</span>
                </button>
                <button className="admin-btn admin-btn-danger" type="button" disabled={!canManageApplications || isSaving || selectedItem.status === "rejected"} onClick={handleReject}>
                  <XCircle size={14} />
                  <span>Reject application</span>
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {selectedRecord?.type === "partner" && selectedItem ? (
          <div className="admin-referral-page__drawer-body">
            <section className="admin-referral-page__profile-hero admin-card admin-card-compact">
              <span className="admin-referral-page__avatar is-large">{selectedItem.initials}</span>
              <div>
                <strong>{selectedItem.displayName}</strong>
                <p>{selectedItem.contact_email || selectedItem.contact_name || "No primary contact"}</p>
                <div className="admin-referral-page__badge-stack">
                  <AdminStatusBadge tone={getStatusTone(selectedItem.portal_status || "approved")}>{normalizeLabel(selectedItem.portal_status || "approved")}</AdminStatusBadge>
                  <AdminStatusBadge tone="info">{selectedItem.referral_code || "No code"}</AdminStatusBadge>
                </div>
              </div>
            </section>

            <SummaryGrid items={[
              { label: "Referred customers", value: selectedItem.referredCustomersCount },
              { label: "Active cases", value: selectedItem.activeCasesCount },
              { label: "Total commission", value: formatCurrency(selectedItem.earnedCommission) },
              { label: "Pending payout", value: formatCurrency(selectedItem.pendingPayout) },
            ]} />

            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Profile</h3>
              <div className="admin-referral-page__meta-grid">
                <article><strong>Full name</strong><span>{selectedItem.name || "—"}</span></article>
                <article><strong>Public name</strong><span>{selectedItem.public_name || "—"}</span></article>
                <article><strong>Email</strong><span>{selectedItem.contact_email || "—"}</span></article>
                <article><strong>Phone</strong><span>{selectedItem.contact_phone || "—"}</span></article>
                <article><strong>Website</strong><span>{selectedItem.website_url || "—"}</span></article>
                <article><strong>Instagram</strong><span>{selectedItem.instagram_url || "—"}</span></article>
                <article><strong>TikTok</strong><span>{selectedItem.tiktok_url || "—"}</span></article>
                <article><strong>YouTube</strong><span>{selectedItem.youtube_url || "—"}</span></article>
              </div>
            </section>

            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Referral link</h3>
              <div className="admin-referral-page__drawer-actions">
                <button className="admin-btn admin-btn-secondary" type="button" onClick={() => {
                  if (copyText(getPartnerReferralUrl(selectedItem))) {
                    setToast({ type: "success", message: "Referral link copied." });
                  }
                }}>
                  <Copy size={14} />
                  <span>Copy link</span>
                </button>
              </div>
              <div className="admin-referral-page__meta-grid">
                <article><strong>Referral code</strong><span>{selectedItem.referral_code || "—"}</span></article>
                <article><strong>Full referral URL</strong><span>{getPartnerReferralUrl(selectedItem) || "Referral link not configured"}</span></article>
                <article><strong>Portal status</strong><span>{normalizeLabel(selectedItem.portal_status || "approved")}</span></article>
                <article><strong>Conversion rate</strong><span>{selectedItem.conversionRate}</span></article>
              </div>
            </section>

            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Performance</h3>
              <div className="admin-referral-page__meta-grid">
                <article><strong>Referred customers</strong><span>{selectedItem.referredCustomersCount}</span></article>
                <article><strong>Referred leads</strong><span>{selectedItem.linkedLeads.length}</span></article>
                <article><strong>Active cases</strong><span>{selectedItem.activeCasesCount}</span></article>
                <article><strong>Successful cases</strong><span>{selectedItem.successfulCases}</span></article>
                <article><strong>Total commission earned</strong><span>{formatCurrency(selectedItem.earnedCommission)}</span></article>
                <article><strong>Paid payout</strong><span>{formatCurrency(selectedItem.paidPayout)}</span></article>
              </div>
            </section>

            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Referred customers</h3>
              {selectedItem.partnerCustomers.length ? (
                <div className="admin-referral-page__mini-list">
                  {selectedItem.partnerCustomers.slice(0, 6).map((item) => (
                    <article key={item.id}>
                      <strong>{item.customerName}</strong>
                      <small>{item.caseReference !== "—" ? item.caseReference : item.leadReference} • {normalizeLabel(item.caseStatus)}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <p>No referred customers yet.</p>
              )}
            </section>

            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Status actions</h3>
              <label className="admin-referral-page__form-span">
                <span>Internal note</span>
                <textarea className="admin-input" value={partnerActionNotes} onChange={(event) => setPartnerActionNotes(event.target.value)} />
              </label>
              <div className="admin-referral-page__drawer-actions">
                <button className="admin-btn admin-btn-secondary" type="button" disabled={!canEditPartners || isSaving || selectedItem.portal_status === "suspended"} onClick={() => handlePartnerStatusChange("suspended")}>
                  <XCircle size={14} />
                  <span>Suspend partner</span>
                </button>
                <button className="admin-btn admin-btn-primary" type="button" disabled={!canEditPartners || isSaving || selectedItem.portal_status === "approved"} onClick={() => handlePartnerStatusChange("approved")}>
                  <RefreshCcw size={14} />
                  <span>Reactivate partner</span>
                </button>
                <Link className="admin-btn admin-btn-secondary" to={`/admin/people/customers`}>
                  <Users size={14} />
                  <span>Open customers</span>
                </Link>
              </div>
            </section>
          </div>
        ) : null}

        {selectedRecord?.type === "customer" && selectedItem ? (
          <div className="admin-referral-page__drawer-body">
            <SummaryGrid items={[
              { label: "Referral partner", value: selectedItem.partnerLabel },
              { label: "Referral code", value: selectedItem.referralCode },
              { label: "Commission", value: formatCurrency(selectedItem.commissionAmount) },
              { label: "Payout status", value: normalizeLabel(selectedItem.payoutStatus) },
            ]} />

            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Customer</h3>
              <div className="admin-referral-page__meta-grid">
                <article><strong>Name</strong><span>{selectedItem.customerName}</span></article>
                <article><strong>Email</strong><span>{selectedItem.customerEmail}</span></article>
                <article><strong>Phone</strong><span>{selectedItem.customerPhone}</span></article>
                <article><strong>Account</strong><span>{selectedItem.customer?.id ? "Linked customer" : "Not configured"}</span></article>
              </div>
            </section>

            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Referral attribution</h3>
              <div className="admin-referral-page__meta-grid">
                <article><strong>Referral user</strong><span>{selectedItem.partnerLabel}</span></article>
                <article><strong>Referral code</strong><span>{selectedItem.referralCode}</span></article>
                <article><strong>Source URL</strong><span>{selectedItem.sourceUrl}</span></article>
                <article><strong>Attributed</strong><span>{formatDateTime(selectedItem.createdAt)}</span></article>
              </div>
            </section>

            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Claim / case</h3>
              <div className="admin-referral-page__meta-grid">
                <article><strong>Lead reference</strong><span>{selectedItem.leadReference}</span></article>
                <article><strong>Case reference</strong><span>{selectedItem.caseReference}</span></article>
                <article><strong>Route</strong><span>{selectedItem.routeLabel}</span></article>
                <article><strong>Airline</strong><span>{selectedItem.airline}</span></article>
                <article><strong>Disruption type</strong><span>{selectedItem.disruptionType}</span></article>
                <article><strong>Status</strong><span>{normalizeLabel(selectedItem.caseStatus)}</span></article>
              </div>
            </section>

            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Commission</h3>
              <div className="admin-referral-page__meta-grid">
                <article><strong>Estimated compensation</strong><span>{formatCurrency(selectedItem.estimatedCompensation)}</span></article>
                <article><strong>Commission amount</strong><span>{formatCurrency(selectedItem.commissionAmount)}</span></article>
                <article><strong>Commission status</strong><span>{normalizeLabel(selectedItem.commissionStatus)}</span></article>
                <article><strong>Payout status</strong><span>{normalizeLabel(selectedItem.payoutStatus)}</span></article>
              </div>
              <div className="admin-referral-page__drawer-actions">
                {selectedItem.customer?.id ? <Link className="admin-btn admin-btn-secondary" to={`/admin/people/customers?customer=${selectedItem.customer.id}`}>Open customer</Link> : null}
                {selectedItem.lead?.id ? <Link className="admin-btn admin-btn-secondary" to={`/admin/operations/leads?lead=${selectedItem.lead.id}`}>Open lead</Link> : null}
                {selectedItem.caseRow?.id ? <Link className="admin-btn admin-btn-secondary" to={`/admin/operations/cases?case=${selectedItem.caseRow.id}`}>Open case</Link> : null}
              </div>
            </section>
          </div>
        ) : null}

        {selectedRecord?.type === "commission" && selectedItem ? (
          <div className="admin-referral-page__drawer-body">
            <SummaryGrid items={[
              { label: "Partner", value: selectedItem.partnerLabel },
              { label: "Amount", value: formatCurrency(selectedItem.amount, selectedItem.currency) },
              { label: "Rate", value: selectedItem.commission_rate ? `${Number(selectedItem.commission_rate)}%` : "—" },
              { label: "Status", value: normalizeLabel(selectedItem.status) },
            ]} />
            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Commission detail</h3>
              <div className="admin-referral-page__meta-grid">
                <article><strong>Customer / case</strong><span>{selectedItem.customerName}</span></article>
                <article><strong>Case reference</strong><span>{selectedItem.caseReference}</span></article>
                <article><strong>Lead reference</strong><span>{selectedItem.leadReference}</span></article>
                <article><strong>Created</strong><span>{formatDateTime(selectedItem.created_at)}</span></article>
                <article><strong>Approved</strong><span>{formatDateTime(selectedItem.approved_at)}</span></article>
                <article><strong>Paid</strong><span>{formatDateTime(selectedItem.paid_at)}</span></article>
              </div>
              {!canEditFinance ? <p>Commission status is read-only in the current admin role.</p> : <p>Commission actions are read-only here until a dedicated finance workflow is enabled.</p>}
            </section>
          </div>
        ) : null}

        {selectedRecord?.type === "payout" && selectedItem ? (
          <div className="admin-referral-page__drawer-body">
            <SummaryGrid items={[
              { label: "Partner", value: selectedItem.partnerLabel },
              { label: "Amount", value: formatCurrency(selectedItem.amount, selectedItem.currency) },
              { label: "Status", value: normalizeLabel(selectedItem.status) },
              { label: "Method", value: selectedItem.payout_method || "Not configured" },
            ]} />
            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Payout detail</h3>
              <div className="admin-referral-page__meta-grid">
                <article><strong>Customer / case</strong><span>{selectedItem.customerName}</span></article>
                <article><strong>Case reference</strong><span>{selectedItem.caseReference}</span></article>
                <article><strong>Payment reference</strong><span>{selectedItem.payment_reference || "Reference pending"}</span></article>
                <article><strong>Created</strong><span>{formatDateTime(selectedItem.created_at)}</span></article>
                <article><strong>Paid</strong><span>{formatDateTime(selectedItem.paid_at)}</span></article>
                <article><strong>Note</strong><span>{selectedItem.note || "—"}</span></article>
              </div>
              <p>{canEditFinance ? "Payout actions remain read-only here until a dedicated payout backend flow is enabled." : "Payout detail is read-only in the current admin role."}</p>
            </section>
          </div>
        ) : null}

        {selectedRecord?.type === "activity" && selectedItem ? (
          <div className="admin-referral-page__drawer-body">
            <SummaryGrid items={[
              { label: "Event", value: selectedItem.type },
              { label: "Subject", value: selectedItem.title },
              { label: "Status", value: normalizeLabel(selectedItem.status) },
              { label: "Occurred", value: formatDateTime(selectedItem.occurredAt) },
            ]} />
            <section className="admin-panel-card admin-referral-page__panel-section">
              <h3>Activity detail</h3>
              <p>{selectedItem.description}</p>
            </section>
          </div>
        ) : null}
      </AdminSidePanel>
    </div>
  );
}
