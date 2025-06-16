import asyncio
import json
import requests
from typing import Dict, List, Any, Optional
from datetime import datetime
from dataclasses import dataclass
from enum import Enum
import logging
import re

# Import web search capabilities
try:
    from googlesearch import search
    from bs4 import BeautifulSoup
    import requests
    import logging
    SEARCH_AVAILABLE = True
except ImportError:
    SEARCH_AVAILABLE = False
    search = None
    logging.warning("Google search or BeautifulSoup dependencies not available. Install with: pip install googlesearch-python beautifulsoup4 requests")


class AgentRole(Enum):
    MANAGER = "manager"
    RESEARCHER = "researcher"
    ANALYST = "analyst"
    WRITER = "writer"
    REVIEWER = "reviewer"


@dataclass
class Task:
    id: str
    description: str
    assigned_to: Optional[str] = None
    status: str = "pending"
    result: Optional[str] = None
    created_at: datetime = None
    completed_at: Optional[datetime] = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now()


@dataclass
class Message:
    sender: str
    recipient: str
    content: str
    message_type: str = "communication"
    timestamp: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()


class OllamaClient:
    def __init__(self, base_url: str = "http://localhost:11434", default_model: str = "qwen3:latest"):
        self.base_url = base_url
        self.default_model = default_model
    
    async def generate_response(self, prompt: str, system_prompt: str = "", model: str = None) -> str:
        """Generate a response using Ollama"""
        try:
            url = f"{self.base_url}/api/generate"
            data = {
                "model": model or self.default_model,
                "prompt": prompt,
                "system": system_prompt,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "max_tokens": 1000
                }
            }
            
            response = requests.post(url, json=data)
            if response.status_code == 200:
                result = response.json()
                return result.get("response", "")
            else:
                return f"Error in Ollama request: {response.status_code}"
        except Exception as e:
            return f"Ollama connection error: {str(e)}"


