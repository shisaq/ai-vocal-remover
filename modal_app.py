import modal
import base64
import os
import re

MAX_AUDIO_BYTES = 10 * 1024 * 1024
RESULT_TTL_SECONDS = int(os.environ.get("RESULT_TTL_SECONDS", "1800"))
secret = modal.Secret.from_name("ai-vocal-remover-secrets")

# Define the Modal image with Demucs (UVR5 core) dependencies
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg") # ffmpeg is required for audio processing
    .pip_install("demucs", "torchcodec", "fastapi[standard]", "python-multipart", "vercel", "yt-dlp")
)

app = modal.App("uvr5-demucs-app")

def sanitize_filename(filename: str):
    safe = "".join(char if char.isalnum() or char in "._-" else "_" for char in filename)
    return safe or "input.wav"

def sanitize_blob_basename(filename: str):
    stem = os.path.splitext(os.path.basename(filename))[0]
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "-", stem).strip("-._").lower()
    safe = re.sub(r"-{2,}", "-", safe)
    return safe[:80] or "track"

@app.function(image=image, gpu="T4", timeout=900, secrets=[secret])
def process_audio(audio_data: bytes, filename: str):
    import tempfile
    import os
    import subprocess
    
    with tempfile.TemporaryDirectory() as tempdir:
        input_path = os.path.join(tempdir, sanitize_filename(filename))
        with open(input_path, "wb") as f:
            f.write(audio_data)
            
        # Run Demucs: we use the two-stems option to separate vocals and accompaniment
        output_dir = os.path.join(tempdir, "output")
        cmd = [
            "demucs",
            "--two-stems", "vocals",
            "-n", "htdemucs", # state-of-the-art model
            "--out", output_dir,
            input_path
        ]
        
        try:
            print("Running Demucs separation...")
            subprocess.run(cmd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            print("Demucs error:", e.stderr)
            raise Exception("Demucs processing failed")
            
        # Demucs output structure: output_dir/htdemucs/{track_name}/...
        # Note: the input filename is used as the folder name but without extension and spaces replaced?
        # Actually demucs might normalize the folder name. Let's list the output directory.
        track_dir = os.listdir(os.path.join(output_dir, "htdemucs"))[0]
        vocals_path = os.path.join(output_dir, "htdemucs", track_dir, "vocals.wav")
        accomp_path = os.path.join(output_dir, "htdemucs", track_dir, "no_vocals.wav")
        
        if not os.path.exists(vocals_path) or not os.path.exists(accomp_path):
            raise Exception("Output files not found after processing")
            
        with open(vocals_path, "rb") as f:
            vocals = f.read()
        with open(accomp_path, "rb") as f:
            accomp = f.read()
            
        return {
            "vocals": vocals,
            "other": accomp
        }

def wav_to_mp3(wav_data: bytes, stem: str):
    import tempfile
    import os
    import subprocess

    with tempfile.TemporaryDirectory() as tempdir:
        wav_path = os.path.join(tempdir, f"{stem}.wav")
        mp3_path = os.path.join(tempdir, f"{stem}.mp3")
        with open(wav_path, "wb") as f:
            f.write(wav_data)

        subprocess.run(
            ["ffmpeg", "-y", "-i", wav_path, "-codec:a", "libmp3lame", "-b:a", "192k", mp3_path],
            check=True,
            capture_output=True,
            text=True,
        )

        with open(mp3_path, "rb") as f:
            return f.read()

@app.function(image=image, timeout=600, secrets=[secret])
def fetch_from_url(source_url: str, max_bytes: int, max_duration_seconds: int):
    import json
    import tempfile
    import os
    import subprocess
    from vercel.blob import BlobClient

    with tempfile.TemporaryDirectory() as tempdir:
        output_template = os.path.join(tempdir, "source.%(ext)s")
        info = subprocess.run(
            ["yt-dlp", "--dump-json", "--no-playlist", source_url],
            check=True,
            capture_output=True,
            text=True,
        )
        metadata = json.loads(info.stdout)
        duration = int(metadata.get("duration") or 0)

        if duration and duration > max_duration_seconds:
            raise Exception(f"Audio is too long. Maximum duration is {max_duration_seconds // 60} minutes.")

        subprocess.run(
            [
                "yt-dlp",
                "--no-playlist",
                "-x",
                "--audio-format", "mp3",
                "--audio-quality", "0",
                "-o", output_template,
                source_url,
            ],
            check=True,
            capture_output=True,
            text=True,
        )

        files = [os.path.join(tempdir, name) for name in os.listdir(tempdir) if name.startswith("source.")]
        if not files:
            raise Exception("Downloaded audio file was not found.")

        source_path = files[0]
        size = os.path.getsize(source_path)
        if size > max_bytes:
            raise Exception(f"Imported audio is too large. Maximum size is {max_bytes // (1024 * 1024)}MB.")

        title = metadata.get("title") or "imported-audio"
        filename = f"{sanitize_blob_basename(title)}.mp3"
        with open(source_path, "rb") as f:
            audio_data = f.read()

        client = BlobClient()
        blob = client.put(
            f"sources/url-{filename}",
            audio_data,
            access="public",
            content_type="audio/mpeg",
            add_random_suffix=True,
        )

        return {
            "success": True,
            "sourceUrl": blob.url,
            "sourcePathname": blob.pathname,
            "filename": filename,
            "durationSeconds": duration,
        }

@app.function(image=image, timeout=RESULT_TTL_SECONDS + 300, secrets=[secret])
def cleanup_blobs(pathnames: list[str], delay_seconds: int):
    import time
    from vercel.blob import BlobClient

    time.sleep(delay_seconds)
    client = BlobClient()

    for pathname in pathnames:
        try:
            client.delete(pathname)
            print(f"Deleted expired result blob: {pathname}")
        except Exception as exc:
            print(f"Failed to delete result blob {pathname}: {exc}")

@app.function(
    image=image,
    timeout=120,
    secrets=[secret],
    schedule=modal.Period(minutes=30),
)
def sweep_expired_result_blobs():
    from datetime import datetime, timezone
    from vercel.blob import BlobClient

    client = BlobClient()
    now = datetime.now(timezone.utc)
    cursor = None
    deleted_count = 0

    while True:
        page = client.list_objects(prefix="results/", cursor=cursor, limit=1000)
        expired_pathnames = []

        for blob in page.blobs:
            uploaded_at = blob.uploaded_at
            if uploaded_at.tzinfo is None:
                uploaded_at = uploaded_at.replace(tzinfo=timezone.utc)

            age_seconds = (now - uploaded_at).total_seconds()
            if age_seconds >= RESULT_TTL_SECONDS:
                expired_pathnames.append(blob.pathname)

        if expired_pathnames:
            client.delete(expired_pathnames)
            deleted_count += len(expired_pathnames)
            print(f"Deleted {len(expired_pathnames)} expired result blobs")

        if not page.has_more:
            break

        cursor = page.cursor

    print(f"Sweep complete, deleted {deleted_count} expired result blobs")

@app.function(image=image, gpu="T4", timeout=900, secrets=[secret])
def process_blob(source_ref: str, filename: str | None = None):
    from vercel.blob import BlobClient

    client = BlobClient()

    try:
        source = client.get(source_ref, access="public")
        if source.size and source.size > MAX_AUDIO_BYTES:
            raise Exception("Audio file is too large. Maximum size is 10MB.")

        audio_bytes = source.content
        if len(audio_bytes) > MAX_AUDIO_BYTES:
            raise Exception("Audio file is too large. Maximum size is 10MB.")

        input_filename = filename or os.path.basename(source.pathname) or "input.wav"
        stems = process_audio.remote(audio_bytes, input_filename)

        result = {}
        result_pathnames = []
        base_name = sanitize_blob_basename(input_filename)
        for stem, data in stems.items():
            mp3_data = wav_to_mp3(data, stem)
            blob = client.put(
                f"results/{base_name}-{stem}.mp3",
                mp3_data,
                access="public",
                content_type="audio/mpeg",
                add_random_suffix=True,
            )
            result_pathnames.append(blob.pathname)
            result[stem] = {
                "url": blob.url,
                "pathname": blob.pathname,
                "contentType": "audio/mpeg",
                "expiresInSeconds": RESULT_TTL_SECONDS,
            }

        cleanup_blobs.spawn(result_pathnames, RESULT_TTL_SECONDS)
        sweep_expired_result_blobs.spawn()
        return {"success": True, "stems": result}
    finally:
        client.delete(source_ref)

@app.function(image=image, secrets=[secret])
@modal.asgi_app()
def fastapi_app():
    from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Request
    from fastapi.responses import JSONResponse

    web_app = FastAPI()

    def check_auth(authorization: str | None):
        expected_token = os.environ.get("MODAL_AUTH_TOKEN")
        if expected_token and authorization != f"Bearer {expected_token}":
            raise HTTPException(status_code=401, detail="Unauthorized")

    @web_app.post("/separate")
    async def separate_audio(
        audio: UploadFile = File(...),
        authorization: str = Header(None)
    ):
        check_auth(authorization)

        try:
            audio_bytes = await audio.read()
            if len(audio_bytes) > MAX_AUDIO_BYTES:
                raise HTTPException(status_code=413, detail="Audio file is too large. Maximum size is 10MB.")

            filename = audio.filename or "input.wav"

            # Call the heavy GPU function synchronously
            stems = process_audio.remote(audio_bytes, filename)
            result = {
                stem: f"data:audio/wav;base64,{base64.b64encode(data).decode('utf-8')}"
                for stem, data in stems.items()
            }

            return JSONResponse(content={"success": True, "stems": result})
        except HTTPException:
            raise
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @web_app.post("/separate-blob")
    async def separate_blob(
        request: Request,
        authorization: str = Header(None)
    ):
        check_auth(authorization)

        payload = await request.json()
        source_url = payload.get("sourceUrl")
        source_pathname = payload.get("sourcePathname")
        filename = payload.get("filename")

        if not source_url:
            raise HTTPException(status_code=400, detail="Missing sourceUrl.")

        source_ref = source_pathname or source_url

        try:
            function_call = process_blob.spawn(source_ref, filename)
            return JSONResponse(content={"success": True, "jobId": function_call.object_id})
        except HTTPException:
            raise
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @web_app.get("/separate-blob/status/{job_id}")
    async def separate_blob_status(
        job_id: str,
        authorization: str = Header(None)
    ):
        check_auth(authorization)

        try:
            function_call = modal.FunctionCall.from_id(job_id)
            result = function_call.get(timeout=0)
            return JSONResponse(content={"success": True, "status": "done", **result})
        except TimeoutError:
            return JSONResponse(content={"success": True, "status": "processing"})
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JSONResponse(
                content={"success": False, "status": "error", "error": str(e)},
                status_code=500,
            )

    @web_app.post("/url-import")
    async def import_url(
        request: Request,
        authorization: str = Header(None)
    ):
        check_auth(authorization)

        payload = await request.json()
        source_url = payload.get("url")
        max_bytes = int(payload.get("maxBytes") or MAX_AUDIO_BYTES)
        max_duration_seconds = int(payload.get("maxDurationSeconds") or 300)

        if not source_url:
            raise HTTPException(status_code=400, detail="Missing url.")

        try:
            result = fetch_from_url.remote(source_url, max_bytes, max_duration_seconds)
            return JSONResponse(content=result)
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    return web_app
