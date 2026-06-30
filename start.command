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

# Check and auto-install database dependencies if missing
./venv/bin/python3 -c "import pymongo" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Database dependencies not found. Installing pymongo and dnspython..."
    ./venv/bin/python3 -m pip install pymongo dnspython
fi

echo "Starting Flask web server on port 5001..."
echo "This window will remain active. To stop the server, press Ctrl+C."
echo ""
./venv/bin/python3 app.py