class WebSearchTool:
    """Tool for performing web searches using WebSearcher"""
    
    def __init__(self, log_callback=None):
        self.max_results = 5
        self.max_content_length = 1000
        self.request_timeout = (10, 30)  # (connection, read) timeout in seconds
        self.max_retries = 3
        self.retry_delay = 1  # seconds
        self.log_callback = log_callback
    
    def log(self, message, level='info'):
        """Log a message using the callback if available, otherwise use print"""
        if self.log_callback:
            self.log_callback(message, level)
        else:
            print(message)
    
    def fetch_page_content(self, url: str) -> str:
        """
        Fetch the content of a web page and return the text content
        
        Args:
            url: URL of the web page to fetch
            
        Returns:
            Text content of the page, truncated to max_content_length
        """
        if not SEARCH_AVAILABLE:
            return "Content fetching not available - BeautifulSoup library not installed"
        
        if not url or not url.startswith(('http://', 'https://')):
            return "Invalid URL provided"
            
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }
            
            # Usa una sessione per gestire meglio le connessioni
            session = requests.Session()
            session.headers.update(headers)
            
            # Multipli tentativi con backoff
            for attempt in range(self.max_retries):
                try:
                    response = session.get(
                        url, 
                        timeout=self.request_timeout,  # (connection timeout, read timeout)
                        allow_redirects=True,
                        verify=False,
                        stream=False
                    )
                    
                    if response.status_code == 200:
                        from bs4 import BeautifulSoup
                        soup = BeautifulSoup(response.text, 'html.parser')
                        
                        # Rimuovi script e style
                        for script in soup(["script", "style"]):
                            script.decompose()
                        
                        text_content = soup.get_text(separator=' ', strip=True)
                        return text_content[:self.max_content_length]
                    elif response.status_code == 403:
                        return f"Access denied to {url} (403 Forbidden)"
                    elif response.status_code == 404:
                        return f"Page not found at {url} (404)"
                    elif response.status_code == 429:
                        return f"Rate limited by {url} (429 Too Many Requests)"
                    else:
                        return f"HTTP error {response.status_code} for {url}"
                        
                except requests.exceptions.SSLError as ssl_error:
                    # Gestione specifica per errori SSL
                    if attempt < self.max_retries - 1:
                        print(f"SSL error on attempt {attempt + 1}, trying with SSL verification disabled... ({str(ssl_error)})")
                        try:
                            # Retry senza verifica SSL per certificati auto-firmati
                            response = session.get(
                                url, 
                                timeout=self.request_timeout,
                                allow_redirects=True,
                                verify=False,  # Disabilita verifica SSL
                                stream=False
                            )
                            
                            if response.status_code == 200:
                                from bs4 import BeautifulSoup
                                soup = BeautifulSoup(response.text, 'html.parser')
                                
                                # Rimuovi script e style
                                for script in soup(["script", "style"]):
                                    script.decompose()
                                
                                text_content = soup.get_text(separator=' ', strip=True)
                                return text_content[:self.max_content_length]
                            else:
                                print(f"SSL retry also failed with status code: {response.status_code}")
                                continue
                                
                        except Exception as retry_error:
                            print(f"SSL retry failed: {str(retry_error)}")
                            import time
                            time.sleep(self.retry_delay * (attempt + 1))
                            continue
                    else:
                        return f"SSL certificate error after {self.max_retries} attempts: {str(ssl_error)}"
                        
                except (requests.exceptions.ConnectionError, 
                        requests.exceptions.Timeout,
                        requests.exceptions.ReadTimeout) as e:
                    if attempt < self.max_retries - 1:
                        print(f"Connection error on attempt {attempt + 1}, retrying... ({str(e)})")
                        import time
                        time.sleep(self.retry_delay * (attempt + 1))  # Exponential backoff
                        continue
                    else:
                        return f"Connection failed after {self.max_retries} attempts: {str(e)}"
                        
                except requests.exceptions.RequestException as e:
                    return f"Request error for {url}: {str(e)}"
                    
            return f"Failed to fetch content after {self.max_retries} attempts"
            
        except Exception as e:
            return f"Unexpected error fetching page content: {str(e)}"
    
    def search_web(self, query: str, max_results: int = None) -> List[Dict[str, Any]]:
        """
        Perform a web search using googlesearch-python
        
        Args:
            query: Search query string
            max_results: Maximum number of results to return
            
        Returns:
            List of search results with snippet, body, and URL
        """
        print(f"🔍 Performing web search for query: {query}")
        self.log(f"🔍 Searching for: {query}")
        
        if not SEARCH_AVAILABLE or search is None:
            return [{
                "snippet": "Web search not available - googlesearch library not installed. Please install with: pip install googlesearch-python beautifulsoup4",
                "url": "",
                "body": "",
                "error": True
            }]
       
        try:
            max_results = max_results or self.max_results
            
            # Use googlesearch-python library
            print("Performing Google search...")
            self.log(f"📡 Connecting to search engine...")
            search_urls = list(search(query, num_results=max_results, lang='en'))
            
            print(f"Found {len(search_urls)} results for query: {query}")
            self.log(f"📊 Found {len(search_urls)} results")
            search_results = []
            
            for i, url in enumerate(search_urls):
                if i >= max_results:
                    break
                
                print(f"Processing URL {i+1}: {url[:50]}...")
                self.log(f"📄 Processing result {i+1}/{len(search_urls)}: {url[:60]}...")
                
                # Fetch document body text con gestione errori migliorata
                body_text = ""
                if url:
                    body_text = self.fetch_page_content(url)
                    
                    # Controlla se il fetch ha avuto successo o è stato un errore
                    if body_text.startswith(("Error", "Connection failed", "Unexpected error", "Request error")):
                        print(f"Warning: Failed to fetch content from {url[:50]}...: {body_text}")
                        # Mantieni l'URL ma senza contenuto del body
                        body_text = f"Content unavailable: {body_text}"
                else:
                    body_text = "No URL provided"
                
                # Create a snippet from the body text (first 200 characters)
                if body_text and not body_text.startswith("Content unavailable"):
                    snippet = body_text[:200] + "..." if len(body_text) > 200 else body_text
                else:
                    # Se non c'è contenuto del body, usa l'URL come snippet
                    snippet = f"URL: {url}" if url else "No content available"
                
                print(f"Content status for {url[:50]}...: {'Success' if not body_text.startswith(('Error', 'Connection failed', 'Content unavailable')) else 'Failed'} ({len(body_text)} characters)")
                
                search_result = {
                    "snippet": snippet,
                    "body": body_text,
                    "url": url,
                    "error": body_text.startswith(("Error", "Connection failed", "Unexpected error", "Request error", "Content unavailable"))
                }
                print(f"Added result: {search_result['url'][:50]}...")
                search_results.append(search_result)
            
            self.log(f"✅ Web search completed - processed {len(search_results)} results")
            
            if not search_results:
                return [{
                    "snippet": "No search results found for the given query",
                    "url": "",
                    "body": "",
                    "error": False
                }]
            
            return search_results
                
        except Exception as e:
            print(f"Error performing web search: {str(e)}")
            return [{
                "snippet": f"Error performing web search: {str(e)}",
                "url": "",
                "body": "",
                "error": True
            }]
    
    def format_search_results(self, results: List[Dict[str, Any]], search_type: str = "web") -> str:
        """
        Format search results for use by AI agents
        
        Args:
            results: List of search results
            search_type: Type of search (web)
            
        Returns:
            Formatted string with search results
        """
        if not results:
            return "No search results found."
        
        formatted_results = f"\n=== {search_type.upper()} SEARCH RESULTS ===\n"
        
        for i, result in enumerate(results, 1):
            if result.get("error"):
                formatted_results += f"\n{i}. ERROR: {result['snippet']}\n"
                continue
                
            formatted_results += f"\n{i}. URL: {result['url']}\n"
            if result.get('snippet'):
                formatted_results += f"   Summary: {result['snippet']}\n"
            if result.get('body'):
                formatted_results += f"   Content: {result['body']}\n"
        
        formatted_results += "\n=== END SEARCH RESULTS ===\n"
        return formatted_results


