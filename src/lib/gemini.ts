/**
 * Gemini AI интеграция для анализа документов.
 * Для активации добавьте GEMINI_API_KEY в .env
 * Получить бесплатный ключ: https://aistudio.google.com/app/apikey
 */

import { GoogleGenAI } from "@google/genai";
import { readFile } from "fs/promises";
import path from "path";

export const isGeminiEnabled = !!process.env.GEMINI_API_KEY;

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY не задан");
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export interface DocumentAnalysis {
  docType: string;           // Тип документа (лицензия, сертификат, баланс...)
  issuedTo: string;          // Кому выдан
  issuedBy: string;          // Кем выдан
  number: string;            // Номер документа
  validFrom: string | null;  // Дата выдачи
  validUntil: string | null; // Срок действия
  summary: string;           // Краткое резюме что это
  isRelevantForTenders: boolean; // Подходит ли для тендеров вообще
  warning: string | null;    // Предупреждение если документ нерелевантный
  extractedData: Record<string, string>; // Дополнительные поля
}

/**
 * Анализирует документ с помощью Gemini Vision.
 * Поддерживает PDF, JPG, PNG.
 */
export async function analyzeDocumentWithAI(fileUrl: string, fileName: string): Promise<DocumentAnalysis | null> {
  if (!isGeminiEnabled) return null;

  try {
    const client = getClient();

    // Читаем файл с диска
    const filePath = path.join(process.cwd(), "public", fileUrl.replace(/^\//, ""));
    const fileBytes = await readFile(filePath);
    const base64 = fileBytes.toString("base64");

    // Определяем MIME тип
    const ext = fileName.split(".").pop()?.toLowerCase() || "pdf";
    const mimeType = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg";

    const prompt = `Ты анализируешь документ российской компании для участия в государственных закупках (тендерах по 44-ФЗ).

Проанализируй документ и верни JSON с полями:
{
  "docType": "тип документа (лицензия ФСБ / лицензия ФСТЭК / допуск СРО / лицензия МЧС / сертификат соответствия / декларация соответствия / бухгалтерский баланс / выписка ЕГРЮЛ / реестр контрактов / паспорт / диплом / спортивный документ / другое)",
  "issuedTo": "название организации которой выдан документ",
  "issuedBy": "кем выдан (орган, организация)",
  "number": "номер документа или пустая строка",
  "validFrom": "дата выдачи в формате ДД.ММ.ГГГГ или null",
  "validUntil": "срок действия в формате ДД.ММ.ГГГГ или null или 'бессрочно'",
  "summary": "1-2 предложения что это за документ и что подтверждает",
  "isRelevantForTenders": true если документ полезен для госзакупок, false если нет (например: спортивный, личный, не относится к бизнесу),
  "warning": "предупреждение если документ не подходит для тендеров или выглядит нерелевантным, иначе null",
  "extractedData": {дополнительные поля которые удалось извлечь}
}

Отвечай ТОЛЬКО JSON без markdown, без пояснений.`;

    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
            { text: prompt },
          ],
        },
      ],
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    return JSON.parse(cleaned) as DocumentAnalysis;
  } catch (error) {
    console.error("Gemini analysis error:", error);
    return null;
  }
}

/**
 * Анализирует профиль компании и возвращает рекомендации по документам.
 */
export async function analyzeCompanyProfile(description: string, okvedCodes: string[]): Promise<{
  suggestedDocs: string[];
  tenderCategories: string[];
  summary: string;
} | null> {
  if (!isGeminiEnabled) return null;

  try {
    const client = getClient();

    const prompt = `Ты эксперт по государственным закупкам России (44-ФЗ).

Компания описывает себя так: "${description}"
ОКВЭД коды: ${okvedCodes.join(", ") || "не указаны"}

Ответь JSON:
{
  "suggestedDocs": ["список документов которые нужны этой компании для участия в тендерах. Только реальные нужные для этого бизнеса, не лишние."],
  "tenderCategories": ["категории тендеров на которые компания может претендовать"],
  "summary": "2-3 предложения: что это за компания, в каких тендерах может участвовать, что нужно подготовить"
}

Отвечай ТОЛЬКО JSON.`;

    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Gemini profile analysis error:", error);
    return null;
  }
}
