/** Тонкий индикатор при смене вкладки / метки — старая лента не «залипает» визуально. */
export default function TendersLoading() {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] h-0.5 bg-emerald-500 animate-pulse pointer-events-none"
      aria-hidden
    />
  );
}
