# WorkflowStudio 🤖

**WorkflowStudio** is a sophisticated multi-agent AI system that coordinates multiple specialized AI agents to complete complex tasks and workflows. The system features a modern web interface for managing missions and building custom agent workflows.

## 🌟 Features

### Core Capabilities
- **Multi-Agent Coordination**: Five specialized AI agents working together
- **Web Search Integration**: Real-time information gathering from the web
- **Custom Workflows**: Visual workflow builder for creating custom agent sequences
- **Real-time Monitoring**: Live updates on agent status and task progress
- **Modern Web Interface**: Clean, dark-themed web UI with real-time updates

### Specialized Agents
- 🎯 **Manager**: Coordinates missions and manages team workflow
- 🔍 **Researcher**: Gathers information using web search capabilities
- 📊 **Analyst**: Analyzes data and provides insights
- ✍️ **Writer**: Creates high-quality content and documentation
- 👁️ **Reviewer**: Reviews work quality and validates results

## 🏗️ Architecture

The system is built with:
- **Backend**: Python with Flask and SocketIO for real-time communication
- **Frontend**: Modern JavaScript with WebSocket integration
- **AI Engine**: Ollama for local LLM inference
- **Web Search**: Google Search and BeautifulSoup for web research
- **Communication**: Real-time updates via WebSockets

## 📋 Prerequisites

Before running WorkflowStudio, ensure you have:

1. **Python 3.8+** installed
2. **Ollama** installed and running locally
3. **Required AI Models** downloaded in Ollama:
   - `llama3.2:latest` (primary model)
   - `qwen3:latest` (alternative model)
   - Whichever model you prefer for your tasks

### Installing Ollama and Models

```bash
# Install Ollama (macOS)
brew install ollama

# Start Ollama service
ollama serve

# Download required models
ollama pull llama3.2:latest
ollama pull qwen3:latest
```

## 🚀 Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd WorkflowStudio
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Verify Ollama Connection
Make sure Ollama is running on `http://localhost:11434`:
```bash
curl http://localhost:11434/api/version
```

### 4. Start the Application
```bash
# Option 1: Use the automated startup script
python start_web.py

# Option 2: Start manually
python web_server.py
```

The web interface will be available at `http://localhost:7777`

## 💻 Usage

### Custom Workflow Builder

2. **Design Your Workflow**:
   - Drag agents from the palette to the canvas
   - Configure each agent's task and parameters
   - Set custom prompts for specialized behavior
   - Choose specific AI models for each agent
3. **Save and Execute**: Save your workflow and run it with custom missions

#### Pre-built Workflows
- **Business Plan Development**: Complete business plan creation workflow
- **Content Marketing Campaign**: End-to-end marketing campaign development
- **Market Research Analysis**: Comprehensive market research and competitor analysis
- **Product Launch Strategy**: Full product launch planning and execution
- **Blog Post Creation**: Simple content creation workflow

## 🔧 Configuration

### Central Configuration (`config.py`)
The system uses a centralized configuration file that contains all shared constants and settings:

```python
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
```

### Additional Configuration (`config.json`)
```json
{
  "ollama": {
    "base_url": "http://localhost:11434",
    "model": "qwen3:latest",
    "temperature": 0.7,
    "top_p": 0.9,
    "max_tokens": 1000
  },
  "agents": {
    "manager": { "enabled": true, "max_memory": 100 },
    "researcher": { "enabled": true, "max_memory": 100 },
    "analyst": { "enabled": true, "max_memory": 100 },
    "writer": { "enabled": true, "max_memory": 100 },
    "reviewer": { "enabled": true, "max_memory": 100 }
  }
}
```

### Customizing Settings
To modify system settings, edit the `config.py` file:
- **Server Port**: Change `SERVER_PORT` to use a different port
- **Ollama Connection**: Update `OLLAMA_BASE_URL` for different Ollama instances
- **Default Model**: Modify `DEFAULT_MODEL` to use your preferred AI model
- **Workflow Storage**: Change `WORKFLOWS_DIR` for custom workflow location

### Environment Variables
You can override configuration with environment variables:
- `OLLAMA_BASE_URL`: Ollama server URL
- `DEFAULT_MODEL`: Default AI model to use

## 🔍 How It Works

### Standard Mission Flow
1. **Planning Phase**: Manager analyzes the mission and creates execution plan
2. **Research Phase**: Researcher gathers information using web search
3. **Analysis Phase**: Analyst processes data and identifies insights
4. **Content Creation**: Writer creates comprehensive content
5. **Quality Review**: Reviewer validates and provides feedback

### Agent Communication
- Agents maintain memory of previous interactions
- Context is shared between agents for continuity
- Real-time status updates through WebSocket connection

### Web Search Integration
The Researcher agent can:
- Perform Google web searches
- Search for recent news articles
- Extract and summarize web content
- Cite sources in research reports

## 📁 Project Structure

```
WorkflowStudio/
├── main.py                 # Core multi-agent system
├── web_server.py          # Flask web server
├── start_web.py           # Automated startup script
├── config.py              # Centralized configuration settings
├── config.json            # Additional configuration settings
├── requirements.txt       # Python dependencies
├── static/                # Web assets (CSS, JS)
├── templates/             # HTML templates
└── workflows/             # Pre-built workflow definitions
```

## 🛠️ API Endpoints

### REST API
- `POST /api/start_mission` - Start a new mission
- `POST /api/run_custom_workflow` - Execute custom workflow
- `GET /api/ollama/models` - Get available AI models

### WebSocket Events
- `log_update` - Real-time log messages
- `agent_status_update` - Agent status changes
- `mission_completed` - Mission completion
- `mission_error` - Error notifications

## 🔧 Troubleshooting

### Common Issues

**Ollama Connection Failed**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/version

# Start Ollama if not running
ollama serve
```

**Model Not Found**
```bash
# Download required models
ollama pull llama3.2:latest
ollama pull qwen3:latest
```

**Web Search Not Working**
- Ensure you have internet connectivity
- Check if Google search dependencies are installed:
```bash
pip install googlesearch-python beautifulsoup4
```

**Port 7777 Already in Use**
```bash
# Kill process using port 7777
lsof -ti:7777 | xargs kill -9

# Or modify the port in config.py
# Edit config.py and change SERVER_PORT = 7777 to your preferred port
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

If you encounter issues or have questions:
1. Check the troubleshooting section above
2. Review the console logs for error messages
3. Ensure all prerequisites are properly installed
4. Open an issue on the repository with detailed information

## 🚀 What's Next?

Future enhancements planned:
- Integration with additional AI models
- Advanced workflow branching and conditionals
- Multi-language support
- Cloud deployment options
- Enhanced collaboration features
- API integrations for external services

---

**WorkflowStudio** - Unleashing the power of coordinated AI agents for complex task completion! 🚀
