#!/usr/bin/env python3
"""
Script di avvio per InfinityBench AI Web Interface
"""

import os
import sys
import subprocess
import time
import requests

def check_ollama_connection():
    """Verifica se Ollama è in esecuzione"""
    try:
        response = requests.get("http://localhost:11434/api/version", timeout=5)
        return response.status_code == 200
    except:
        return False

def check_ollama_model():
    """Verifica se il modello llama3.2:latest è disponibile"""
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get('models', [])
            return any('llama3.2:latest' in model.get('name', '') for model in models)
    except:
        pass
    return False

def main():
    print("🚀 InfinityBench AI - Avvio Sistema")
    print("=" * 50)
    
    # Verifica Ollama
    print("🔍 Verifica connessione Ollama...")
    if not check_ollama_connection():
        print("❌ Ollama non è in esecuzione!")
        print("💡 Avvia Ollama con: ollama serve")
        print("💡 Poi riavvia questo script")
        return
    
    print("✅ Ollama è in esecuzione")
    
    # Verifica modello
    print("🔍 Verifica modello llama3.2:latest...")
    if not check_ollama_model():
        print("⚠️  Modello llama3.2:latest non trovato!")
        print("💡 Installa il modello con: ollama pull llama3.2:latest")
        
        # Chiedi se procedere comunque
        choice = input("Vuoi continuare comunque? (s/n): ").strip().lower()
        if choice != 's':
            return
    else:
        print("✅ Modello llama3.2:latest disponibile")
    
    # Avvia il server web
    print("\n🌐 Avvio server web...")
    print("📱 Interface sarà disponibile su: http://localhost:7777")
    print("🔗 WebSocket attivo per aggiornamenti in tempo reale")
    print("\n💡 Premi Ctrl+C per fermare il server")
    print("=" * 50)
    
    try:
        # Avvia il server web
        os.system("python3 web_server.py")
    except KeyboardInterrupt:
        print("\n\n👋 Server fermato. Arrivederci!")
    except Exception as e:
        print(f"\n❌ Errore nell'avvio del server: {e}")

if __name__ == "__main__":
    main()
