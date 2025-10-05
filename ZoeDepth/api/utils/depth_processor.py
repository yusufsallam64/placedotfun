"""
Depth processing utilities for ZoeDepth
Handles depth estimation and 3D mesh generation from images and panoramas
"""
import torch
import numpy as np
from PIL import Image
import trimesh
from scipy.ndimage import gaussian_filter
from zoedepth.utils.geometry import create_triangles
from typing import Optional, Tuple
import io


class DepthProcessor:
    """Handles depth estimation using ZoeDepth model"""
    
    def __init__(self, device: Optional[str] = None):
        """
        Initialize the depth processor
        
        Args:
            device: Device to use ('cuda', 'mps', 'cpu'). Auto-detected if None.
        """
        if device is None:
            self.device = self._auto_detect_device()
        else:
            self.device = device
        
        self.model = None
        
    def _auto_detect_device(self) -> str:
        """Auto-detect the best available device"""
        if torch.cuda.is_available():
            return "cuda"
        elif torch.backends.mps.is_available():
            return "mps"
        else:
            return "cpu"
    
    def load_model(self):
        """Load the ZoeDepth model"""
        if self.model is None:
            repo = "isl-org/ZoeDepth"
            self.model = torch.hub.load(repo, "ZoeD_N", pretrained=True, trust_repo=True)
            self.model.to(self.device)
            self.model.eval()
        return self.model
    
    def estimate_depth(self, image: Image.Image) -> np.ndarray:
        """
        Estimate depth from an image
        
        Args:
            image: PIL Image
            
        Returns:
            Depth map as numpy array
        """
        if self.model is None:
            self.load_model()
        
        with torch.no_grad():
            depth = self.model.infer_pil(image)
        
        return depth
    
    def estimate_depth_from_bytes(self, image_bytes: bytes) -> np.ndarray:
        """
        Estimate depth from image bytes
        
        Args:
            image_bytes: Image data as bytes
            
        Returns:
            Depth map as numpy array
        """
        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        return self.estimate_depth(image)


class PanoramaProcessor:
    """Handles panorama to 3D mesh conversion"""
    
    def __init__(self, depth_processor: DepthProcessor):
        self.depth_processor = depth_processor
    
    @staticmethod
    def depth_edges_mask(depth: np.ndarray, threshold: float = 0.03) -> np.ndarray:
        """Compute edge mask from depth map"""
        depth_dx, depth_dy = np.gradient(depth)
        depth_grad = np.sqrt(depth_dx ** 2 + depth_dy ** 2)
        return depth_grad > threshold
    
    @staticmethod
    def pano_depth_to_world_points(depth: np.ndarray) -> np.ndarray:
        """
        Convert 360° depth to world points using spherical projection
        
        Args:
            depth: Depth map array
            
        Returns:
            3D points in world coordinates
        """
        radius = depth.flatten()
        
        lon = np.linspace(-np.pi, np.pi, depth.shape[1])
        lat = np.linspace(-np.pi/2, np.pi/2, depth.shape[0])
        
        lon, lat = np.meshgrid(lon, lat)
        lon = lon.flatten()
        lat = lat.flatten()
        
        # Spherical to cartesian
        x = radius * np.cos(lat) * np.cos(lon)
        y = radius * np.cos(lat) * np.sin(lon)
        z = radius * np.sin(lat)
        
        return np.stack([x, y, z], axis=1)
    
    def process_panorama(
        self,
        image: Image.Image,
        max_resolution: int = 2048,
        smooth_depth: bool = True,
        smooth_sigma: float = 0.5,
        remove_edges: bool = True,
        edge_threshold: float = 0.03
    ) -> Tuple[trimesh.Trimesh, dict]:
        """
        Process a panoramic image into a 3D mesh
        
        Args:
            image: Input panoramic image
            max_resolution: Maximum resolution for processing
            smooth_depth: Whether to smooth the depth map
            smooth_sigma: Smoothing strength
            remove_edges: Whether to remove depth discontinuities
            edge_threshold: Threshold for edge removal
            
        Returns:
            Tuple of (mesh, metadata)
        """
        # Resize if needed
        if max(image.size) > max_resolution:
            ratio = max_resolution / max(image.size)
            new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
            image = image.resize(new_size, Image.LANCZOS)
        
        # Estimate depth
        depth = self.depth_processor.estimate_depth(image)
        
        # Optional smoothing
        if smooth_depth:
            depth = gaussian_filter(depth, sigma=smooth_sigma)
        
        # Convert to 3D points
        pts3d = self.pano_depth_to_world_points(depth)
        verts = pts3d.reshape(-1, 3)
        
        # Create triangles
        image_array = np.array(image)
        if remove_edges:
            edge_mask = self.depth_edges_mask(depth, threshold=edge_threshold)
            triangles = create_triangles(
                image_array.shape[0], 
                image_array.shape[1],
                mask=~edge_mask
            )
        else:
            triangles = create_triangles(image_array.shape[0], image_array.shape[1])
        
        # Create mesh with colors
        colors = image_array.reshape(-1, 3)
        mesh = trimesh.Trimesh(vertices=verts, faces=triangles, vertex_colors=colors)
        
        # Clean mesh
        mesh.remove_degenerate_faces()
        mesh.remove_duplicate_faces()
        mesh.merge_vertices()
        
        # Metadata
        metadata = {
            'vertices': len(mesh.vertices),
            'faces': len(mesh.faces),
            'resolution': f"{image.size[0]}x{image.size[1]}",
            'depth_min': float(depth.min()),
            'depth_max': float(depth.max()),
            'depth_mean': float(depth.mean()),
            'device': self.depth_processor.device
        }
        
        return mesh, metadata


class RegularImageProcessor:
    """Handles regular image depth estimation"""
    
    def __init__(self, depth_processor: DepthProcessor):
        self.depth_processor = depth_processor
    
    def process_image(
        self,
        image: Image.Image,
        return_visualization: bool = False
    ) -> Tuple[np.ndarray, Optional[Image.Image]]:
        """
        Process a regular image for depth estimation
        
        Args:
            image: Input image
            return_visualization: Whether to return a depth visualization
            
        Returns:
            Tuple of (depth_array, visualization_image)
        """
        depth = self.depth_processor.estimate_depth(image)
        
        visualization = None
        if return_visualization:
            # Create colored depth map
            depth_normalized = (depth - depth.min()) / (depth.max() - depth.min())
            depth_colored = (depth_normalized * 255).astype(np.uint8)
            visualization = Image.fromarray(depth_colored)
        
        return depth, visualization
