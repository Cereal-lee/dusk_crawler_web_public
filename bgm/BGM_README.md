# 로컬 BGM 설정

공개판은 ComfyUI에 HTTP 요청을 보내는 브리지 코드만 포함합니다. 모델·음원·ComfyUI·가상 환경은 배포하지 않습니다. 외부 소프트웨어와 모델은 각각의 이용 조건을 확인하고 설치하세요.

## Windows 준비

Python 3.13, Git, FFmpeg/FFprobe가 PATH에 있어야 합니다. 아래는 NVIDIA GPU용으로 검증한 환경의 설치 예입니다. 저장소 루트에서 실행하세요.

```powershell
New-Item -ItemType Directory -Force bgm/runtime
python -m venv bgm/runtime/.venv
git clone https://github.com/Comfy-Org/ComfyUI.git bgm/runtime/ComfyUI
git -C bgm/runtime/ComfyUI checkout 1332fabfcc507aa7c548cd5152071ed494c207e8
bgm/runtime/.venv/Scripts/python.exe -m pip install -r bgm/local_bgm/requirements.lock.txt --extra-index-url https://download.pytorch.org/whl/cu130
bgm/runtime/.venv/Scripts/python.exe bgm/local_bgm/download_models.py
```

모델 다운로드 스크립트는 `https://huggingface.co/Comfy-Org/stable-audio-3`의 파일을 받고 SHA-256을 검증합니다. 공급자의 접근 권한과 이용 조건이 먼저 충족되어야 합니다. 접근이 거절되면 해당 공급자에서 해결해야 합니다.

## 실행

```powershell
# 다른 터미널에서 npm run dev를 실행한 다음:
$env:WORKSHOP_ORIGIN='http://127.0.0.1:4173'
./bgm/start_bgm.ps1
```

웹사이트의 BGM 공방에서 **PC 연결**을 누르세요. 브라우저가 로컬 네트워크 접근을 묻는 경우 사용자가 허용해야 합니다. 브리지는 127.0.0.1:8190, ComfyUI는 127.0.0.1:8188에서만 실행됩니다. 이미 해당 포트에서 다른 공방 브리지가 실행 중이면 먼저 해당 브리지를 종료하거나 다른 PC에서 실행하세요. 두 작업실은 같은 포트를 동시에 사용할 수 없습니다.

다른 웹사이트에서 연결하려면 브리지를 시작하기 전에 `WORKSHOP_ORIGIN`을 그 사이트의 정확한 origin으로 지정하세요. 연결 키는 `bgm/runtime/.bridge_key`에 보관하며 Git에 포함하지 않습니다. 공개 서버로 브리지를 노출하지 마세요.

## 저장과 레퍼런스

- 생성 음원·제목·프롬프트: `bgm/runtime/library/`
- 업로드한 레퍼런스 음원: `bgm/runtime/reference_audio/`
- 샘플 실행 결과: `bgm/runtime/output/preview_v1/`
- 음원 제목이 같아도 곡별 ID 폴더에 따로 저장합니다.
- 생성 완료 후 제목 수정, WAV/MP3/JSON 다운로드를 지원합니다.
- 기준 음원을 선택하거나 업로드하고 변형 정도 10~90을 지정할 수 있습니다. 유사도 보장값은 아닙니다.
- 현재 UI는 15~120초 생성을 요청합니다. 모델의 지원 범위와 실제 출력 길이는 사용하는 모델에 따라 확인하세요.
- BGM은 해당 PC에만 저장되며 PXF 계정 저장소로 동기화하지 않습니다.

자신이 사용할 권리가 있는 음원만 레퍼런스로 제공하세요. 저장소의 MIT는 외부 모델과 음원의 이용 조건을 바꾸지 않습니다.
