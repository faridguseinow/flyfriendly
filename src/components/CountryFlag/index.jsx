function toFlagEmoji(code) {
  if (!code || code.length !== 2) {
    return null;
  }

  const upper = code.toUpperCase();
  const chars = [...upper];

  if (!chars.every((char) => char >= "A" && char <= "Z")) {
    return null;
  }

  return chars
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function CountryFlag({ code, label = "", className = "" }) {
  const emoji = toFlagEmoji(code);

  return (
    <span className={`country-flag ${className}`.trim()} aria-hidden="true" title={label || code || ""}>
      {emoji || "•"}
    </span>
  );
}

export default CountryFlag;
