import { GoogleGenAI } from "@google/genai";

async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.log("KEY_MISSING"); process.exit(1); }
  const client = new GoogleGenAI({ apiKey: key });
  try {
    const r = await client.models.generateContent({
      model: "gemini-2.0-flash-lite",
      contents: [{ role: "user", parts: [{ text: "Ответь одним словом: работаешь?" }] }],
    });
    const text = r.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log("OK:", text);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Только код ошибки без ключа
    const code = msg.match(/"code":(\d+)/)?.[1] || "unknown";
    const status = msg.match(/"status":"([^"]+)"/)?.[1] || "unknown";
    console.log("ERR:", code, status);
  }
}
main();
