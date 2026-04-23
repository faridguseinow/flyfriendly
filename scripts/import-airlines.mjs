import fs from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const source = process.argv[2] || "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat";
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

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

function searchText(parts) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const raw = source.startsWith("http")
  ? await fetch(source).then((response) => {
    if (!response.ok) {
      throw new Error(`Could not download airlines source: ${response.status}`);
    }

    return response.text();
  })
  : await fs.readFile(source, "utf8");

const airlines = raw
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const [id, name, alias, iataCode, icaoCode, callsign, country, active] = csvSplit(line);

    return {
      id: Number(id),
      name,
      alias: alias === "\\N" ? null : alias || null,
      iata_code: iataCode === "\\N" || iataCode === "-" ? null : iataCode || null,
      icao_code: icaoCode === "\\N" || icaoCode === "-" ? null : icaoCode || null,
      callsign: callsign === "\\N" ? null : callsign || null,
      country: country === "\\N" ? null : country || null,
      active: active === "Y",
      search_text: searchText([name, alias, iataCode, icaoCode, callsign, country]),
    };
  })
  .filter((airline) => airline.name);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const chunkSize = 500;

for (let offset = 0; offset < airlines.length; offset += chunkSize) {
  const batch = airlines.slice(offset, offset + chunkSize);
  const { error } = await supabase
    .from("airlines")
    .upsert(batch, { onConflict: "id" });

  if (error) {
    console.error(`Failed on batch ${offset / chunkSize + 1}:`, error.message);
    process.exit(1);
  }

  console.log(`Imported ${Math.min(offset + chunkSize, airlines.length)} / ${airlines.length}`);
}

console.log("Airlines import finished.");
