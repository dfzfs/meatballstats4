// The shop window: what each built-in app is, in words, and where it sits on the phone. This file is all that is
// loaded for an app that is off; the app's own module (src/apps/<id>.js) is imported only when it is switched on.
export const COST = { zero: '토큰 0', low: '조금', tap: '누를 때만' };

export const BUILTIN = [
    // 상태
    { id: 'scene', icon: '🧭', name: '장면', tab: '요약', color: '#3a8ee6', cost: 'low', desc: '지금 언제 · 어디서 · 누구와 무슨 일인지 한눈에 요약해 두고, AI가 헷갈리지 않게 알려 줘요.' },
    { id: 'people', icon: '👥', name: '인물', tab: '소개', color: '#4d908e', cost: 'low', desc: '이야기에 나온 사람들을 한 줄 소개와 함께 모아 두고, 지금 장면에 있는 사람만 AI에 알려 줘요.' },
    { id: 'look', icon: '👕', name: '차림새', tab: '차림새', color: '#577590', cost: 'low', desc: '누가 뭘 입고 있는지, 어디를 다쳤는지 기억해서 다음 답에서 옷이나 상처가 멋대로 바뀌지 않게 해요.' },
    { id: 'bonds', icon: '💞', name: '관계', tab: '관계', color: '#e0567f', cost: 'low', desc: '두 사람이 어디까지 가까워졌는지 적어 두고, AI가 단계를 건너뛰지 않게 속도를 지켜요.' },
    { id: 'secrets', icon: '🔒', name: '비밀', tab: '비밀', color: '#6c5ce7', cost: 'low', desc: 'AI가 숨겨야 할 비밀을 먼저 말해 버리지 않게 지켜요. 비밀 내용은 본편 AI에 보내지 않아요.' },
    { id: 'heart', icon: '💗', name: '호감', tab: '호감', color: '#ff5d8f', cost: 'zero', desc: '애정 · 신뢰를 숫자로, 질투와 마음 비교, 고백 · 청혼 · 이별 카드. 관계가 적은 것을 받아 셈해서 AI에 더 묻지 않아요.' },
    { id: 'mind', icon: '💭', name: '속마음', tab: '속마음', color: '#a78bfa', cost: 'tap', desc: '누르면 지금 장면 속 인물의 속마음을 살짝 보여 줘요. 나만 보고, 본편 AI에는 안 가요.' },
    { id: 'schedule', icon: '📆', name: '일정', color: '#7a6ad8', cost: 'tap', desc: '가운데 시간 선에 함께하는 일정, 왼쪽 · 오른쪽에 인물별 일정. 🪄 한 번이면 이번 주를 다 짜 줘요.' },
    { id: 'calendar', icon: '📅', name: '달력', color: '#3a8ee6', cost: 'zero', desc: '이야기 속 날짜를 달력으로 보여 주고, 내가 표시한 날이 다가오면 AI에 알려 줘요.' },
    { id: 'map', icon: '🗺', name: '지도', color: '#2f9e7a', cost: 'zero', desc: '다녀온 곳을 노선도로 그려요. 누가 어디 있는지, 가는 길, 건물 안까지 보여 줘요. 장면이 적어 둔 걸 읽기만 해요.' },
    { id: 'stats', icon: '❤️', name: '수치', tab: '수치', color: '#ff6b6b', cost: 'low', desc: '체력 · 기운처럼 내가 정한 수치를 막대로 보여 주고, 낮아지면 AI가 그에 맞게 쓰게 해요.' },
    { id: 'wallet', icon: '💰', name: '지갑', tab: '지갑', color: '#f4a261', cost: 'low', desc: '돈과 물건을 코드가 세어서, 없는 돈을 쓰거나 잃은 물건이 다시 나오지 않게 해요.' },
    { id: 'life', icon: '🧸', name: '생활', tab: '생활', color: '#f4978e', cost: 'low', desc: '시간이 흐르면 허기 · 졸림 · 청결 · 사람이 저절로 줄어요. 먹고 자고 씻고 누굴 만나면 다시 차요.' },
    // 지시
    { id: 'helper', icon: '😼', name: '도우미', color: '#f2a65a', cost: 'tap', desc: '미트볼 고양이에게 말로 시켜요. 고칠 걸 말하면 먼저 보여 주고 확인하면 고쳐요. 기능 질문에도 답해요.' },
    { id: 'director', icon: '🎬', name: '지시', color: '#264653', cost: 'low', desc: '채팅에 남지 않는 지시를 적어요. 다음 답 한 번 · 이 장면 동안 · 계속 중에서 골라요.' },
    { id: 'echo', icon: '🔁', name: '되풀이 막기', color: '#2a9d8f', cost: 'zero', desc: '같은 표현 · 같은 첫머리가 답마다 되풀이되면, 되풀이되는 동안만 살짝 말려요.' },
    { id: 'todo', icon: '📌', name: '약속', color: '#e76f51', cost: 'low', desc: '이야기 속 약속 · 할 일을 적어 두고, AI가 잊지 않게 열린 것만 알려 줘요.' },
    { id: 'memo', icon: '📝', name: '메모', tab: '메모', color: '#43aa8b', cost: 'zero', desc: '이 채팅에서 AI가 늘 기억했으면 하는 걸 적어 둬요. 적은 그대로만 보내요.' },
    { id: 'record', icon: '📒', name: '기록', tab: '답 기록', color: '#e9c46a', cost: 'zero', desc: '답마다 무엇이 적혔는지 한눈에 보고, 틀리게 읽은 답만 골라 다시 읽혀요.' },
    { id: 'choices', icon: '🎯', name: '선택지', color: '#ef476f', cost: 'tap', desc: 'AI 답 끝의 선택지를 누르기 쉬운 목록으로 보여 주고, 누르면 입력창에 넣어 줘요.' },
    { id: 'lore', icon: '📖', name: '설정집', tab: '설정집', color: '#8d6e63', cost: 'zero', desc: '세계 · 장소 · 물건 · 규칙을 적어 두면, 그 말이 나온 답에만 골라서 AI에 알려 줘요.' },
    { id: 'custom', icon: '🧩', name: '내 칸', tab: '내 칸', color: '#5e60ce', cost: 'low', desc: '내가 정한 것을 따로 적게 해요(예: 명성, 마나, 수상함). 칸을 만들 때만 읽기에 한 줄이 늘어요.' },
    // 재미
    { id: 'fate', icon: '🃏', name: '운명', tab: '운명 카드', color: '#3d348b', cost: 'zero', desc: '축복 · 저주 · 사건 카드를 뽑아요. 몇 답 동안 이야기에 스며들다 저절로 꺼져요.' },
    { id: 'group', icon: '💬', name: '단체방', tab: '단체방', color: '#00b4d8', cost: 'tap', desc: '인물들끼리의 단체 대화방. 누르면 자기들끼리 떠드는 몇 줄을 받아요.' },
    { id: 'hypno', icon: '🌀', name: '최면', tab: '최면', color: '#7b2cbf', cost: 'zero', desc: '한 인물에게 암시를 걸어요. 정한 답 수만큼 따르다가 풀려요.' },
    { id: 'dice', icon: '🎲', name: '주사위', color: '#7c5cff', cost: 'tap', desc: '판정이 필요할 때 눌러서 굴려요. 결과는 다음 답에 한 번만 반영돼요.' },
    { id: 'contacts', icon: '📞', name: '연락', tab: '문자', color: '#34c759', cost: 'tap', desc: '이야기 속 인물에게 문자를 보내고 답장을 받아요. 주고받은 문자는 다음 답에 한 번 알려 줘요.' },
    { id: 'fortune', icon: '🔮', name: '점집', tab: '점집', color: '#9b5de5', cost: 'tap', desc: '이야기 속 하루에 한 번 운세를 뽑아요. 원하면 그날의 운이 이야기에 살짝 스며들어요.' },
    { id: 'music', icon: '🎵', name: '추천 음악', color: '#ff8fab', cost: 'tap', desc: '누르면 지금 장면에 어울리는 실제 곡을 하나 골라 줘요.' },
    { id: 'twist', icon: '🌀', name: '이야기 장치', tab: '장치', color: '#118ab2', cost: 'zero', desc: '이야기가 알아서 조금씩 출렁이게 하는 장치 열 가지. AI를 따로 부르지 않아요.' },
    { id: 'album', icon: '🏆', name: '앨범', tab: '앨범', color: '#ffb703', cost: 'zero', desc: '이야기에서 이룬 것(업적)이 저절로 모이고, 마음에 드는 장면을 눌러서 남겨요.' },
    { id: 'touch', icon: '💌', name: '연인의 손길', tab: '연인의 손길', color: '#ff5d8f', cost: 'zero', desc: '연인(한 명만)이 가끔 내 폰을 몰래 만져요. 연락처 이름 · 달력 · 쪽지 · 돈 · 물건 · 약속까지. 티 나게, AI 호출 없이.' },
    { id: 'news', icon: '📰', name: '소식', tab: '소식', color: '#6c7a89', cost: 'tap', desc: '누르면 이야기 속 세상의 소식 몇 줄을 만들어 줘요. 원하면 소문으로 이야기에 흘려 넣어요.' },
];

