# COCORORIA 로그 변환기

GitHub Pages에서 바로 실행할 수 있는 순수 HTML/CSS/JavaScript 기반 변환기입니다.

## 기능

- COCORORIA HTML 불러오기
- 탭 이름/색상 변경
- 탭 삭제 및 출력 제외
- 캐릭터 이름/글자색 변경
- 캐릭터 이미지 추가
- 캐릭터를 나레이션으로 지정
- `/system` 메시지 스타일 변환
- `/system`은 내용의 형태와 상관없이 위아래에 얇은 구분선을 넣어 표시
- 같은 캐릭터 + 같은 표정은 구분선 없이 연결
- 표정(avatar-image)이 바뀌면 새 메시지 블록으로 구분
- 변환 결과를 HTML로 저장
- 서버 업로드 없이 브라우저에서 처리

## GitHub Pages

Repository 루트에 `index.html`, `style.css`, `script.js`를 올린 뒤
Settings → Pages → Deploy from a branch → `main` / `/ (root)`를 선택하면 됩니다.

## 주의

원본 COCORORIA HTML은 변경하지 않습니다. 변환 결과는 브라우저에서 새 HTML 파일로 생성됩니다.
