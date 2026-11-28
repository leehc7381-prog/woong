# 기록 저장 구조 바꾸기 계획 (가족 문서 1MB 한도 대비)

> **육아 기록(care)은 이 계획과 조금 다르게 옮겼어요:** `families/{가족코드}/logs/{YYYY-MM}` = `{ care: { dYYYYMMDD: { 기록id: 기록 } } }`, 가족 문서에 `logsV: 2`, `logsMovedAt`.
> 올리는 순서: `firestore-step1.rules` 게시 → 새 앱 배포 → 두 휴대폰에서 옮기기 확인 → `firestore.rules` 게시.
> 일정·할 일·접종·발달은 아직 가족 문서에 그대로 있어요. 아래는 처음 계획이에요.

## 왜 바꿔야 하나요

지금은 수유·유축·소변·대변·잠·체온·투약·병원 기록(`care`), 일정과 교대근무(`events`, 그 안의 `events.shift`),
예방접종(`vax`), 성장 기록(`growth`), 할 일(`events.todo`)까지 전부 `families/{가족코드}` 문서 **하나**에 들어가요.

Firestore 문서 하나는 **최대 1MB**예요. 기록 하나가 이름표까지 합쳐 100~150바이트쯤이고,
신생아 때는 하루 20~25개(수유 8~12, 소변 6~8, 대변 3~4, 잠 몇 번)를 기록하니 하루 약 3KB예요.
그러면 **1년 안팎**이면 1MB가 차고, 그 순간부터는 기록뿐 아니라 설정·일정까지 **모든 저장이 실패**해요.
또 지금 규칙(`firestore.rules`)이 `care`를 2000일, `events`를 1000개로 막고 있어서 그것도 언젠가 걸려요.

## 바꾼 뒤 모양

```
families/{가족코드}                     ← 작고 거의 안 커지는 것만
  createdAt, geminiKey, autoFeed, birthDate
  growth   { sex, records, done }       (한 달에 몇 개라 작음)
  vax      { 접종id: 날짜 }              (최대 수십 개)
  shift    { a, off, o: { dYYYYMMDD: "연차" } }   ← events.shift에서 꺼냄
  schema   2                            ← 새 구조로 옮겼다는 표시

families/{가족코드}/care/{YYYYMM}       ← 한 달에 문서 하나
  m: "2026-12"
  days: { d20261215: { e기록id: { k, t, ft, ml, min, ... } } }

families/{가족코드}/events/{일정id}     ← 일정 하나에 문서 하나
  d, d2, t, title, who

families/{가족코드}/todos/{할일id}      ← 할 일 하나에 문서 하나 (지금은 events.todo)

families/{가족코드}/tips, categories    ← 지금 그대로
```

### 왜 "월별 문서"인가요 (날짜별이 아니라)

- 한 달 기록은 많아도 25개 × 31일 × 150바이트 ≈ **120KB**라 1MB에 한참 못 미쳐요. 쌍둥이처럼 기록이 두 배여도 괜찮아요.
- 앱이 보는 범위는 대부분 "오늘", "최근 72시간"(건강), "최근 7일"(채팅 요약)이에요. 월별이면 **이번 달 + 지난달 문서 2개만** 실시간으로 지켜보면 돼요.
  날짜별 문서로 나누면 지켜봐야 할 문서가 7~8개로 늘고 읽기 횟수도 많아져요.
- 기록 하나를 더하는 방법은 지금과 거의 같아요: `care/202612` 문서에 `days.d20261215.e…` 필드만 더해요.
  같은 날 엄마·아빠가 동시에 기록해도 필드가 달라서 서로 덮어쓰지 않아요.
- 예전 날짜로 넘겨 볼 때(기록 탭 ‹ 버튼)만 그 달 문서를 한 번 읽어 와요.

### 일정·할 일은 왜 문서 하나씩인가요

일정과 할 일은 하나씩 고치고 지우는 일이 많고, 개수는 1년에 수백 개 정도라 컬렉션 하나를 통째로 지켜봐도 가벼워요.
문서 하나씩이면 "일정 1000개까지" 같은 한도도 필요 없어요.

## 기존 데이터 옮기기

1. **규칙 먼저 바꾸기 (예전 앱도 계속 돌아가게)**
   새 하위 컬렉션(`care`, `events`, `todos`)과 새 필드(`shift`, `schema`)를 허용하는 규칙을 먼저 게시해요.
   이때는 예전 필드(`care`, `events`)도 계속 허용해서, 아직 업데이트 안 된 휴대폰도 문제없게 해요.
