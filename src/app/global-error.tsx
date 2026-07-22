"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="ru">
      <body style={{ background: "#eef1f6", color: "#1e293b" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: "100%",
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              padding: 32,
              textAlign: "center",
            }}
          >
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              Приложение не загрузилось
            </h1>
            <p style={{ color: "#64748b", marginBottom: 24 }}>
              Произошла критическая ошибка. Попробуйте перезагрузить страницу.
            </p>
            <button
              onClick={reset}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Попробовать снова
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
