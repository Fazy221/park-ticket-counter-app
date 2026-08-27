import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { staffLogin } from "@/lib/api";
import {
  cacheStaffToken,
  getActiveStaffId,
  getStaffMeta,
  getStaffToken,
  setActiveStaffId,
} from "@/lib/authTokenCache";

type Staff = { id: string; name: string; role: "counter_staff" | "superadmin" };

type AuthContextValue = {
  staff: Staff | null;
  token: string | null;
  loading: boolean;
  login: (serverUrl: string, username: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const activeId = await getActiveStaffId();
      if (activeId) {
        const [cachedToken, meta] = await Promise.all([
          getStaffToken(activeId),
          getStaffMeta(activeId),
        ]);
        if (cachedToken && meta) {
          setStaff({ id: activeId, name: meta.name, role: meta.role });
          setToken(cachedToken);
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (serverUrl: string, username: string, pin: string) => {
    const result = await staffLogin(serverUrl, username, pin);
    const staffData: Staff = {
      id: result.record.id,
      name: result.record.name,
      role: result.record.role,
    };
    await cacheStaffToken(staffData.id, result.token, {
      name: staffData.name,
      role: staffData.role,
    });
    await setActiveStaffId(staffData.id);
    setStaff(staffData);
    setToken(result.token);
  }, []);

  const logout = useCallback(async () => {
    // Clears only the "who's active" pointer. The cached token itself
    // stays - the sync loop still needs it to drain any of this person's
    // scans that are still queued (see authTokenCache.ts).
    await setActiveStaffId(null);
    setStaff(null);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ staff, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