2. **새 앱 올리기**
   새 앱은 가족 문서를 열 때 `schema`가 2가 아니고 `care`나 `events` 필드가 있으면 자동으로 옮겨요.
   - `care.dYYYYMMDD`를 달별로 묶어서 `care/{YYYYMM}` 문서에 합쳐 써요(merge).
   - `events`의 일정마다 `events/{id}` 문서를 만들고, `events.shift`는 가족 문서 `shift` 필드로 옮겨요.
   - 한 번에 최대 500개까지 쓸 수 있는 batch로 나눠서 써요. 1년치여도 몇 번이면 끝나요.
   - 다 쓴 뒤 새 문서들을 다시 읽어서 기록 개수가 같은지 확인하고, 같을 때만 `schema: 2`를 표시하고
     예전 `care`, `events` 필드를 지워요. 개수가 다르면 지우지 않고 다음에 다시 시도해요.
   - 기록 id가 그대로라서 **두 번 옮겨도 똑같은 결과**예요. 엄마·아빠 휴대폰이 동시에 옮겨도 안전해요.
   - 옮기기 전에 "백업 파일 저장"과 같은 내용을 휴대폰에 자동으로 한 번 저장해 둬요(혹시 모를 때를 위해).
3. **옛날 앱이 늦게 쓴 기록 챙기기**
   한쪽 휴대폰에서 앱을 새로고침하지 않고 오래 켜 두면 예전 버전이 계속 돌아가서, 옮긴 뒤에도 가족 문서 `care`에 새 기록을 쓸 수 있어요.
   - 새 앱은 열 때마다 가족 문서에 `care`가 다시 생겼는지 보고, 있으면 같은 방법으로 옮기고 지워요.
4. **규칙 조이기 (몇 주 뒤)**
   두 휴대폰 모두 새 버전인 게 확인되면, `schema`가 2인 가족 문서에는 예전 `care`, `events` 필드를 못 쓰게 막아요.
   그때 예전 앱으로 기록하면 "저장하지 못했어요" 안내가 떠서 새로고침하게 돼요.

### 같이 바꿔야 하는 앱 부분

- 기록 저장·삭제(`careSave`, `careDelete`), 일정 저장·삭제(`evSave`, `evDelete`), 교대근무 저장(`shiftWrite`), 할 일 저장(지금 `events.todo` → `todos/{id}`).
- 가족 문서 실시간 구독: 이번 달·지난달 `care` 문서와 `events`, `todos` 컬렉션 구독을 더해요.
- 백업 파일 저장/불러오기: 새 구조에서 모아서 저장하고, **예전 백업 파일도 불러올 수 있게** 그대로 받아 줘요.
- 가족 코드 없이 쓰는 모드(휴대폰 저장)는 Firestore 한도와 상관없어서 그대로 둬요.

## firestore.rules 바꿀 점 (초안)

```
function famFields() {
  return ['createdAt', 'geminiKey', 'autoFeed', 'birthDate', 'growth', 'vax', 'shift', 'schema',
          'care', 'events'];   // 4단계에서 'care', 'events'는 schema 2 문서에선 못 쓰게 막아요
}
// famShapeOk에 더할 것
  && (!('schema' in d) || d.schema is int)
  && (!('shift' in d) || (d.shift is map && (!('o' in d.shift) || d.shift.o.size() <= 2000)))

match /families/{code} {
  // ... 지금 규칙 그대로 ...

  // 월별 기록: 문서 id는 YYYYMM, 필드는 m과 days만, 한 달 최대 31일
  match /care/{month} {
    allow read: if request.auth != null;
    allow create, update: if request.auth != null && month.matches('[0-9]{6}')
      && request.resource.data.keys().hasOnly(['m', 'days'])
      && request.resource.data.days is map && request.resource.data.days.size() <= 31;
    allow delete: if false;
  }
  // 일정 하나씩
  match /events/{id} {
    allow read, delete: if request.auth != null;
    allow create, update: if request.auth != null && id.size() <= 40
      && request.resource.data.keys().hasOnly(['d', 'd2', 't', 'title', 'who'])
      && request.resource.data.title is string && request.resource.data.title.size() <= 60;
  }
  // 할 일 하나씩 (필드 이름은 할 일 기능에 맞춰 정해요)
  match /todos/{id} {
    allow read, delete: if request.auth != null;
    allow create, update: if request.auth != null && id.size() <= 40
      && request.resource.data.keys().size() <= 12;
  }
}
```

- 지금 있는 `match /{col}/{doc}` 규칙(tips, categories)은 그대로 둬요. Firestore 규칙은 맞는 규칙 중 하나만 허용해도 통과라서,
  새 규칙을 따로 더해도 서로 부딪히지 않아요.
- 규칙은 Firebase 콘솔(woong-cb156 → Firestore → 규칙)에 붙여 넣어 게시해야 해요. 순서는 **규칙 먼저, 앱 나중**이에요.

## 언제 하면 좋을까요

지금 크기로는 출산 뒤 몇 달은 괜찮아요. 기록이 쌓이기 전인 **출산 직후~생후 2개월 안**에 옮기면 옮길 데이터도 적고 가장 안전해요.
그 전에 앱 설정에 "저장 공간 얼마나 썼는지"(가족 문서 크기 대략)를 보여 주는 작은 표시를 먼저 넣어 두는 것도 방법이에요.
