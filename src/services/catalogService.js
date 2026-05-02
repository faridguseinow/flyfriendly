import { requireSupabase } from "../lib/supabase.js";

const AIRPORT_FIELDS = "id, ident, type, name, municipality, iso_country, country_name, latitude_deg, longitude_deg, keywords, search_text, scheduled_service, iata_code, icao_code";
const AIRLINE_FIELDS = "id, name, iata_code, icao_code, country, active";
let fallbackAirportsPromise;
let fallbackAirlinesPromise;
const AIRLINE_NAME_ALIASES = {
  "azerbaijan airlines": ["azal"],
  "turkish airlines": ["thy"],
  "lot polish airlines": ["lot"],
  "klm royal dutch airlines": ["klm"],
  "scandinavian airlines system": ["sas"],
  "british airways": ["ba"],
  "lufthansa": ["lh", "dlh"],
};
const CURATED_AIRLINES = [
  {
    id: "curated-j2-ahy",
    name: "Azerbaijan Airlines",
    iata_code: "J2",
    icao_code: "AHY",
    country: "Azerbaijan",
    active: true,
    aliases: ["azal", "azal airlines", "azerbaijan airlines"],
    source: "curated",
  },
  {
    id: "curated-vf",
    name: "AJet",
    iata_code: "VF",
    icao_code: "TKJ",
    country: "Turkey",
    active: true,
    aliases: ["ajet", "a jet", "anadolujet", "anadolu jet", "anadolujet airlines"],
    source: "curated",
  },
];
const regionNames = typeof Intl !== "undefined"
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

function normalizeSearch(value) {
  return value?.trim().toLowerCase().replace(/[,%]/g, " ") || "";
}

function normalizeToken(value) {
  return value?.toString().toLowerCase().replace(/[^a-z0-9]/g, "") || "";
}

function formatAirportDisplay(airport) {
  const code = airport.iata_code || airport.icao_code || airport.ident || "";
  const city = airport.municipality || airport.name || "";
  const country = airport.country_name || getCountryName(airport.iso_country) || airport.iso_country || "";

  return {
    code,
    city,
    country,
  };
}

