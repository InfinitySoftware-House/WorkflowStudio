#!/usr/bin/env python3
"""
Server Web per il Sistema Multi-Agente InfinityBench AI
Interface web moderna, dark e semplice per visualizzare tutti gli step
"""

from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import asyncio
import json
import threading
import os
import uuid
import requests
from datetime import datetime
from main import MultiAgentSystem
from config import (
    SERVER_PORT, SERVER_HOST, SECRET_KEY, TEMPLATES_AUTO_RELOAD,
    WORKFLOWS_DIR, MAX_LOGS_DISPLAY, OLLAMA_BASE_URL, OLLAMA_API_TAGS, OLLAMA_TIMEOUT
)

app = Flask(__name__)
app.config['SECRET_KEY'] = SECRET_KEY
app.config['TEMPLATES_AUTO_RELOAD'] = TEMPLATES_AUTO_RELOAD
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Stato globale dell'applicazione
app_state = {
    'current_mission': None,
    'mission_status': 'idle',  # idle, running, completed, error
    'current_phase': None,
    'phases_completed': [],
    'results': {},
    'logs': [],
    'agents_status': {},
    'mas': None
}

def log_message(message, level='info'):
    """Add a message to logs and send it via WebSocket"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    log_entry = {
        'timestamp': timestamp,
        'message': message,
        'level': level
    }
    app_state['logs'].append(log_entry)
    socketio.emit('log_update', log_entry)
    print(f"[{timestamp}] {level.upper()}: {message}")

def update_phase(phase_name, status='running'):
    """Update current phase status"""
    app_state['current_phase'] = phase_name
    socketio.emit('phase_update', {
        'current_phase': phase_name,
        'status': status,
        'phases_completed': app_state['phases_completed']
    })

def complete_phase(phase_name, result):
    """Complete a phase and save the result"""
    app_state['phases_completed'].append(phase_name)
    app_state['results'][phase_name] = result
    socketio.emit('phase_completed', {
        'phase': phase_name,
        'result': result[:200] + "..." if len(result) > 200 else result,
        'phases_completed': app_state['phases_completed']
    })

async def run_mission_async(mission_description, mission_type):
    """Run the mission asynchronously with real-time updates"""
    try:
        app_state['mission_status'] = 'running'
        app_state['current_mission'] = mission_description
        app_state['phases_completed'] = []
        app_state['results'] = {}
        app_state['logs'] = []
        app_state['current_workflow'] = None  # No custom workflow
        
        log_message(f"🚀 Starting mission: {mission_description}")
        
        # Send default agents info to frontend
        default_agents = get_default_agents_info()
        socketio.emit('workflow_agents_update', {
            'agents': default_agents,
            'is_custom_workflow': False
        })
        
        # Initialize the multi-agent system
        if not app_state['mas']:
            app_state['mas'] = MultiAgentSystem(log_callback=log_message)
        
        mas = app_state['mas']
        # Update log callback for existing instance
        mas.set_log_callback(log_message)
        
        # Phase 1: Planning
        update_phase("planning")
        log_message("📋 Phase 1: Mission planning")
        update_agent_status("manager", "working")
        
        from main import Task
        planning_task = Task(
            id="planning",
            description=f"Plan how to complete this mission: {mission_description}. Mission type: {mission_type}. Define phases, assign roles, and establish execution order."
        )
        
        planning_result = await mas.agents["manager"].process_task(planning_task)
        complete_phase("planning", planning_result)
        log_message("✅ Planning completed")
        update_agent_status("manager", "completed")
        
        # Phase 2: Research
        update_phase("research")
        log_message("🔍 Phase 2: Information research")
        log_message("🌐 Performing web searches to gather current information...")
        update_agent_status("researcher", "working")
        
        research_task = Task(
            id="research",
            description=f"Research detailed information on: {mission_description}. Find data, statistics, best practices, and relevant information using web search capabilities."
        )
        
        research_result = await mas.agents["researcher"].process_task(research_task)
        complete_phase("research", research_result)
        log_message("✅ Research completed with web search results integrated")
        update_agent_status("researcher", "completed")
        
        # Phase 3: Analysis
        update_phase("analysis")
        log_message("📊 Phase 3: Data analysis")
        update_agent_status("analyst", "working")
        
        analysis_task = Task(
            id="analysis",
            description=f"Analyze the collected information for the mission: {mission_description}. Identify patterns, insights, and recommendations based on research data."
        )
        
        mas.agents["analyst"].memory.append(f"Research data: {research_result}")
        analysis_result = await mas.agents["analyst"].process_task(analysis_task)
        complete_phase("analysis", analysis_result)
        log_message("✅ Analysis completed")
        update_agent_status("analyst", "completed")
        
        # Phase 4: Writing
        update_phase("writing")
        log_message("✍️ Phase 4: Content creation")
        update_agent_status("writer", "working")
        
        writing_task = Task(
            id="writing",
            description=f"Create complete and well-structured content for: {mission_description}. Use research and analysis information to create a high-quality result."
        )
        
        mas.agents["writer"].memory.extend([
            f"Research: {research_result[:300]}...",
            f"Analysis: {analysis_result[:300]}..."
        ])
        
        writing_result = await mas.agents["writer"].process_task(writing_task)
        complete_phase("writing", writing_result)
        log_message("✅ Content created")
        update_agent_status("writer", "completed")
        
        # Phase 5: Review
        update_phase("review")
        log_message("🔍 Phase 5: Review and quality control")
        update_agent_status("reviewer", "working")
        
        review_task = Task(
            id="review",
            description=f"Review all work done for the mission: {mission_description}. Verify quality, completeness, and consistency. Provide feedback and suggestions for improvements."
        )
        
        mas.agents["reviewer"].memory.extend([
            f"Planning: {planning_result[:200]}...",
            f"Research: {research_result[:200]}...",
            f"Analysis: {analysis_result[:200]}...",
            f"Content: {writing_result[:200]}..."
        ])
        
        review_result = await mas.agents["reviewer"].process_task(review_task)
        complete_phase("review", review_result)
        log_message("✅ Review completed")
        update_agent_status("reviewer", "completed")
        
        # Mission completed
        app_state['mission_status'] = 'completed'
        app_state['current_phase'] = None
        
        final_result = {
            "mission_description": mission_description,
            "mission_type": mission_type,
            "phases": app_state['results'],
            "completion_time": datetime.now().isoformat()
        }
        
        socketio.emit('mission_completed', final_result)
        log_message("🎉 Mission completed successfully!")
        
        return final_result
        
    except Exception as e:
        app_state['mission_status'] = 'error'
        error_msg = f"❌ Error during execution: {str(e)}"
        log_message(error_msg, 'error')
        socketio.emit('mission_error', {'error': str(e)})
        return None

def run_mission_thread(mission_description, mission_type):
    """Run the mission in a separate thread"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    result = loop.run_until_complete(run_mission_async(mission_description, mission_type))
    loop.close()
    return result