// The phone's three shelves. An entry with one app opens that app; an entry with several is one page whose inner
// tabs are those apps (each still switches on and off by itself, so an unused part costs nothing).
export const SHELVES = [
    { id: 'state', icon: '📋', name: '상태', hint: '지금 이야기가 어떤지', entries: [
        { id: 'scene', apps: ['scene'] },
        { id: 'cast', front: true, icon: '👥', name: '인물', color: '#4d908e', desc: '사람마다 소개 · 차림새 · 관계 · 호감 · 비밀 · 속마음을 한 장에', apps: ['people', 'look', 'bonds', 'heart', 'secrets', 'mind'] },
        { id: 'plan', icon: '📆', name: '일정', color: '#7a6ad8', desc: '가운데 시간 선 양옆에 인물별 일정. 달력과 약속도 같은 시간표에 떠요', apps: ['schedule', 'calendar', 'todo'] },
        { id: 'map', apps: ['map'] },
        { id: 'me', front: true, icon: '🙋', name: '나', color: '#ff6b6b', desc: '내 수치 · 지갑 · 생활 · 내가 만든 칸을 한 장에', apps: ['stats', 'wallet', 'life', 'custom'] },
    ] },
    { id: 'direct', icon: '🎬', name: '지시', hint: '이야기를 내 뜻대로', entries: [
        { id: 'helper', apps: ['helper'] },
        { id: 'director', apps: ['director'] },
        { id: 'echo', apps: ['echo'] },
        { id: 'memo', icon: '📝', name: '메모', color: '#43aa8b', desc: 'AI가 기억했으면 하는 것. 늘 보내는 메모와, 그 말이 나올 때만 꺼내는 설정집', apps: ['memo', 'lore'] },
        { id: 'record', icon: '📒', name: '기록', color: '#e9c46a', desc: '답마다 무엇이 적혔는지, 그리고 이룬 것과 남긴 장면', apps: ['record', 'album'] },
        { id: 'choices', apps: ['choices'] },
    ] },
    { id: 'fun', icon: '🎡', name: '재미', hint: '누를 때만 움직여요', entries: [
        { id: 'dice', apps: ['dice'] },
        { id: 'contacts', icon: '📞', name: '연락', color: '#34c759', desc: '인물과 문자, 단체방, 연인이 몰래 만진 폰', apps: ['contacts', 'group', 'touch'] },
        { id: 'news', apps: ['news'] },
        { id: 'fortune', icon: '🔮', name: '점집', color: '#9b5de5', desc: '오늘의 운세와 점괘, 그리고 운명의 카드', apps: ['fortune', 'fate'] },
        { id: 'music', apps: ['music'] },
        { id: 'twist', icon: '🌀', name: '이야기 장치', color: '#118ab2', desc: '이야기를 저절로 출렁이게 하는 장치들과, 인물에게 거는 암시', apps: ['twist', 'hypno'] },
    ] },
];
export const entryOf = (id) => { for (const s of SHELVES) for (const e of s.entries) if (e.id === id) return e; return null; };
// Where an app lives: -> { shelf, entry } (null for an app from outside)
export const homeOf = (appId) => { for (const s of SHELVES) for (const e of s.entries) if (e.apps.includes(appId)) return { shelf: s, entry: e }; return null; };

