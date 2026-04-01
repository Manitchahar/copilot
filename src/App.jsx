import { Navigate, Route, Routes } from "react-router-dom";
import ActiveSessionPage from "./pages/ActiveSessionPage";
import WorkspacePage from "./pages/WorkspacePage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkspacePage />} />
      <Route path="/session" element={<ActiveSessionPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
