import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "airlines" ? "airlines" : "airports";
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  if (q.length < 2) {
    return Response.json({ data: [] }, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );

  const table = type === "airlines" ? "airlines" : "airports";
  const columns = type === "airlines"
    ? "id, name, iata_code, icao_code, country"
    : "id, name, iata_code, icao_code, ident, municipality, iso_country, scheduled_service";

  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .ilike("search_text", `%${q}%`)
    .limit(12);

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }

  return Response.json({ data }, { headers: corsHeaders });
});
