# ZoeDepth - Depth Estimation

Minimal setup for ZoeDepth depth estimation with Apple Silicon (MPS) support.

## Structure

```
ZoeDepth/
├── api/                    # REST API
├── zoedepth/              # Core model code
├── inputs/                # Place your input images here
├── outputs/               # Generated depth maps go here
├── venv/                  # Virtual environment
├── run_depth.py           # Simple CLI tool
├── start_api.sh           # Start the API server
└── requirements-api.txt   # Dependencies
```

## Quick Start

### 1. Simple CLI Usage

```bash
# Activate environment
source venv/bin/activate

# Run on an image
python run_depth.py inputs/your_image.jpg
```

### 2. API Server

```bash
./start_api.sh
```

Then visit: http://localhost:8000/docs

## API Endpoints

- `POST /estimate-depth` - Estimate depth from image
- `POST /panorama-to-3d` - Convert 360° panorama to 3D mesh (GLB/OBJ/PLY)

## Examples

**CLI:**
```bash
python run_depth.py inputs/photo.jpg
# Output saved to: outputs/photo_depth.png
```

**API (curl):**
```bash
# Depth estimation
curl -X POST "http://localhost:8000/estimate-depth?return_visualization=true" \
  -F "file=@inputs/photo.jpg" \
  --output depth.png

# Panorama to 3D
curl -X POST "http://localhost:8000/panorama-to-3d?format=glb" \
  -F "file=@inputs/panorama.jpg" \
  --output mesh.glb
```

**Python:**
```python
import torch
from PIL import Image

# Load model
model = torch.hub.load("isl-org/ZoeDepth", "ZoeD_N", pretrained=True)
device = "mps"  # or "cuda" or "cpu"
model.to(device).eval()

# Estimate depth
image = Image.open("image.jpg")
depth = model.infer_pil(image)
```

## System

- Uses MPS (Metal Performance Shaders) on Apple Silicon
- Falls back to CUDA or CPU automatically
- Models cached in `~/.cache/torch/hub/`