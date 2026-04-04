import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import WorkspacePage from "./pages/WorkspacePage";

const ActiveSessionPage = lazy(() => import("./pages/ActiveSessionPage"));

function AppShellFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="rounded-[1.5rem] border border-border/20 bg-background px-8 py-7 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <span className="material-symbols-outlined animate-pulse">bolt</span>
        </div>
        <p className="font-newsreader text-2xl">Opening Rocky</p>
        <p className="mt-2 text-sm text-muted-foreground">Loading the workspace…</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<AppShellFallback />}>
      <Routes>
        <Route path="/" element={<WorkspacePage />} />
        <Route path="/session" element={<ActiveSessionPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
