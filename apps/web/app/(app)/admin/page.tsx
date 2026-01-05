"use client";

import { useRouter } from "next/navigation";
import { useMe } from "@/lib/auth-context";
import { useEffect } from "react";

export default function AdminPage() {
  const me = useMe();
  const router = useRouter();

  useEffect(() => {
    if (me.role !== "admin") {
      // 비관리자가 직접 접근한 경우 티켓 목록으로 보낸다.
      router.replace("/tickets");
    }
  }, [me.role, router]);

  if (me.role !== "admin") {
    return (
      <div className="p-6 text-sm text-gray-600">
        관리자 전용 페이지입니다. 권한이 없어 티켓 목록으로 이동합니다.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="text-xs text-gray-500">ADMIN</div>
        <h1 className="text-2xl font-semibold">관리자 대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">운영 설정과 모니터링을 제공합니다.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded-lg p-4 bg-white space-y-2">
          <div className="text-sm font-semibold">운영 알림</div>
          <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
            <li>담당자 배정 SLA 확인</li>
            <li>첨부파일 용량 한도 검토</li>
            <li>로그 보관/백업 일정 확인</li>
          </ul>
        </div>

        <div className="border rounded-lg p-4 bg-white space-y-2">
          <div className="text-sm font-semibold">추가 예정</div>
          <div className="text-sm text-gray-700 leading-6">
            에이전트 관리, 카테고리/우선순위 설정, 템플릿 관리 등 운영 기능을 순차 추가할 예정입니다.
          </div>
        </div>
      </div>
    </div>
  );
}
