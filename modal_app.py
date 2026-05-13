import modal
from fastapi import FastAPI, UploadFile, File, HTTPException, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import base64
import os

MAX_AUDIO_BYTES = 10 * 1024 * 1024
secret = modal.Secret.from_name("ai-vocal-remover-secrets")

# Define the Modal image with Demucs (UVR5 core) dependencies
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg") # ffmpeg is required for audio processing
    .pip_install("demucs", "torchcodec", "fastapi[standard]", "python-multipart", "vercel")
)

app = modal.App("uvr5-demucs-app")

class BlobSeparateRequest(BaseModel):
    sourceUrl: str
    sourcePathname: str | None = None
    filename: str | None = None

def check_auth(authorization: str | None):
    expected_token = os.environ.get("MODAL_AUTH_TOKEN")
    if expected_token and authorization != f"Bearer {expected_token}":
        raise HTTPException(status_code=401, detail="Unauthorized")

def sanitize_filename(filename: str):
    safe = "".join(char if char.isalnum() or char in "._-" else "_" for char in filename)
    return safe or "input.wav"

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

web_app = FastAPI()

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
    payload: BlobSeparateRequest,
    authorization: str = Header(None)
):
    check_auth(authorization)

    from vercel.blob import AsyncBlobClient

    client = AsyncBlobClient()
    source_ref = payload.sourcePathname or payload.sourceUrl

    try:
        source = await client.get(source_ref, access="public")
        if source.size and source.size > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Audio file is too large. Maximum size is 10MB.")

        audio_bytes = source.content
        if len(audio_bytes) > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Audio file is too large. Maximum size is 10MB.")

        filename = payload.filename or os.path.basename(source.pathname) or "input.wav"
        stems = process_audio.remote(audio_bytes, filename)

        result = {}
        base_name = os.path.splitext(sanitize_filename(filename))[0]
        for stem, data in stems.items():
            blob = await client.put(
                f"results/{base_name}-{stem}.wav",
                data,
                access="public",
                content_type="audio/wav",
                add_random_suffix=True,
            )
            result[stem] = blob.url

        return JSONResponse(content={"success": True, "stems": result})
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await client.delete(source_ref)

@app.function(image=image, secrets=[secret])
@modal.asgi_app()
def fastapi_app():
    return web_app
