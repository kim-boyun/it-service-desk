"use client";

import { QueryClient } from "@tanstack/react-query";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 5_000, // 기본 5초간 캐시 유지 (fresh 상태)
        gcTime: 10 * 60 * 1000, // 10분간 메모리에 캐시 보관 (이전 cacheTime)
      },
    },
  });
}
