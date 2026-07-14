import { useEffect, useMemo, useState } from "react";
import { Link2, Users } from "lucide-react";
import { fetchReferralPartnersModuleData } from "../../services/adminService.js";
import {
  AdminColumnTable,
  AdminFilterBar,
  AdminKpiCard,
  AdminPageHeader,
  AdminSidePanel,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import "../AdminReferralPartners/style.scss";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function toPartnerLabel(partner) {
  return partner?.public_name || partner?.name || partner?.referral_code || "—";
}

function toClaimStatusTone(status) {
  if (["won", "approved", "paid", "closed"].includes(status)) return "success";
  if (["rejected", "cancelled"].includes(status)) return "danger";
  if (["submitted", "under_review", "pending_review", "documents_pending"].includes(status)) return "warning";
  return "neutral";
}

function toAttributionDate(lead) {
  return lead.created_at || null;
}

export default function AdminReferrals() {
  const [moduleData, setModuleData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedReferralId, setSelectedReferralId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      setError("");
      setIsLoading(true);
      try {
        setModuleData(await fetchReferralPartnersModuleData());
      } catch (nextError) {
        setError(nextError.message || "Could not load referrals.");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const partnersById = useMemo(
    () => new Map((moduleData?.partners || []).map((partner) => [partner.id, partner])),
    [moduleData?.partners],
  );

  const leadsById = useMemo(
    () => new Map((moduleData?.leads || []).map((lead) => [lead.id, lead])),
    [moduleData?.leads],
  );

  const casesById = useMemo(
    () => new Map((moduleData?.cases || []).map((caseRow) => [caseRow.id, caseRow])),
    [moduleData?.cases],
  );

  const caseByLeadId = useMemo(() => {
    const map = new Map();
    (moduleData?.cases || []).forEach((caseRow) => {
      if (caseRow?.lead_id) {
        map.set(caseRow.lead_id, caseRow);
      }
    });
    return map;
  }, [moduleData?.cases]);

  const casesByPartnerId = useMemo(() => {
    const map = new Map();
    (moduleData?.cases || []).forEach((caseRow) => {
      if (!caseRow.referral_partner_id) return;
      const next = map.get(caseRow.referral_partner_id) || [];
      next.push(caseRow);
      map.set(caseRow.referral_partner_id, next);
    });
    return map;
  }, [moduleData?.cases]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const baseRows = (moduleData?.referrals || []).length
      ? (moduleData.referrals || []).map((referral) => {
        const lead = referral.lead_id ? leadsById.get(referral.lead_id) || null : null;
        const matchingCase = referral.case_id
          ? casesById.get(referral.case_id) || null
          : (lead?.id ? caseByLeadId.get(lead.id) || null : null);
        const partner = partnersById.get(referral.partner_id)
          || (lead?.referral_partner_id ? partnersById.get(lead.referral_partner_id) || null : null)
          || (matchingCase?.referral_partner_id ? partnersById.get(matchingCase.referral_partner_id) || null : null);
        const attributionMeta = referral.attribution_meta || {};

        return {
          id: referral.id,
          leadId: lead?.id || referral.lead_id || null,
          leadCode: lead?.lead_code || attributionMeta.lead_code || "—",
          partnerId: referral.partner_id || lead?.referral_partner_id || matchingCase?.referral_partner_id || null,
          partnerLabel: toPartnerLabel(partner),
          partnerCode: referral.referral_code || attributionMeta.partner_referral_code || partner?.referral_code || "—",
          partnerPortalStatus: partner?.portal_status || "approved",
          claimStatus: matchingCase?.status || attributionMeta.case_status || lead?.status || referral.status || "submitted",
          attributionDate: referral.created_at || toAttributionDate(lead),
          routeLabel: [
            matchingCase?.route_from || attributionMeta.route_from || lead?.departure_airport,
            matchingCase?.route_to || attributionMeta.route_to || lead?.arrival_airport,
          ].filter(Boolean).join(" -> ") || "—",
          sourceLabel: referral.referral_code || lead?.source_details?.referral_code || lead?.source || "—",
          linkedCaseCode: matchingCase?.case_code || attributionMeta.case_code || "—",
          rawLead: lead || { created_at: referral.created_at || null },
          rawPartner: partner || null,
          rawCase: matchingCase,
        };
      })
      : (moduleData?.leads || [])
        .filter((lead) => lead.referral_partner_id)
        .map((lead) => {
        const partner = partnersById.get(lead.referral_partner_id);
        const relatedCases = casesByPartnerId.get(lead.referral_partner_id) || [];
        const matchingCase = relatedCases.find((item) => item.case_code && lead.payload?.caseCode && item.case_code === lead.payload.caseCode)
          || relatedCases.find((item) => item.status !== "cancelled")
          || null;

        return {
          id: lead.id,
          leadId: lead.id,
          leadCode: lead.lead_code || "—",
          partnerId: lead.referral_partner_id,
          partnerLabel: toPartnerLabel(partner),
          partnerCode: partner?.referral_code || "—",
          partnerPortalStatus: partner?.portal_status || "approved",
          claimStatus: matchingCase?.status || lead.status || "submitted",
          attributionDate: toAttributionDate(lead),
          routeLabel: lead.payload?.routeLabel
            || [lead.payload?.departure, lead.payload?.destination].filter(Boolean).join(" -> ")
            || "—",
          sourceLabel: lead.source_details?.referral_code || lead.source || "—",
          linkedCaseCode: matchingCase?.case_code || "—",
          rawLead: lead,
          rawPartner: partner || null,
          rawCase: matchingCase,
        };
      });

    return baseRows.filter((row) => {
      const matchesSearch = !query || [
        row.leadCode,
        row.partnerLabel,
        row.partnerCode,
        row.linkedCaseCode,
        row.routeLabel,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = statusFilter === "all" || row.claimStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [caseByLeadId, casesById, casesByPartnerId, leadsById, moduleData?.leads, moduleData?.referrals, partnersById, search, statusFilter]);

  const selectedReferral = useMemo(
    () => rows.find((item) => item.id === selectedReferralId) || rows[0] || null,
    [rows, selectedReferralId],
  );

  const statusOptions = useMemo(() => {
    const statuses = Array.from(new Set(rows.map((item) => item.claimStatus).filter(Boolean)));
    return [{ value: "all", label: "All claim states" }, ...statuses.map((item) => ({ value: item, label: item }))];
  }, [rows]);

  const metrics = useMemo(() => ({
    total: rows.length,
    activePartners: new Set(rows.map((item) => item.partnerId)).size,
    pendingClaims: rows.filter((item) => ["submitted", "under_review", "pending_review", "documents_pending"].includes(item.claimStatus)).length,
    convertedCases: rows.filter((item) => item.linkedCaseCode !== "—").length,
  }), [rows]);

  const columns = useMemo(() => ([
    {
      key: "lead",
      label: "Lead / claim",
      width: 170,
      minWidth: 140,
      maxWidth: 240,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{row.leadCode}</span>
          <span className="admin-crm-table__cell-sub">{row.linkedCaseCode !== "—" ? row.linkedCaseCode : "Lead only"}</span>
        </div>
      ),
      getCellTitle: (row) => row.leadCode,
    },
    {
      key: "partner",
      label: "Partner",
      width: 180,
      minWidth: 150,
      maxWidth: 260,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{row.partnerLabel}</span>
          <span className="admin-crm-table__cell-sub">{row.partnerCode}</span>
        </div>
      ),
      getCellTitle: (row) => `${row.partnerLabel} • ${row.partnerCode}`,
    },
    {
      key: "status",
      label: "Claim status",
      width: 150,
      minWidth: 120,
      maxWidth: 220,
      wrap: false,
      resizable: true,
      reorderable: true,
      renderCell: (row) => <AdminStatusBadge tone={toClaimStatusTone(row.claimStatus)}>{row.claimStatus}</AdminStatusBadge>,
      getCellTitle: (row) => row.claimStatus,
    },
    {
      key: "date",
      label: "Attribution date",
      width: 170,
      minWidth: 140,
      maxWidth: 240,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => (
        <div className="admin-crm-table__stack">
          <span className="admin-crm-table__cell-main">{formatDate(row.attributionDate)}</span>
          <span className="admin-crm-table__cell-sub">{row.partnerPortalStatus}</span>
        </div>
      ),
      getCellTitle: (row) => formatDate(row.attributionDate),
    },
    {
      key: "route",
      label: "Route",
      width: 320,
      minWidth: 240,
      maxWidth: 520,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => <span className="admin-crm-table__cell-main">{row.routeLabel}</span>,
      getCellTitle: (row) => row.routeLabel,
    },
    {
      key: "source",
      label: "Source",
      width: 180,
      minWidth: 140,
      maxWidth: 280,
      wrap: true,
      resizable: true,
      reorderable: true,
      renderCell: (row) => <span className="admin-crm-table__cell-main">{row.sourceLabel}</span>,
      getCellTitle: (row) => row.sourceLabel,
    },
    {
      key: "action",
      label: "Action",
      width: 120,
      minWidth: 100,
      maxWidth: 160,
      wrap: false,
      resizable: true,
      reorderable: true,
      hideable: false,
      renderCell: (row) => (
        <button
          type="button"
          className="admin-btn admin-btn-secondary"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedReferralId(row.id);
            setDrawerOpen(true);
          }}
        >
          Open
        </button>
      ),
    },
  ]), []);

  return (
    <div className="admin-page admin-partner-referrals-page">
      <AdminPageHeader
        title="Referrals"
        subtitle="Claims and leads attributed to approved referral partners"
        breadcrumbs={[
          { label: "Admin", path: "/admin" },
          { label: "Referrals" },
        ]}
      />

      {error ? <p className="admin-message is-error">{error}</p> : null}

      <div className="admin-partner-program__kpis">
        <AdminKpiCard label="Attributed referrals" value={isLoading ? "—" : metrics.total} icon={Link2} />
        <AdminKpiCard label="Active partners" value={isLoading ? "—" : metrics.activePartners} icon={Users} />
        <AdminKpiCard label="Claims moving" value={isLoading ? "—" : metrics.pendingClaims} icon={Link2} />
        <AdminKpiCard label="Converted to case" value={isLoading ? "—" : metrics.convertedCases} icon={Users} />
      </div>

      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search lead, partner, route, case"
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={statusOptions}
      />

      <AdminColumnTable
        storageKey="ff-admin-table-layout-referrals"
        title="Referred claims"
        countLabel={isLoading ? "" : `${rows.length} referral${rows.length === 1 ? "" : "s"}`}
        columns={columns}
        rows={rows}
        loading={isLoading}
        error={!isLoading ? error : ""}
        emptyTitle="No referrals found."
        emptyDetail="Try adjusting the current filters."
        selectedRowId={drawerOpen ? selectedReferral?.id || "" : ""}
        getRowKey={(row) => row.id}
        onRowClick={(row) => {
          setSelectedReferralId(row.id);
          setDrawerOpen(true);
        }}
      />

      <AdminSidePanel
        open={drawerOpen}
        title={selectedReferral?.leadCode || "Referral detail"}
        subtitle={selectedReferral ? `${selectedReferral.partnerLabel} • ${selectedReferral.partnerCode}` : ""}
        eyebrow="Referral"
        onClose={() => setDrawerOpen(false)}
        className="admin-partner-program__drawer-panel"
        withOverlay
      >
        {selectedReferral ? (
          <div className="admin-partner-program__drawer">
            <section className="admin-partner-program__summary-grid">
              <article className="admin-partner-program__info-card"><span>Lead reference</span><strong>{selectedReferral.leadCode}</strong></article>
              <article className="admin-partner-program__info-card"><span>Partner</span><strong>{selectedReferral.partnerLabel}</strong></article>
              <article className="admin-partner-program__info-card"><span>Partner code</span><strong>{selectedReferral.partnerCode}</strong></article>
              <article className="admin-partner-program__info-card"><span>Partner status</span><div className="admin-partner-program__badge-slot"><AdminStatusBadge tone={selectedReferral.partnerPortalStatus === "approved" ? "success" : "warning"}>{selectedReferral.partnerPortalStatus}</AdminStatusBadge></div></article>
              <article className="admin-partner-program__info-card"><span>Claim status</span><div className="admin-partner-program__badge-slot"><AdminStatusBadge tone={toClaimStatusTone(selectedReferral.claimStatus)}>{selectedReferral.claimStatus}</AdminStatusBadge></div></article>
              <article className="admin-partner-program__info-card"><span>Attribution date</span><strong>{formatDate(selectedReferral.attributionDate)}</strong></article>
            </section>

            <section className="admin-partner-program__section">
              <h3>Referral detail</h3>
              <div className="admin-partner-program__meta-grid">
                <div><span>Linked case</span><strong>{selectedReferral.linkedCaseCode}</strong></div>
                <div><span>Route</span><strong>{selectedReferral.routeLabel}</strong></div>
                <div><span>Source</span><strong>{selectedReferral.sourceLabel}</strong></div>
                <div><span>Lead created</span><strong>{formatDate(selectedReferral.rawLead.created_at)}</strong></div>
              </div>
            </section>
          </div>
        ) : null}
      </AdminSidePanel>
    </div>
  );
}
