# Telegram automation

컴퓨터가 꺼져 있어도 GitHub Actions가 한국 시간 기준 매일 09:00, 15:00, 19:00, 19:30, 20:00에 채널 공지를 발송합니다. GitHub 예약 지연에 대비해 작업은 3시간 일찍 시작해 목표 시각까지 기다리며, 09:00 공지는 발송 후 자동 고정합니다.

메시지는 `messages`, 이미지는 `images` 폴더에서 시간 이름별로 관리합니다. 봇 토큰은 저장소 파일이 아니라 GitHub Actions secret에만 저장합니다.
