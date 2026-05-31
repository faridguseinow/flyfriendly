import { useEffect, useMemo, useState } from "react";
import { Download, FilterX, Mail, ShieldCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchCustomersModuleData } from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import {
  AdminColumnTable,
  AdminFilterBar,
  AdminMetricsStrip,
  AdminPageHeader,
  AdminSidePanel,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import {
  formatFinanceCurrency,
  formatFinanceDateParts,
  formatFinanceDateTimeLabel,
} from "../../lib/adminFinanceFormatters.js";
import "./style.scss";

function formatDateTime(value) {
  return formatFinanceDateTimeLabel(value);
}

function formatDate(value) {
  return formatFinanceDateParts(value).date;
}

function formatCurrency(value, currency = "EUR") {
  return formatFinanceCurrency(value, currency, { emptyLabel: "—" });
}

function normalizeLabel(value) {
  return String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getInitials(name, fallback = "") {
  const source = String(name || fallback || "").trim();
  if (!source) return "CU";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function deriveAccountStatus(profile) {
  const normalizedStatus = String(profile?.status || "").toLowerCase();
  if (["blocked", "disabled", "suspended", "inactive", "deleted"].includes(normalizedStatus)) return "blocked";
  if (profile?.last_login_at) return "active";
  if (profile?.id) return "registered";
  return "unknown";
}

function getAccountTone(status) {
  if (status === "active" || status === "registered") return "success";
  if (status === "blocked") return "danger";
  if (status === "invited" || status === "pending password") return "warning";
  return "neutral";
}

function exportCustomersCsv(rows) {
  const headers = [
    "Customer",
    "Email",
    "Phone",
    "Account Status",
    "Portal Access",
    "Total Claims",
    "Active Cases",
    "Estimated Compensation",
    "Pending Payout",
    "Paid Amount",
    "Created",
    "Last Activity",
  ];

  const lines = rows.map((item) => [
    item.displayName,
    item.email,
    item.phone,
    item.accountStatus,
    item.portalAccess ? "Yes" : "No",
    item.totalClaims,
    item.activeCasesCount,
    item.estimatedCompensationTotal,
    item.pendingPayoutTotal,
    item.paidAmountTotal,
    item.createdSortDate,
    item.lastActivityAt,
  ]);

  const csv = [headers, ...lines]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fly-friendly-customers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AdminCustomers() {
  const { hasPermission } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const [moduleData, setModuleData] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadCustomers = async () => {
    setError("");
    setIsLoading(true);

    try {
      const next = await fetchCustomersModuleData();
      setModuleData(next);
    } catch (nextError) {
      setError(nextError.message || "Could not load customers module.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    const deepLinkedCustomerId = searchParams.get("customer");
    if (deepLinkedCustomerId) {
      setSelectedCustomerId(deepLinkedCustomerId);
      setDrawerOpen(true);
    }
  }, [searchParams]);

  const customerRows = useMemo(() => {
    const profilesByEmail = new Map((moduleData?.profiles || [])
      .filter((profile) => profile.email)
      .map((profile) => [String(profile.email).toLowerCase(), profile]));
    const referrals = moduleData?.referrals || [];
    const leadsByCustomer = new Map();
    const casesByCustomer = new Map();
    const communicationsByCustomer = new Map();
    const financeByCase = new Map((moduleData?.finance || []).map((entry) => [entry.case_id, entry]));
    const leadDocumentsByLead = new Map();
    const caseDocumentsByCase = new Map();
    const signaturesByLead = new Map();

    (moduleData?.leads || []).forEach((lead) => {
      const current = leadsByCustomer.get(lead.customer_id) || [];
      current.push(lead);
      leadsByCustomer.set(lead.customer_id, current);
    });

    (moduleData?.cases || []).forEach((caseRow) => {
      const current = casesByCustomer.get(caseRow.customer_id) || [];
      current.push(caseRow);
      casesByCustomer.set(caseRow.customer_id, current);
    });

    (moduleData?.communications || []).forEach((entry) => {
      const current = communicationsByCustomer.get(entry.customer_id) || [];
      current.push(entry);
      communicationsByCustomer.set(entry.customer_id, current);
    });

    (moduleData?.leadDocuments || []).forEach((document) => {
      const current = leadDocumentsByLead.get(document.lead_id) || [];
      current.push(document);
      leadDocumentsByLead.set(document.lead_id, current);
    });

    (moduleData?.caseDocuments || []).forEach((document) => {
      const current = caseDocumentsByCase.get(document.case_id) || [];
      current.push(document);
      caseDocumentsByCase.set(document.case_id, current);
    });

    (moduleData?.leadSignatures || []).forEach((signature) => {
      const current = signaturesByLead.get(signature.lead_id) || [];
      current.push(signature);
      signaturesByLead.set(signature.lead_id, current);
    });

    return (moduleData?.customers || []).map((customer) => {
      const linkedLeads = [...(leadsByCustomer.get(customer.id) || [])].sort((left, right) => new Date(right.updated_at || right.created_at).getTime() - new Date(left.updated_at || left.created_at).getTime());
      const linkedCases = [...(casesByCustomer.get(customer.id) || [])].sort((left, right) => new Date(right.updated_at || right.created_at).getTime() - new Date(left.updated_at || left.created_at).getTime());
      const linkedCommunications = [...(communicationsByCustomer.get(customer.id) || [])].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
      const profile = customer.email ? profilesByEmail.get(String(customer.email).toLowerCase()) || null : null;
      const accountStatus = deriveAccountStatus(profile);
      const portalAccess = Boolean(profile);
      const activeCases = linkedCases.filter((caseRow) => caseRow.is_active_customer_case);
      const estimatedCompensationTotal = linkedCases.reduce((sum, caseRow) => sum + Number(caseRow.estimated_compensation || 0), 0);
      const linkedFinance = linkedCases.map((caseRow) => financeByCase.get(caseRow.id)).filter(Boolean);
      const pendingPayoutTotal = moduleData?.supportsCustomerFinance
        ? linkedFinance
          .filter((entry) => !["completed", "paid"].includes(String(entry.payment_status || "").toLowerCase()))
          .reduce((sum, entry) => sum + Number(entry.customer_payout || 0), 0)
        : null;
      const paidAmountTotal = moduleData?.supportsCustomerFinance
        ? linkedFinance
          .filter((entry) => ["completed", "paid"].includes(String(entry.payment_status || "").toLowerCase()) || entry.customer_paid_at)
          .reduce((sum, entry) => sum + Number(entry.customer_payout || 0), 0)
        : null;
      const documentCount = linkedLeads.reduce((sum, lead) => sum + (leadDocumentsByLead.get(lead.id)?.length || 0) + (signaturesByLead.get(lead.id)?.length || 0), 0)
        + linkedCases.reduce((sum, caseRow) => sum + (caseDocumentsByCase.get(caseRow.id)?.length || 0), 0);
      const hasPassport = linkedLeads.some((lead) => (leadDocumentsByLead.get(lead.id) || []).some((item) => String(item.document_type || "").toLowerCase().includes("passport") || String(item.document_type || "").toLowerCase().includes("id")));
      const hasBoarding = linkedLeads.some((lead) => (leadDocumentsByLead.get(lead.id) || []).some((item) => String(item.document_type || "").toLowerCase().includes("boarding")))
        || linkedCases.some((caseRow) => (caseDocumentsByCase.get(caseRow.id) || []).some((item) => String(item.document_type || "").toLowerCase().includes("boarding")));
      const hasSignature = linkedLeads.some((lead) => (signaturesByLead.get(lead.id) || []).some((item) => item.terms_accepted))
        || linkedLeads.some((lead) => (leadDocumentsByLead.get(lead.id) || []).some((item) => String(item.document_type || "").toLowerCase().includes("signature") || String(item.document_type || "").toLowerCase().includes("consent")));
      const missingRequiredDocuments = [
        !hasPassport ? "Passport / ID" : null,
        !hasBoarding ? "Boarding Pass" : null,
        !hasSignature ? "Signature / Consent" : null,
      ].filter(Boolean);
      const latestLead = linkedLeads[0] || null;
      const latestCase = linkedCases[0] || null;
      const referralInfo = referrals.find((item) => item.customer_id === customer.id)
        || referrals.find((item) => linkedCases.some((caseRow) => caseRow.id === item.case_id))
        || referrals.find((item) => linkedLeads.some((lead) => lead.id === item.lead_id))
        || (customer.email
          ? referrals.find((item) => String(item.attribution_meta?.client_email || "").toLowerCase() === String(customer.email || "").toLowerCase())
          : null)
        || null;
      const referralLabel = referralInfo
        ? referralInfo.attribution_meta?.partner_name
          || referralInfo.attribution_meta?.partner_referral_code
          || referralInfo.referral_code
          || "Referral"
        : "";
      const createdSortDate = profile?.created_at || customer.created_at || linkedLeads[linkedLeads.length - 1]?.created_at || linkedCases[linkedCases.length - 1]?.created_at || null;
      const lastActivityAt = [
        customer.updated_at,
        latestLead?.updated_at,
        latestLead?.created_at,
        latestCase?.updated_at,
        latestCase?.created_at,
        linkedCommunications[0]?.created_at,
        linkedFinance[0]?.updated_at,
      ].filter(Boolean).sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null;
      const customerTypes = [
        linkedLeads.length ? "claim_submitted" : null,
        portalAccess ? "registered_account" : null,
        activeCases.length ? "has_active_case" : null,
        paidAmountTotal ? "paid_customer" : null,
      ].filter(Boolean);

      return {
        ...customer,
        profile,
        linkedLeads,
        linkedCases,
        linkedCommunications,
        accountStatus,
        portalAccess,
        activeCases,
        activeCasesCount: activeCases.length,
        totalClaims: Number(customer.total_leads || linkedLeads.length || 0),
        estimatedCompensationTotal,
        pendingPayoutTotal,
        paidAmountTotal,
        documentCount,
        missingRequiredDocuments,
        latestLead,
        latestCase,
        referralInfo,
        referralLabel,
        createdSortDate,
        lastActivityAt,
        customerTypes,
        displayName: customer.full_name || customer.email || customer.phone || `Customer ${String(customer.id || "").slice(0, 8)}`,
        initials: getInitials(customer.full_name, customer.email || customer.phone),
        currency: linkedFinance.find((entry) => entry?.currency)?.currency || "EUR",
      };
    });
  }, [moduleData]);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const fromMs = dateRange.from ? new Date(`${dateRange.from}T00:00:00`).getTime() : null;
    const toMs = dateRange.to ? new Date(`${dateRange.to}T23:59:59`).getTime() : null;

    const rows = customerRows.filter((item) => {
      const matchesSearch = !query || [
        item.displayName,
        item.email,
        item.phone,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesAccount = accountFilter === "all" || item.accountStatus === accountFilter;
      const matchesType = typeFilter === "all" || item.customerTypes.includes(typeFilter);
      const createdMs = item.createdSortDate ? new Date(item.createdSortDate).getTime() : null;
      const matchesFrom = !fromMs || (createdMs && createdMs >= fromMs);
      const matchesTo = !toMs || (createdMs && createdMs <= toMs);

      return matchesSearch && matchesAccount && matchesType && matchesFrom && matchesTo;
    });

    return [...rows].sort((left, right) => new Date(right.createdSortDate || 0).getTime() - new Date(left.createdSortDate || 0).getTime());
  }, [accountFilter, customerRows, dateRange.from, dateRange.to, search, typeFilter]);

  const metrics = useMemo(() => {
    const total = filteredCustomers.length;
    const registered = filteredCustomers.filter((item) => item.portalAccess).length;
    const referred = filteredCustomers.filter((item) => item.referralInfo).length;
    const activeCases = filteredCustomers.reduce((sum, item) => sum + Number(item.activeCasesCount || 0), 0);
    const pending = filteredCustomers.reduce((sum, item) => sum + Number(item.pendingPayoutTotal || 0), 0);
    const paid = filteredCustomers.reduce((sum, item) => sum + Number(item.paidAmountTotal || 0), 0);

    return [
      { label: "Total", value: total },
      { label: "Registered", value: registered },
      { label: "Referred", value: referred },
      { label: "Active cases", value: activeCases },
      { label: "Pending", value: formatCurrency(pending) },
      { label: "Paid", value: formatCurrency(paid) },
    ];
  }, [filteredCustomers]);

  const customerColumns = useMemo(() => ([
    {
      key: "customer",
      label: "Customer",
      width: 220,
      minWidth: 160,
      maxWidth: 360,
      resizable: true,
      reorderable: true,
      wrap: true,
      renderCell: (customer) => (
        <div className="admin-crm-page__primary">
          <strong className="admin-crm-table__cell-main" title={customer.displayName}>{customer.displayName}</strong>
          <span className="admin-crm-table__cell-sub">{customer.country || (customer.referralInfo ? `Referral · ${customer.referralLabel}` : "Country not set")}</span>
        </div>
      ),
      getCellTitle: (customer) => customer.displayName,
    },
    {
      key: "contact",
      label: "Contact",
      width: 220,
      minWidth: 160,
      maxWidth: 360,
      resizable: true,
      reorderable: true,
      wrap: true,
      renderCell: (customer) => (
        <div className="admin-crm-page__primary">
          <strong className="admin-crm-table__cell-main" title={customer.email || "—"}>{customer.email || "—"}</strong>
          <span className="admin-crm-table__cell-sub" title={customer.phone || "—"}>{customer.phone || "—"}</span>
        </div>
      ),
      getCellTitle: (customer) => `${customer.email || "—"}${customer.phone ? ` · ${customer.phone}` : ""}`,
    },
    {
      key: "account",
      label: "Account",
      width: 160,
      minWidth: 130,
      maxWidth: 240,
      resizable: true,
      reorderable: true,
      wrap: false,
      renderCell: (customer) => (
        <div className="admin-customers-page__account-cell">
          <AdminStatusBadge tone={getAccountTone(customer.accountStatus)}>{normalizeLabel(customer.accountStatus)}</AdminStatusBadge>
          <span className="admin-crm-table__cell-sub">{customer.portalAccess ? "Portal linked" : "No portal access"}</span>
        </div>
      ),
    },
    {
      key: "claims",
      label: "Claims",
      width: 130,
      minWidth: 100,
      maxWidth: 200,
      resizable: true,
      reorderable: true,
      wrap: true,
      renderCell: (customer) => (
        <div className="admin-crm-page__primary">
          <strong className="admin-crm-table__cell-main">{customer.totalClaims}</strong>
          <span className="admin-crm-table__cell-sub">{customer.activeCasesCount} active cases</span>
        </div>
      ),
    },
    {
      key: "compensation",
      label: "Compensation",
      width: 170,
      minWidth: 130,
      maxWidth: 260,
      resizable: true,
      reorderable: true,
      wrap: true,
      renderCell: (customer) => (
        <div className="admin-crm-page__primary">
          <strong className="admin-crm-table__cell-main">{formatCurrency(customer.estimatedCompensationTotal, customer.currency)}</strong>
          <span className="admin-crm-table__cell-sub">Pending {formatCurrency(customer.pendingPayoutTotal, customer.currency)}</span>
        </div>
      ),
      getCellTitle: (customer) => `Estimated ${formatCurrency(customer.estimatedCompensationTotal, customer.currency)} · Pending ${formatCurrency(customer.pendingPayoutTotal, customer.currency)} · Paid ${formatCurrency(customer.paidAmountTotal, customer.currency)}`,
    },
    {
      key: "created",
      label: "Created",
      width: 130,
      minWidth: 110,
      maxWidth: 180,
      resizable: true,
      reorderable: true,
      wrap: true,
      renderCell: (customer) => {
        const created = formatFinanceDateParts(customer.createdSortDate);
        return (
          <div className="admin-crm-page__date">
            <strong className="admin-crm-table__cell-main">{created.date}</strong>
            {created.time ? <span className="admin-crm-table__cell-sub">{created.time}</span> : null}
          </div>
        );
      },
      getCellTitle: (customer) => formatDateTime(customer.createdSortDate),
    },
    {
      key: "lastActivity",
      label: "Last activity",
      width: 150,
      minWidth: 120,
      maxWidth: 220,
      resizable: true,
      reorderable: true,
      wrap: true,
      renderCell: (customer) => {
        const last = formatFinanceDateParts(customer.lastActivityAt);
        return (
          <div className="admin-crm-page__date">
            <strong className="admin-crm-table__cell-main">{last.date}</strong>
            {last.time ? <span className="admin-crm-table__cell-sub">{last.time}</span> : null}
          </div>
        );
      },
      getCellTitle: (customer) => formatDateTime(customer.lastActivityAt),
    },
  ]), []);

  const selectedCustomer = useMemo(
    () => filteredCustomers.find((item) => item.id === selectedCustomerId)
      || customerRows.find((item) => item.id === selectedCustomerId)
      || null,
    [customerRows, filteredCustomers, selectedCustomerId],
  );

  const openCustomer = (customerId) => {
    setSelectedCustomerId(customerId);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
  };

  const clearFilters = () => {
    setSearch("");
    setAccountFilter("all");
    setTypeFilter("all");
    setDateRange({ from: "", to: "" });
  };

  const activityItems = useMemo(() => {
    if (!selectedCustomer) return [];

    const leadItems = selectedCustomer.linkedLeads.slice(0, 3).map((lead) => ({
      id: `lead-${lead.id}`,
      label: lead.lead_code || `Lead ${String(lead.id).slice(0, 8)}`,
      meta: `${normalizeLabel(lead.status || "new")} • ${lead.airline || "—"} • ${formatDateTime(lead.updated_at || lead.created_at)}`,
    }));
    const caseItems = selectedCustomer.linkedCases.slice(0, 3).map((caseRow) => ({
      id: `case-${caseRow.id}`,
      label: caseRow.case_code || `Case ${String(caseRow.id).slice(0, 8)}`,
      meta: `${normalizeLabel(caseRow.status || "draft")} • ${caseRow.airline || "—"} • ${formatDateTime(caseRow.updated_at || caseRow.created_at)}`,
    }));
    const communicationItems = selectedCustomer.linkedCommunications.slice(0, 3).map((entry) => ({
      id: `communication-${entry.id}`,
      label: `${normalizeLabel(entry.channel || "communication")}`,
      meta: `${entry.subject || entry.body || "No content"} • ${formatDateTime(entry.created_at)}`,
    }));

    return [...caseItems, ...leadItems, ...communicationItems]
      .sort((left, right) => {
        const leftTime = new Date(String(left.meta).split(" • ").pop() || 0).getTime();
        const rightTime = new Date(String(right.meta).split(" • ").pop() || 0).getTime();
        return rightTime - leftTime;
      })
      .slice(0, 6);
  }, [selectedCustomer]);

  return (
    <div className="admin-page admin-customers-page admin-crm-page">
      {error ? <p className="admin-message is-error">{error}</p> : null}
      {moduleData && !moduleData.supportsCustomersModuleV1 ? (
        <p className="admin-message">
          Customers schema is not available yet. Run `006_core_operations_schema_v1.sql` and `007_cases_module_v1.sql`
          in Supabase to unlock the full customers module.
        </p>
      ) : null}

      <AdminPageHeader
        title="Customers"
        secondaryActions={[
          {
            label: "Export CSV",
            icon: Download,
            onClick: () => exportCustomersCsv(filteredCustomers),
            disabled: !filteredCustomers.length,
          },
        ]}
      />

      <section className="admin-crm-page__workspace">
        <AdminMetricsStrip items={metrics} />

        <AdminFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search name, email, phone"
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        >
          <select className="admin-filter-control admin-select" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
            <option value="all">All account statuses</option>
            <option value="registered">Registered</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
            <option value="unknown">Unknown</option>
          </select>

          <select className="admin-filter-control admin-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All customer types</option>
            <option value="claim_submitted">Claim submitted</option>
            <option value="registered_account">Registered account</option>
            <option value="has_active_case">Has active case</option>
            <option value="paid_customer">Paid customer</option>
          </select>

          <button className="admin-btn admin-btn-secondary admin-crm-page__clear" type="button" onClick={clearFilters}>
            <FilterX size={15} />
            <span>Clear filters</span>
          </button>
        </AdminFilterBar>

        <AdminColumnTable
          storageKey="ff-admin-table-layout-customers"
          title="Customers"
          countLabel={`${filteredCustomers.length} customer${filteredCustomers.length === 1 ? "" : "s"}`}
          columns={customerColumns}
          rows={filteredCustomers}
          loading={isLoading}
          error={error}
          emptyTitle={search || accountFilter !== "all" || typeFilter !== "all" ? "No customers match these filters" : "No customers found"}
          emptyDetail="Adjust filters or wait for new claims and registrations."
          selectedRowId={drawerOpen ? selectedCustomer?.id || "" : ""}
          getRowKey={(customer) => customer.id}
          onRowClick={(customer) => openCustomer(customer.id)}
        />
      </section>

      {selectedCustomer ? (
        <AdminSidePanel
          open={drawerOpen}
          className="admin-customers-page__drawer"
          eyebrow="Customer"
          title={selectedCustomer.displayName}
          subtitle={selectedCustomer.email || selectedCustomer.phone || "No primary contact"}
          onClose={closeDrawer}
          withOverlay
          overlayClassName="admin-customers-page__overlay"
          overlayLabel="Close customer drawer"
        >
          <section className="admin-customers-page__drawer-hero">
            <span className="admin-customers-page__avatar is-large">{selectedCustomer.initials}</span>
            <div>
              <strong>{selectedCustomer.displayName}</strong>
              <p>{selectedCustomer.email || "—"}</p>
              <div className="admin-customers-page__drawer-badges">
                <AdminStatusBadge tone={getAccountTone(selectedCustomer.accountStatus)}>{normalizeLabel(selectedCustomer.accountStatus)}</AdminStatusBadge>
                <AdminStatusBadge tone={selectedCustomer.portalAccess ? "success" : "neutral"}>{selectedCustomer.portalAccess ? "Portal linked" : "No portal access"}</AdminStatusBadge>
                {selectedCustomer.referralInfo ? <AdminStatusBadge tone="info">Referred</AdminStatusBadge> : null}
              </div>
            </div>
          </section>

          <section className="admin-customers-page__summary">
            <article><strong>Full name</strong><span>{selectedCustomer.displayName}</span></article>
            <article><strong>Created</strong><span>{formatDateTime(selectedCustomer.createdSortDate)}</span></article>
            <article><strong>Email</strong><span>{selectedCustomer.email || "—"}</span></article>
            <article><strong>Last login</strong><span>{selectedCustomer.profile?.last_login_at ? formatDateTime(selectedCustomer.profile.last_login_at) : "—"}</span></article>
            <article><strong>Phone</strong><span>{selectedCustomer.phone || "—"}</span></article>
            <article><strong>Preferred language</strong><span>{selectedCustomer.preferred_language || "—"}</span></article>
            <article><strong>Country</strong><span>{selectedCustomer.country || "—"}</span></article>
            <article><strong>Portal role</strong><span>{selectedCustomer.profile?.role ? normalizeLabel(selectedCustomer.profile.role) : "—"}</span></article>
          </section>

          <section className="admin-customers-page__section">
            <div className="admin-customers-page__section-title">
              <h4>Claims / Cases</h4>
            </div>
            <div className="admin-customers-page__summary">
              <article><strong>Total claims</strong><span>{selectedCustomer.totalClaims}</span></article>
              <article><strong>Active cases</strong><span>{selectedCustomer.activeCasesCount}</span></article>
              <article><strong>Latest claim</strong><span>{selectedCustomer.latestLead?.lead_code || "—"}</span></article>
              <article><strong>Latest case</strong><span>{selectedCustomer.latestCase?.case_code || "—"}</span></article>
            </div>
            <div className="admin-customers-page__drawer-actions">
              <Link className="admin-btn admin-btn-secondary" to="/admin/operations/leads">Open claims</Link>
              <Link className="admin-btn admin-btn-secondary" to="/admin/operations/cases">Open cases</Link>
            </div>
          </section>

          {selectedCustomer.referralInfo ? (
            <section className="admin-customers-page__section">
              <div className="admin-customers-page__section-title">
                <h4>Referral attribution</h4>
              </div>
              <div className="admin-customers-page__summary">
                <article><strong>Attribution</strong><span>Referred</span></article>
                <article><strong>Referral partner</strong><span>{selectedCustomer.referralLabel}</span></article>
                <article><strong>Referral code</strong><span>{selectedCustomer.referralInfo.referral_code || "—"}</span></article>
                <article><strong>Attributed</strong><span>{formatDateTime(selectedCustomer.referralInfo.created_at || selectedCustomer.referralInfo.updated_at)}</span></article>
              </div>
            </section>
          ) : null}

          <section className="admin-customers-page__section">
            <div className="admin-customers-page__section-title">
              <h4>Compensation</h4>
            </div>
            {moduleData?.supportsCustomerFinance ? (
              <div className="admin-customers-page__summary">
                <article><strong>Estimated compensation</strong><span>{formatCurrency(selectedCustomer.estimatedCompensationTotal, selectedCustomer.currency)}</span></article>
                <article><strong>Pending payout</strong><span>{formatCurrency(selectedCustomer.pendingPayoutTotal, selectedCustomer.currency)}</span></article>
                <article><strong>Paid amount</strong><span>{formatCurrency(selectedCustomer.paidAmountTotal, selectedCustomer.currency)}</span></article>
                <article><strong>Currency</strong><span>{selectedCustomer.currency || "EUR"}</span></article>
              </div>
            ) : (
              <p className="admin-customers-page__empty-copy">Finance details not configured.</p>
            )}
          </section>

          <section className="admin-customers-page__section">
            <div className="admin-customers-page__section-title">
              <h4>Documents</h4>
            </div>
            <div className="admin-customers-page__summary">
              <article><strong>Uploaded documents</strong><span>{selectedCustomer.documentCount}</span></article>
              <article><strong>Missing required</strong><span>{selectedCustomer.missingRequiredDocuments.length || 0}</span></article>
            </div>
            {selectedCustomer.missingRequiredDocuments.length ? (
              <div className="admin-customers-page__missing-list">
                {selectedCustomer.missingRequiredDocuments.map((item) => <span key={item}>{item}</span>)}
              </div>
            ) : (
              <p className="admin-customers-page__empty-copy">Required customer documents look complete.</p>
            )}
            <div className="admin-customers-page__drawer-actions">
              <Link className="admin-btn admin-btn-secondary" to="/admin/operations/documents">Open documents</Link>
            </div>
          </section>

          <section className="admin-customers-page__section">
            <div className="admin-customers-page__section-title">
              <h4>Activity</h4>
            </div>
            {activityItems.length ? (
              <div className="admin-customers-page__activity-list">
                {activityItems.map((item) => (
                  <article key={item.id} className="admin-list-card">
                    <strong>{item.label}</strong>
                    <p>{item.meta}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="admin-customers-page__empty-copy">No recent customer activity yet.</p>
            )}
          </section>

          <section className="admin-customers-page__section">
            <div className="admin-customers-page__section-title">
              <h4>Actions</h4>
            </div>
            <div className="admin-customers-page__drawer-actions">
              <Link className="admin-btn admin-btn-secondary" to="/admin/people/customers">Open customer record</Link>
              <Link className="admin-btn admin-btn-secondary" to="/admin/operations/cases">Open related cases</Link>
              <Link className="admin-btn admin-btn-secondary" to="/admin/operations/leads">Open related claims</Link>
              {selectedCustomer.email ? (
                <a className="admin-btn admin-btn-secondary" href={`mailto:${selectedCustomer.email}`}>
                  <Mail size={14} />
                  <span>Email customer</span>
                </a>
              ) : null}
              {hasPermission("customers.manage") ? (
                <button className="admin-btn admin-btn-ghost" type="button" disabled title="Account block/reactivate flow is not configured in the current backend.">
                  <ShieldCheck size={14} />
                  <span>Account actions not configured</span>
                </button>
              ) : null}
            </div>
          </section>
        </AdminSidePanel>
      ) : null}
    </div>
  );
}
