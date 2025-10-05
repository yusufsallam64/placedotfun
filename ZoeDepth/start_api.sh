#!/bin/bash
# Startup script for ZoeDepth API

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Activate virtual environment
source "$SCRIPT_DIR/venv/bin/activate"

# Set SSL certificate path for macOS
export SSL_CERT_FILE=$(python3 -c "import certifi; print(certifi.where())")

# Add project root to PYTHONPATH so zoedepth module can be found
export PYTHONPATH="${SCRIPT_DIR}:${PYTHONPATH}"

# Start the API server
cd "$SCRIPT_DIR/api"
echo "Starting ZoeDepth API on http://localhost:8000"
echo "Documentation available at http://localhost:8000/docs"
echo ""
python3 main.py

