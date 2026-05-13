import modal
from fastapi import FastAPI, UploadFile, File, HTTPException, Header
from fastapi.responses import JSONResponse
import base64

# Define the Modal image with Demucs (UVR5 core) dependencies
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg") # ffmpeg is required for audio processing
    .pip_install("demucs", "fastapi[standard]", "python-multipart")
)

app = modal.App("uvr5-demucs-app")

@app.function(image=image, gpu="T4", timeout=600)
def process_audio(audio_data: bytes, filename: str):
    import tempfile
    import os
    import subprocess
    
    with tempfile.TemporaryDirectory() as tempdir:
        input_path = os.path.join(tempdir, filename)
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
            vocals_b64 = base64.b64encode(f.read()).decode("utf-8")
        with open(accomp_path, "rb") as f:
            accomp_b64 = base64.b64encode(f.read()).decode("utf-8")
            
        return {
            "vocals": f"data:audio/wav;base64,{vocals_b64}",
            "other": f"data:audio/wav;base64,{accomp_b64}"
        }

web_app = FastAPI()

@web_app.post("/separate")
async def separate_audio(
    audio: UploadFile = File(...),
    authorization: str = Header(None)
):
    import os
    expected_token = os.environ.get("MODAL_AUTH_TOKEN")
    if expected_token and authorization != f"Bearer {expected_token}":
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    try:
        audio_bytes = await audio.read()
        filename = audio.filename or "input.wav"
        
        # Call the heavy GPU function synchronously
        result = process_audio.remote(audio_bytes, filename)
        
        return JSONResponse(content={"success": True, "stems": result})
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.function(image=image)
@modal.asgi_app()
def fastapi_app():
    return web_app
