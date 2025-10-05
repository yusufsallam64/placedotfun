#!/usr/bin/env python3
"""
Simple script to run ZoeDepth depth estimation
"""
import torch
from PIL import Image
import numpy as np
import sys
import os

def main():
    # Setup device
    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"Using device: {device}")
    
    # Load model
    print("Loading ZoeDepth model...")
    model = torch.hub.load("isl-org/ZoeDepth", "ZoeD_N", pretrained=True, trust_repo=True)
    model.to(device)
    model.eval()
    print("Model loaded!")
    
    # Check for input file
    if len(sys.argv) > 1:
        input_path = sys.argv[1]
    else:
        input_path = input("Enter path to image: ").strip()
    
    if not os.path.exists(input_path):
        print(f"Error: File not found: {input_path}")
        return
    
    # Load and process image
    print(f"Processing: {input_path}")
    image = Image.open(input_path).convert('RGB')
    
    # Estimate depth
    with torch.no_grad():
        depth = model.infer_pil(image)
    
    # Save depth map
    output_path = os.path.join("outputs", os.path.basename(input_path).replace('.jpg', '_depth.png').replace('.jpeg', '_depth.png'))
    
    # Normalize and save
    depth_normalized = ((depth - depth.min()) / (depth.max() - depth.min()) * 255).astype(np.uint8)
    Image.fromarray(depth_normalized).save(output_path)
    
    print(f"✓ Depth map saved to: {output_path}")
    print(f"  Depth range: {depth.min():.2f} - {depth.max():.2f}")

if __name__ == "__main__":
    main()
