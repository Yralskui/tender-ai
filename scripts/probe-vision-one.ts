import path from "path";
import Groq from "groq-sdk";
import { renderPdfPages } from "../src/lib/pdfRender";

const file = path.join(
  process.cwd(),
  "data/sample-documents",
  "РУ №РЗН 2025-25693 от 26.06.2025 Комплекты белья стер (прост, плен, пелен, чех).pdf"
);

async function main() {
  console.log("GROQ:", process.env.GROQ_API_KEY ? "set" : "MISSING");
  const pages = await renderPdfPages(file, 2);
  console.log("rendered:", pages.length, "page1 bytes:", pages[0]?.dataUrl.length);

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Прочитай текст на странице РУ. Верни JSON: {products: string[], number: string}" },
            { type: "image_url", image_url: { url: pages[0].dataUrl } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 2000,
    });
    console.log("response:", completion.choices[0]?.message?.content?.slice(0, 500));
  } catch (e) {
    console.error("groq error:", e);
  }
}

main();
