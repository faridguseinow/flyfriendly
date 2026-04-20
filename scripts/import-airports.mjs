import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const csvPath = process.argv[2];
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!csvPath) {
  throw new Error("Usage: node scripts/import-airports.mjs /path/to/airports.csv");
}

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function toNumber(value) {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const raw = fs.readFileSync(path.resolve(csvPath), "utf8").trim();
const [headerLine, ...lines] = raw.split(/\r?\n/);
const headers = parseCsvLine(headerLine);

const airports = lines
  .map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));

    return {
      id: Number(row.id),
      ident: row.ident || null,
      type: row.type || null,
      name: row.name,
      latitude_deg: toNumber(row.latitude_deg),
      longitude_deg: toNumber(row.longitude_deg),
      elevation_ft: row.elevation_ft ? Number(row.elevation_ft) : null,
      continent: row.continent || null,
      iso_country: row.iso_country || null,
      iso_region: row.iso_region || null,
      municipality: row.municipality || null,
      scheduled_service: row.scheduled_service === "yes",
      icao_code: row.icao_code || null,
      iata_code: row.iata_code || null,
      gps_code: row.gps_code || null,
      local_code: row.local_code || null,
      home_link: row.home_link || null,
      wikipedia_link: row.wikipedia_link || null,
      keywords: row.keywords || null,
      updated_at: new Date().toISOString(),
    };
  })
  .filter((airport) => airport.id && airport.name);

const batchSize = 1000;

for (let index = 0; index < airports.length; index += batchSize) {
  const batch = airports.slice(index, index + batchSize);
  const { error } = await supabase
    .from("airports")
    .upsert(batch, { onConflict: "id" });

  if (error) {
    throw error;
  }

  console.log(`Imported ${Math.min(index + batchSize, airports.length)} / ${airports.length}`);
}

console.log("Airport import complete.");
