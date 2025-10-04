# ZoeDepth FastAPI

A production-ready REST API for depth estimation and 3D reconstruction using ZoeDepth with Apple Silicon (MPS) support.

## Features

✅ **Depth Estimation** - Estimate depth from regular images  
✅ **360° Panorama to 3D** - Convert panoramic images to 3D meshes  
✅ **MPS Acceleration** - Native Apple Silicon GPU support  
✅ **Multiple Formats** - Export as GLB, OBJ, or PLY  
✅ **High Quality** - Adjustable resolution and smoothing  
✅ **RESTful API** - Easy integration with any application  

## Quick Start

### 1. Install Dependencies

```bash
cd /Users/safakaragoz/Desktop/placedotfun/ZoeDepth
source venv/bin/activate
pip install -r requirements-api.txt
```

### 2. Start the Server

**Option A: Using the startup script (recommended)**
```bash
./start_api.sh
```

**Option B: Manual start**
```bash
export PYTHONPATH="/Users/safakaragoz/Desktop/placedotfun/ZoeDepth:$PYTHONPATH"
export SSL_CERT_FILE=$(python -c "import certifi; print(certifi.where())")
cd api
python main.py
```

The API will be available at: **http://localhost:8000**

### 3. View API Documentation

Open in your browser:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## API Endpoints

### GET `/`
Get API information and available endpoints

### GET `/health`
Health check endpoint

### POST `/estimate-depth`
Estimate depth from a regular image

**Parameters:**
- `file` (required): Image file
- `return_visualization` (optional): Return colored depth map (default: false)

**Example:**
```bash
curl -X POST "http://localhost:8000/estimate-depth?return_visualization=true" \
  -F "file=@examples/pano_2.jpeg" \
  --output depth_map.png
```

### POST `/panorama-to-3d`
Convert a 360° panoramic image to a 3D mesh

**Parameters:**
- `file` (required): Panoramic image file
- `max_resolution` (optional): Maximum resolution (default: 2048)
- `smooth_depth` (optional): Apply smoothing (default: true)
- `smooth_sigma` (optional): Smoothing strength (default: 0.5)
- `remove_edges` (optional): Remove discontinuities (default: true)
- `edge_threshold` (optional): Edge threshold (default: 0.03)
- `format` (optional): Output format - glb, obj, or ply (default: glb)

**Example:**
```bash
curl -X POST "http://localhost:8000/panorama-to-3d?format=glb&max_resolution=2048" \
  -F "file=@examples/pano_2.jpeg" \
  --output panorama.glb
```

### GET `/info`
Get detailed API and model information

## Usage Examples

### Python

```python
import requests

# Depth estimation
with open('image.jpg', 'rb') as f:
    response = requests.post(
        'http://localhost:8000/estimate-depth',
        files={'file': f},
        params={'return_visualization': True}
    )
    
with open('depth_map.png', 'wb') as f:
    f.write(response.content)

# Panorama to 3D
with open('panorama.jpg', 'rb') as f:
    response = requests.post(
        'http://localhost:8000/panorama-to-3d',
        files={'file': f},
        params={
            'format': 'glb',
            'max_resolution': 2048,
            'smooth_depth': True
        }
    )
    
with open('mesh.glb', 'wb') as f:
    f.write(response.content)
```

### JavaScript/TypeScript

```javascript
// Depth estimation
const formData = new FormData();
formData.append('file', imageFile);

const response = await fetch('http://localhost:8000/estimate-depth?return_visualization=true', {
    method: 'POST',
    body: formData
});

const blob = await response.blob();
const depthMapUrl = URL.createObjectURL(blob);

// Panorama to 3D
const formData = new FormData();
formData.append('file', panoramaFile);

const response = await fetch('http://localhost:8000/panorama-to-3d?format=glb', {
    method: 'POST',
    body: formData
});

const meshBlob = await response.blob();
// Use mesh in Three.js, Babylon.js, etc.
```

### cURL

```bash
# Get API info
curl http://localhost:8000/info

# Health check
curl http://localhost:8000/health

# Estimate depth (get JSON stats)
curl -X POST http://localhost:8000/estimate-depth \
  -F "file=@image.jpg"

# Estimate depth (get visualization)
curl -X POST "http://localhost:8000/estimate-depth?return_visualization=true" \
  -F "file=@image.jpg" \
  --output depth.png

# Convert panorama to 3D mesh
curl -X POST "http://localhost:8000/panorama-to-3d?format=glb&max_resolution=2048" \
  -F "file=@panorama.jpg" \
  --output mesh.glb
```

## Configuration

### Environment Variables

Create a `.env` file in the `api/` directory:

```env
# Server configuration
HOST=0.0.0.0
PORT=8000

# Model configuration
DEFAULT_MAX_RESOLUTION=2048
DEFAULT_SMOOTH_SIGMA=0.5
DEFAULT_EDGE_THRESHOLD=0.03

# SSL certificates (for macOS)
SSL_CERT_FILE=/path/to/certifi/cacert.pem
```

### Production Deployment

For production, use Gunicorn with Uvicorn workers:

```bash
pip install gunicorn

gunicorn api.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --timeout 120
```

## Performance

- **Device**: Automatically uses MPS (Apple Silicon), CUDA, or CPU
- **Speed**: ~1-2s for depth estimation, 10-30s for high-quality 3D mesh
- **Memory**: ~2GB for model, varies with image resolution
- **Concurrent Requests**: Supports multiple concurrent requests

## Error Handling

The API returns standard HTTP status codes:

- `200` - Success
- `400` - Bad request (invalid parameters)
- `500` - Server error (processing failed)

Error responses include details:

```json
{
  "detail": "Error message describing what went wrong"
}
```

## Development

### Project Structure

```
api/
├── main.py              # FastAPI application
├── utils/
│   ├── __init__.py
│   └── depth_processor.py  # Core processing logic
├── README.md            # This file
└── __init__.py
```

### Testing

```bash
# Start server in development mode
cd api
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Test with curl
curl http://localhost:8000/health
```

## License

MIT License - Same as ZoeDepth

## Support

- **GitHub Issues**: https://github.com/isl-org/ZoeDepth/issues
- **Documentation**: http://localhost:8000/docs (when server is running)