// Kept for older code that still asks for groups.
export const GROUPS = SHELVES.map((s) => ({ id: s.id, name: s.name, hint: s.hint }));

// First-run question: 「어떤 롤플을 해요?」
export const PRESETS = [
    { id: 'story', icon: '📖', name: '이야기만 편하게', desc: '가장 가볍게. 상황 요약만 적어 두고 되풀이를 막아요.', apps: ['scene', 'people', 'echo', 'record', 'helper'] },
    { id: 'romance', icon: '💕', name: '연애 · 관계 중심', desc: '천천히 가까워지고, 비밀은 지켜요.', apps: ['scene', 'people', 'bonds', 'secrets', 'look', 'mind', 'echo', 'record', 'helper'] },
    { id: 'sim', icon: '🎒', name: '생활 · 모험 시뮬', desc: '돈 · 수치 · 생활 · 약속을 세고, 판정은 주사위로.', apps: ['scene', 'people', 'wallet', 'stats', 'life', 'todo', 'calendar', 'schedule', 'map', 'dice', 'record', 'helper'] },
    { id: 'direct', icon: '🎬', name: '내가 감독', desc: '몰래 지시를 넣고, 선택지 · 장치로 이야기를 굴려요.', apps: ['director', 'memo', 'secrets', 'echo', 'scene', 'choices', 'twist', 'record', 'helper'] },
];
