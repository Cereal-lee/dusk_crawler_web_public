"""Download the official Comfy-Org Stable Audio 3 Small Music files."""
import hashlib
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'runtime'
FILES = (
    ("checkpoints/stable_audio_3_small_music.safetensors", 2270384940,
     "da85866b11b01d0694d990785f6abbd79c8064df1b0e6f8aea52935e0ef84b64"),
    ("text_encoders/t5gemma_b_b_ul2.safetensors", 1187264003,
     "1e1eba25be8872edb0d3c6335c6658fd6388e7b14b60da6e454e404cfcd8150e"),
)


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def download(relative, expected_size, expected_hash):
    target = ROOT / "ComfyUI" / "models" / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file() and target.stat().st_size == expected_size and digest(target) == expected_hash:
        print(f"Verified existing {target.name}", flush=True)
        return
    partial = target.with_suffix(target.suffix + ".part")
    offset = partial.stat().st_size if partial.exists() else 0
    headers = {"User-Agent": "DuskCrawler-BGM-Local-Preview/1.0"}
    if offset:
        headers["Range"] = f"bytes={offset}-"
    url = "https://huggingface.co/Comfy-Org/stable-audio-3/resolve/main/" + relative
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=90) as response:
        if response.status != 206:
            offset = 0
        mode = "ab" if offset else "wb"
        count = offset
        printed_at = time.monotonic()
        print(f"Downloading {target.name}: {expected_size / 1e9:.2f} GB", flush=True)
        with partial.open(mode) as out:
            while chunk := response.read(8 * 1024 * 1024):
                out.write(chunk)
                count += len(chunk)
                if time.monotonic() - printed_at >= 15:
                    print(f"{target.name}: {count / expected_size:.0%}", flush=True)
                    printed_at = time.monotonic()
    if partial.stat().st_size != expected_size or digest(partial) != expected_hash:
        raise RuntimeError(f"Download verification failed: {target.name}")
    partial.replace(target)
    print(f"SHA256 verified: {target.name}", flush=True)


if __name__ == "__main__":
    for model_file in FILES:
        download(*model_file)