class Agent:
    def __init__(self, name: str, role: AgentRole, system_prompt: str, log_callback=None):
        self.name = name
        self.role = role
        self.system_prompt = system_prompt
        self.ollama_client = OllamaClient()
        self.memory: List[str] = []
        self.tasks: List[Task] = []
        self.messages: List[Message] = []
        
        # Add search tool for researchers
        if role == AgentRole.RESEARCHER:
            self.search_tool = WebSearchTool(log_callback=log_callback)
        else:
            self.search_tool = None
    
    async def process_task(self, task: Task, model: str = None) -> str:
        """Process an assigned task"""
        
        # Special handling for research tasks
        if self.role == AgentRole.RESEARCHER and self.search_tool:
            return await self.process_research_task(task, model)
        
        prompt = f"""
        Assigned task: {task.description}
        
        As a {self.role.value}, you must complete this task using your specific expertise.
        
        Context from memory:
        {chr(10).join(self.memory[-5:]) if self.memory else "No previous context"}
        Then provide a detailed and professional response.
        """
        
        result = await self.ollama_client.generate_response(prompt, self.system_prompt, model)
        
        # Update memory and task
        self.memory.append(f"Task completed: {task.description} -> {result[:200]}...")
        task.result = result
        task.status = "completed"
        task.completed_at = datetime.now()
        
        return result
    
    async def process_research_task(self, task: Task, model: str = None) -> str:
        """Special processing for research tasks with web search capabilities"""
        
        # First, analyze what needs to be researched
        analysis_prompt = f"""
        Research task: {task.description}
        
        As a researcher, you must analyze this task and determine what information to search for.
        
        INSTRUCTIONS:
        1. Identify what specific information needs to be searched
        2. Create 2-3 focused search queries (keywords)
        3. Determine if you need web content
        
        You MUST respond in this EXACT format. Do not deviate from this structure:
        
        SEARCH QUERIES:
        1. [first search query]
        2. [second search query]
        3. [third search query (if needed)]
        
        SEARCH TYPE: web
        
        EXAMPLE of correct format:
        Research task: I need to find current market data and trends for electric vehicles to understand the industry landscape.
        
        SEARCH QUERIES:
        1. electric vehicle market size 2024 statistics
        2. EV sales trends global analysis
        3. electric car industry growth forecast
        
        SEARCH TYPE: web
        
        Now provide your response following this exact structure:
        """
        
        analysis_result = await self.ollama_client.generate_response(analysis_prompt, self.system_prompt, model)
        
        # Extract search queries from the analysis
        search_queries = self.extract_search_queries(analysis_result)
        print(f"Extracted search queries: {search_queries}")
        search_type = self.extract_search_type(analysis_result)
        print(f"Determined search type: {search_type}")
        
        # Log the queries that will be searched
        if self.search_tool and hasattr(self.search_tool, 'log'):
            self.search_tool.log(f"🎯 Identified {len(search_queries)} search queries: {', '.join(search_queries[:3])}")
        
        # Perform web searches
        all_search_results = ""
        
        for query in search_queries[:3]:  # Limit to 3 searches to avoid overload
            if search_type == "web":
                web_results = self.search_tool.search_web(query, max_results=3)
                formatted_web = self.search_tool.format_search_results(web_results, "web")
                all_search_results += f"\n\nWEB SEARCH FOR: '{query}'\n{formatted_web}"
            
        # Now synthesize the research with the search results
        synthesis_prompt = f"""
        Research task: {task.description}
        
        I have gathered the following information from web searches:
        {all_search_results}
        
        Context from memory:
        {chr(10).join(self.memory[-5:]) if self.memory else "No previous context"}
        
        As a researcher, synthesize this information to provide a comprehensive response to the research task.
        
        <think>
        Based on the search results, I can see that...
        The key findings are...
        I should focus on...
        </think>
        
        Provide a detailed, well-structured research report that combines the web search findings with your expertise.
        Include relevant data, statistics, trends, and insights found in the search results.
        Cite the sources when mentioning specific information.
        """
        
        final_result = await self.ollama_client.generate_response(synthesis_prompt, self.system_prompt, model)
        
        # Update memory and task with search info
        self.memory.append(f"Performed web searches for: {', '.join(search_queries)}")
        self.memory.append(f"Research completed: {task.description} -> {final_result[:200]}...")
        
        task.result = final_result
        task.status = "completed"
        task.completed_at = datetime.now()
        
        return final_result
    
    def extract_search_queries(self, analysis_text: str) -> List[str]:
        """Extract search queries from analysis text"""
        queries = []
        lines = analysis_text.split('\n')
        
        in_queries_section = False
        for line in lines:
            line = line.strip()
            if "SEARCH QUERIES:" in line.upper():
                in_queries_section = True
                continue
            
            if in_queries_section:
                if line.startswith(('1.', '2.', '3.', '-', '*')):
                    # Extract query after the number/bullet
                    query = re.sub(r'^[0-9]+\.\s*', '', line)
                    query = re.sub(r'^[-*]\s*', '', query)
                    query = query.strip('[]')
                    if query:
                        queries.append(query)
                elif line.upper().startswith('SEARCH TYPE:'):
                    break
                elif line and not line.startswith(('4.', '5.')):  # Stop at higher numbers
                    break
        
        # Fallback: if no structured queries found, extract from task description
        if not queries:
            # Try to create a basic query from the task description
            queries.append(analysis_text.split('Research task:')[1].split('\n')[0].strip() if 'Research task:' in analysis_text else "general information")
        
        return queries[:3]  # Maximum 3 queries
    
    def extract_search_type(self, analysis_text: str) -> str:
        """Extract search type from analysis text"""
        if "SEARCH TYPE:" in analysis_text.upper():
            type_line = ""
            for line in analysis_text.split('\n'):
                if "SEARCH TYPE:" in line.upper():
                    type_line = line.lower()
                    break
                
                return "web"
        
        return "web"  # Default to web search
    
    async def communicate(self, recipient: str, message: str, message_type: str = "communication") -> Message:
        """Send a message to another agent"""
        msg = Message(
            sender=self.name,
            recipient=recipient,
            content=message,
            message_type=message_type
        )
        self.messages.append(msg)
        return msg
    
    async def respond_to_message(self, message: Message) -> str:
        """Respond to a received message"""
        prompt = f"""
        You received a message from {message.sender}:
        "{message.content}"
        
        As a {self.role.value}, provide an appropriate and constructive response.
        Consider your role and specific expertise.
        """
        
        response = await self.ollama_client.generate_response(prompt, self.system_prompt)
        self.memory.append(f"Communication with {message.sender}: {message.content[:100]}...")
        
        return response


