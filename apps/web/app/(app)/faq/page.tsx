const faqs = [
  {
    q: "VPN 연결이 자주 끊깁니다.",
    a: "유선 연결을 우선 사용하고, 무선 이용 시 5GHz SSID를 선택하세요. 계속 문제 발생 시 티켓으로 로그를 첨부해 주세요.",
  },
  {
    q: "Outlook 메일 용량이 가득 찼습니다.",
    a: "불필요한 첨부를 삭제하고, 아카이브를 활성화하세요. 그래도 부족하면 헬프데스크에 증설을 요청할 수 있습니다.",
  },
  {
    q: "노트북 성능이 느립니다.",
    a: "백그라운드 프로그램(Teams/Zoom 등) 실행 상태를 확인하고, 디스크 여유 공간을 10GB 이상 확보하세요. 하드웨어 점검이 필요하면 티켓을 등록해 주세요.",
  },
];

export default function FaqPage() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="text-xs text-gray-500">FAQ</div>
        <h1 className="text-2xl font-semibold">자주 묻는 질문</h1>
        <p className="text-sm text-gray-500 mt-1">빠른 해결을 위해 먼저 확인해 보세요.</p>
      </div>

      {faqs.length === 0 ? (
        <div className="border rounded-lg p-4 text-sm text-gray-500 bg-white">등록된 FAQ가 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="border rounded-lg bg-white p-4">
              <div className="text-sm font-semibold mb-2">{f.q}</div>
              <div className="text-sm text-gray-700 leading-6 whitespace-pre-line">{f.a}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
