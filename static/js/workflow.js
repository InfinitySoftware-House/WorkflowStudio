// Workflow Builder JavaScript
class WorkflowBuilder {
    constructor() {
        this.canvas = document.getElementById('workflow-canvas');
        this.nodes = new Map();
        this.connections = []; // Initialize connections array
        this.selectedNode = null;
        this.nodeCounter = 0;
        this.canvasOffset = { x: 0, y: 0 };
        this.scale = 1;
        this.currentWorkflowId = null; // Track current workflow for updating
        
        // Grid configuration for fixed rows
        this.gridConfig = {
            rowHeight: 150,    // Height of each row (including spacing)
            nodeHeight: 120,   // Actual height of each node
            rowSpacing: 30,    // Spacing between rows
            leftMargin: 40,    // Left margin
            rightMargin: 40,   // Right margin
            topMargin: 40      // Top margin
        };
        
        // Initialize SVG for connections
        this.setupConnectionsSVG();
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateWorkflowInfo();
        this.setupSocket();
        this.loadOllamaModels(); // Load available models
    }

    setupSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });

        this.socket.on('log_update', (log) => {
            console.log('Workflow log:', log);
            // Add log entry if execution panel is visible
            if (document.getElementById('workflow-execution-panel').style.display === 'flex') {
                this.addLogEntry('info', log.message || log);
            }
        });

        this.socket.on('mission_completed', (result) => {
            console.log('Workflow completed:', result);
            this.showNotification('Workflow completed successfully!', 'success');
            this.handleWorkflowCompleted(result);
            if (document.getElementById('workflow-execution-panel').style.display === 'flex') {
                this.addLogEntry('success', 'Workflow completed successfully!');
            }
        });

        this.socket.on('mission_error', (error) => {
            console.error('Workflow error:', error);
            this.showNotification('Workflow execution failed: ' + error.error, 'error');
            this.handleWorkflowError(error);
        });

        this.socket.on('workflow_agents_update', (data) => {
            console.log('Workflow agents update:', data);
            this.updateWorkflowAgents(data.agents);
        });

        this.socket.on('agent_status_update', (data) => {
            console.log('Agent status update:', data);
            this.updateAgentStatus(data.agent_id, data.status);
            if (document.getElementById('workflow-execution-panel').style.display === 'flex') {
                this.addLogEntry('info', `Agent ${data.agent_id} status: ${data.status}`);
            }
        });
    }

    setupEventListeners() {
        // Drag and drop from palette
        document.querySelectorAll('.agent-item').forEach(item => {
            item.addEventListener('dragstart', this.handleDragStart.bind(this));
        });

        // Canvas drop
        this.canvas.addEventListener('dragover', this.handleDragOver.bind(this));
        this.canvas.addEventListener('drop', this.handleDrop.bind(this));

        // Canvas events
        this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));
        // Buttons
        document.getElementById('clear-canvas-btn').addEventListener('click', this.clearCanvas.bind(this));
        document.getElementById('load-workflow-btn').addEventListener('click', this.showLoadModal.bind(this));
        document.getElementById('save-workflow-btn').addEventListener('click', this.showSaveModal.bind(this));
        document.getElementById('run-workflow-btn').addEventListener('click', this.showRunModal.bind(this));

        // Layout buttons
        document.getElementById('arrange-sequential-btn').addEventListener('click', this.arrangeNodesSequentially.bind(this));
        document.getElementById('reset-layout-btn').addEventListener('click', this.resetLayout.bind(this));

        // Canvas controls
        document.getElementById('zoom-in-btn').addEventListener('click', () => this.zoom(1.2));
        document.getElementById('zoom-out-btn').addEventListener('click', () => this.zoom(0.8));
        document.getElementById('reset-zoom-btn').addEventListener('click', () => this.resetZoom());

        // Properties panel
        document.getElementById('update-node-btn').addEventListener('click', this.updateSelectedNode.bind(this));
        document.getElementById('delete-node-btn').addEventListener('click', this.deleteSelectedNode.bind(this));
        document.getElementById('node-agent-type').addEventListener('change', this.handleAgentTypeChange.bind(this));
        
        // Color picker
        document.getElementById('node-color').addEventListener('input', this.handleColorChange.bind(this));
        document.getElementById('node-color').addEventListener('change', this.handleColorChange.bind(this));

        // Execution panel
        document.getElementById('close-execution-btn').addEventListener('click', this.closeExecutionPanel.bind(this));

        // Modals
        this.setupModalEvents();
    }

    setupModalEvents() {
        // Load modal
        document.getElementById('cancel-load-btn').addEventListener('click', this.hideLoadModal.bind(this));
        
        // Save modal
        document.getElementById('cancel-save-btn').addEventListener('click', this.hideSaveModal.bind(this));
        document.getElementById('confirm-save-btn').addEventListener('click', this.saveWorkflow.bind(this));
        
        // Run modal
        document.getElementById('cancel-run-btn').addEventListener('click', this.hideRunModal.bind(this));
        document.getElementById('confirm-run-btn').addEventListener('click', this.runWorkflow.bind(this));

        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').style.display = 'none';
            });
        });

        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });
    }

    handleDragStart(e) {
        e.dataTransfer.setData('text/plain', e.target.dataset.agentType);
        e.dataTransfer.effectAllowed = 'copy';
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        
        // Add visual feedback for target row
        const rect = this.canvas.getBoundingClientRect();
        const dropY = e.clientY - rect.top;
        const targetRow = this.getRowFromY(dropY);
        
        // Highlight target row area
        this.highlightTargetRow(targetRow);
    }

    handleDrop(e) {
        e.preventDefault();
        
        // Remove row highlight
        this.removeRowHighlight();
        
        const agentType = e.dataTransfer.getData('text/plain');
        
        // Get drop position
        const rect = this.canvas.getBoundingClientRect();
        const dropY = e.clientY - rect.top;
        
        // Calculate which row the drop occurred in
        const targetRow = this.getRowFromY(dropY);
        
        // Insert node in the calculated row
        this.insertNodeInRow(agentType, targetRow);
    }

    getRowFromY(y) {
        // Calculate which row based on Y coordinate
        const adjustedY = y - this.gridConfig.topMargin;
        const row = Math.floor(adjustedY / this.gridConfig.rowHeight);
        return Math.max(0, row); // Ensure row is never negative
    }

    insertNodeInRow(agentType, targetRow) {
        // Get current nodes sorted by order
        const nodeArray = Array.from(this.nodes.values()).sort((a, b) => a.order - b.order);
        
        // Clamp target row to valid range
        targetRow = Math.max(0, targetRow);
        
        // Calculate correct insertion position
        let insertPosition = Math.min(targetRow, nodeArray.length);
        var availableWidth = this.canvas.clientWidth - this.gridConfig.leftMargin - this.gridConfig.rightMargin;

        var nodeWidth = Math.min(600, availableWidth);
        
        // Create node with temporary position
        const tempX = this.gridConfig.leftMargin + (availableWidth - nodeWidth) / 2;
        const tempY = this.gridConfig.topMargin + (insertPosition * this.gridConfig.rowHeight);
        const newNode = this.createNode(agentType, tempX, tempY);
        
        // Update the order of all nodes to accommodate the new insertion
        this.reorderNodesAfterInsertion(newNode.id, insertPosition);
        
        // Rearrange all nodes to fit in grid
        this.arrangeNodesInGrid();
    }

    reorderNodesAfterInsertion(newNodeId, insertPosition) {
        // Get all nodes except the new one, sorted by order
        const existingNodes = Array.from(this.nodes.values())
            .filter(n => n.id !== newNodeId)
            .sort((a, b) => a.order - b.order);
        
        const newNode = this.nodes.get(newNodeId);
        
        // Reorder all nodes
        const allNodes = [];
        
        // Add nodes before insertion position
        for (let i = 0; i < insertPosition; i++) {
            if (existingNodes[i]) {
                allNodes.push(existingNodes[i]);
            }
        }
        
        // Add the new node
        allNodes.push(newNode);
        
        // Add remaining nodes after insertion position
        for (let i = insertPosition; i < existingNodes.length; i++) {
            allNodes.push(existingNodes[i]);
        }
        
        // Update order values
        allNodes.forEach((node, index) => {
            node.order = index + 1;
            const orderElement = node.element.querySelector('.node-order');
            if (orderElement) {
                orderElement.textContent = `#${node.order}`;
            }
        });
    }

    // Layout functions for fixed grid arrangement
    arrangeNodesInGrid() {
        const nodeArray = Array.from(this.nodes.values());
        const canvasWidth = this.canvas.clientWidth;
        const availableWidth = canvasWidth - this.gridConfig.leftMargin - this.gridConfig.rightMargin;
        const nodeWidth = Math.min(600, availableWidth);
        
        // Sort nodes by their order
        nodeArray.sort((a, b) => a.order - b.order);

        // Arrange nodes in fixed grid rows
        nodeArray.forEach((node, index) => {
            const row = index; // Each node gets its own row (0-based)
            
            // Center the node horizontally in the available space
            const x = this.gridConfig.leftMargin + (availableWidth - nodeWidth) / 2;
            
            // Position in the correct row
            const y = this.gridConfig.topMargin + (row * this.gridConfig.rowHeight);
            
            // Update node position
            node.position.x = x;
            node.position.y = y;
            
            // Update DOM element position and size
            node.element.style.left = `${x}px`;
            node.element.style.top = `${y}px`;
            node.element.style.width = `${nodeWidth}px`;
            node.element.style.height = `${this.gridConfig.nodeHeight}px`;
            
            // Ensure proper positioning
            node.element.style.position = 'absolute';
        });

        // Recreate FIFO connections after repositioning
        this.recreateFIFOConnections();
        
        // Redraw after repositioning
        this.updateWorkflowInfo();
    }

    // Keep legacy function for backward compatibility
    arrangeNodesSequentially() {
        this.arrangeNodesInGrid();
    }

    addNodeInSequentialOrder(agentType, x = null, y = null) {
        // Calculate position for new node in the next available row
        const nodeArray = Array.from(this.nodes.values());
        const canvasWidth = this.canvas.clientWidth;
        const nodeWidth = Math.min(600, canvasWidth - this.gridConfig.leftMargin - this.gridConfig.rightMargin);
        
        // Position in the next row
        const row = nodeArray.length;
        const newX = this.gridConfig.leftMargin + (canvasWidth - nodeWidth - this.gridConfig.leftMargin - this.gridConfig.rightMargin) / 2;
        const newY = this.gridConfig.topMargin + (row * this.gridConfig.rowHeight);
        
        // Create the node
        this.createNode(agentType, x || newX, y || newY);
    }

    insertNodeAtPosition(agentType, position) {
        // Insert a node at a specific position in the sequence
        const nodeArray = Array.from(this.nodes.values());
        
        if (position < 0 || position > nodeArray.length) {
            position = nodeArray.length; // Add to end if invalid position
        }

        // Create node at temporary position
        const tempX = 100;
        const tempY = 100;
        this.createNode(agentType, tempX, tempY);

        // Rearrange all nodes in grid
        this.arrangeNodesInGrid();
    }

    // Enhanced createNode for sequential layout
    createNode(agentType, x, y) {
        const nodeId = `node_${++this.nodeCounter}`;
        const agentInfo = this.getAgentInfo(agentType);
        
        const nodeElement = document.createElement('div');
        nodeElement.className = 'workflow-node';
        nodeElement.dataset.nodeId = nodeId;
        nodeElement.style.left = `${x}px`;
        nodeElement.style.top = `${y}px`;
        
        nodeElement.innerHTML = `
            <div class="node-header">
                <i class="${agentInfo.icon}"></i>
                <span class="node-title">${agentInfo.title}</span>
                <span class="node-order">#${this.nodeCounter}</span>
            </div>
            <div class="node-description">${agentInfo.description}</div>
            <div class="node-type">${agentType}</div>
            <div class="node-actions">
                <button class="node-action-btn move-up" title="Move Up">
                    <i class="fas fa-arrow-up"></i>
                </button>
                <button class="node-action-btn move-down" title="Move Down">
                    <i class="fas fa-arrow-down"></i>
                </button>
                <button class="node-action-btn delete-node" title="Delete Node">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        // Add event listeners
        nodeElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNode(nodeId);
        });

        nodeElement.addEventListener('mousedown', this.handleNodeMouseDown.bind(this));

        // Node action buttons
        const moveUpBtn = nodeElement.querySelector('.move-up');
        const moveDownBtn = nodeElement.querySelector('.move-down');
        const deleteBtn = nodeElement.querySelector('.delete-node');

        moveUpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.moveNodeUp(nodeId);
        });

        moveDownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.moveNodeDown(nodeId);
        });

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteNode(nodeId);
        });

        this.canvas.appendChild(nodeElement);

        // Store node data
        const nodeData = {
            id: nodeId,
            agentType: agentType,
            title: agentInfo.title,
            description: agentInfo.description,
            customPrompt: '',
            model: '', // Default to empty (use default model)
            color: agentInfo.color || '#2d3748', // Use agent default color
            position: { x, y },
            element: nodeElement,
            order: this.nodeCounter
        };

        this.nodes.set(nodeId, nodeData);
        
        // Apply default color
        this.applyNodeColor(nodeData);
        
        // Auto-connect in FIFO order (sequential)
        this.autoConnectFIFO(nodeId);
        
        this.updateWorkflowInfo();
        this.selectNode(nodeId);

        return nodeData;
    }

    selectNode(nodeId) {
        // Clear previous selection
        if (this.selectedNode) {
            const prevNode = this.nodes.get(this.selectedNode);
            if (prevNode && prevNode.element) {
                prevNode.element.classList.remove('selected');
            }
        }

        // Select new node
        this.selectedNode = nodeId;
        const node = this.nodes.get(nodeId);
        if (node && node.element) {
            node.element.classList.add('selected');
            this.showNodeProperties(node);
        }
    }

    showNodeProperties(node) {
        document.getElementById('no-selection').style.display = 'none';
        document.getElementById('node-properties').style.display = 'block';

        document.getElementById('node-id').value = node.id;
        document.getElementById('node-title').value = node.title;
        document.getElementById('node-description').value = node.description;
        document.getElementById('node-agent-type').value = node.agentType;
        document.getElementById('node-custom-prompt').value = node.customPrompt || '';
        document.getElementById('node-model').value = node.model || ''; // Set selected model
        
        // Set color - use node color or agent default
        const agentInfo = this.getAgentInfo(node.agentType);
        const displayColor = node.color || agentInfo.color || '#2d3748';
        document.getElementById('node-color').value = displayColor;

        // Update color preview
        const colorPreview = document.getElementById('color-preview');
        colorPreview.style.backgroundColor = displayColor;

        // Show/hide custom prompt field
        this.handleAgentTypeChange();
    }

    hideNodeProperties() {
        document.getElementById('no-selection').style.display = 'block';
        document.getElementById('node-properties').style.display = 'none';
        this.selectedNode = null;
    }

    updateSelectedNode() {
        if (!this.selectedNode) return;

        const node = this.nodes.get(this.selectedNode);
        if (!node) return;

        // Update node data
        node.title = document.getElementById('node-title').value;
        node.description = document.getElementById('node-description').value;
        node.agentType = document.getElementById('node-agent-type').value;
        node.customPrompt = document.getElementById('node-custom-prompt').value;
        node.model = document.getElementById('node-model').value; // Save selected model
        node.color = document.getElementById('node-color').value;

        // Update DOM
        const titleElement = node.element.querySelector('.node-title');
        const descElement = node.element.querySelector('.node-description');
        const typeElement = node.element.querySelector('.node-type');
        const iconElement = node.element.querySelector('.node-header i');

        if (titleElement) titleElement.textContent = node.title;
        if (descElement) descElement.textContent = node.description;
        if (typeElement) typeElement.textContent = node.agentType;

        // Update icon
        const agentInfo = this.getAgentInfo(node.agentType);
        if (iconElement) {
            iconElement.className = agentInfo.icon;
        }

        // Apply color to node
        this.applyNodeColor(node);

        this.showNotification('Node updated successfully!', 'success');
    }

    deleteSelectedNode() {
        if (!this.selectedNode) return;
        
        if (confirm('Are you sure you want to delete this node?')) {
            this.deleteNode(this.selectedNode);
        }
    }

    handleAgentTypeChange() {
        const agentType = document.getElementById('node-agent-type').value;
        const customPromptGroup = document.getElementById('custom-prompt-group');
        
        if (agentType === 'custom') {
            customPromptGroup.style.display = 'block';
        } else {
            customPromptGroup.style.display = 'none';
        }
        
        // Update color to agent default when agent type changes
        if (this.selectedNode) {
            const agentInfo = this.getAgentInfo(agentType);
            const colorInput = document.getElementById('node-color');
            const colorPreview = document.getElementById('color-preview');
            
            colorInput.value = agentInfo.color || '#2d3748';
            colorPreview.style.backgroundColor = agentInfo.color || '#2d3748';
            
            // Apply color change immediately
            this.handleColorChange();
        }
    }

    handleColorChange() {
        const colorInput = document.getElementById('node-color');
        const colorPreview = document.getElementById('color-preview');
        const selectedColor = colorInput.value;
        
        // Update color preview
        colorPreview.style.backgroundColor = selectedColor;
        
        // Apply color to selected node in real-time
        if (this.selectedNode) {
            const node = this.nodes.get(this.selectedNode);
            if (node) {
                node.color = selectedColor;
                this.applyNodeColor(node);
            }
        }
    }

    applyNodeColor(node) {
        const element = node.element;
        const agentInfo = this.getAgentInfo(node.agentType);
        const color = node.color || agentInfo.color || '#2d3748';
        
        // Convert hex to RGB for CSS custom properties
        const rgb = this.hexToRgb(color);
        
        // Set custom CSS properties for the node
        element.style.setProperty('--node-color', color);
        element.style.setProperty('--node-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
        
        // Mark node as having custom color
        element.setAttribute('data-custom-color', 'true');
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 45, g: 55, b: 72 }; // Default color RGB
    }

    autoConnectFIFO(newNodeId) {
        const nodeArray = Array.from(this.nodes.values()).sort((a, b) => a.order - b.order);
        const newNodeIndex = nodeArray.findIndex(n => n.id === newNodeId);
        
        if (newNodeIndex > 0) {
            // Connect previous node to this new node
            const prevNode = nodeArray[newNodeIndex - 1];
            this.addConnection(prevNode.id, newNodeId);
        }
        
        // Redraw connections
        this.redrawConnections();
    }

    addConnection(sourceId, targetId) {
        // Check if connection already exists
        const exists = this.connections.find(conn => 
            conn.source === sourceId && conn.target === targetId
        );
        
        if (!exists) {
            this.connections.push({ source: sourceId, target: targetId });
        }
    }

    redrawConnections() {
        // Clear existing connections
        this.connectionsSVG.innerHTML = '';

        // Set SVG size to match canvas
        const canvasRect = this.canvas.getBoundingClientRect();
        this.connectionsSVG.setAttribute('width', canvasRect.width);
        this.connectionsSVG.setAttribute('height', canvasRect.height);

        // Draw all connections
        this.connections.forEach(conn => {
            this.drawConnection(conn.source, conn.target);
        });
    }

    drawConnection(sourceId, targetId) {
        const sourceNode = this.nodes.get(sourceId);
        const targetNode = this.nodes.get(targetId);

        if (!sourceNode || !targetNode) return;

        // Calculate connection points (bottom of source to top of target)
        const sourceRect = sourceNode.element.getBoundingClientRect();
        const targetRect = targetNode.element.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();

        // Source point (bottom center)
        const sourceX = sourceRect.left - canvasRect.left + sourceRect.width / 2;
        const sourceY = sourceRect.bottom - canvasRect.top;

        // Target point (top center)
        const targetX = targetRect.left - canvasRect.left + targetRect.width / 2;
        const targetY = targetRect.top - canvasRect.top;

        // Create SVG path for curved connection
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        // Calculate control points for smooth curve
        const dy = targetY - sourceY;
        const controlOffset = Math.abs(dy) * 0.4;
        
        const cp1x = sourceX;
        const cp1y = sourceY + controlOffset;
        const cp2x = targetX;
        const cp2y = targetY - controlOffset;
        
        const d = `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`;
        
        path.setAttribute('d', d);
        path.setAttribute('class', 'connection-line');
        path.setAttribute('stroke', '#0099cc');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('marker-end', 'url(#arrowhead)');
        
        this.connectionsSVG.appendChild(path);

        // Add arrowhead marker if not exists
        this.addArrowMarker();
    }

    addArrowMarker() {
        // Check if marker already exists
        if (this.connectionsSVG.querySelector('#arrowhead')) return;

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');

        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '7');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '3.5');
        marker.setAttribute('orient', 'auto');

        polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
        polygon.setAttribute('fill', '#0099cc');

        marker.appendChild(polygon);
        defs.appendChild(marker);
        this.connectionsSVG.appendChild(defs);
    }
    

    moveNodeUp(nodeId) {
        const nodeArray = Array.from(this.nodes.values()).sort((a, b) => a.order - b.order);
        const currentIndex = nodeArray.findIndex(n => n.id === nodeId);
        
        if (currentIndex > 0) {
            this.reorderNodeToRow(nodeId, currentIndex - 1);
        }
    }

    moveNodeDown(nodeId) {
        const nodeArray = Array.from(this.nodes.values()).sort((a, b) => a.order - b.order);
        const currentIndex = nodeArray.findIndex(n => n.id === nodeId);
        
        if (currentIndex < nodeArray.length - 1) {
            this.reorderNodeToRow(nodeId, currentIndex + 1);
        }
    }

    
    handleCanvasClick(e) {
        if (e.target === this.canvas || e.target.classList.contains('canvas-grid')) {
            // Deselect node
            if (this.selectedNode) {
                const node = this.nodes.get(this.selectedNode);
                if (node && node.element) {
                    node.element.classList.remove('selected');
                }
                this.selectedNode = null;
                document.getElementById('no-selection').style.display = 'block';
                document.getElementById('node-properties').style.display = 'none';
            }
        }
    }

    handleNodeMouseDown(e) {
        if (e.button !== 0) return; // Only left click

        const nodeElement = e.currentTarget;
        const nodeId = nodeElement.dataset.nodeId;
        
        this.selectNode(nodeId);

        // Start dragging for row reordering
        const startY = e.clientY;
        const originalNode = this.nodes.get(nodeId);
        const originalOrder = originalNode.order;

        // Add dragging class immediately
        nodeElement.classList.add('dragging');

        const handleMouseMove = (e) => {
            const deltaY = e.clientY - startY;
            
            // Show visual feedback during drag
            nodeElement.style.transform = `translateY(${deltaY}px)`;
            nodeElement.style.zIndex = '1000';
        };

        const handleMouseUp = (e) => {
            // Remove dragging class and reset transform
            nodeElement.classList.remove('dragging');
            nodeElement.style.transform = '';
            nodeElement.style.zIndex = '';
            
            // Calculate final position based on mouse position
            const rect = this.canvas.getBoundingClientRect();
            const finalY = e.clientY - rect.top;
            const targetRow = this.getRowFromY(finalY);
            
            // Reorder node based on target row
            this.reorderNodeToRow(nodeId, targetRow);

            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        e.preventDefault();
        e.stopPropagation();
    }

    reorderNodeToRow(nodeId, targetRow) {
        const nodeArray = Array.from(this.nodes.values()).sort((a, b) => a.order - b.order);
        const currentNode = this.nodes.get(nodeId);
        const currentIndex = nodeArray.findIndex(n => n.id === nodeId);
        
        // Clamp target row to valid range (0-based)
        targetRow = Math.max(0, Math.min(targetRow, nodeArray.length - 1));
        
        if (targetRow !== currentIndex) {
            // Remove current node from array
            nodeArray.splice(currentIndex, 1);
            
            // Insert at target position
            nodeArray.splice(targetRow, 0, currentNode);
            
            // Update order values for all nodes
            nodeArray.forEach((node, index) => {
                node.order = index + 1;
                const orderElement = node.element.querySelector('.node-order');
                if (orderElement) {
                    orderElement.textContent = `#${node.order}`;
                }
            });
            
            // Rearrange nodes in grid
            this.arrangeNodesInGrid();
            
            this.showNotification(`Node moved to position ${targetRow + 1}`, 'success');
        }
    }

    handleCanvasMouseDown(e) {
        // Canvas panning (if implemented)
    }

    handleCanvasMouseMove(e) {
        // Track mouse position for temporary connections
        const rect = this.canvas.getBoundingClientRect();
        this.mousePosition = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        // Redraw connections if we have a temporary connection
        if (this.tempConnection && this.connectionMode) {
            this.redrawConnections();
        }
    }

    drawTemporaryConnection() {
        if (!this.tempConnection || !this.mousePosition) return;

        const sourceNode = this.nodes.get(this.tempConnection.source);
        if (!sourceNode) return;

        const sourcePoint = this.getConnectionPoint(sourceNode, 'output');
        if (!sourcePoint) return;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        const dx = this.mousePosition.x - sourcePoint.x;
        const controlOffset = Math.max(Math.abs(dx) * 0.4, 50);
        
        const cp1x = sourcePoint.x + controlOffset;
        const cp1y = sourcePoint.y;
        const cp2x = this.mousePosition.x - controlOffset;
        const cp2y = this.mousePosition.y;
        
        const d = `M ${sourcePoint.x} ${sourcePoint.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${this.mousePosition.x} ${this.mousePosition.y}`;
        
        path.setAttribute('d', d);
        path.setAttribute('class', 'connection-line temporary');
        
        this.connectionssvg.appendChild(path);
    }

    handleCanvasMouseUp(e) {
        // Handle canvas interactions
    }

    redrawConnections() {
        // Clear existing connections
        this.connectionsSVG.innerHTML = '';

        // Set SVG size to match canvas
        const canvasRect = this.canvas.getBoundingClientRect();
        this.connectionsSVG.setAttribute('width', canvasRect.width);
        this.connectionsSVG.setAttribute('height', canvasRect.height);

        // Draw all connections
        this.connections.forEach(conn => {
            this.drawConnection(conn.source, conn.target);
        });

        // Draw temporary connection if in connection mode
        if (this.tempConnection && this.mousePosition) {
            this.drawTemporaryConnection();
        }
    }

    drawConnection(sourceId, targetId) {
        const sourceNode = this.nodes.get(sourceId);
        const targetNode = this.nodes.get(targetId);

        if (!sourceNode || !targetNode) return;

        // Get precise connection point positions
        const sourcePoint = this.getConnectionPoint(sourceNode, 'output');
        const targetPoint = this.getConnectionPoint(targetNode, 'input');

        if (!sourcePoint || !targetPoint) return;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        // Create smooth bezier curve
        const dx = targetPoint.x - sourcePoint.x;
        const dy = targetPoint.y - sourcePoint.y;
        
        // Control point offset (40% of horizontal distance, minimum 50px)
        const controlOffset = Math.max(Math.abs(dx) * 0.4, 50);
        
        const cp1x = sourcePoint.x + controlOffset;
        const cp1y = sourcePoint.y;
        const cp2x = targetPoint.x - controlOffset;
        const cp2y = targetPoint.y;
        
        const d = `M ${sourcePoint.x} ${sourcePoint.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetPoint.x} ${targetPoint.y}`;
        
        path.setAttribute('d', d);
        path.setAttribute('class', 'connection-line');
        path.setAttribute('data-source', sourceId);
        path.setAttribute('data-target', targetId);
        
        // Add click handler for connection deletion
        path.style.pointerEvents = 'stroke';
        path.style.cursor = 'pointer';
        path.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteConnection(sourceId, targetId);
        });
        
        this.connectionsSVG.appendChild(path);
    }

    getConnectionPoint(node, type) {
        if (!node || !node.element) return null;

        const nodeElement = node.element;
        const connectionPoint = nodeElement.querySelector(`.node-connection-point.${type}`);
        
        if (!connectionPoint) return null;

        // Get the actual position of the connection point relative to the canvas
        const pointRect = connectionPoint.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();

        // Account for canvas scroll position
        const scrollLeft = this.canvas.scrollLeft || 0;
        const scrollTop = this.canvas.scrollTop || 0;

        return {
            x: pointRect.left - canvasRect.left + scrollLeft + (pointRect.width / 2),
            y: pointRect.top - canvasRect.top + scrollTop + (pointRect.height / 2)
        };
    }

    deleteConnection(sourceId, targetId) {
        if (confirm('Delete this connection?')) {
            this.connections = this.connections.filter(conn => 
                !(conn.source === sourceId && conn.target === targetId)
            );
            this.redrawConnections();
            this.updateWorkflowInfo();
            this.showNotification('Connection deleted', 'info');
        }
    }

    clearCanvas() {
        if (confirm('Are you sure you want to clear the entire canvas?')) {
            this.clearCanvasSilent();
        }
    }

    clearCanvasSilent() {
        // Remove all node elements
        this.nodes.forEach(node => {
            if (node.element && node.element.parentNode) {
                node.element.parentNode.removeChild(node.element);
            }
        });

        // Clear data
        this.nodes.clear();
        this.connections = [];
        this.selectedNode = null;
        this.tempConnection = null;
        this.currentWorkflowId = null; // Reset workflow ID

        // Update UI
        document.getElementById('no-selection').style.display = 'block';
        document.getElementById('node-properties').style.display = 'none';
        this.updateWorkflowInfo();
        this.redrawConnections();
    }

    zoom(factor) {
        this.scale *= factor;
        this.scale = Math.max(0.25, Math.min(2, this.scale));
        this.canvas.style.transform = `scale(${this.scale})`;
    }

    resetZoom() {
        this.scale = 1;
        this.canvas.style.transform = 'scale(1)';
    }

    updateWorkflowInfo() {
        document.getElementById('node-count').textContent = this.nodes.size;
        document.getElementById('connection-count').textContent = this.connections.length;
    }

    async showLoadModal() {
        document.getElementById('load-workflow-modal').style.display = 'flex';
        await this.loadWorkflowsList();
    }

    hideLoadModal() {
        document.getElementById('load-workflow-modal').style.display = 'none';
    }

    async loadWorkflowsList() {
        const workflowList = document.getElementById('workflow-list');
        workflowList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading workflows...</div>';

        try {
            const response = await fetch('/api/workflows');
            const data = await response.json();
            
            if (data.workflows && data.workflows.length > 0) {
                this.renderWorkflowsList(data.workflows);
            } else {
                workflowList.innerHTML = `
                    <div class="empty-workflows">
                        <i class="fas fa-folder-open"></i>
                        <p>No saved workflows found</p>
                        <small>Create and save your first workflow to see it here</small>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading workflows:', error);
            workflowList.innerHTML = `
                <div class="empty-workflows">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error loading workflows</p>
                    <small>${error.message}</small>
                </div>
            `;
        }
    }

    renderWorkflowsList(workflows) {
        const workflowList = document.getElementById('workflow-list');
        workflowList.innerHTML = '';

        workflows.forEach(workflow => {
            const workflowItem = document.createElement('div');
            workflowItem.className = 'workflow-item';
            
            // Determine workflow type based on name or metadata
            const workflowType = this.getWorkflowType(workflow.name);
            const nodeCount = workflow.metadata?.node_count || 0;
            const connectionCount = workflow.metadata?.connection_count || 0;
            
            workflowItem.innerHTML = `
                <div class="workflow-type-badge">${workflowType}</div>
                <div class="workflow-stats">
                    <i class="fas fa-sitemap"></i> ${nodeCount}
                </div>
                <div class="workflow-info">
                    <div class="workflow-name">
                        <i class="fas fa-project-diagram"></i>
                        ${workflow.name}
                    </div>
                    <div class="workflow-description">
                        ${workflow.description || 'No description available for this workflow.'}
                    </div>
                    <div class="workflow-meta">
                        <div class="workflow-meta-item">
                            <i class="fas fa-sitemap"></i>
                            <span>${nodeCount} nodes</span>
                        </div>
                        <div class="workflow-meta-item">
                            <i class="fas fa-link"></i>
                            <span>${connectionCount} connections</span>
                        </div>
                        <div class="workflow-meta-item">
                            <i class="fas fa-clock"></i>
                            <span>${this.formatDate(workflow.created_at)}</span>
                        </div>
                    </div>
                </div>
                <div class="workflow-actions">
                    <button class="workflow-action-btn load" data-action="load" data-id="${workflow.id}">
                        <i class="fas fa-folder-open"></i> Load
                    </button>
                    <button class="workflow-action-btn duplicate" data-action="duplicate" data-id="${workflow.id}">
                        <i class="fas fa-copy"></i> Duplicate
                    </button>
                </div>
            `;

            // Add event listeners
            const loadBtn = workflowItem.querySelector('[data-action="load"]');
            const duplicateBtn = workflowItem.querySelector('[data-action="duplicate"]');
            
            loadBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.loadWorkflow(workflow.id);
            });
            
            duplicateBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.duplicateWorkflow(workflow.id);
            });

            // Make the whole item clickable (selectable)
            workflowItem.addEventListener('click', () => {
                // Remove selection from other items
                document.querySelectorAll('.workflow-item.selected').forEach(item => {
                    item.classList.remove('selected');
                });
                // Select this item
                workflowItem.classList.add('selected');
            });

            workflowList.appendChild(workflowItem);
        });
    }

    getWorkflowType(workflowName) {
        const name = workflowName.toLowerCase();
        if (name.includes('business') || name.includes('plan')) return 'Business';
        if (name.includes('marketing') || name.includes('campaign')) return 'Marketing';
        if (name.includes('research') || name.includes('analysis')) return 'Research';
        if (name.includes('content') || name.includes('blog')) return 'Content';
        if (name.includes('product') || name.includes('launch')) return 'Product';
        return 'Custom';
    }

    async loadWorkflow(workflowId) {
        try {
            const response = await fetch(`/api/workflows/${workflowId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const workflowData = await response.json();

            if (workflowData && workflowData.workflow) {
                this.importWorkflow(workflowData);
                this.currentWorkflowId = workflowId;
                this.hideLoadModal();
                this.showNotification('Workflow loaded successfully!', 'success');
            } else {
                throw new Error('Invalid workflow data received');
            }
        } catch (error) {
            console.error('Error loading workflow:', error);
            this.showNotification(`Error loading workflow: ${error.message}`, 'error');
        }
    }

    async duplicateWorkflow(workflowId) {
        try {
            const response = await fetch(`/api/workflows/${workflowId}/duplicate`, {
                method: 'POST'
            });
            const result = await response.json();

            if (response.ok) {
                this.showNotification('Workflow duplicated successfully!', 'success');
                await this.loadWorkflowsList(); // Refresh the list
            } else {
                this.showNotification('Failed to duplicate workflow: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error duplicating workflow:', error);
            this.showNotification('Error duplicating workflow', 'error');
        }
    }

    async deleteWorkflow(workflowId) {
        if (confirm('Are you sure you want to delete this workflow? This action cannot be undone.')) {
            try {
                const response = await fetch('/api/workflows', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ id: workflowId })
                });
                const result = await response.json();

                if (response.ok) {
                    this.showNotification('Workflow deleted successfully!', 'success');
                    await this.loadWorkflowsList(); // Refresh the list
                } else {
                    this.showNotification('Failed to delete workflow: ' + result.error, 'error');
                }
            } catch (error) {
                console.error('Error deleting workflow:', error);
                this.showNotification('Error deleting workflow', 'error');
            }
        }
    }

    importWorkflow(workflowData) {
        // Clear current canvas without confirmation dialog
        this.clearCanvasSilent();

        if (!workflowData || !workflowData.workflow) {
            this.showNotification('Invalid workflow data', 'error');
            return;
        }

        const workflow = workflowData.workflow;
        const nodes = workflow.nodes || [];
        const connections = workflow.connections || [];

        if (nodes.length === 0) {
            this.showNotification('Workflow contains no nodes', 'warning');
            return;
        }

        // Reset node counter to highest ID in imported workflow
        let maxNodeNumber = 0;
        nodes.forEach(nodeData => {
            const nodeMatch = nodeData.id.match(/node_(\d+)/);
            if (nodeMatch) {
                maxNodeNumber = Math.max(maxNodeNumber, parseInt(nodeMatch[1]));
            }
        });
        this.nodeCounter = maxNodeNumber;

        // Import nodes and restore their order
        nodes.forEach((nodeData, index) => {
            try {
                const nodeElement = this.createNodeFromData(nodeData);
                this.canvas.appendChild(nodeElement);
                
                // Get agent info for default color
                const agentInfo = this.getAgentInfo(nodeData.agentType);
                
                // Store node data with proper order
                this.nodes.set(nodeData.id, {
                    ...nodeData,
                    color: nodeData.color || agentInfo.color || '#2d3748', // Ensure color exists with agent default
                    model: nodeData.model || '', // Ensure model property exists
                    element: nodeElement,
                    order: nodeData.order || (index + 1) // Ensure order exists
                });
            } catch (error) {
                console.error('Error importing node:', nodeData.id, error);
                this.showNotification(`Error importing node ${nodeData.id}`, 'warning');
            }
        });

        // Import connections
        this.connections = connections.filter(conn => 
            this.nodes.has(conn.source) && this.nodes.has(conn.target)
        );
        
        // Arrange nodes in grid layout
        this.arrangeNodesInGrid();
        
        this.updateWorkflowInfo();
    }

    createNodeFromData(nodeData) {
        const agentInfo = this.getAgentInfo(nodeData.agentType);
        
        const nodeElement = document.createElement('div');
        nodeElement.className = 'workflow-node';
        nodeElement.dataset.nodeId = nodeData.id;
        nodeElement.style.left = `${nodeData.position.x}px`;
        nodeElement.style.top = `${nodeData.position.y}px`;
        
        nodeElement.innerHTML = `
            <div class="node-header">
                <i class="${agentInfo.icon}"></i>
                <span class="node-title">${nodeData.title}</span>
                <span class="node-order">#${nodeData.order || 1}</span>
            </div>
            <div class="node-description">${nodeData.description}</div>
            <div class="node-type">${nodeData.agentType}</div>
            <div class="node-actions">
                <button class="node-action-btn move-up" title="Move Up">
                    <i class="fas fa-arrow-up"></i>
                </button>
                <button class="node-action-btn move-down" title="Move Down">
                    <i class="fas fa-arrow-down"></i>
                </button>
                <button class="node-action-btn delete-node" title="Delete Node">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        // Add event listeners
        nodeElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNode(nodeData.id);
        });

        nodeElement.addEventListener('mousedown', this.handleNodeMouseDown.bind(this));

        // Node action buttons
        const moveUpBtn = nodeElement.querySelector('.move-up');
        const moveDownBtn = nodeElement.querySelector('.move-down');
        const deleteBtn = nodeElement.querySelector('.delete-node');

        moveUpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.moveNodeUp(nodeData.id);
        });

        moveDownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.moveNodeDown(nodeData.id);
        });

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteNode(nodeData.id);
        });

        // Apply color if it exists or use agent default
        const nodeAgentInfo = this.getAgentInfo(nodeData.agentType);
        const nodeColor = nodeData.color || nodeAgentInfo.color || '#2d3748';
        const rgb = this.hexToRgb(nodeColor);
        nodeElement.style.setProperty('--node-color', nodeColor);
        nodeElement.style.setProperty('--node-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
        nodeElement.setAttribute('data-custom-color', 'true');

        return nodeElement;
    }

    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    showSaveModal() {
        if (this.nodes.size === 0) {
            this.showNotification('Please add at least one node before saving', 'warning');
            return;
        }
        
        // Pre-populate fields if updating existing workflow
        const nameField = document.getElementById('workflow-name');
        const descField = document.getElementById('workflow-description');
        
        if (this.currentWorkflowId) {
            // If we have a current workflow ID, we're updating
            // Keep existing values or clear them for new input
            if (!nameField.value) {
                nameField.value = 'Updated Workflow';
            }
        } else {
            // Clear fields for new workflow
            nameField.value = '';
            descField.value = '';
        }
        
        document.getElementById('save-workflow-modal').style.display = 'flex';
        nameField.focus();
    }

    hideSaveModal() {
        document.getElementById('save-workflow-modal').style.display = 'none';
        // Clear form fields
        document.getElementById('workflow-name').value = '';
        document.getElementById('workflow-description').value = '';
    }

    async saveWorkflow() {
        const name = document.getElementById('workflow-name').value.trim();
        const description = document.getElementById('workflow-description').value.trim();

        if (!name) {
            this.showNotification('Please enter a workflow name', 'warning');
            document.getElementById('workflow-name').focus();
            return;
        }

        if (this.nodes.size === 0) {
            this.showNotification('Cannot save empty workflow', 'warning');
            return;
        }

        const workflowData = this.exportWorkflow();
        const isUpdate = this.currentWorkflowId !== null;

        try {
            const url = '/api/workflows';
            const method = isUpdate ? 'PUT' : 'POST';
            const body = {
                name: name,
                description: description,
                workflow: workflowData
            };

            if (isUpdate) {
                body.id = this.currentWorkflowId;
            }

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success !== false) {
                if (isUpdate) {
                    this.showNotification('Workflow updated successfully!', 'success');
                } else {
                    this.showNotification('Workflow saved successfully!', 'success');
                    this.currentWorkflowId = result.workflow_id || result.id;
                }
                this.hideSaveModal();
            } else {
                throw new Error(result.error || 'Save failed');
            }
        } catch (error) {
            console.error('Error saving workflow:', error);
            this.showNotification(`Error saving workflow: ${error.message}`, 'error');
        }
    }

    showRunModal() {
        if (this.nodes.size === 0) {
            this.showNotification('Please add at least one node before running', 'warning');
            return;
        }

        this.generateWorkflowPreview();
        document.getElementById('run-workflow-modal').style.display = 'flex';
    }

    hideRunModal() {
        document.getElementById('run-workflow-modal').style.display = 'none';
    }

    generateWorkflowPreview() {
        const previewContent = document.getElementById('workflow-preview-content');
        previewContent.innerHTML = '';

        // Sort nodes by execution order
        const sortedNodes = Array.from(this.nodes.values()).sort((a, b) => {
            return (a.position.y - b.position.y) || (a.position.x - b.position.x);
        });

        sortedNodes.forEach((node, index) => {
            const item = document.createElement('div');
            item.className = 'workflow-preview-item';
            
            const agentInfo = this.getAgentInfo(node.agentType);
            const modelInfo = node.model ? `<small style="color: #666; margin-left: 8px;">(Model: ${node.model})</small>` : '';
            
            item.innerHTML = `
                <i class="${agentInfo.icon}"></i>
                <span>${index + 1}. ${node.title}${modelInfo}</span>
            `;
            
            previewContent.appendChild(item);
        });
    }

    async runWorkflow() {
        const missionDescription = document.getElementById('workflow-mission-description').value;

        if (!missionDescription) {
            this.showNotification('Please enter a mission description', 'warning');
            return;
        }

        const workflowData = this.exportWorkflow();

        try {
            const response = await fetch('/api/run_custom_workflow', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    workflow: workflowData,
                    description: missionDescription
                })
            });

            if (response.ok) {
                this.showNotification('Workflow started successfully!', 'success');
                this.hideRunModal();
                
                // Show execution panel instead of redirecting
                this.showExecutionPanel(missionDescription, workflowData);
            } else {
                const error = await response.json();
                this.showNotification('Failed to start workflow: ' + error.error, 'error');
            }
        } catch (error) {
            console.error('Error running workflow:', error);
            this.showNotification('Error running workflow', 'error');
        }
    }

    exportWorkflow() {
        const nodes = Array.from(this.nodes.values()).map(node => ({
            id: node.id,
            agentType: node.agentType,
            title: node.title,
            description: node.description,
            customPrompt: node.customPrompt || '',
            model: node.model || '', // Include selected model
            color: node.color || '#2d3748',
            position: node.position,
            order: node.order || 1
        }));

        return {
            nodes: nodes,
            connections: this.connections,
            metadata: {
                node_count: nodes.length,
                connection_count: this.connections.length,
                created_at: new Date().toISOString()
            }
        };
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

        // Add to document
        document.body.appendChild(notification);

        // Auto remove
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    autoConnectSequential() {
        // Auto-connect nodes in sequential order
        const nodeArray = Array.from(this.nodes.values()).sort((a, b) => a.order - b.order);
        
        if (nodeArray.length < 2) {
            this.showNotification('Need at least 2 nodes to auto-connect', 'warning');
            return;
        }
        
        // Clear existing connections
        this.connections = [];
        
        // Create sequential connections
        for (let i = 0; i < nodeArray.length - 1; i++) {
            this.addConnection(nodeArray[i].id, nodeArray[i + 1].id);
        }
        
        this.redrawConnections();
        this.showNotification('Nodes auto-connected sequentially', 'success');
    }

    resetLayout() {
        // Reset to default positions without connections
        this.connections = [];
        
        const nodeArray = Array.from(this.nodes.values());
        const startX = 50;
        const startY = 50;
        const spacing = 150;
        
        nodeArray.forEach((node, index) => {
            const x = startX + (index % 3) * 200; // 3 columns
            const y = startY + Math.floor(index / 3) * spacing;
            
            node.position.x = x;
            node.position.y = y;
            node.element.style.left = `${x}px`;
            node.element.style.top = `${y}px`;
            node.element.style.width = 'auto';
        });
        
        this.redrawConnections();
        this.showNotification('Layout reset to grid', 'info');
    }

    deleteNode(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        // Remove all connections involving this node
        this.connections = this.connections.filter(conn => 
            conn.source !== nodeId && conn.target !== nodeId
        );

        // Remove from DOM
        if (node.element && node.element.parentNode) {
            node.element.parentNode.removeChild(node.element);
        }

        // Remove from nodes map
        this.nodes.delete(nodeId);

        // Clear selection if this node was selected
        if (this.selectedNode === nodeId) {
            this.hideNodeProperties();
        }

        // Recreate FIFO connections for remaining nodes  
        this.recreateFIFOConnections();
        this.updateWorkflowInfo();
        
        // Rearrange remaining nodes in grid
        if (this.nodes.size > 0) {
            setTimeout(() => this.arrangeNodesInGrid(), 100);
        }
    }

    setupConnectionsSVG() {
        // Create SVG element for connections
        this.connectionsSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.connectionsSVG.classList.add('connections-svg');
        this.connectionsSVG.style.position = 'absolute';
        this.connectionsSVG.style.top = '0';
        this.connectionsSVG.style.left = '0';
        this.connectionsSVG.style.width = '100%';
        this.connectionsSVG.style.height = '100%';
        this.connectionsSVG.style.pointerEvents = 'none';
        this.connectionsSVG.style.zIndex = '1';
        
        this.canvas.appendChild(this.connectionsSVG);
    }

    getAgentInfo(agentType) {
        const agentTypes = {
            'manager': {
                title: 'Mission Manager',
                description: 'Manages mission workflow and coordination',
                icon: 'fas fa-user-tie',
                color: '#4F46E5' // Indigo
            },
            'researcher': {
                title: 'Researcher',
                description: 'Conducts research and gathers information',
                icon: 'fas fa-search',
                color: '#0891B2' // Cyan
            },
            'analyst': {
                title: 'Data Analyst',
                description: 'Analyzes data and provides insights',
                icon: 'fas fa-chart-bar',
                color: '#059669' // Emerald
            },
            'writer': {
                title: 'Content Writer',
                description: 'Creates written content and documentation',
                icon: 'fas fa-pen-fancy',
                color: '#DC2626' // Red
            },
            'reviewer': {
                title: 'Quality Reviewer',
                description: 'Reviews and validates work quality',
                icon: 'fas fa-eye',
                color: '#7C2D12' // Orange
            },
            'custom': {
                title: 'Custom Agent',
                description: 'Custom agent with specific instructions',
                icon: 'fas fa-robot',
                color: '#6B7280' // Gray
            }
        };

        return agentTypes[agentType] || agentTypes['custom'];
    }

    recreateFIFOConnections() {
        // Clear all existing connections
        this.connections = [];
        
        // Get nodes sorted by their visual order (top to bottom)
        const nodeArray = Array.from(this.nodes.values()).sort((a, b) => a.order - b.order);
        
        // Create sequential connections (FIFO)
        for (let i = 0; i < nodeArray.length - 1; i++) {
            this.addConnection(nodeArray[i].id, nodeArray[i + 1].id);
        }
        
        // Redraw all connections
        this.redrawConnections();
    }

    highlightTargetRow(row) {
        // Remove any existing highlights
        this.removeRowHighlight();
        
        const canvasWidth = this.canvas.clientWidth;
        const availableWidth = canvasWidth - this.gridConfig.leftMargin - this.gridConfig.rightMargin;
        const nodeWidth = Math.min(600, availableWidth);
        
        // Create highlight element
        const highlight = document.createElement('div');
        highlight.className = 'row-highlight';
        highlight.style.position = 'absolute';
        highlight.style.left = `${this.gridConfig.leftMargin + (availableWidth - nodeWidth) / 2}px`;
        highlight.style.width = `${nodeWidth}px`;
        highlight.style.top = `${this.gridConfig.topMargin + (row * this.gridConfig.rowHeight)}px`;
        highlight.style.height = `${this.gridConfig.nodeHeight}px`;
        highlight.style.background = 'rgba(0, 153, 204, 0.15)';
        highlight.style.border = '2px dashed var(--accent-primary)';
        highlight.style.borderRadius = '12px';
        highlight.style.pointerEvents = 'none';
        highlight.style.zIndex = '5';
        highlight.style.animation = 'pulse 1s infinite';
        
        this.canvas.appendChild(highlight);
        this.currentRowHighlight = highlight;
    }

    removeRowHighlight() {
        if (this.currentRowHighlight && this.currentRowHighlight.parentNode) {
            this.currentRowHighlight.parentNode.removeChild(this.currentRowHighlight);
            this.currentRowHighlight = null;
        }
    }

    // Model management methods
    async loadOllamaModels() {
        try {
            const response = await fetch('/api/ollama/models');
            if (response.ok) {
                const data = await response.json();
                this.populateModelDropdown(data.models);
            } else {
                console.error('Failed to load Ollama models');
                this.populateModelDropdown([]); // Use empty array as fallback
            }
        } catch (error) {
            console.error('Error loading Ollama models:', error);
            this.populateModelDropdown([]); // Use empty array as fallback
        }
    }

    populateModelDropdown(models) {
        const modelSelect = document.getElementById('node-model');
        modelSelect.innerHTML = ''; // Clear existing options
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Use default model';
        modelSelect.appendChild(defaultOption);
        
        // Add available models
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = model.name;
            modelSelect.appendChild(option);
        });
        
        // If no models available, show error message
        if (models.length === 0) {
            const errorOption = document.createElement('option');
            errorOption.value = '';
            errorOption.textContent = 'No models available (check Ollama)';
            errorOption.disabled = true;
            modelSelect.appendChild(errorOption);
        }
    }

    // Utility function to convert markdown to HTML
    convertMarkdownToHTML(markdown) {
        if (typeof markdown !== 'string') {
            return markdown;
        }
        
        // Check if marked is available
        if (typeof marked !== 'undefined') {
            try {
                // Configure marked for security
                marked.setOptions({
                    breaks: true,
                    gfm: true,
                    sanitize: false, // We'll handle sanitization if needed
                    smartLists: true,
                    smartypants: true
                });
                
                return marked.parse(markdown);
            } catch (error) {
                console.error('Error parsing markdown:', error);
                return this.basicMarkdownToHTML(markdown);
            }
        } else {
            // Fallback to basic markdown conversion
            return this.basicMarkdownToHTML(markdown);
        }
    }

    // Basic markdown to HTML converter as fallback
    basicMarkdownToHTML(markdown) {
        return markdown
            // Headers
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            // Bold
            .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
            .replace(/__(.*?)__/gim, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.*)\*/gim, '<em>$1</em>')
            .replace(/_(.*?)_/gim, '<em>$1</em>')
            // Code blocks
            .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
            // Inline code
            .replace(/`(.*?)`/gim, '<code>$1</code>')
            // Links
            .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank">$1</a>')
            // Line breaks
            .replace(/\n\n/gim, '</p><p>')
            .replace(/\n/gim, '<br>')
            // Wrap in paragraphs
            .replace(/^(.+)$/gim, '<p>$1</p>')
            // Clean up double paragraphs
            .replace(/<p><\/p>/gim, '')
            .replace(/<p>(<h[1-6]>.*?<\/h[1-6]>)<\/p>/gim, '$1')
            .replace(/<p>(<pre>.*?<\/pre>)<\/p>/gim, '$1');
    }

    // ...existing code...
}

// Add notification styles
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 3000;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: slideIn 0.3s ease-out;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .notification-success {
        background: #2ed573;
    }

    .notification-error {
        background: #ff4757;
    }

    .notification-warning {
        background: #ffa502;
    }

    .notification-info {
        background: #0099cc;
    }

    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;

document.head.appendChild(notificationStyles);

// Initialize the workflow builder when the page loads
window.addEventListener('DOMContentLoaded', () => {
    window.workflowBuilder = new WorkflowBuilder();
});

// Workflow execution management functions
WorkflowBuilder.prototype.showExecutionPanel = function(missionDescription, workflowData) {
    const executionPanel = document.getElementById('workflow-execution-panel');
    const missionInfoDiv = document.getElementById('execution-mission-info');
    
    // Show mission information
    missionInfoDiv.innerHTML = `
        <h5>mission Description</h5>
        <p>${missionDescription}</p>
        <div style="margin-top: 1rem;">
            <strong>Workflow Nodes:</strong> ${workflowData.nodes.length}<br>
            <strong>Connections:</strong> ${workflowData.connections.length}
        </div>
    `;
    
    // Initialize agents display
    this.initializeWorkflowAgents(workflowData.nodes);
    
    // Clear previous logs and results
    document.getElementById('workflow-logs').innerHTML = '';
    document.getElementById('workflow-results').innerHTML = '';
    document.getElementById('workflow-results-section').style.display = 'none';
    
    // Show the execution panel
    executionPanel.style.display = 'flex';
};

WorkflowBuilder.prototype.closeExecutionPanel = function() {
    const executionPanel = document.getElementById('workflow-execution-panel');
    executionPanel.style.display = 'none';
};

WorkflowBuilder.prototype.initializeWorkflowAgents = function(nodes) {
    const agentsContainer = document.getElementById('workflow-agents-container');
    
    agentsContainer.innerHTML = nodes.map(node => {
        const agentTypeIcons = {
            manager: 'fa-user-tie',
            researcher: 'fa-search',
            analyst: 'fa-chart-bar',
            writer: 'fa-pen-fancy',
            reviewer: 'fa-eye',
            custom: 'fa-robot'
        };
        
        const icon = agentTypeIcons[node.agentType] || 'fa-robot';
        
        return `
            <div class="agent-status-card" id="agent-card-${node.id}">
                <div class="agent-status-header">
                    <div class="agent-status-title">
                        <i class="fas ${icon}"></i>
                        ${node.title || node.agentType}
                    </div>
                    <span class="agent-status-badge idle" id="agent-badge-${node.id}">idle</span>
                </div>
                <div class="agent-task-description">
                    ${node.description || 'No task description provided'}
                </div>
            </div>
        `;
    }).join('');
};

WorkflowBuilder.prototype.updateWorkflowAgents = function(agents) {
    // This function will be called when the server sends workflow agents updates
    const agentsContainer = document.getElementById('workflow-agents-container');
    
    if (!agents || agents.length === 0) {
        agentsContainer.innerHTML = '<p class="muted">No agents available</p>';
        return;
    }
    
    // Update existing agents or create new ones
    agents.forEach(agent => {
        const existingCard = document.getElementById(`agent-card-${agent.id}`);
        if (existingCard) {
            this.updateAgentStatus(agent.id, agent.status);
        }
    });
};

WorkflowBuilder.prototype.updateAgentStatus = function(agentId, status) {
    const agentCard = document.getElementById(`agent-card-${agentId}`);
    const agentBadge = document.getElementById(`agent-badge-${agentId}`);
    
    if (!agentCard || !agentBadge) {
        console.log(`Agent card or badge not found for ${agentId}`);
        return;
    }
    
    // Remove all status classes
    agentCard.classList.remove('working', 'completed', 'error', 'idle');
    agentBadge.classList.remove('working', 'completed', 'error', 'idle');
    
    // Add new status class
    agentCard.classList.add(status);
    agentBadge.classList.add(status);
    agentBadge.textContent = status;
};

WorkflowBuilder.prototype.handleWorkflowCompleted = function(result) {
    // Show results section
    const resultsSection = document.getElementById('workflow-results-section');
    const resultsContainer = document.getElementById('workflow-results');
    
    resultsSection.style.display = 'block';
    
    if (result && result.phases) {
        const resultsHtml = Object.entries(result.phases).map(([phase, content]) => {
            // Convert markdown content to HTML
            const htmlContent = this.convertMarkdownToHTML(content);
            
            return `
                <div class="result-item">
                    <div class="result-header">
                        <i class="fas fa-check-circle"></i>
                        <span class="result-title">${phase}</span>
                    </div>
                    <div class="result-content">${htmlContent}</div>
                </div>
            `;
        }).join('');
        
        resultsContainer.innerHTML = resultsHtml;
    } else {
        resultsContainer.innerHTML = '<p class="muted">No detailed results available</p>';
    }
    
    // Update all agents to completed status
    const agentCards = document.querySelectorAll('.agent-status-card');
    agentCards.forEach(card => {
        const agentId = card.id.replace('agent-card-', '');
        this.updateAgentStatus(agentId, 'completed');
    });
};

WorkflowBuilder.prototype.handleWorkflowError = function(error) {
    // Mark all agents as error
    const agentCards = document.querySelectorAll('.agent-status-card');
    agentCards.forEach(card => {
        const agentId = card.id.replace('agent-card-', '');
        this.updateAgentStatus(agentId, 'error');
    });
    
    // Add error to logs
    this.addLogEntry('error', error.error || 'Workflow execution failed');
};

// Enhanced log management
WorkflowBuilder.prototype.addLogEntry = function(type, message) {
    const logsContainer = document.getElementById('workflow-logs');
    const timestamp = new Date().toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `
        <span class="log-timestamp">[${timestamp}]</span>
        <span class="log-message">${message}</span>
    `;
    
    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
};
