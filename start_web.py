#!/usr/bin/env python3
"""
Startup script for InfinityBench AI Web Interface
"""

import os
import sys
import subprocess
import time
import requests
from config import SERVER_PORT, OLLAMA_BASE_URL, OLLAMA_API_VERSION, OLLAMA_API_TAGS, OLLAMA_TIMEOUT, DEFAULT_MODEL

def check_ollama_connection():
    """Check if Ollama is running"""
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}{OLLAMA_API_VERSION}", timeout=OLLAMA_TIMEOUT)
        return response.status_code == 200
    except:
        return False

def check_ollama_model():
    """Check if the default model is available"""
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}{OLLAMA_API_TAGS}", timeout=OLLAMA_TIMEOUT)
        if response.status_code == 200:
            models = response.json().get('models', [])
            return any(DEFAULT_MODEL in model.get('name', '') for model in models)
    except:
        pass
    return False

def main():
    print("🚀 InfinityBench AI - System Startup")
    print("=" * 50)
    
    # Check Ollama
    print("🔍 Checking Ollama connection...")
    if not check_ollama_connection():
        print("❌ Ollama is not running!")
        print("💡 Start Ollama with: ollama serve")
        print("💡 Then restart this script")
        return
    
    print("✅ Ollama is running")
    
    # Check model
    print(f"🔍 Checking {DEFAULT_MODEL} model...")
    if not check_ollama_model():
        print(f"⚠️  Model {DEFAULT_MODEL} not found!")
        print(f"💡 Install the model with: ollama pull {DEFAULT_MODEL}")
        
        # Ask if continue anyway
        choice = input("Do you want to continue anyway? (y/n): ").strip().lower()
        if choice != 'y':
            return
    else:
        print(f"✅ Model {DEFAULT_MODEL} available")
    
    # Start web server
    print("\n🌐 Starting web server...")
    print(f"📱 Interface will be available at: http://localhost:{SERVER_PORT}")
    print("🔗 WebSocket active for real-time updates")
    print("\n💡 Press Ctrl+C to stop the server")
    print("=" * 50)
    
    try:
        # Start web server
        os.system("python3 web_server.py")
    except KeyboardInterrupt:
        print("\n\n👋 Server stopped. Goodbye!")
    except Exception as e:
        print(f"\n❌ Error starting server: {e}")

if __name__ == "__main__":
    main()