@app.route('/')
def index():
    """Main page"""
    return render_template('workflow_builder.html')

@app.route('/workflow')
def workflow_builder():
    """Workflow builder page"""
    return render_template('workflow_builder.html')

@app.route('/favicon.ico')
def favicon():
    """Serve the favicon"""
    try:
        return send_from_directory(os.path.join(app.root_path, 'static'), 'favicon.ico')
    except:
        # If favicon doesn't exist, return empty 204 response
        return '', 204

@app.errorhandler(403)
def forbidden(error):
    """Handle 403 errors"""
    return jsonify({'error': 'Access denied'}), 403

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({'error': 'Resource not found'}), 404

@app.route('/api/status')
def get_status():
    """Return current system status"""
    return jsonify({
        'status': app_state['mission_status'],
        'current_mission': app_state['current_mission'],
        'current_phase': app_state['current_phase'],
        'phases_completed': app_state['phases_completed'],
        'logs': app_state['logs'][-MAX_LOGS_DISPLAY:]  # Last logs based on config
    })

@app.route('/api/start_mission', methods=['POST'])
def start_mission():
    """Start a new mission"""
    if app_state['mission_status'] == 'running':
        return jsonify({'error': 'A mission is already running'}), 400
    
    data = request.json
    mission_description = data.get('description', '')
    mission_type = data.get('type', 'general')
    
    if not mission_description:
        return jsonify({'error': 'Mission description required'}), 400
    
    # Start the mission in a separate thread
    thread = threading.Thread(
        target=run_mission_thread,
        args=(mission_description, mission_type)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({'message': 'Mission started successfully'})

@app.route('/api/results')
def get_results():
    """Return current mission results"""
    return jsonify({
        'results': app_state['results'],
        'status': app_state['mission_status']
    })

@app.route('/api/logs')
def get_logs():
    """Return all logs"""
    return jsonify({'logs': app_state['logs']})

# Configuration for workflows
WORKFLOWS_PATH = os.path.join(os.path.dirname(__file__), WORKFLOWS_DIR)
if not os.path.exists(WORKFLOWS_PATH):
    os.makedirs(WORKFLOWS_PATH)

def load_workflows():
    """Load all saved workflows from disk"""
    workflows = []
    try:
        for filename in os.listdir(WORKFLOWS_PATH):
            if filename.endswith('.json'):
                filepath = os.path.join(WORKFLOWS_PATH, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    workflow_data = json.load(f)
                    workflows.append(workflow_data)
    except Exception as e:
        print(f"Error loading workflows: {e}")
    return workflows

def save_workflow_to_disk(workflow_data):
    """Save a workflow to disk"""
    try:
        # Generate unique filename
        workflow_id = workflow_data.get('id', str(uuid.uuid4()))
        filename = f"workflow_{workflow_id}.json"
        filepath = os.path.join(WORKFLOWS_PATH, filename)
        
        # Add metadata
        workflow_data['id'] = workflow_id
        workflow_data['created_at'] = datetime.now().isoformat()
        workflow_data['updated_at'] = datetime.now().isoformat()
        
        # Save to file
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(workflow_data, f, indent=2, ensure_ascii=False)
        
        return workflow_id
    except Exception as e:
        print(f"Error saving workflow: {e}")
        return None

def delete_workflow_from_disk(workflow_id):
    """Delete a workflow from disk"""
    try:
        filename = f"workflow_{workflow_id}.json"
        filepath = os.path.join(WORKFLOWS_PATH, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            return True
    except Exception as e:
        print(f"Error deleting workflow: {e}")
    return False

def update_workflow_on_disk(workflow_id, workflow_data):
    """Update an existing workflow on disk"""
    try:
        filename = f"workflow_{workflow_id}.json"
        filepath = os.path.join(WORKFLOWS_PATH, filename)
        
        if os.path.exists(filepath):
            # Load existing data to preserve creation date
            with open(filepath, 'r', encoding='utf-8') as f:
                existing_data = json.load(f)
            
            # Update data
            workflow_data['id'] = workflow_id
            workflow_data['created_at'] = existing_data.get('created_at', datetime.now().isoformat())
            workflow_data['updated_at'] = datetime.now().isoformat()
            
            # Save updated data
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(workflow_data, f, indent=2, ensure_ascii=False)
            
            return True
    except Exception as e:
        print(f"Error updating workflow: {e}")
    return False

@app.route('/api/workflows', methods=['GET', 'POST', 'PUT', 'DELETE'])
def handle_workflows():
    """Handle workflow management with full CRUD operations"""
    if request.method == 'GET':
        # Return all saved workflows
        workflows = load_workflows()
        return jsonify({'workflows': workflows})
    
    elif request.method == 'POST':
        # Save a new workflow
        data = request.json
        workflow_name = data.get('name', '')
        workflow_description = data.get('description', '')
        workflow_data = data.get('workflow', {})
        
        if not workflow_name or not workflow_data:
            return jsonify({'error': 'Workflow name and data required'}), 400
        
        # Prepare workflow data for saving
        complete_workflow = {
            'name': workflow_name,
            'description': workflow_description,
            'workflow': workflow_data,
            'metadata': {
                'node_count': len(workflow_data.get('nodes', [])),
                'connection_count': len(workflow_data.get('connections', [])),
                'agent_types': list(set(node.get('agentType', 'unknown') for node in workflow_data.get('nodes', [])))
            }
        }
        
        workflow_id = save_workflow_to_disk(complete_workflow)
        if workflow_id:
            return jsonify({
                'message': 'Workflow saved successfully',
                'workflow_id': workflow_id
            })
        else:
            return jsonify({'error': 'Failed to save workflow'}), 500
    
    elif request.method == 'PUT':
        # Update an existing workflow
        data = request.json
        workflow_id = data.get('id', '')
        workflow_name = data.get('name', '')
        workflow_description = data.get('description', '')
        workflow_data = data.get('workflow', {})
        
        if not workflow_id or not workflow_name or not workflow_data:
            return jsonify({'error': 'Workflow ID, name and data required'}), 400
        
        # Prepare workflow data for updating
        complete_workflow = {
            'name': workflow_name,
            'description': workflow_description,
            'workflow': workflow_data,
            'metadata': {
                'node_count': len(workflow_data.get('nodes', [])),
                'connection_count': len(workflow_data.get('connections', [])),
                'agent_types': list(set(node.get('agentType', 'unknown') for node in workflow_data.get('nodes', [])))
            }
        }
        
        if update_workflow_on_disk(workflow_id, complete_workflow):
            return jsonify({'message': 'Workflow updated successfully'})
        else:
            return jsonify({'error': 'Failed to update workflow'}), 500
    
    elif request.method == 'DELETE':
        # Delete a workflow
        data = request.json
        workflow_id = data.get('id', '')
        
        if not workflow_id:
            return jsonify({'error': 'Workflow ID required'}), 400
        
        if delete_workflow_from_disk(workflow_id):
            return jsonify({'message': 'Workflow deleted successfully'})
        else:
            return jsonify({'error': 'Failed to delete workflow'}), 500

@app.route('/api/workflows/<workflow_id>')
def get_workflow(workflow_id):
    """Get a specific workflow by ID"""
    try:
        filename = f"workflow_{workflow_id}.json"
        filepath = os.path.join(WORKFLOWS_PATH, filename)
        
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                workflow_data = json.load(f)
            return jsonify(workflow_data)
        else:
            return jsonify({'error': 'Workflow not found'}), 404
    except Exception as e:
        return jsonify({'error': f'Error loading workflow: {str(e)}'}), 500

@app.route('/api/workflows/<workflow_id>/duplicate', methods=['POST'])
def duplicate_workflow(workflow_id):
    """Duplicate an existing workflow"""
    try:
        filename = f"workflow_{workflow_id}.json"
        filepath = os.path.join(WORKFLOWS_PATH, filename)
        
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                original_workflow = json.load(f)
            
            # Create a copy with modified name
            duplicated_workflow = original_workflow.copy()
            duplicated_workflow['name'] = f"{original_workflow['name']} (Copy)"
            
            # Remove old metadata
            if 'id' in duplicated_workflow:
                del duplicated_workflow['id']
            if 'created_at' in duplicated_workflow:
                del duplicated_workflow['created_at']
            if 'updated_at' in duplicated_workflow:
                del duplicated_workflow['updated_at']
            
            # Save duplicated workflow
            new_workflow_id = save_workflow_to_disk(duplicated_workflow)
            if new_workflow_id:
                return jsonify({
                    'message': 'Workflow duplicated successfully',
                    'new_workflow_id': new_workflow_id
                })
            else:
                return jsonify({'error': 'Failed to duplicate workflow'}), 500
        else:
            return jsonify({'error': 'Original workflow not found'}), 404
    except Exception as e:
        return jsonify({'error': f'Error duplicating workflow: {str(e)}'}), 500

@app.route('/api/run_custom_workflow', methods=['POST'])
def run_custom_workflow():
    """Run a custom workflow created by the user"""
    if app_state['mission_status'] == 'running':
        return jsonify({'error': 'A mission is already running'}), 400
    
    data = request.json
    workflow = data.get('workflow', {})
    mission_description = data.get('description', '')
    
    if not workflow or not mission_description:
        return jsonify({'error': 'Workflow and mission description required'}), 400
    
    # Start the custom workflow in a separate thread
    thread = threading.Thread(
        target=run_custom_workflow_thread,
        args=(workflow, mission_description)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({'message': 'Custom workflow started successfully'})

def run_custom_workflow_thread(workflow, mission_description):
    """Run the custom workflow in a separate thread"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    result = loop.run_until_complete(run_custom_workflow_async(workflow, mission_description))
    loop.close()
    return result

async def run_custom_workflow_async(workflow, mission_description):
    """Run the custom workflow asynchronously with real-time updates"""
    try:
        app_state['mission_status'] = 'running'
        app_state['current_mission'] = mission_description
        app_state['phases_completed'] = []
        app_state['results'] = {}
        app_state['logs'] = []
        app_state['current_workflow'] = workflow  # Store current workflow
        
        log_message(f"🚀 Starting custom workflow: {mission_description}")
        
        # Send workflow agents info to frontend
        workflow_agents = get_workflow_agents_info(workflow)
        socketio.emit('workflow_agents_update', {
            'agents': workflow_agents,
            'is_custom_workflow': True
        })

        
        # Initialize the multi-agent system
        if not app_state['mas']:
            app_state['mas'] = MultiAgentSystem(log_callback=log_message)
        
        mas = app_state['mas']
        # Update log callback for existing instance
        mas.set_log_callback(log_message)
        
        # Get workflow nodes sorted by execution order
        nodes = workflow.get('nodes', [])
        connections = workflow.get('connections', [])
        
        # Sort nodes by their position and connections
        execution_order = determine_execution_order(nodes, connections)
        
        # Execute each node in the workflow
        for node in execution_order:
            agent_id = node.get('agentType', 'manager')
            task_description = node.get('description', '') + "\nMission description: " + mission_description
            node_id = node.get('id', '')
            custom_prompt = node.get('customPrompt', '')
            selected_model = node.get('model', None)  # Get selected model from node
            
            if not task_description:
                continue
            
            # Update agent status to working
            update_agent_status(node_id, 'working')
            
            # Map custom agent types to existing agents
            agent_mapping = {
                'manager': 'manager',
                'researcher': 'researcher', 
                'analyst': 'analyst',
                'writer': 'writer',
                'reviewer': 'reviewer',
                'custom': 'manager'  # Custom agents use manager as fallback
            }
            
            agent_name = agent_mapping.get(agent_id, 'manager')
            
            update_phase(f"{agent_name}_{node_id}")
            log_message(f"🤖 {node.get('title', agent_name.title())} (Model: {selected_model or 'default'}): {task_description}")
            
            from main import Task
            task = Task(
                id=node_id,
                description=task_description
            )
            
            # Add context from previous nodes if connected
            context = get_context_from_connections(node_id, connections, app_state['results'])
            if context:
                mas.agents[agent_name].memory.extend(context)
            
            # Use custom prompt if provided
            if custom_prompt and agent_id == 'custom':
                # For custom agents, temporarily update the system prompt
                original_prompt = mas.agents[agent_name].system_prompt
                mas.agents[agent_name].system_prompt = custom_prompt
                
                result = await mas.agents[agent_name].process_task(task, selected_model)
                
                # Restore original prompt
                mas.agents[agent_name].system_prompt = original_prompt
            else:
                result = await mas.agents[agent_name].process_task(task, selected_model)
            
            complete_phase(node["title"], result)
            log_message(f"✅ {node.get('title', agent_name.title())} completed task")
            
            # Update agent status to completed
            update_agent_status(node_id, 'completed')
        
        # Mission completed
        app_state['mission_status'] = 'completed'
        app_state['current_phase'] = None
        
        final_result = {
            "mission_description": mission_description,
            "workflow": workflow,
            "phases": app_state['results'],
            "completion_time": datetime.now().isoformat()
        }
        
        socketio.emit('mission_completed', final_result)
        log_message("🎉 Custom workflow completed successfully!")
        
        return final_result
        
    except Exception as e:
        app_state['mission_status'] = 'error'
        error_msg = f"❌ Error during custom workflow execution: {str(e)}"
        log_message(error_msg, 'error')
        socketio.emit('mission_error', {'error': str(e)})
        return None

def determine_execution_order(nodes, connections):
    """Determine the execution order of nodes based on connections"""
    # Simple implementation: sort by position for now
    # In a more complex implementation, you'd do topological sorting
    return sorted(nodes, key=lambda n: (n.get('position', {}).get('y', 0), n.get('position', {}).get('x', 0)))

def get_context_from_connections(node_id, connections, results):
    """Get context from connected previous nodes"""
    context = []
    for conn in connections:
        if conn.get('target') == node_id:
            source_id = conn.get('source')
            # Find results from source node
            for phase_name, result in results.items():
                if source_id in phase_name:
                    context.append(f"Previous result: {result[:300]}...")
    return context

def get_default_agents_info():
    """Get default agents information for display"""
    return [
        {
            'id': 'manager',
            'name': 'Manager',
            'type': 'manager',
            'icon': 'fas fa-user-tie',
            'description': 'Coordinates missions and manages the team',
            'status': 'idle'
        },
        {
            'id': 'researcher',
            'name': 'Researcher',
            'type': 'researcher',
            'icon': 'fas fa-search',
            'description': 'Gathers and verifies information using web search',
            'status': 'idle'
        },
        {
            'id': 'analyst',
            'name': 'Analyst',
            'type': 'analyst',
            'icon': 'fas fa-chart-bar',
            'description': 'Analyzes data and provides insights',
            'status': 'idle'
        },
        {
            'id': 'writer',
            'name': 'Writer',
            'type': 'writer',
            'icon': 'fas fa-pen-fancy',
            'description': 'Creates high-quality content',
            'status': 'idle'
        },
        {
            'id': 'reviewer',
            'name': 'Reviewer',
            'type': 'reviewer',
            'icon': 'fas fa-eye',
            'description': 'Controls quality and validates results',
            'status': 'idle'
        }
    ]

def get_workflow_agents_info(workflow):
    """Extract agent information from workflow for display"""
    nodes = workflow.get('nodes', [])
    agents_info = []
    
    # Map agent types to icons and descriptions
    agent_type_mapping = {
        'manager': {
            'icon': 'fas fa-user-tie',
            'description': 'Coordinates missions and manages the team'
        },
        'researcher': {
            'icon': 'fas fa-search', 
            'description': 'Gathers and verifies information using web search'
        },
        'analyst': {
            'icon': 'fas fa-chart-bar',
            'description': 'Analyzes data and provides insights'
        },
        'writer': {
            'icon': 'fas fa-pen-fancy',
            'description': 'Creates high-quality content'
        },
        'reviewer': {
            'icon': 'fas fa-eye',
            'description': 'Controls quality and validates results'
        },
        'custom': {
            'icon': 'fas fa-robot',
            'description': 'Custom agent with user-defined behavior'
        }
    }
    
    for node in nodes:
        agent_type = node.get('agentType', 'custom')
        agent_info = agent_type_mapping.get(agent_type, agent_type_mapping['custom'])
        
        agents_info.append({
            'id': node.get('id', ''),
            'name': node.get('title', 'Custom Agent'),
            'type': agent_type,
            'icon': agent_info['icon'],
            'description': node.get('description', agent_info['description']),
            'status': 'idle'
        })
    
    return agents_info

def update_agent_status(agent_id, status):
    """Update agent status and broadcast to frontend"""
    socketio.emit('agent_status_update', {
        'agent_id': agent_id,
        'status': status
    })

@socketio.on('connect')
def handle_connect():
    """Handle WebSocket connection"""
    emit('connected', {'status': 'connected'})
    emit('status_update', {
        'status': app_state['mission_status'],
        'current_mission': app_state['current_mission'],
        'current_phase': app_state['current_phase'],
        'phases_completed': app_state['phases_completed']
    })

@socketio.on('disconnect')
def handle_disconnect():
    """Handle WebSocket disconnection"""
    print('Client disconnected')

@app.route('/api/ollama/models')
def get_ollama_models():
    """Get available Ollama models"""
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}{OLLAMA_API_TAGS}", timeout=OLLAMA_TIMEOUT)
        if response.status_code == 200:
            data = response.json()
            models = []
            for model in data.get('models', []):
                models.append({
                    'name': model.get('name', ''),
                    'size': model.get('size', 0),
                    'modified_at': model.get('modified_at', ''),
                    'details': model.get('details', {})
                })
            return jsonify({'models': models})
        else:
            return jsonify({'error': 'Failed to fetch models from Ollama'}), 500
    except Exception as e:
        return jsonify({'error': f'Ollama connection error: {str(e)}'}), 500

if __name__ == '__main__':
    print("🌐 Starting InfinityBench AI web server...")
    print(f"📱 Interface available at: http://localhost:{SERVER_PORT}")
    print("🔗 WebSocket active for real-time updates")
    
    try:
        socketio.run(app, host='0.0.0.0', port=SERVER_PORT, debug=True, allow_unsafe_werkzeug=True)
    except Exception as e:
        print(f"❌ Error starting server: {e}")
        print("🔄 Trying with alternative configuration...")
        try:
            app.run(host='0.0.0.0', port=SERVER_PORT, debug=True)
        except Exception as e2:
            print(f"❌ Error with alternative configuration too: {e2}")
