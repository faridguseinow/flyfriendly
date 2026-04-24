import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const airportsSource = process.argv[2] || "/Users/a1111/Downloads/airports.csv";
const airlinesSource = process.argv[3] || "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat";
const outputDir = path.join(rootDir, "src", "data");
const countryAliases = {
  RU: ["Russian Federation"],
  KR: ["Republic of Korea", "South Korea"],
  KP: ["Democratic People's Republic of Korea", "North Korea"],
  IR: ["Islamic Republic of Iran"],
  MD: ["Republic of Moldova"],
  TZ: ["United Republic of Tanzania"],
  VN: ["Viet Nam"],
  LA: ["Lao People's Democratic Republic"],
  BO: ["Plurinational State of Bolivia"],
  VE: ["Bolivarian Republic of Venezuela"],
  SY: ["Syrian Arab Republic"],
};
const curatedAirlines = [
  {
    id: 197,
    name: "Azerbaijan Airlines",
    iata_code: "J2",
    icao_code: "AHY",
    country: "Azerbaijan",
    active: true,
    search_text: searchText(["Azerbaijan Airlines", "AZAL", "J2", "AHY", "Azerbaijan"]),
  },
  {
    id: 9000001,
    name: "AJet",
    iata_code: "VF",
    icao_code: "TKJ",
    country: "Turkey",
    active: true,
    search_text: searchText(["AJet", "A Jet", "AnadoluJet", "Anadolu Jet", "VF", "TKJ", "Turkey"]),
  },
];

function csvSplit(line) {
  const parts = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

function normalize(value) {
  return (value || "").trim();
}

function searchText(parts) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAirportName(value) {
  return (value || "").replace(/^\(Duplicate\)\s*/i, "").trim();
}

function isPassengerAirportRow(row) {
  const type = (row.type || "").toLowerCase();
  const name = (row.name || "").toLowerCase();

  if (!row.iata_code) {
    return false;
  }

  if (!["large_airport", "medium_airport", "small_airport"].includes(type)) {
    return false;
  }

  if (/(heliport|seaplane|air base|airbase|naval|military|airfield|army air|raf )/i.test(name)) {
    return false;
  }

  return true;
}

function isPassengerAirlineRow(row) {
  const name = (row.name || "").toLowerCase();

  if (row.active !== "Y") {
    return false;
  }

  if (/(cargo|freight|logistic|helicopter|charter|virtual|ambulance|air force|squadron|military|army|government|private shuttle)/i.test(name)) {
    return false;
  }

  return true;
}

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

function getCountryTerms(code) {
  const primary = code ? countryNames.of(code) || code : "";
  return [primary, ...(countryAliases[code] || [])].filter(Boolean);
}

async function buildAirportFallback() {
  const raw = await fs.readFile(airportsSource, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const headers = csvSplit(lines[0]);
  const airports = [];
  const seen = new Set();

  for (const line of lines.slice(1)) {
    const values = csvSplit(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, normalize(values[index])]));

    if (!isPassengerAirportRow(row)) {
      continue;
    }

    const cleanName = normalizeAirportName(row.name);
    if (!cleanName) {
      continue;
    }
    const countryTerms = getCountryTerms(row.iso_country);

    const preferredCode = row.iata_code || row.icao_code || row.ident;
    const dedupeKey = [cleanName.toLowerCase(), (row.municipality || "").toLowerCase(), row.iso_country, preferredCode].join("|");

    if (row.name.startsWith("(Duplicate)") || seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);

    airports.push({
      id: Number(row.id),
      ident: row.ident,
      name: cleanName,
      municipality: row.municipality,
      iso_country: row.iso_country,
      country_name: countryTerms[0] || "",
      keywords: row.keywords,
      iata_code: row.iata_code,
      icao_code: row.icao_code,
      scheduled_service: row.scheduled_service === "yes",
      type: row.type,
      search_text: searchText([
        row.name,
        row.ident,
        row.iata_code,
        row.icao_code,
        row.municipality,
        row.iso_country,
        ...countryTerms,
        row.keywords,
      ]),
    });
  }

  airports.sort((left, right) => {
    if (left.scheduled_service !== right.scheduled_service) {
      return Number(right.scheduled_service) - Number(left.scheduled_service);
    }

    return left.name.localeCompare(right.name);
  });

  await fs.writeFile(
    path.join(outputDir, "airports-fallback.json"),
    `${JSON.stringify(airports)}\n`,
    "utf8",
  );
}

async function buildAirlineFallback() {
  const raw = airlinesSource.startsWith("http")
    ? await fetch(airlinesSource).then((response) => {
      if (!response.ok) {
        throw new Error(`Could not download airlines source: ${response.status}`);
      }

      return response.text();
    })
    : await fs.readFile(airlinesSource, "utf8");

  const importedAirlines = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [id, name, alias, iataCode, icaoCode, callsign, country, active] = csvSplit(line);

      return {
        id: Number(id),
        name: normalize(name),
        iata_code: iataCode === "\\N" || iataCode === "-" ? "" : normalize(iataCode),
        icao_code: icaoCode === "\\N" || icaoCode === "-" ? "" : normalize(icaoCode),
        country: country === "\\N" ? "" : normalize(country),
        active: active === "Y",
        search_text: searchText([name, alias, iataCode, icaoCode, callsign, country]),
      };
    })
    .filter((airline) => airline.name && isPassengerAirlineRow({ name: airline.name, active: airline.active ? "Y" : "N" }))
  const airlineMap = new Map();

  [...importedAirlines, ...curatedAirlines].forEach((airline) => {
    const key = [airline.iata_code, airline.icao_code, airline.name.toLowerCase()].join("|");
    airlineMap.set(key, airline);
  });

  const airlines = Array.from(airlineMap.values()).sort((left, right) => {
    if (left.active !== right.active) {
      return Number(right.active) - Number(left.active);
    }

    return left.name.localeCompare(right.name);
  });

  await fs.writeFile(
    path.join(outputDir, "airlines-fallback.json"),
    `${JSON.stringify(airlines)}\n`,
    "utf8",
  );
}

await fs.mkdir(outputDir, { recursive: true });
await buildAirportFallback();
await buildAirlineFallback();

console.log("Fallback aviation catalog generated in src/data.");
