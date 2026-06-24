import Sidebar from "@/components/Sidebar";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen bg-[#eef1f6]">
      <Sidebar />
      <main className="flex-1 p-6 lg:p-8 animate-pulse">
        <div className="h-8 w-48 bg-slate-200 rounded-lg mb-2" />
        <div className="h-4 w-64 bg-slate-100 rounded mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="app-card p-4 h-24 bg-white" />
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="app-card h-20 bg-white" />
          ))}
        </div>
      </main>
    </div>
  );
}
