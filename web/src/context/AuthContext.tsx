import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { pb, currentStaff, type StaffRecord } from "@/lib/pb";
import { ClientResponseError } from "pocketbase";

type AuthContextValue = {
  staff: StaffRecord | null;
  loading: boolean;
  login: (username: string, pin: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffRecord | null>(currentStaff());
  const [loading, setLoading] = useState(false);

  // authStore already persists to localStorage and rehydrates on load;
  // this just keeps React state in sync with it (e.g. a 401 elsewhere in
  // the app calling pb.authStore.clear()).
  useEffect(() => {
    return pb.authStore.onChange(() => {
      setStaff(currentStaff());
    });
  }, []);

  async function login(username: string, pin: string) {
    setLoading(true);
    try {
      // Reuses the exact same custom route the mobile app's PIN pad calls -
      // "a future web superadmin logs in exactly the way counter staff do,
      // just gated by role" (README). The role gate itself happens after:
      // a successful login here just proves the PIN is right, not that
      // this person is a superadmin.
      const res = await pb.send("/api/staff-login", {
        method: "POST",
        body: { username, pin },
      });
      pb.authStore.save(res.token, res.record);
      const staffRecord = res.record as StaffRecord;
      if (staffRecord.role !== "superadmin") {
        pb.authStore.clear();
        throw new Error("This account doesn't have superadmin access.");
      }
      setStaff(currentStaff());
    } catch (err) {
      if (err instanceof ClientResponseError) {
        throw new Error(err.response?.message || "Invalid username or PIN");
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    pb.authStore.clear();
    setStaff(null);
  }

  return (
    <AuthContext.Provider value={{ staff, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
