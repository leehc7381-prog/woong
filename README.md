# 영웅이 육아노트

유튜브·인스타 릴스 육아 꿀팁을 올리면 제미나이가 소리와 화면을 함께 분석해 카테고리별로 정리해 주는 웹앱이에요. 가족 코드로 부부가 같은 목록을 함께 봐요.

## 구성
- `index.html`: 앱 전체 (빌드 과정 없음)
- `firebase-config.js`: Firebase 웹 설정 (공개 값)
- `firestore.rules`: Firestore 보안 규칙. Firebase 콘솔 → Firestore → 규칙 탭에 붙여넣어요.
- `manifest.webmanifest`, `icon-*.png`: 홈 화면 앱 설정

## 데이터
- `families/{가족코드}`: `{ createdAt, geminiKey? }`
- `families/{가족코드}/tips/{id}`: 꿀팁
- `families/{가족코드}/categories/{id}`: AI가 새로 만든 카테고리
