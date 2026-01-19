"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

export type TicketCategory = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
};

export function useTicketCategories() {
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<TicketCategory[]>("/ticket-categories")
      .then((data) => {
        if (!alive) return;
        setCategories(data);
        setError(null);
      })
      .catch((e: any) => {
        if (!alive) return;
        setError(e.message ?? "카테고리를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const map = useMemo(() => {
    const next: Record<number, string> = {};
    for (const c of categories) next[c.id] = c.name;
    return next;
  }, [categories]);

  return { categories, map, loading, error };
}
