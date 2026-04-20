import { requireSupabase } from "../lib/supabase.js";

const AIRPORT_FIELDS = "id, ident, name, municipality, iso_country, iata_code, icao_code";
const AIRLINE_FIELDS = "id, name, iata_code, icao_code, country";

function normalizeSearch(value) {
  return value?.trim().toLowerCase().replace(/[,%]/g, " ") || "";
}

export function formatAirportOption(airport) {
  const code = airport.iata_code || airport.icao_code || airport.ident;
  const city = airport.municipality ? `${airport.municipality} · ` : "";
  return `${airport.name}${code ? ` (${code})` : ""}${city || airport.iso_country ? ` - ${city}${airport.iso_country || ""}` : ""}`;
}

export function formatAirlineOption(airline) {
  const codes = [airline.iata_code, airline.icao_code].filter(Boolean).join(" / ");
  return `${airline.name}${codes ? ` / ${codes}` : ""}${airline.country ? ` - ${airline.country}` : ""}`;
}

export async function searchAirports(query, limit = 8) {
  const term = normalizeSearch(query);

  if (term.length < 2) {
    return [];
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from("airports")
    .select(AIRPORT_FIELDS)
    .or(`search_text.ilike.%${term}%,iata_code.ilike.%${term}%,icao_code.ilike.%${term}%,ident.ilike.%${term}%`)
    .order("scheduled_service", { ascending: false })
    .order("name", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}

export async function searchAirlines(query, limit = 8) {
  const term = normalizeSearch(query);

  if (term.length < 2) {
    return [];
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from("airlines")
    .select(AIRLINE_FIELDS)
    .or(`search_text.ilike.%${term}%,iata_code.ilike.%${term}%,icao_code.ilike.%${term}%`)
    .order("active", { ascending: false })
    .order("name", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}
