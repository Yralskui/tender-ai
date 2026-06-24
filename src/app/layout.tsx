import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { BackgroundAutoSync } from "@/components/tender/AutoSyncIndicator";

export const metadata: Metadata = {
  title: "TenderAI — Знай какие тендеры ты выиграешь",
  description: "AI-платформа для анализа госзакупок. Загрузи документы компании — получи точный анализ какие тендеры ты выиграешь и почему откажут в других.",
};

const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark";document.documentElement.classList.add(d?"dark":"light");document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){document.documentElement.classList.add("light");}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased min-h-screen">
        <ThemeProvider>
          <BackgroundAutoSync />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
