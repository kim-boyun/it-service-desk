"use client";

import { createContext, useContext } from "react";

export type Me = {
  emp_no: string;
  kor_name?: string | null;
  title?: string | null;
  department?: string | null;
  role: "requester" | "admin";
};

const AuthContext = createContext<Me | null>(null);

export function AuthProvider({ me, children }: { me: Me; children: React.ReactNode }) {
  return <AuthContext.Provider value={me}>{children}</AuthContext.Provider>;
}

export function useMe() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useMe must be used within AuthProvider");
  return v;
}
