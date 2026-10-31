// ASTRO TRADE PRO — Astrology Report Generator
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "content-type": "application/json" };

const sectors = [
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

const rulers: Record<number, string> = {
  0: "Surya",
  1: "Chandra",
  2: "Mangal",
  3: "Budh",
  4: "Guru",
  5: "Shukra",
  6: "Shani",
};

const themes: Record<string, string> = {
  Surya: "leadership, authority, confidence aur visibility",
  Chandra: "public sentiment, emotions, liquidity symbolism aur adaptability",
  Mangal: "energy, urgency, competition aur impulsive reactions",
  Budh: "communication, commerce, calculation aur technology",
  Guru: "expansion, optimism, learning aur long-term perspective",
  Shukra: "comfort, consumption, value aur relationships",
  Shani: "discipline, caution, structure aur patience",
};

const sectorRulers: Record<string, string> = {
  "Banking & Finance": "Guru",
  "IT & Technology": "Budh",
  "Auto & Automobile": "Mangal",
  "Pharma & Healthcare": "Chandra",
  "Metal & Mining": "Mangal",
  "Energy & Power": "Surya",
  "FMCG": "Shukra",
  "Realty": "Shani",
  "Infrastructure": "Shani",
  "Oil & Gas": "Surya",
};

function dayKey(d: Date) {
  return d.getUTCDay();
}

function dateNumber(d: Date) {
  return [...d.toISOString().slice(0, 10).replaceAll("-", "")]
    .reduce((a, c) => a + Number(c), 0);
}

function reduce(n: number) {
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = [...String(n)].reduce((a, c) => a + Number(c), 0);
  }
  return n;
}

function signForSector(sector: string, day: string, n: number) {
  const r = sectorRulers[sector];
  const score = (Object.keys(themes).indexOf(r) + n + day.length) % 3;

  return score === 0
    ? "अनुकूल ज्योतिषीय संकेत"
    : score === 1
    ? "मिश्रित ज्योतिषीय संकेत"
    : "सावधानी के संकेत";
}

function buildReport(now: Date, slot: string) {
  const ruler = rulers[dayKey(now)];
  const n = reduce(dateNumber(now));
  const date = now.toISOString().slice(0, 10);

  const slotLabel =
    slot === "pre_market"
      ? "Pre-Market Outlook"
      : slot === "mid_session"
      ? "Mid-Session Astrology Update"
      : slot === "post_market"
      ? "Post-Market & Next-Day Outlook"
      : "On-Demand Astrology Report";

  const intro =
    `${date} · ${slotLabel}. Aaj ka weekday-planetary ruler ${ruler} maana gaya hai. ` +
    `Is din ka symbolic theme: ${themes[ruler]}. Date numerology root ${n} hai. ` +
    "Yeh traditional symbolic framework par aadharit educational reading hai; " +
    "isse actual grah-degree, Chandra nakshatra, KP cusp/sub-lord ya market data calculation na samjhein.";

  const sectorsText = sectors
    .map(s => `${s}: ${signForSector(s, ruler, n)} (symbolic ruler ${sectorRulers[s]}).`)
    .join("\n");

  const nifty =
    `NIFTY 50: ${ruler} ke weekday symbolism aur date-number ${n} ke aadhar par ` +
    `${n % 2 === 0 ? "santulit/discipline" : "badlav/volatility"} theme par dhyan. ` +
    "Is reading se tezi ya mandi ki factual guarantee nahi nikalti; ise sirf jyotishiya chintan ke roop mein dekhein.";

  return {
    report_title: `[${slotLabel}] NIFTY 50 & 10 Sectors — Astrology Only — ${date}`,
    customer_summary: intro,
    vedic_analysis:
      `Vedic weekday symbolism: ${ruler}. Paramparik theme ${themes[ruler]}. ` +
      "Yeh simplified weekday reading hai; full sidereal transit chart shamil nahi hai.",
    kp_analysis:
      "KP status: is automated edition mein KP ayanamsa, bhava cusps, nakshatra sub-lords aur ruling planets ka precise ephemeris calculation enabled nahi hai. Isliye koi KP-specific result claim nahi kiya ja raha.",
    numerology_analysis:
      `Date numerology root: ${n}. Is number ko symbolic reflection ke liye use karein, predictive certainty ke liye nahi.`,
    sector_analysis: sectorsText,
    stock_analysis: "Koi individual stock pick ya buy/sell call generate nahi ki gayi.",
    market_outlook: nifty,
    trading_timing: "Koi exact entry/exit timing nahi di ja rahi. Yeh astrology-only educational outlook hai.",
    is_published: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const slot = String(body.slot ?? "");

    if (!["pre_market", "mid_session", "post_market", "manual"].includes(slot)) {
      return new Response(
        JSON.stringify({ error: "Invalid report slot" }),
        { status: 400, headers: cors },
      );
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let targetUserIds: string[] = [];

    if (
      req.headers.get("x-astro-cron-secret") === Deno.env.get("ASTRO_CRON_SECRET") &&
      Deno.env.get("ASTRO_CRON_SECRET")
    ) {
      const { data: members, error } = await service
        .from("premium_memberships")
        .select("user_id")
        .eq("is_active", true)
        .gt("valid_until", new Date().toISOString());

      if (error) throw error;

      targetUserIds = (members || []).map(
        (m: { user_id: string }) => m.user_id,
      );
    } else {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");

      if (!token) {
        return new Response(
          JSON.stringify({ error: "Login required" }),
          { status: 401, headers: cors },
        );
      }

      const { data: { user }, error } = await service.auth.getUser(token);

      if (error || !user) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired login session" }),
          { status: 401, headers: cors },
        );
      }

      if (slot !== "manual") {
        return new Response(
          JSON.stringify({ error: "Scheduled reports are server-triggered" }),
          { status: 403, headers: cors },
        );
      }

      targetUserIds = [user.id];
    }

    if (!targetUserIds.length) {
      return new Response(
        JSON.stringify({ ok: true, inserted: 0, message: "No active Premium members" }),
        { headers: cors },
      );
    }

    const report = buildReport(new Date(), slot);
    const rows = targetUserIds.map(user_id => ({ user_id, ...report }));

    const { error: insertErr } = await service.from("reports").insert(rows);

    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({
        ok: true,
        slot,
        inserted: rows.length,
        title: report.report_title,
      }),
      { headers: cors },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: cors },
    );
  }
});
