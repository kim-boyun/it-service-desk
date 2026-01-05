export default function NoticesPage() {
  const notices = [
    {
      id: 1,
      title: "1월 정기 점검 안내",
      date: "2026-01-10",
      body: "01:00~03:00 동안 네트워크 점검으로 일부 서비스가 일시 중단됩니다.",
      category: "점검",
    },
    {
      id: 2,
      title: "메일 용량 정책 변경",
      date: "2026-01-03",
      body: "개인 메일박스 기본 용량이 30GB로 상향되었습니다. 초과 시 헬프데스크로 문의하세요.",
      category: "정책",
    },
    {
      id: 3,
      title: "보안 교육 이수 안내",
      date: "2025-12-28",
      body: "재학생/교직원 대상 보안 교육이 1월 말까지 의무 이수입니다.",
      category: "보안",
    },
  ];

  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="text-xs text-gray-500">NOTICE</div>
        <h1 className="text-2xl font-semibold">공지사항</h1>
        <p className="text-sm text-gray-500 mt-1">서비스 운영/점검/정책 안내를 확인하세요.</p>
      </div>

      {notices.length === 0 ? (
        <div className="border rounded-lg p-4 text-sm text-gray-500 bg-white">등록된 공지사항이 없습니다.</div>
      ) : (
        <div className="border rounded-lg divide-y bg-white">
          {notices.map((n) => (
            <div key={n.id} className="p-4 space-y-1">
              <div className="flex items-center justify-between gap-4">
                <div className="text-lg font-semibold">{n.title}</div>
                <span className="text-xs rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">{n.category}</span>
              </div>
              <div className="text-xs text-gray-500">{n.date}</div>
              <div className="text-sm text-gray-700 leading-6">{n.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
