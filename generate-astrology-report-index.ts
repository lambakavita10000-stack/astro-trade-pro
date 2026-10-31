// ASTRO TRADE PRO — AI-assisted astrology report generator
// Deploy as: supabase/functions/generate-astrology-report/index.ts
//
// Required Supabase Edge Function secrets:
// OPENAI_API_KEY
// OPENAI_MODEL  (a model enabled for your OpenAI API project)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// Important: This version does NOT pretend to calculate a real Vedic/KP chart.
// It produces a clearly-labelled educational interpretation from birth details.
// Add a verified ephemeris/KP calculation service before publishing planetary
// degrees, nakshatras, dashas, cuspal sub-lords, or exact transit claims.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-astro-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const SECTORS = [
  "Banking & Finance",
  "IT & Technology",
  "Auto & Automobile",
  "Pharma & Healthcare",
  "Metal & Mining",
  "Energy & Power",
  "FMCG",
  "Realty",
  "Infrastructure",
  "Oil & Gas",
];

type Report = {
  report_title: string;
  customer_summary: string;
  vedic_analysis: string;
  kp_analysis: string;
  numerology_analysis: string;
  sector_analysis: string;
  stock_analysis: string;
  market_outlook: string;
  trading_timing: string;
  is_published: boolean;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
}

function numerologyRoot(dateString: string): number {
  const digits = dateString.replace(/\D/g, "");
  let total = [...digits].reduce((sum, digit) => sum + Number(digit), 0);
  while (total > 9 && ![11, 22, 33].includes(total)) {
    total = [...String(total)].reduce((sum, digit) => sum + Number(digit), 0);
  }
  return total;
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;

  const parts: string[] = [];
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function parseReport(raw: string): Omit<Report, "is_published"> {
  // Be tolerant if the model surrounds JSON with markdown fences.
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("AI response did not contain a valid JSON report.");
  }

  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  const fields = [
    "report_title",
    "customer_summary",
    "vedic_analysis",
    "kp_analysis",
    "numerology_analysis",
    "sector_analysis",
    "stock_analysis",
    "market_outlook",
    "trading_timing",
  ] as const;

  const result: Record<string, string> = {};
  for (const field of fields) {
    const value = parsed[field];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`AI report is missing required field: ${field}`);
    }
    result[field] = value.trim();
  }
  return result as Omit<Report, "is_published">;
}

async function generateWithAI(input: {
  name: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  slot: string;
  today: string;
  numerology: number;
}): Promise<Omit<Report, "is_published">> {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const model = requiredEnv("OPENAI_MODEL");

  const instructions = `
You write careful, detailed Hindi/Hinglish educational reports for Astro Trade Pro.
Return ONLY one valid JSON object with exactly these string keys:
report_title, customer_summary, vedic_analysis, kp_analysis,
numerology_analysis, sector_analysis, stock_analysis, market_outlook,
trading_timing.

Use the customer's birth details only as context for a traditional, reflective
astrology-style reading. CRITICAL HONESTY RULES:
- No ephemeris/chart calculation has been supplied. Do NOT invent ascendant,
  planetary degrees, signs, houses, nakshatras, dashas, KP cusps, star-lords,
  sub-lords, ruling planets, or transits.
- In vedic_analysis, clearly say this is a preliminary weekday/date-symbolism
  interpretation, not a calculated kundli.
- In kp_analysis, clearly say precise KP judgement is unavailable until a
  verified KP ephemeris/cusp/sub-lord calculation is connected.
- In numerology_analysis, explain the supplied date root as a symbolic
  numerology exercise, not a scientific prediction.
- Provide all ten sectors individually in sector_analysis, with cautious
  symbolic themes only. Do not state factual bullish/bearish predictions.
- stock_analysis must not recommend individual securities or buy/sell trades.
- market_outlook must separate astrology symbolism from actual market evidence.
  No live market data was supplied, so explicitly say market direction is not
  verified and no price/volume/technical conclusion is being made.
- trading_timing must not invent exact entry/exit times.
- Avoid certainty, guarantees, and personalized financial advice.
- Write a useful, structured, substantial report, not a one-line placeholder.
- Mention that astrology is not a validated method for forecasting markets.
`;

  const userInput = `
Prepare the customer's requested ${input.slot} report.

Customer name: ${input.name || "Customer"}
Date of birth: ${input.birthDate}
Time of birth: ${input.birthTime}
Place of birth: ${input.birthPlace}
Report date: ${input.today}
Date numerology root (precomputed): ${input.numerology}

Include practical educational sections and explain limitations honestly.
For sector_analysis cover exactly these sectors:
${SECTORS.map((sector, i) => `${i + 1}. ${sector}`).join("\n")}
`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions,
      input: userInput,
      max_output_tokens: 3500,
      store: false,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || `OpenAI API returned HTTP ${response.status}`;
    throw new Error(`Report AI failed: ${detail}`);
  }

  const outputText = extractOutputText(payload);
  if (!outputText) throw new Error("AI returned an empty report.");
  return parseReport(outputText);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const service = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Login required. Please sign in again." }, 401);

    const { data: authData, error: authError } = await service.auth.getUser(token);
    if (authError || !authData.user) {
      return json({ error: "Your login session is invalid or expired. Please log in again." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const slot = String(body?.slot ?? "manual");
    if (slot !== "manual") {
      return json({ error: "Customer report requests must use slot=manual." }, 400);
    }

    const user = authData.user;

    // Birth details are read from the existing table used by index.html.
    const { data: birth, error: birthError } = await service
      .from("birth_profiles")
      .select("birth_date,birth_time,birth_place")
      .eq("user_id", user.id)
      .maybeSingle();

    if (birthError) throw new Error(`Could not read birth profile: ${birthError.message}`);
    if (!birth?.birth_date || !birth?.birth_time || !birth?.birth_place) {
      return json({
        error: "Birth details are incomplete. Please update your date, time and place of birth.",
      }, 400);
    }

    const { data: profile } = await service
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);
    const reportContent = await generateWithAI({
      name: profile?.full_name || user.user_metadata?.full_name || user.email || "Customer",
      birthDate: birth.birth_date,
      birthTime: birth.birth_time,
      birthPlace: birth.birth_place,
      slot,
      today,
      numerology: numerologyRoot(birth.birth_date),
    });

    const report: Report = {
      ...reportContent,
      is_published: true,
    };

    // Column names match the existing customer dashboard query in index.html.
    const { data: inserted, error: insertError } = await service
      .from("reports")
      .insert({ user_id: user.id, ...report })
      .select("id,report_title,created_at")
      .single();

    if (insertError) throw new Error(`Could not save report: ${insertError.message}`);

    return json({
      ok: true,
      message: "Your report has been generated and saved.",
      report_id: inserted.id,
      report_title: inserted.report_title,
      created_at: inserted.created_at,
      report,
    });
  } catch (error) {
    console.error("generate-astrology-report error:", error);
    return json({
      error: error instanceof Error ? error.message : "Unexpected report generation error.",
    }, 500);
  }
});
