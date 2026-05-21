function CountryFlag({ code, label = "", className = "" }) {
  const normalizedCode = String(code || "").trim().toLowerCase();
  const isValidCode = /^[a-z]{2}$/.test(normalizedCode);
  const imageUrl = isValidCode ? `https://flagcdn.com/w40/${normalizedCode}.png` : "";

  return (
    <span className={`country-flag ${className}`.trim()} aria-hidden="true" title={label || code || ""}>
      {imageUrl ? <img src={imageUrl} alt="" loading="lazy" decoding="async" /> : <span className="country-flag__fallback" />}
    </span>
  );
}

export default CountryFlag;
