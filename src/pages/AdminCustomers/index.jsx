import { useEffect, useMemo, useState } from "react";
import { Download, Globe2, Search, UserRound, Users, Wallet } from "lucide-react";
import { fetchCustomersModuleData, updateCustomerProfile } from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import { useSearchParams } from "react-router-dom";
import "./style.scss";

function MetricCard({ icon: Icon, label, value }) {
  return (
    <article className="admin-metric">
      <span><Icon size={22} strokeWidth={1.8} /></span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
  );
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatCurrency(value) {
  return `${Number(value || 0).toFixed(0)} EUR`;
}

function exportCustomersCsv(rows) {
  const headers = ["Customer", "Email", "Phone", "Country", "Language", "Total Leads", "Total Cases", "Approved Cases", "Compensation"];
  const lines = rows.map((item) => [
    item.full_name,
    item.email,
    item.phone,
    item.country,
    item.preferred_language,
    item.total_leads,
    item.total_cases,
    item.total_approved_cases,
    item.total_compensation,
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

function AdminCustomers() {
  const { hasPermission } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const [moduleData, setModuleData] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [notesDraft, setNotesDraft] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadCustomers = async () => {
    setError("");
    setIsLoading(true);

    try {
      const next = await fetchCustomersModuleData();
      setModuleData(next);
      if (!selectedCustomerId && next.customers[0]) {
        setSelectedCustomerId(next.customers[0].id);
        setNotesDraft(next.customers[0].notes || "");
      } else if (selectedCustomerId && !next.customers.some((item) => item.id === selectedCustomerId) && next.customers[0]) {
        setSelectedCustomerId(next.customers[0].id);
        setNotesDraft(next.customers[0].notes || "");
      }
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
    }
  }, [searchParams]);

  const filteredCustomers = useMemo(() => {
    const rows = moduleData?.customers || [];
    const query = search.trim().toLowerCase();

    return rows.filter((item) => {
      const matchesSearch = !query || [
        item.full_name,
        item.email,
        item.phone,
        item.country,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesCountry = countryFilter === "all" || item.country === countryFilter;
      const matchesLanguage = languageFilter === "all" || item.preferred_language === languageFilter;

      return matchesSearch && matchesCountry && matchesLanguage;
    });
  }, [moduleData, search, countryFilter, languageFilter]);

  const selectedCustomer = useMemo(
    () => filteredCustomers.find((item) => item.id === selectedCustomerId)
      || moduleData?.customers?.find((item) => item.id === selectedCustomerId)
      || filteredCustomers[0]
      || null,
    [filteredCustomers, moduleData, selectedCustomerId],
  );

  useEffect(() => {
    setNotesDraft(selectedCustomer?.notes || "");
  }, [selectedCustomer?.id]);

  const selectedLeads = useMemo(
    () => (moduleData?.leads || []).filter((item) => item.customer_id === selectedCustomer?.id),
    [moduleData, selectedCustomer],
  );

  const selectedCases = useMemo(
    () => (moduleData?.cases || []).filter((item) => item.customer_id === selectedCustomer?.id),
    [moduleData, selectedCustomer],
  );

  const selectedCommunications = useMemo(
    () => (moduleData?.communications || []).filter((item) => item.customer_id === selectedCustomer?.id),
    [moduleData, selectedCustomer],
  );

  const metrics = useMemo(() => {
    const rows = moduleData?.customers || [];
    return {
      totalCustomers: rows.length,
      totalLeads: rows.reduce((sum, item) => sum + Number(item.total_leads || 0), 0),
      totalCases: rows.reduce((sum, item) => sum + Number(item.total_cases || 0), 0),
      approvedCases: rows.reduce((sum, item) => sum + Number(item.total_approved_cases || 0), 0),
      totalCompensation: rows.reduce((sum, item) => sum + Number(item.total_compensation || 0), 0),
      avgCasesPerCustomer: rows.length ? rows.reduce((sum, item) => sum + Number(item.total_cases || 0), 0) / rows.length : 0,
    };
  }, [moduleData]);

  const countries = useMemo(
    () => Array.from(new Set((moduleData?.customers || []).map((item) => item.country).filter(Boolean))).sort(),
    [moduleData],
  );

  const languages = useMemo(
    () => Array.from(new Set((moduleData?.customers || []).map((item) => item.preferred_language).filter(Boolean))).sort(),
    [moduleData],
  );

  const saveCustomer = async () => {
    if (!selectedCustomer) return;

    setIsSaving(true);
    setError("");
    try {
      await updateCustomerProfile(selectedCustomer.id, { notes: notesDraft });
      await loadCustomers();
    } catch (nextError) {
      setError(nextError.message || "Could not update customer profile.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-page admin-customers-page">
      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><Users size={16} /> Core Operations</span>
          <h1>Customers</h1>
          <p>
            Maintain a central customer record across leads, cases, communications, and lifetime compensation history.
          </p>
        </div>
      </header>

      {error && <p className="admin-message is-error">{error}</p>}
      {moduleData && !moduleData.supportsCustomersModuleV1 && (
        <p className="admin-message">
          Customers schema is not available yet. Run `006_core_operations_schema_v1.sql` and `007_cases_module_v1.sql`
          in Supabase to unlock the full customers module.
        </p>
      )}

      {isLoading ? (
        <p className="admin-message">Loading customers...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <MetricCard icon={Users} label="Total customers" value={metrics.totalCustomers} />
            <MetricCard icon={UserRound} label="Total leads" value={metrics.totalLeads} />
            <MetricCard icon={Globe2} label="Total cases" value={metrics.totalCases} />
            <MetricCard icon={Wallet} label="Approved cases" value={metrics.approvedCases} />
            <MetricCard icon={Wallet} label="Total compensation" value={formatCurrency(metrics.totalCompensation)} />
            <MetricCard icon={Globe2} label="Avg. cases per customer" value={metrics.avgCasesPerCustomer.toFixed(1)} />
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div>
                <h2>Customer database</h2>
                <p>Search and inspect customer records generated from converted leads and active cases.</p>
              </div>
              <button className="admin-link-button" type="button" onClick={() => exportCustomersCsv(filteredCustomers)}>
                <Download size={14} />
                <span>Export CSV</span>
              </button>
            </div>
            <div className="admin-customers__filters">
              <label className="admin-search">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search customer, email, phone, country" />
              </label>
              <select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)}>
                <option value="all">All countries</option>
                {countries.map((country) => <option key={country} value={country}>{country}</option>)}
              </select>
              <select value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)}>
                <option value="all">All languages</option>
                {languages.map((language) => <option key={language} value={language}>{language}</option>)}
              </select>
            </div>

            <div className="admin-customers__grid">
              <section className="admin-panel">
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Country</th>
                        <th>Leads</th>
                        <th>Cases</th>
                        <th>Approved</th>
                        <th>Compensation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.map((item) => (
                        <tr key={item.id} className={selectedCustomer?.id === item.id ? "is-selected" : ""} onClick={() => setSelectedCustomerId(item.id)}>
                          <td>{item.full_name || item.email || item.phone || item.id.slice(0, 8)}</td>
                          <td>{item.country || "-"}</td>
                          <td>{item.total_leads || 0}</td>
                          <td>{item.total_cases || 0}</td>
                          <td>{item.total_approved_cases || 0}</td>
                          <td>{formatCurrency(item.total_compensation)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-panel admin-customers__detail">
                <div className="admin-panel__head">
                  <div>
                    <h2>Customer detail</h2>
                    <p>{selectedCustomer ? selectedCustomer.full_name || selectedCustomer.email || selectedCustomer.id.slice(0, 8) : "Select a customer to inspect."}</p>
                  </div>
                </div>

                {selectedCustomer ? (
                  <div className="admin-customers__detail-body">
                    <div className="admin-customers__summary">
                      <article><strong>Email</strong><span>{selectedCustomer.email || "-"}</span></article>
                      <article><strong>Phone</strong><span>{selectedCustomer.phone || "-"}</span></article>
                      <article><strong>Country</strong><span>{selectedCustomer.country || "-"}</span></article>
                      <article><strong>Language</strong><span>{selectedCustomer.preferred_language || "-"}</span></article>
                    </div>

                    <section className="admin-customers__section">
                      <h3>Notes</h3>
                      <textarea
                        value={notesDraft}
                        onChange={(event) => setNotesDraft(event.target.value)}
                        placeholder="Add internal customer notes"
                        disabled={!hasPermission("customers.edit")}
                      />
                      <div className="admin-customers__note-actions">
                        <button className="admin-link-button" type="button" onClick={saveCustomer} disabled={!hasPermission("customers.edit") || isSaving}>
                          <span>{isSaving ? "Saving..." : "Save notes"}</span>
                        </button>
                      </div>
                    </section>

                    <section className="admin-customers__section">
                      <h3>Linked leads</h3>
                      <div className="admin-customers__timeline">
                        {selectedLeads.length ? selectedLeads.map((item) => (
                          <article key={item.id}>
                            <strong>{item.lead_code || item.id.slice(0, 8)}</strong>
                            <p>{item.status} · {item.airline || "-"} · {item.departure_airport || "-"} → {item.arrival_airport || "-"}</p>
                          </article>
                        )) : <p>No leads linked yet.</p>}
                      </div>
                    </section>

                    <section className="admin-customers__section">
                      <h3>Linked cases</h3>
                      <div className="admin-customers__timeline">
                        {selectedCases.length ? selectedCases.map((item) => (
                          <article key={item.id}>
                            <strong>{item.case_code || item.id.slice(0, 8)}</strong>
                            <p>{item.status} · {item.airline || "-"} · {item.route_from || "-"} → {item.route_to || "-"} · {formatCurrency(item.estimated_compensation)}</p>
                          </article>
                        )) : <p>No cases linked yet.</p>}
                      </div>
                    </section>

                    <section className="admin-customers__section">
                      <h3>Communication history</h3>
                      <div className="admin-customers__timeline">
                        {selectedCommunications.length ? selectedCommunications.map((item) => (
                          <article key={item.id}>
                            <strong>{item.channel} · {formatDate(item.created_at)}</strong>
                            <p>{item.subject || item.body || "No content"}</p>
                          </article>
                        )) : <p>No communications linked yet.</p>}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="admin-empty admin-empty--module">
                    <h2>No customer selected</h2>
                    <p>Select a customer to review linked leads, cases, and communications.</p>
                  </div>
                )}
              </section>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default AdminCustomers;
