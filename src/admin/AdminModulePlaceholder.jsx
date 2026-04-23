function AdminModulePlaceholder({ title, description, phase }) {
  return (
    <section className="admin-panel">
      <div className="admin-panel__head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="admin-empty admin-empty--module">
        <h2>{title} foundation ready</h2>
        <p>{phase}</p>
      </div>
    </section>
  );
}

export default AdminModulePlaceholder;
