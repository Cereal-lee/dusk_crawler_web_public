"""Generate the three preview tracks through the local ComfyUI HTTP API."""
import hashlib
import json
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parent / 'runtime'
OUTPUT = ROOT / "output" / "preview_v1"
COMFY_OUTPUT = ROOT / "ComfyUI" / "output"
SERVER = "http://127.0.0.1:8188"


def api(route, body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(SERVER + route, data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(error.read().decode("utf-8", errors="replace")) from error


def graph(recipe, sample):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": recipe["model"]}},
        "2": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "t5gemma_b_b_ul2.safetensors", "type": "stable_audio", "device": "cpu"}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": sample["prompt"], "clip": ["2", 0]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": "", "clip": ["2", 0]}},
        "5": {"class_type": "EmptyLatentAudio", "inputs": {
            "seconds": recipe["duration_seconds"], "batch_size": 1}},
        "6": {"class_type": "KSampler", "inputs": {
            "model": ["1", 0], "positive": ["3", 0], "negative": ["4", 0],
            "latent_image": ["5", 0], "seed": sample["seed"], "steps": recipe["steps"],
            "cfg": 1.0, "sampler_name": "lcm", "scheduler": "simple", "denoise": 1.0}},
        "7": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "SaveAudio", "inputs": {
            "audio": ["7", 0], "filename_prefix": "dusk_crawler_preview/" + sample["id"]}},
    }


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def run():
    recipe = json.loads((SOURCE / "recipes.json").read_text(encoding="utf-8"))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    api("/system_stats")
    manifest = []
    for sample in recipe["samples"]:
        workflow = graph(recipe, sample)
        fingerprint = hashlib.sha256(json.dumps(workflow, sort_keys=True).encode()).hexdigest()
        receipt_path = OUTPUT / (sample["id"] + ".job.json")
        write_json(OUTPUT / (sample["id"] + ".api.json"), workflow)
        started = time.monotonic()
        receipt = json.loads(receipt_path.read_text(encoding="utf-8")) if receipt_path.exists() else {}
        if receipt.get("fingerprint") != fingerprint:
            submitted = api("/prompt", {"prompt": workflow, "client_id": "dusk_crawler_bgm_preview"})
            receipt = {"prompt_id": submitted["prompt_id"], "fingerprint": fingerprint}
            write_json(receipt_path, receipt)
        prompt_id = receipt["prompt_id"]
        print(f"Generating {sample['id']} ({prompt_id})", flush=True)
        last_log = started
        while True:
            history = api("/history/" + prompt_id).get(prompt_id)
            if history:
                write_json(OUTPUT / (sample["id"] + ".history.json"), history)
                if history["status"].get("status_str") == "error":
                    raise RuntimeError(json.dumps(history["status"], ensure_ascii=False))
                audio = history.get("outputs", {}).get("8", {}).get("audio", [])
                if audio:
                    result = audio[0]
                    break
            if time.monotonic() - started > 1200:
                raise TimeoutError("Generation exceeded 20 minutes; inspect ComfyUI before retrying.")
            if time.monotonic() - last_log > 20:
                print(f"{sample['id']}: waiting, {time.monotonic() - started:.0f}s", flush=True)
                last_log = time.monotonic()
            time.sleep(5)
        source = (COMFY_OUTPUT / result.get("subfolder", "") / result["filename"]).resolve()
        if not source.is_relative_to(COMFY_OUTPUT.resolve()):
            raise RuntimeError("ComfyUI returned an unexpected output path")
        flac = OUTPUT / (sample["id"] + ".flac")
        shutil.copy2(source, flac)
        wav = OUTPUT / (sample["id"] + ".wav")
        mp3 = OUTPUT / (sample["id"] + ".mp3")
        # Preserve the generated lossless master; preview copies only standardize loudness.
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(flac),
                        "-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-ar", "44100", "-c:a", "pcm_s16le", str(wav)], check=True)
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
                        "-c:a", "libmp3lame", "-q:a", "2", str(mp3)], check=True)
        metadata = dict(sample, model=recipe["model"], requested_duration=recipe["duration_seconds"],
                        steps=recipe["steps"], elapsed_seconds=round(time.monotonic() - started, 2),
                        prompt_id=prompt_id, loop_verified=False, normalization_lufs=-18,
                        files={"original": flac.name, "wav": wav.name, "preview": mp3.name})
        manifest.append(metadata)
        write_json(OUTPUT / "manifest.json", manifest)
        print(f"Saved {mp3.name} ({metadata['elapsed_seconds']}s including export)", flush=True)


if __name__ == "__main__":
    run()
