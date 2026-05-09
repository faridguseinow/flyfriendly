function AdminPlaceholderPage({
  title,
  description = "This page is ready for redesign.",
  futurePurpose = "",
  primaryActionLabel = "",
  onPrimaryAction = null,
}) {
  return (
    <section className="admin-reset-page" aria-label={title}>
      <div className="admin-reset-card">
        <p>{description}</p>

        {futurePurpose ? (
          <div className="admin-reset-card__placeholder">
            <span>Future purpose</span>
            <p>{futurePurpose}</p>
          </div>
        ) : null}

        {primaryActionLabel ? (
          <div className="admin-reset-card__actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onPrimaryAction || undefined}
              disabled={!onPrimaryAction}
            >
              {primaryActionLabel}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default AdminPlaceholderPage;
