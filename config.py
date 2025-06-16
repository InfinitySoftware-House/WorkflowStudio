#!/usr/bin/env python3
"""
Configuration file for InfinityBench AI
Contains all shared constants and configuration settings
"""

# Server configuration
SERVER_PORT = 7777
SERVER_HOST = '0.0.0.0'

# Ollama configuration
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_API_VERSION = "/api/version"
OLLAMA_API_TAGS = "/api/tags"
OLLAMA_TIMEOUT = 5

# Default model configuration
DEFAULT_MODEL = "llama3.2:latest"

# Web interface configuration
SECRET_KEY = 'infinitybench_ai_secret_2024'
TEMPLATES_AUTO_RELOAD = True

# Workflow storage configuration
WORKFLOWS_DIR = 'workflows'

# Logging configuration
MAX_LOGS_DISPLAY = 50