class MultiAgentSystem:
    def __init__(self, log_callback=None):
        self.agents: Dict[str, Agent] = {}
        self.global_tasks: List[Task] = []
        self.communication_log: List[Message] = []
        self.log_callback = log_callback
        self.initialize_agents()
    
    def set_log_callback(self, log_callback):
        """Set or update the log callback function"""
        self.log_callback = log_callback
        # Update existing agents
        for agent in self.agents.values():
            if hasattr(agent, 'search_tool') and agent.search_tool:
                agent.search_tool.log_callback = log_callback
    
    def initialize_agents(self):
        """Initialize agents with specific roles"""
        
        # Manager Agent
        manager_prompt = """
        You are an expert Manager in mission management and team coordination.
        Your responsibilities include:
        - Planning and organizing work
        - Coordinating other agents
        - Monitoring progress
        - Making strategic decisions
        - Assigning appropriate tasks to team members
        
        Communicate clearly and professionally, always providing precise guidance.
        """
        
        # Researcher Agent
        researcher_prompt = """
        You are a Researcher specialized in information gathering and analysis with web search capabilities.
        Your responsibilities include:
        - Researching in-depth information on specific topics using web search tools
        - Performing targeted web searches when needed
        - Verifying source credibility and fact-checking information
        - Identifying trends and patterns from online sources
        - Providing accurate and up-to-date data from web searches
        - Synthesizing complex information from multiple web sources
        - Analyzing search results to extract key insights

        You have access to DuckDuckGo web search capabilities.
        When given a research task, you should:
        1. Analyze what information is needed
        2. Determine appropriate search queries
        3. Perform web searches to gather current information
        4. Synthesize findings into a comprehensive research report
        
        You are methodical, precise, and always fact-based. Always cite sources when presenting information found through web searches.
        """
        
        # Analyst Agent  
        analyst_prompt = """
        You are an Analyst expert in data and information interpretation.
        Your responsibilities include:
        - Analyzing collected data and information
        - Identifying insights and conclusions
        - Creating models and predictions
        - Evaluating pros and cons
        - Providing data-based recommendations
        
        You are logical, systematic, and results-oriented.
        """
        
        # Writer Agent
        writer_prompt = """
        You are a Writer specialized in creating high-quality content.
        Your responsibilities include:
        - Creating engaging and well-structured content
        - Adapting tone and style to target audience
        - Organizing information logically
        - Revising and improving texts
        - Ensuring clarity and readability
        
        You are creative, eloquent, and attentive to linguistic details.
        """
        
        # Reviewer Agent
        reviewer_prompt = """
        You are a Reviewer expert in quality control and validation.
        Your responsibilities include:
        - Reviewing other agents' work
        - Identifying errors, inconsistencies, and improvements
        - Ensuring work quality and completeness
        - Providing constructive feedback
        - Validating that objectives have been achieved
        
        You are constructively critical, meticulous, and quality-oriented.
        """
        
        self.agents = {
            "manager": Agent("Manager", AgentRole.MANAGER, manager_prompt, self.log_callback),
            "researcher": Agent("Researcher", AgentRole.RESEARCHER, researcher_prompt, self.log_callback),
            "analyst": Agent("Analyst", AgentRole.ANALYST, analyst_prompt, self.log_callback),
            "writer": Agent("Writer", AgentRole.WRITER, writer_prompt, self.log_callback),
            "reviewer": Agent("Reviewer", AgentRole.REVIEWER, reviewer_prompt, self.log_callback)
        }
    
    async def assign_task(self, task_description: str, mission_type: str = "general") -> Dict[str, Any]:
        """Assign a complex task to the multi-agent system"""
        
        print(f"\n🚀 Starting mission: {task_description}\n")
        
        # Phase 1: Manager plans the mission
        print("📋 Phase 1: mission planning")
        planning_task = Task(
            id="planning",
            description=f"Plan how to complete this mission: {task_description}. mission type: {mission_type}. Define phases, assign roles, and establish execution order."
        )
        
        planning_result = await self.agents["manager"].process_task(planning_task)
        print(f"Manager: {planning_result}\n")
        
        # Phase 2: Researcher gathers information
        print("🔍 Phase 2: Information research")
        research_task = Task(
            id="research",
            description=f"Research detailed information on: {task_description}. Find data, statistics, best practices, and relevant information."
        )
        
        research_result = await self.agents["researcher"].process_task(research_task)
        print(f"Researcher: {research_result}\n")
        
        # Phase 3: Analyst analyzes the information
        print("📊 Phase 3: Data analysis")
        analysis_task = Task(
            id="analysis",
            description=f"Analyze the collected information for the mission: {task_description}. Identify patterns, insights, and recommendations based on research data."
        )
        
        # Share research results with the analyst
        self.agents["analyst"].memory.append(f"Research data: {research_result}")
        analysis_result = await self.agents["analyst"].process_task(analysis_task)
        print(f"Analyst: {analysis_result}\n")
        
        # Phase 4: Writer creates content
        print("✍️ Phase 4: Content creation")
        writing_task = Task(
            id="writing",
            description=f"Create complete and well-structured content for: {task_description}. Use research and analysis information to create a high-quality result."
        )
        
        # Share previous results with the writer
        self.agents["writer"].memory.extend([
            f"Research: {research_result[:300]}...",
            f"Analysis: {analysis_result[:300]}..."
        ])
        
        writing_result = await self.agents["writer"].process_task(writing_task)
        print(f"Writer: {writing_result}\n")
        
        # Phase 5: Reviewer validates the work
        print("🔍 Phase 5: Review and quality control")
        review_task = Task(
            id="review",
            description=f"Review all work done for the mission: {task_description}. Verify quality, completeness, and consistency. Provide feedback and suggestions for improvements."
        )
        
        # Share all results with the reviewer
        self.agents["reviewer"].memory.extend([
            f"Planning: {planning_result[:200]}...",
            f"Research: {research_result[:200]}...",
            f"Analysis: {analysis_result[:200]}...",
            f"Content: {writing_result[:200]}..."
        ])
        
        review_result = await self.agents["reviewer"].process_task(review_task)
        print(f"Reviewer: {review_result}\n")
        
        # Final communication between agents
        print("💬 Phase 6: Final communication and synthesis")
        
        # The manager requests final feedback
        feedback_msg = await self.agents["manager"].communicate(
            "reviewer", 
            "Can you provide final feedback on the completed mission? Are there areas that need improvements?"
        )
        
        final_feedback = await self.agents["reviewer"].respond_to_message(feedback_msg)
        print(f"Reviewer's final feedback: {final_feedback}\n")
        
        # Risultato finale compilato
        final_result = {
            "mission_description": task_description,
            "mission_type": mission_type,
            "phases": {
                "planning": planning_result,
                "research": research_result,
                "analysis": analysis_result,
                "writing": writing_result,
                "review": review_result,
                "final_feedback": final_feedback
            },
            "collaboration_summary": self.get_collaboration_summary(),
            "completion_time": datetime.now().isoformat()
        }
        
        return final_result
    
    def get_collaboration_summary(self) -> Dict[str, Any]:
        """Provide a summary of collaboration between agents"""
        return {
            "total_tasks_completed": sum(len([t for t in agent.tasks if t.status == "completed"]) for agent in self.agents.values()),
            "total_communications": len(self.communication_log),
            "agents_involved": list(self.agents.keys()),
            "memory_entries": {name: len(agent.memory) for name, agent in self.agents.items()}
        }
    
    async def agent_discussion(self, topic: str, participants: List[str] = None) -> List[str]:
        """Facilitate a discussion between agents on a specific topic"""
        if participants is None:
            participants = list(self.agents.keys())
        
        print(f"\n💭 Team discussion on: {topic}\n")
        
        discussion_log = []
        
        for agent_name in participants:
            if agent_name in self.agents:
                agent = self.agents[agent_name]
                
                # Each agent contributes to the discussion
                prompt = f"Contribute to the team discussion on: {topic}. Provide your unique perspective based on your role as {agent.role.value}."
                
                contribution = await agent.ollama_client.generate_response(prompt, agent.system_prompt)
                discussion_log.append(f"{agent_name}: {contribution}")
                print(f"{agent_name}: {contribution}\n")
                
                # Add to agent's memory
                agent.memory.append(f"Discussion on {topic}: {contribution[:150]}...")
        
        return discussion_log

