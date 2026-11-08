# ComfyUI 실행 보조 스크립트

설치·실행은 [BGM 설정](../BGM_README.md)을 참고하세요.

- `download_models.py`: 공식 배포 파일 다운로드와 SHA-256 검사.
- `start_comfy.ps1`: `../runtime/`의 설치 환경을 사용해 loopback에서 ComfyUI 실행.
- `generate_samples.py`: `recipes.json`의 프롬프트를 ComfyUI에 제출하고 비교용 음원 생성.
- `requirements.lock.txt`: 검증 시 사용한 Python 의존성 목록. 패키지 자체는 포함하지 않습니다.

저장소 루트에서 샘플 생성:

```powershell
bgm/runtime/.venv/Scripts/python.exe bgm/local_bgm/generate_samples.py
```

샘플 음악은 다운로드에 포함되지 않습니다. BPM·루프 연결은 모델 결과를 청취해 확인하세요.

외부 출처: [ComfyUI](https://github.com/Comfy-Org/ComfyUI), [모델 배포](https://huggingface.co/Comfy-Org/stable-audio-3), [모델 이용 조건](https://stability.ai/license).
