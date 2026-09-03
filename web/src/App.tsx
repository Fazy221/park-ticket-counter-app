import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Tickets } from "@/pages/Tickets";
import { Conflicts } from "@/pages/Conflicts";
import { StaffPage } from "@/pages/Staff";
import { Counters } from "@/pages/Counters";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/conflicts" element={<Conflicts />} />
            <Route path="/staff" element={<StaffPage />} />
            <Route path="/counters" element={<Counters />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
