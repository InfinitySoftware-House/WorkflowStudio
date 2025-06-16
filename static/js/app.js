// InfinityBench AI - JavaScript Frontend
class InfinityBenchApp {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.currentMission = null;
        
        this.init();
    }
    
    init() {
        this.connectWebSocket();
        this.setupEventListeners();
        this.updateConnectionStatus(false);
    }
    
    connectWebSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.isConnected = true;
            this.updateConnectionStatus(true);
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('connected', (data) => {
            this.addLog('System connected and ready', 'success');
        });
        
        this.socket.on('log_update', (log) => {
            this.addLog(log.message, log.level);
        });
        
        this.socket.on('phase_update', (data) => {
            this.updateAgentStatus(this.getAgentForPhase(data.current_phase), 'working');
        });
        
        this.socket.on('phase_completed', (data) => {
            this.updateAgentStatus(this.getAgentForPhase(data.phase), 'idle');
        });
        
        this.socket.on('mission_completed', (data) => {
            this.showResults(data);
            this.resetAgentsStatus();
            this.enableForm();
        });
        
        this.socket.on('mission_error', (data) => {
            this.addLog(`Errore: ${data.error}`, 'error');
            this.resetAgentsStatus();
            this.enableForm();
        });
        
        this.socket.on('status_update', (data) => {
            if (data.current_mission) {
                this.updateMissionStatus(data);
            }
        });

        // New event for workflow agents update
        this.socket.on('workflow_agents_update', (data) => {
            console.log('Workflow agents update:', data);
            this.updateAgentsDisplay(data.agents, data.is_custom_workflow);
        });

        // New event for individual agent status update
        this.socket.on('agent_status_update', (data) => {
            console.log('Agent status update:', data);
            this.updateAgentStatusById(data.agent_id, data.status);
        });
    }
    
    setupEventListeners() {
        const form = document.getElementById('mission-form');
        const startBtn = document.getElementById('start-btn');
        
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.startMission();
        });
    }
    
    updateConnectionStatus(connected) {
        const statusDot = document.getElementById('connection-status');
        const statusText = document.getElementById('connection-text');
        
        if (connected) {
            statusDot.classList.remove('offline');
            statusDot.classList.add('online');
            statusText.textContent = 'Connected';
        } else {
            statusDot.classList.remove('online');
            statusDot.classList.add('offline');
            statusText.textContent = 'Disconnected';
        }
    }
    
    startMission() {
        const description = document.getElementById('mission-description').value.trim();
        const type = document.getElementById('mission-type').value;
        
        if (!description) {
            this.addLog('Enter a mission description', 'error');
            return;
        }
        
        this.disableForm();
        this.resetUI();
        
        fetch('/api/start_mission', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                description,
                type
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                this.addLog(data.error, 'error');
                this.enableForm();
            } else {
                this.addLog('Mission started successfully!', 'success');
                this.currentMission = description;
            }
        })
        .catch(error => {
            this.addLog(`Error starting mission: ${error.message}`, 'error');
            this.enableForm();
        });
    }
    
    /**
     * Parsa i tag <think></think> e li converte in accordion
     */
    parseThinkTags(content) {
        const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
        let accordionCounter = 0;
        const baseId = Date.now();
        
        return content.replace(thinkRegex, (match, thinkContent) => {
            accordionCounter++;
            const accordionId = `think-${baseId}-${accordionCounter}-${Math.random().toString(36).substr(2, 9)}`;
            
            return this.createThinkAccordion(accordionId, thinkContent.trim());
        });
    }
    
    /**
     * Crea l'HTML per un accordion di pensiero
     */ 
    createThinkAccordion(id, content) {
        // Escape HTML nel contenuto per sicurezza
        const escapedContent = this.escapeHtml(content);
        
        const accordionHtml = `
            <div class="think-accordion" data-accordion-id="${id}">
                <div class="think-accordion-header" data-toggle-id="${id}">
                    <div class="think-accordion-title">
                        <i class="fas fa-brain"></i>
                        <span>Reasoning process</span>
                    </div>
                    <div class="think-accordion-toggle">
                        <i class="fas fa-chevron-down"></i>
                    </div>
                </div>
                <div class="think-accordion-content">
                    <div class="think-accordion-body">
                        ${this.formatThinkContent(escapedContent)}
                    </div>
                </div>
            </div>
        `;
        
        // Aggiungi event listener dopo che l'HTML è stato inserito
        setTimeout(() => this.addAccordionEventListener(id), 0);
        
        return accordionHtml;
    }
    
    /**
     * Formatta il contenuto del tag think
     */
    formatThinkContent(content) {
        // Converte da Markdown a HTML
        return this.markdownToHtml(content);
    }
    
    /**
     * Aggiunge event listener per un accordion specifico
     */
    addAccordionEventListener(accordionId) {
        const header = document.querySelector(`[data-toggle-id="${accordionId}"]`);
        if (header && !header.hasAttribute('data-listener-added')) {
            header.addEventListener('click', () => {
                this.toggleThinkAccordion(accordionId);
            });
            header.setAttribute('data-listener-added', 'true');
        }
    }

    /**
     * Converte Markdown in HTML
     */
    markdownToHtml(markdown) {
        if (!markdown) return '';
        
        let html = markdown;
        
        // Headers
        html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
        
        // Bold
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
        
        // Italic
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        html = html.replace(/_(.*?)_/g, '<em>$1</em>');
        
        // Code inline
        html = html.replace(/`(.*?)`/g, '<code>$1</code>');
        
        // Code blocks
        html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        
        // Links
        html = html.replace(/\[([^\]]*)\]\(([^\)]*)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        // Lists
        html = html.replace(/^\s*\* (.*$)/gim, '<li>$1</li>');
        html = html.replace(/^\s*- (.*$)/gim, '<li>$1</li>');
        html = html.replace(/^\s*\+ (.*$)/gim, '<li>$1</li>');
        
        // Numbered lists
        html = html.replace(/^\s*\d+\. (.*$)/gim, '<li>$1</li>');
        
        // Wrap consecutive <li> elements in <ul> or <ol>
        html = html.replace(/(<li>.*<\/li>)/gis, (match) => {
            return '<ul>' + match + '</ul>';
        });
        
        // Line breaks and paragraphs
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');
        
        // Wrap in paragraphs if not already wrapped
        if (!html.includes('<p>') && !html.includes('<h1>') && !html.includes('<h2>') && !html.includes('<h3>') && !html.includes('<ul>') && !html.includes('<pre>')) {
            html = '<p>' + html + '</p>';
        } else if (html.includes('</p><p>')) {
            html = '<p>' + html + '</p>';
        }
        
        // Clean up empty paragraphs
        html = html.replace(/<p><\/p>/g, '');
        html = html.replace(/<p>\s*<\/p>/g, '');
        
        return html;
    }

    /**
     * Escape HTML per sicurezza
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Toggle dell'accordion dei tag think
     */
    toggleThinkAccordion(accordionId) {
        console.log('Toggling accordion:', accordionId);
        const accordion = document.querySelector(`[data-accordion-id="${accordionId}"]`);
        
        if (!accordion) {
            console.error('Accordion not found:', accordionId);
            return;
        }
        
        const content = accordion.querySelector('.think-accordion-content');
        const toggle = accordion.querySelector('.think-accordion-toggle i');
        
        if (!content || !toggle) {
            console.error('Accordion elements not found for:', accordionId);
            return;
        }
        
        // Toggle the active state
        const isActive = accordion.classList.contains('active');
        
        if (isActive) {
            // Close this accordion
            accordion.classList.remove('active');
            content.style.maxHeight = '0px';
            toggle.style.transform = 'rotate(0deg)';
            console.log('Closed accordion:', accordionId);
        } else {
            // Open this accordion
            accordion.classList.add('active');
            content.style.maxHeight = content.scrollHeight + 'px';
            toggle.style.transform = 'rotate(180deg)';
            console.log('Opened accordion:', accordionId);
        }
    }
    
    updateAgentStatus(agentName, status) {
        const agentCard = document.querySelector(`[data-agent="${agentName}"]`);
        if (agentCard) {
            const statusElement = agentCard.querySelector('.agent-status');
            
            statusElement.classList.remove('idle', 'active', 'working', 'searching');
            
            switch(status) {
                case 'working':
                    statusElement.classList.add('working');
                    if (agentName === 'researcher') {
                        statusElement.innerHTML = '<i class="fas fa-search fa-spin"></i> Searching web...';
                    } else {
                        statusElement.innerHTML = '<i class="fas fa-cog fa-spin"></i> Working...';
                    }
                    break;
                case 'searching':
                    statusElement.classList.add('searching');
                    statusElement.innerHTML = '<i class="fas fa-globe fa-pulse"></i> Web searching...';
                    break;
                case 'active':
                    statusElement.classList.add('active');
                    statusElement.textContent = 'Active';
                    break;
                default:
                    statusElement.classList.add('idle');
                    statusElement.textContent = 'Idle';
            }
        }
    }
    
    getAgentForPhase(phaseName) {
        const phaseAgentMap = {
            'planning': 'manager',
            'research': 'researcher',
            'analysis': 'analyst',
            'writing': 'writer',
            'review': 'reviewer'
        };
        
        return phaseAgentMap[phaseName] || 'manager';
    }
    
    resetAgentsStatus() {
        document.querySelectorAll('.agent-card').forEach(card => {
            const statusElement = card.querySelector('.agent-status');
            statusElement.classList.remove('active', 'working');
            statusElement.classList.add('idle');
            statusElement.textContent = 'Idle';
        });
    }

    updateAgentsDisplay(agents, isCustomWorkflow) {
        const agentsGrid = document.querySelector('.agents-grid');
        if (!agentsGrid) return;

        // Clear existing agents
        agentsGrid.innerHTML = '';

        // Add header if it's a custom workflow
        if (isCustomWorkflow) {
            const headerDiv = document.createElement('div');
            headerDiv.className = 'agents-header';
            headerDiv.innerHTML = `
                <div class="workflow-indicator">
                    <i class="fas fa-mission-diagram"></i>
                    <span>Custom Workflow Active</span>
                </div>
            `;
            agentsGrid.appendChild(headerDiv);
        }

        // Add agents
        agents.forEach(agent => {
            const agentCard = document.createElement('div');
            agentCard.className = 'agent-card';
            agentCard.setAttribute('data-agent', agent.id);
            
            agentCard.innerHTML = `
                <div class="agent-header">
                    <i class="${agent.icon}"></i>
                    <h3>${agent.name}</h3>
                </div>
                <div class="agent-status idle">${agent.status === 'idle' ? 'Idle' : agent.status}</div>
                <p>${agent.description}</p>
            `;
            
            agentsGrid.appendChild(agentCard);
        });

        // Store current agents for status updates
        this.currentAgents = agents;
        this.isCustomWorkflow = isCustomWorkflow;
    }

    updateAgentStatusById(agentId, status) {
        const agentCard = document.querySelector(`[data-agent="${agentId}"]`);
        if (agentCard) {
            const statusElement = agentCard.querySelector('.agent-status');
            
            statusElement.classList.remove('idle', 'active', 'working', 'completed');
            
            switch(status) {
                case 'working':
                    statusElement.classList.add('working');
                    statusElement.innerHTML = '<i class="fas fa-cog fa-spin"></i> Working...';
                    break;
                case 'completed':
                    statusElement.classList.add('completed');
                    statusElement.innerHTML = '<i class="fas fa-check-circle"></i> Completed';
                    break;
                case 'active':
                    statusElement.classList.add('active');
                    statusElement.textContent = 'Active';
                    break;
                default:
                    statusElement.classList.add('idle');
                    statusElement.textContent = 'Idle';
            }
        }
    }
    
    showResults(data) {
        const resultsSection = document.getElementById('results-section');
        const resultsContainer = document.getElementById('results-container');
        
        let resultsHTML = '';
        
        for (const [phase, result] of Object.entries(data.phases)) {
            const phaseNames = {
                'planning': 'Planning',
                'research': 'Research',
                'analysis': 'Analysis',
                'writing': 'Writing',
                'review': 'Review',
                'final_feedback': 'Final Feedback'
            };
            
            const phaseIcons = {
                'planning': 'fas fa-clipboard-list',
                'research': 'fas fa-search',
                'analysis': 'fas fa-chart-line',
                'writing': 'fas fa-pen',
                'review': 'fas fa-check-circle',
                'final_feedback': 'fas fa-comments'
            };
            
            // Parse and convert think tags to accordions for results too
            const processedResult = this.parseThinkTags(result);
            
            // Convert all Markdown to HTML
            const formattedResult = this.markdownToHtml(processedResult);
            
            resultsHTML += `
                <div class="result-card">
                    <h3><i class="${phaseIcons[phase]}"></i> ${phaseNames[phase]}</h3>
                    <div class="result-content">${formattedResult}</div>
                </div>
            `;
        }
        
        resultsContainer.innerHTML = resultsHTML;
        resultsSection.style.display = 'block';
        
        // Scroll to results
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    addLog(message, level = 'info') {
        const logsContainer = document.getElementById('logs-container');
        const timestamp = new Date().toLocaleTimeString();
        
        // Determine icon based on message content
        let icon = '';
        if (message.includes('web search') || message.includes('Performing web searches')) {
            icon = '<i class="fas fa-search"></i> ';
        } else if (message.includes('DuckDuckGo') || message.includes('search results')) {
            icon = '<i class="fas fa-globe"></i> ';
        } else if (message.includes('Research')) {
            icon = '<i class="fas fa-microscope"></i> ';
        } else if (message.includes('Planning')) {
            icon = '<i class="fas fa-clipboard-list"></i> ';
        } else if (message.includes('Analysis')) {
            icon = '<i class="fas fa-chart-line"></i> ';
        } else if (message.includes('Writing') || message.includes('Content')) {
            icon = '<i class="fas fa-pen"></i> ';
        } else if (message.includes('Review')) {
            icon = '<i class="fas fa-check-circle"></i> ';
        }
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${level}`;
        logEntry.innerHTML = `
            <span class="timestamp">${timestamp}</span>
            <span class="message">${icon}${message}</span>
        `;
        
        logsContainer.appendChild(logEntry);
        logsContainer.scrollTop = logsContainer.scrollHeight;
        
        // Keep only last 100 logs
        while (logsContainer.children.length > 100) {
            logsContainer.removeChild(logsContainer.firstChild);
        }
    }
    
    disableForm() {
        const startBtn = document.getElementById('start-btn');
        const textarea = document.getElementById('mission-description');
        const select = document.getElementById('mission-type');
        
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mission in Progress...';
        textarea.disabled = true;
        select.disabled = true;
    }
    
    enableForm() {
        const startBtn = document.getElementById('start-btn');
        const textarea = document.getElementById('mission-description');
        const select = document.getElementById('mission-type');
        
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="fas fa-rocket"></i> Start Mission';
        textarea.disabled = false;
        select.disabled = false;
    }
    
    resetUI() {
        // Hide results section
        document.getElementById('results-section').style.display = 'none';
    }
    
    updateMissionStatus(data) {
        if (data.current_phase) {
            this.updateAgentStatus(this.getAgentForPhase(data.current_phase), 'working');
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.infinityBenchApp = new InfinityBenchApp();
});

// Utility functions
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        console.log('Copied to clipboard');
    });
}

function downloadResults() {
    // This could be implemented to download results as JSON or PDF
    console.log('Download functionality to be implemented');
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl+Enter to start mission
    if (e.ctrlKey && e.key === 'Enter') {
        document.getElementById('start-btn').click();
    }
    
    // Escape to clear form
    if (e.key === 'Escape') {
        document.getElementById('mission-form').reset();
    }
});
