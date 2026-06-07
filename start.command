#!/bin/bash
# Change directory to the workspace folder
cd "$(dirname "$0")"

echo "========================================="
echo "   RMS Warehouse Document Generator   "
echo "========================================="
echo ""
echo "Activating virtual environment..."
if [ ! -d "venv" ]; then
    echo "Error: virtual environment (venv) not found!"
    echo "Please make sure venv is initialized."
    read -p "Press enter to exit..."
    exit 1
fi

echo "Starting Flask web server on port 5001..."
echo "This window will remain active. To stop the server, press Ctrl+C."
echo ""
./venv/bin/python3 app.py
