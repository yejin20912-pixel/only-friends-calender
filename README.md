# 약속시간표 배포 메모

정적 웹앱이라서 GitHub Pages에 바로 올릴 수 있고, `firebase-config.js`를 채우면 여러 사람이 같은 링크에서 동시에 입력할 수 있습니다.

## 현재 상태

- `index.html`, `styles.css`, `app.js`: 화면과 기능 구현 완료
- `firebase-config.js`: Firebase 설정값만 비워둔 상태
- `firebase-config.example.js`: 예시 템플릿
- 방마다 로컬 저장 키를 분리해 같은 브라우저에서 여러 링크를 열어도 데이터가 섞이지 않게 처리

## 1. Firebase 연결

1. Firebase 콘솔에서 새 프로젝트를 만듭니다.
2. 프로젝트에 웹 앱을 추가합니다.
3. `Build > Realtime Database`에서 데이터베이스를 생성합니다.
4. 앱 설정 화면의 `firebaseConfig` 값을 [firebase-config.js](./firebase-config.js)에 붙여 넣습니다.

예시:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "내프로젝트.firebaseapp.com",
  databaseURL: "https://내프로젝트-default-rtdb.firebaseio.com",
  projectId: "내프로젝트",
  storageBucket: "내프로젝트.firebasestorage.app",
  messagingSenderId: "...",
  appId: "...",
};
```

Realtime Database 규칙은 처음에는 아래처럼 시작하면 됩니다.

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

이 규칙은 링크를 아는 사람이 해당 방에 들어와 읽고 쓰는 방식입니다.

## 2. GitHub에 올리기

아직 Git 저장소는 만들어지지 않았습니다. 이 폴더에서 아래 순서로 올리면 됩니다.

```powershell
git init -b main
git add .
git commit -m "Initial meeting scheduler"
git remote add origin https://github.com/사용자이름/저장소이름.git
git push -u origin main
```

## 3. GitHub Pages 켜기

1. GitHub 저장소의 `Settings > Pages`로 이동합니다.
2. `Deploy from a branch`를 선택합니다.
3. `main` 브랜치와 `/root`를 선택합니다.
4. 배포가 끝나면 생성된 URL로 접속합니다.

처음 접속하면 주소 뒤에 `?room=랜덤문자`가 자동으로 붙습니다. 상단의 `링크 복사` 버튼으로 친구들에게 보내면 같은 방을 함께 쓸 수 있습니다.

## 4. Firebase 없이 쓸 때

`firebase-config.js`를 비워둔 상태로 열면 공유는 안 되지만, 한 기기 안에서는 로컬 모드로 바로 사용할 수 있습니다.