function isPassengerAirport(airport) {
  const type = (airport.type || "").toLowerCase();
  const name = (airport.name || "").toLowerCase();
  const hasPassengerCode = Boolean(airport.iata_code);

  if (!hasPassengerCode) {
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

function isPassengerAirline(airline) {
  const name = (airline.name || "").toLowerCase();

  if (!airline.active) {
    return false;
  }

  if (/(cargo|freight|logistic|helicopter|charter|virtual|ambulance|air force|squadron|military|army|government|private shuttle)/i.test(name)) {
    return false;
  }

  return true;
}

function getCanonicalAirlineOverride(airline) {
  const normalizedName = normalizeToken(airline.name);
  const normalizedIata = normalizeToken(airline.iata_code);
  const normalizedIcao = normalizeToken(airline.icao_code);

  if (normalizedIata === "j2" || normalizedIcao === "ahy" || normalizedName === "azerbaijanairlines") {
    return CURATED_AIRLINES[0];
  }

  if (
    normalizedIata === "vf" ||
    normalizedIcao === "tkj" ||
    normalizedName === "ajet" ||
    normalizedName === "anadolujet" ||
    normalizedName.includes("anadolujet")
  ) {
    return CURATED_AIRLINES[1];
  }

  return null;
}

function normalizeAirlineRecord(airline) {
  const override = getCanonicalAirlineOverride(airline);

  if (!override) {
    return {
      ...airline,
      aliases: airline.aliases || [],
      source: airline.source || "fallback",
    };
  }

  const mergedAliases = new Set([
    ...(override.aliases || []),
    ...(airline.aliases || []),
    airline.name,
    airline.iata_code,
    airline.icao_code,
  ].filter(Boolean));

  return {
    ...airline,
    name: override.name,
    iata_code: override.iata_code || airline.iata_code || "",
    icao_code: override.icao_code || airline.icao_code || "",
    country: override.country || airline.country || "",
    active: override.active ?? airline.active,
    aliases: Array.from(mergedAliases),
    source: airline.source || override.source || "curated",
  };
}

export function formatAirportOption(airport) {
  const { code, city, country } = formatAirportDisplay(airport);
  return [code, city, country].filter(Boolean).join(" - ");
}

export function formatAirlineOption(airline) {
  return airline.name || "";
}

export function getCountryName(code) {
  if (!code) {
    return "";
  }

  return regionNames?.of(code) || code;
}

export function describeAirportOption(airport) {
  const { code, city, country } = formatAirportDisplay(airport);
  const title = [code, city].filter(Boolean).join(" - ") || airport.name;
  const subtitle = country || "";
  const metaParts = [];

  if (airport.name && airport.name !== city) {
    metaParts.push(airport.name);
  }

  if (airport.ident && airport.ident !== code) {
    metaParts.push(`ident:${airport.ident}`);
  }

  return {
    ...airport,
    label: [code, city, country].filter(Boolean).join(" - ") || airport.name,
    title,
    subtitle,
    meta: metaParts.join(" • "),
    countryCode: airport.iso_country || "",
    code: code || "",
  };
}

export function describeAirlineOption(airline) {
  const subtitleParts = [];

  if (airline.country) {
    subtitleParts.push(airline.country);
  }

  if (airline.id) {
    subtitleParts.push(`id:${airline.id}`);
  }

  if (airline.iata_code) {
    subtitleParts.push(`iata:${airline.iata_code}`);
  }

  if (airline.icao_code) {
    subtitleParts.push(`icao:${airline.icao_code}`);
  }

  return {
    ...airline,
    label: airline.name || "",
    title: airline.name || "",
    subtitle: subtitleParts.join(" • "),
    code: airline.iata_code || airline.icao_code || "",
  };
}

function getAirlineAliases(airline) {
  const normalizedName = normalizeToken(airline.name);

  return [
    ...(AIRLINE_NAME_ALIASES[normalizedName] || []),
    ...(airline.aliases || []),
    airline.iata_code,
    airline.icao_code,
  ]
    .filter(Boolean)
    .map((value) => normalizeToken(value))
    .filter(Boolean);
}

function scoreAirlineAliasMatch(airline, term) {
  const normalizedTerm = normalizeToken(term);
  const normalizedName = normalizeToken(airline.name);
  const normalizedCountry = normalizeToken(airline.country);

  if (!normalizedTerm) {
    return 0;
  }

  let score = 0;

  if (normalizedName === normalizedTerm) {
    score += 1500;
  } else if (normalizedName.startsWith(normalizedTerm)) {
    score += 920;
  } else if (
    (airline.name || "")
      .split(/[^a-z0-9]+/i)
      .map((part) => normalizeToken(part))
      .some((part) => part && part.startsWith(normalizedTerm))
  ) {
    score += 480;
  }

  for (const alias of getAirlineAliases(airline)) {
    if (alias === normalizedTerm) {
      score += 1200;
      continue;
    }

    if (normalizedTerm.startsWith(alias) || alias.startsWith(normalizedTerm)) {
      score += 420;
      continue;
    }

    if (alias.includes(normalizedTerm)) {
      score += 140;
    }
  }

  if (normalizedCountry === normalizedTerm) {
    score += 120;
  } else if (normalizedCountry.startsWith(normalizedTerm)) {
    score += 60;
  } else if (normalizedCountry.includes(normalizedTerm)) {
    score += 20;
  }

  if (
    !normalizedTerm.includes("cargo") &&
    !normalizedTerm.includes("freight") &&
    !normalizedTerm.includes("logistic") &&
    !normalizedTerm.includes("heli") &&
    !normalizedTerm.includes("charter") &&
    /(cargo|freight|logistic|helicopter|charter)/i.test(airline.name || "")
  ) {
    score -= 180;
  }

  return score;
}

function scoreMatch(item, term, fields) {
  let score = 0;
  const normalizedTerm = normalizeToken(term);

  for (const field of fields) {
    const value = (item[field] || "").toString().toLowerCase();
    const normalizedValue = normalizeToken(value);

    if (!value) {
      continue;
    }

    if (value === term) {
      score += 500;
      continue;
    }

    if (value.startsWith(term)) {
      score += 220;
      continue;
    }

    if (
      normalizedTerm &&
      normalizedValue &&
      normalizedValue.length <= 4 &&
      normalizedValue.length >= 3 &&
      normalizedTerm.startsWith(normalizedValue)
    ) {
      score += 180;
      continue;
    }

    if (value.includes(term)) {
      score += 80;
    }

    const prefix = value.slice(0, term.length);
    if (prefix.length >= 3 && prefix[0] === term[0] && isOneEditAway(prefix, term)) {
      score += 36;
    }
  }

  return score;
}

function isOneEditAway(left, right) {
  if (left === right) {
    return true;
  }

  if (Math.abs(left.length - right.length) > 1) {
    return false;
  }

  let indexLeft = 0;
  let indexRight = 0;
  let edits = 0;

  while (indexLeft < left.length && indexRight < right.length) {
    if (left[indexLeft] === right[indexRight]) {
      indexLeft += 1;
      indexRight += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) {
      return false;
    }

    if (left.length > right.length) {
      indexLeft += 1;
    } else if (right.length > left.length) {
      indexRight += 1;
    } else {
      indexLeft += 1;
      indexRight += 1;
    }
  }

  if (indexLeft < left.length || indexRight < right.length) {
    edits += 1;
  }

  return edits <= 1;
}

function searchLocalCatalog(rows, term, config, limit) {
  return rows
    .map((row) => ({
      ...row,
      __score:
        scoreMatch(row, term, config.priorityFields) +
        scoreMatch(row, term, config.secondaryFields) +
        (config.extraScore ? config.extraScore(row, term) : 0) +
        (config.flagField && row[config.flagField] ? 24 : 0),
    }))
    .filter((row) => row.__score > 0)
    .sort((left, right) => {
      if ((right.__score || 0) !== (left.__score || 0)) {
        return (right.__score || 0) - (left.__score || 0);
      }

      if (config.flagField && left[config.flagField] !== right[config.flagField]) {
        return Number(right[config.flagField]) - Number(left[config.flagField]);
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, limit)
    .map(({ __score, ...row }) => row);
}

async function loadFallbackAirports() {
  if (!fallbackAirportsPromise) {
    fallbackAirportsPromise = import("../data/airports-fallback.json").then((module) => module.default || []);
  }

  return fallbackAirportsPromise;
}

async function loadFallbackAirlines() {
  if (!fallbackAirlinesPromise) {
    fallbackAirlinesPromise = import("../data/airlines-fallback.json").then((module) => module.default || []);
  }

  return fallbackAirlinesPromise;
}

function dedupeCatalogRows(rows) {
  const seen = new Map();
  const sourcePriority = {
    curated: 3,
    supabase: 2,
    fallback: 1,
  };

  rows.forEach((row) => {
    const normalizedRow = row.name || row.iata_code || row.icao_code ? normalizeAirlineRecord(row) : row;
    const key = [
      normalizeToken(normalizedRow.name),
      normalizeToken(normalizedRow.iata_code),
      normalizeToken(normalizedRow.icao_code),
    ].join("|");

    if (!key.replace(/\|/g, "")) {
      return;
    }

    const current = seen.get(key);
    if (
      !current ||
      (sourcePriority[normalizedRow.source] || 0) > (sourcePriority[current.source] || 0)
    ) {
      seen.set(key, normalizedRow);
    }
  });

  return Array.from(seen.values());
}

export async function searchAirports(query, limit = 8) {
  const term = normalizeSearch(query);

  if (term.length < 2) {
    return [];
  }

  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from("airports")
      .select(AIRPORT_FIELDS)
      .or(`search_text.ilike.%${term}%,name.ilike.%${term}%,municipality.ilike.%${term}%,keywords.ilike.%${term}%,iata_code.ilike.%${term}%,icao_code.ilike.%${term}%,ident.ilike.%${term}%`)
      .limit(Math.max(limit * 10, 40));

    if (!error && data?.length) {
      return searchLocalCatalog(
        data.filter(isPassengerAirport),
        term,
        {
          priorityFields: ["iata_code", "icao_code", "ident"],
          secondaryFields: ["name", "municipality", "country_name", "iso_country", "keywords"],
          flagField: "scheduled_service",
        },
        limit,
      ).map((item) => ({ ...item, source: "supabase" }));
    }
  } catch {
    // fallback below
  }

  return searchLocalCatalog(
    (await loadFallbackAirports()).filter(isPassengerAirport),
    term,
    {
      priorityFields: ["iata_code", "icao_code", "ident"],
      secondaryFields: ["name", "municipality", "iso_country"],
      flagField: "scheduled_service",
    },
    limit,
  ).map((item) => ({ ...item, source: "fallback" }));
}

export async function searchAirlines(query, limit = 8) {
  const term = normalizeSearch(query);

  if (term.length < 2) {
    return [];
  }

  const candidates = CURATED_AIRLINES.map((item) => ({
    ...item,
    search_text: [item.name, ...(item.aliases || []), item.iata_code, item.icao_code, item.country].filter(Boolean).join(" ").toLowerCase(),
  }));

  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from("airlines")
      .select(AIRLINE_FIELDS)
      .or(`search_text.ilike.%${term}%,name.ilike.%${term}%,iata_code.ilike.%${term}%,icao_code.ilike.%${term}%`)
      .limit(Math.max(limit * 10, 40));

    if (!error && data?.length) {
      candidates.push(...data.map((item) => ({ ...item, source: "supabase" })));
    }
  } catch {
    // fallback below
  }

  candidates.push(...(await loadFallbackAirlines()).map((item) => ({ ...item, source: "fallback" })));

  return searchLocalCatalog(
    dedupeCatalogRows(candidates).filter(isPassengerAirline),
    term,
    {
      priorityFields: ["iata_code", "icao_code"],
      secondaryFields: ["name"],
      flagField: "active",
      extraScore: scoreAirlineAliasMatch,
    },
    limit,
  );
}
