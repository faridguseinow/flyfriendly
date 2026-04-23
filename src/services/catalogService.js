import { requireSupabase } from "../lib/supabase.js";

const AIRPORT_FIELDS = "id, ident, name, municipality, iso_country, iata_code, icao_code";
const AIRLINE_FIELDS = "id, name, iata_code, icao_code, country";
let fallbackAirportsPromise;
let fallbackAirlinesPromise;
const regionNames = typeof Intl !== "undefined"
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

function normalizeSearch(value) {
  return value?.trim().toLowerCase().replace(/[,%]/g, " ") || "";
}

export function formatAirportOption(airport) {
  const code = airport.iata_code || airport.icao_code || airport.ident;
  return `${airport.name}${code ? ` (${code})` : ""}`;
}

export function formatAirlineOption(airline) {
  const codes = [airline.iata_code, airline.icao_code].filter(Boolean).join(" / ");
  return `${airline.name}${codes ? ` / ${codes}` : ""}`;
}

export function getCountryName(code) {
  if (!code) {
    return "";
  }

  return regionNames?.of(code) || code;
}

export function describeAirportOption(airport) {
  const code = airport.iata_code || airport.icao_code || airport.ident;
  const country = airport.country_name || getCountryName(airport.iso_country) || airport.iso_country || "";
  const subtitle = [airport.municipality, country].filter(Boolean).join(", ");

  return {
    ...airport,
    label: `${airport.name}${code ? `, ${code}` : ""}`,
    title: `${airport.name}${code ? `, ${code}` : ""}`,
    subtitle,
    meta: airport.ident ? `ident:${airport.ident}` : "",
    countryCode: airport.iso_country || "",
    code: code || "",
  };
}

export function describeAirlineOption(airline) {
  const codes = [airline.iata_code, airline.icao_code].filter(Boolean).join(" / ");

  return {
    ...airline,
    label: `${airline.name}${codes ? ` / ${codes}` : ""}`,
    title: `${airline.name}${codes ? ` / ${codes}` : ""}`,
    subtitle: airline.country || "",
    code: codes,
  };
}

function scoreMatch(item, term, fields) {
  let score = 0;

  for (const field of fields) {
    const value = (item[field] || "").toString().toLowerCase();

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
        (config.flagField && row[config.flagField] ? 24 : 0),
    }))
    .filter((row) => row.__score > 0 || row.search_text?.includes(term))
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
      .order("scheduled_service", { ascending: false })
      .order("name", { ascending: true })
      .limit(limit);

    if (!error && data?.length) {
      return data.map((item) => ({ ...item, source: "supabase" }));
    }
  } catch {
    // fallback below
  }

  return searchLocalCatalog(
    await loadFallbackAirports(),
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

  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from("airlines")
      .select(AIRLINE_FIELDS)
      .or(`search_text.ilike.%${term}%,iata_code.ilike.%${term}%,icao_code.ilike.%${term}%`)
      .order("active", { ascending: false })
      .order("name", { ascending: true })
      .limit(limit);

    if (!error && data?.length) {
      return data.map((item) => ({ ...item, source: "supabase" }));
    }
  } catch {
    // fallback below
  }

  return searchLocalCatalog(
    await loadFallbackAirlines(),
    term,
    {
      priorityFields: ["iata_code", "icao_code"],
      secondaryFields: ["name", "country"],
      flagField: "active",
    },
    limit,
  ).map((item) => ({ ...item, source: "fallback" }));
}
