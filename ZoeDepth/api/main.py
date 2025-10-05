"""
FastAPI application for ZoeDepth depth estimation
"""
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import io
import tempfile
import os
from typing import Optional

from utils.depth_processor import DepthProcessor, PanoramaProcessor, RegularImageProcessor

# Initialize FastAPI app
app = FastAPI(
    title="ZoeDepth API",
    description="Depth estimation and 3D reconstruction API using ZoeDepth with MPS support",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize processors (lazy loading)
depth_processor = None
panorama_processor = None
regular_processor = None


def get_depth_processor():
    """Get or initialize depth processor"""
    global depth_processor
    if depth_processor is None:
        depth_processor = DepthProcessor()
        depth_processor.load_model()
    return depth_processor


def get_panorama_processor():
    """Get or initialize panorama processor"""
    global panorama_processor
    if panorama_processor is None:
        panorama_processor = PanoramaProcessor(get_depth_processor())
    return panorama_processor


def get_regular_processor():
    """Get or initialize regular image processor"""
    global regular_processor
    if regular_processor is None:
        regular_processor = RegularImageProcessor(get_depth_processor())
    return regular_processor


@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "ZoeDepth API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "depth_estimation": "/estimate-depth",
            "panorama_to_3d": "/panorama-to-3d",
            "docs": "/docs"
        },
        "device": get_depth_processor().device
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    processor = get_depth_processor()
    return {
        "status": "healthy",
        "device": processor.device,
        "model_loaded": processor.model is not None
    }


@app.post("/estimate-depth")
async def estimate_depth(
    file: UploadFile = File(...),
    return_visualization: bool = Query(False, description="Return colored depth map")
):
    """
    Estimate depth from a regular image
    
    Args:
        file: Image file (jpg, png, etc.)
        return_visualization: Whether to return visualization or raw depth data
        
    Returns:
        Depth map as image (if visualization=True) or JSON with depth statistics
    """
    try:
        # Read and validate image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert('RGB')
        
        # Process image
        processor = get_regular_processor()
        depth, visualization = processor.process_image(
            image, 
            return_visualization=return_visualization
        )
        
        if return_visualization and visualization:
            # Return depth map as image
            img_byte_arr = io.BytesIO()
            visualization.save(img_byte_arr, format='PNG')
            img_byte_arr.seek(0)
            
            return StreamingResponse(
                img_byte_arr,
                media_type="image/png",
                headers={"Content-Disposition": "attachment; filename=depth_map.png"}
            )
        else:
            # Return depth statistics as JSON
            return JSONResponse({
                "success": True,
                "image_size": image.size,
                "depth_shape": depth.shape,
                "statistics": {
                    "min": float(depth.min()),
                    "max": float(depth.max()),
                    "mean": float(depth.mean()),
                    "std": float(depth.std())
                },
                "device": get_depth_processor().device
            })
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")


@app.post("/panorama-to-3d")
async def panorama_to_3d(
    file: UploadFile = File(...),
    max_resolution: int = Query(2048, description="Maximum resolution (higher = better quality, slower)"),
    smooth_depth: bool = Query(True, description="Apply depth smoothing"),
    smooth_sigma: float = Query(0.5, description="Smoothing strength"),
    remove_edges: bool = Query(True, description="Remove depth discontinuities"),
    edge_threshold: float = Query(0.03, description="Edge removal threshold"),
    format: str = Query("glb", description="Output format: glb, obj, or ply")
):
    """
    Convert a 360° panoramic image to a 3D mesh
    
    Args:
        file: Panoramic image file (equirectangular projection)
        max_resolution: Maximum resolution for processing
        smooth_depth: Whether to smooth depth map
        smooth_sigma: Smoothing strength (0.1-2.0)
        remove_edges: Remove depth discontinuities for cleaner mesh
        edge_threshold: Threshold for edge removal (0.01-0.1)
        format: Output format (glb, obj, ply)
        
    Returns:
        3D mesh file in the requested format
    """
    try:
        # Validate format
        format = format.lower()
        if format not in ['glb', 'obj', 'ply']:
            raise HTTPException(status_code=400, detail="Format must be 'glb', 'obj', or 'ply'")
        
        # Read and validate image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert('RGB')
        
        # Process panorama
        processor = get_panorama_processor()
        mesh, metadata = processor.process_panorama(
            image,
            max_resolution=max_resolution,
            smooth_depth=smooth_depth,
            smooth_sigma=smooth_sigma,
            remove_edges=remove_edges,
            edge_threshold=edge_threshold
        )
        
        # Export mesh to temporary file
        with tempfile.NamedTemporaryFile(suffix=f'.{format}', delete=False) as tmp:
            mesh.export(tmp.name)
            tmp_path = tmp.name
        
        # Read the file
        with open(tmp_path, 'rb') as f:
            mesh_data = f.read()
        
        # Clean up
        os.unlink(tmp_path)
        
        # Determine MIME type
        mime_types = {
            'glb': 'model/gltf-binary',
            'obj': 'model/obj',
            'ply': 'application/ply'
        }
        
        # Return mesh with metadata in headers
        return StreamingResponse(
            io.BytesIO(mesh_data),
            media_type=mime_types[format],
            headers={
                "Content-Disposition": f"attachment; filename=panorama_mesh.{format}",
                "X-Vertices": str(metadata['vertices']),
                "X-Faces": str(metadata['faces']),
                "X-Resolution": metadata['resolution'],
                "X-Depth-Min": str(metadata['depth_min']),
                "X-Depth-Max": str(metadata['depth_max']),
                "X-Device": metadata['device']
            }
        )
    
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error processing panorama:\n{error_details}")
        raise HTTPException(status_code=500, detail=f"Error processing panorama: {str(e)}")


@app.get("/info")
async def get_info():
    """Get API and model information"""
    processor = get_depth_processor()
    
    return {
        "api_version": "1.0.0",
        "model": "ZoeDepth (ZoeD_N)",
        "device": processor.device,
        "device_info": {
            "cuda_available": True if processor.device == "cuda" else False,
            "mps_available": True if processor.device == "mps" else False,
        },
        "supported_formats": {
            "input": ["jpg", "jpeg", "png", "bmp", "gif"],
            "output_3d": ["glb", "obj", "ply"]
        },
        "endpoints": {
            "/estimate-depth": {
                "method": "POST",
                "description": "Estimate depth from regular image",
                "params": ["file", "return_visualization"]
            },
            "/panorama-to-3d": {
                "method": "POST",
                "description": "Convert 360° panorama to 3D mesh",
                "params": ["file", "max_resolution", "smooth_depth", "format"]
            }
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

