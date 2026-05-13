import modal
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

@app.function(image=image, gpu="T4", timeout=900, secrets=[secret])
def process_blob(source_ref: str, filename: str | None = None):
    from vercel.blob import BlobClient

    client = BlobClient()

    try:
        source = client.get(source_ref, access="private")
        if source.size and source.size > MAX_AUDIO_BYTES:
            raise Exception("Audio file is too large. Maximum size is 10MB.")

        audio_bytes = source.content
        if len(audio_bytes) > MAX_AUDIO_BYTES:
            raise Exception("Audio file is too large. Maximum size is 10MB.")

        input_filename = filename or os.path.basename(source.pathname) or "input.wav"
        stems = process_audio.remote(audio_bytes, input_filename)

        result = {}
        base_name = os.path.splitext(sanitize_filename(input_filename))[0]
        for stem, data in stems.items():
            blob = client.put(
                f"results/{base_name}-{stem}.wav",
                data,
                access="public",
                content_type="audio/wav",
                add_random_suffix=True,
            )
            result[stem] = blob.url

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

    return web_app
