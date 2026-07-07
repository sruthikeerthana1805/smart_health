/**
 * Calls Gemini for a short demand-forecast insight. If GEMINI_API_KEY isn't
 * configured (or the call fails), falls back to a simple moving-average
 * estimate so the feature never breaks a demo.
 */
export async function generateForecastInsight(
  drugName: string,
  dailyUsage: number[],
  avgDailyUsage: number,
  currentStock: number
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const configured = apiKey && apiKey !== "your-gemini-api-key-here";
  const daysLeft = avgDailyUsage > 0 ? Math.floor(currentStock / avgDailyUsage) : null;

  if (!configured) {
    return daysLeft !== null
      ? `[Estimate — no Gemini key set] At ~${avgDailyUsage.toFixed(1)} units/day, current stock lasts ~${daysLeft} more days.`
      : `[Estimate — no Gemini key set] Not enough dispense history yet to project usage.`;
  }

  try {
    const prompt = `You are a rural health supply planner. Drug: ${drugName}. Daily dispensed quantities over the last ${dailyUsage.length} recorded day(s): ${dailyUsage.join(", ") || "none yet"}. Current stock: ${currentStock} units. In 2 short sentences, forecast expected demand for the next 7 days and say whether to reorder now.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data: any = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text?.trim() || "Gemini returned no forecast — check API key/quota.";
  } catch (err) {
    console.error("[gemini] forecast error:", err);
    return daysLeft !== null
      ? `[Fallback — Gemini call failed] At ~${avgDailyUsage.toFixed(1)} units/day, stock lasts ~${daysLeft} more days.`
      : `[Fallback — Gemini call failed] Not enough data to estimate.`;
  }
}
