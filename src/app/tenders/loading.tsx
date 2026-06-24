import Sidebar from "@/components/Sidebar";

export default function TendersLoading() {
  return (
    <div className="flex min-h-screen app-shell">
      <Sidebar />
      <main className="app-main p-3 sm:p-4 lg:p-5 animate-pulse">
        <div className="h-8 w-32 bg-slate-200 rounded-lg mb-4" />
        <div className="h-4 w-96 bg-slate-100 rounded mb-6" />
        <div className="space-y-2.5 max-w-5xl">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="app-card h-[88px] sm:h-24 rounded-xl bg-white" />
          ))}
        </div>
      </main>
    </div>
  );
}
