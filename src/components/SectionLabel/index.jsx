import "./style.scss";

function SectionLabel({ children, icon: Icon }) {
  return (
    <span className="section-label">
      {Icon ? <Icon size={16} strokeWidth={2} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export default SectionLabel;
