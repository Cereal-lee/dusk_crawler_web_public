"""Local reference ingestion and audio-to-audio workflow preparation."""
import json
import math
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

MAX_DURATION = 120
MAX_UPLOAD = 50 * 1024 * 1024
EXTENSIONS = {'.wav', '.mp3', '.flac', '.ogg', '.m4a'}


def valid_id(value):
    return isinstance(value, str) and len(value) == 32 and all(c in '0123456789abcdef' for c in value)


def run_audio(args):
    return subprocess.run(args, check=True, capture_output=True, timeout=120,
                          creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))


def audio_duration(path):
    try:
        result = run_audio(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration',
                            '-of', 'json', str(path)])
        duration = float(json.loads(result.stdout)['format']['duration'])
        if not math.isfinite(duration) or duration < 1 or duration > 600:
            raise ValueError('음원 길이는 1초~10분이어야 합니다.')
        return duration
    except (subprocess.SubprocessError, KeyError, json.JSONDecodeError) as error:
        raise ValueError('읽을 수 있는 음원 파일이 아닙니다.') from error


def ingest_upload(root, stream, size, filename):
    if not 0 < size <= MAX_UPLOAD:
        raise ValueError('음원은 최대 50MB까지 업로드할 수 있습니다.')
    filename = filename.replace('\\', '/').rsplit('/', 1)[-1]
    if Path(filename).suffix.lower() not in EXTENSIONS:
        raise ValueError('WAV, MP3, FLAC, OGG, M4A 파일을 선택해 주세요.')
    root.mkdir(parents=True, exist_ok=True)
    ref_id = uuid.uuid4().hex
    # Decode in a temporary folder; publish metadata only after validation succeeds.
    with tempfile.TemporaryDirectory(dir=root) as temp:
        source = Path(temp) / ('source' + Path(filename).suffix.lower())
        with source.open('wb') as output:
            remaining = size
            while remaining:
                chunk = stream.read(min(1024 * 1024, remaining))
                if not chunk:
                    raise ValueError('업로드가 중단되었습니다. 다시 시도해 주세요.')
                output.write(chunk)
                remaining -= len(chunk)
        duration = audio_duration(source)
        decoded = Path(temp) / 'audio.wav'
        try:
            run_audio(['ffmpeg', '-y', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', str(source), '-t', str(MAX_DURATION),
                       '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', str(decoded)])
        except subprocess.SubprocessError as error:
            raise ValueError('음원을 변환하지 못했습니다. 다른 파일을 선택해 주세요.') from error
        item = {'id': ref_id, 'type': 'upload', 'title': filename[:160],
                'duration': min(duration, MAX_DURATION), 'originalDuration': duration,
                'createdAt': int(time.time() * 1000)}
        decoded.replace(root / (ref_id + '.wav'))
        (root / (ref_id + '.json')).write_text(json.dumps(item, ensure_ascii=False), encoding='utf-8')
    return item


def list_uploads(root):
    return sorted([json.loads(p.read_text(encoding='utf-8')) for p in root.glob('*.json')],
                  key=lambda x: x['createdAt'], reverse=True)


def resolve_reference(data, uploads, selection):
    if not isinstance(selection, dict) or not valid_id(selection.get('id')):
        raise ValueError('올바른 기준 곡을 선택해 주세요.')
    ref_id, kind = selection['id'], selection.get('type')
    if kind == 'library':
        metadata = data / ref_id / 'metadata.json'
        source = data / ref_id / 'audio.wav'
    elif kind == 'upload':
        metadata = uploads / (ref_id + '.json')
        source = uploads / (ref_id + '.wav')
    else:
        raise ValueError('올바른 기준 곡을 선택해 주세요.')
    if not metadata.is_file() or not source.is_file():
        raise ValueError('기준 음원을 찾을 수 없습니다. 다시 선택해 주세요.')
    item = json.loads(metadata.read_text(encoding='utf-8'))
    if kind == 'library' and item.get('status') != 'saved':
        raise ValueError('생성이 완료된 곡만 기준으로 선택할 수 있습니다.')
    return source, {'id': ref_id, 'type': kind, 'title': item['title'], 'duration': item['duration']}


def prepare_reference(source, destination, duration):
    destination.parent.mkdir(parents=True, exist_ok=True)
    run_audio(['ffmpeg', '-y', '-v', 'error', '-stream_loop', '-1', '-i', str(source),
               '-t', str(duration), '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', str(destination)])


def apply_reference(workflow, audio_name, strength, duration):
    workflow['9'] = {'class_type': 'LoadAudio', 'inputs': {'audio': audio_name}}
    workflow['10'] = {'class_type': 'VAEEncodeAudio', 'inputs': {'audio': ['9', 0], 'vae': ['1', 2]}}
    workflow['11'] = {'class_type': 'ConditioningStableAudio', 'inputs': {
        'positive': ['3', 0], 'negative': ['4', 0], 'seconds_start': 0.0, 'seconds_total': duration}}
    workflow['6']['inputs'].update(latent_image=['10', 0], denoise=strength,
                                   positive=['11', 0], negative=['11', 1])
    return workflow
