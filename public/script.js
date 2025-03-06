let biomeCount = 0;
let landmarkCount = 0;
let diceSpread = 1;
const canvas = document.getElementById("whiteboard");
const bcount = document.getElementById("biomeCount");
const lcount = document.getElementById("landmarkCount");
const diceSpreadRange = document.getElementById("diceSpreadRange");
const ctx = canvas.getContext("2d");
const socket = io();
let drawing = false;
let erasing = false;
let diceDropMode = false; // Starts OFF
let draggingDice = false;
let selectedDie = null;
let lastX = 0, lastY = 0;

const diceImages = [
    "/dice_faces/face1.png",
    "/dice_faces/face2.png",
    "/dice_faces/face3.png",
    "/dice_faces/face4.png",
    "/dice_faces/face5.png",
    "/dice_faces/face6.png",
    "/dice_faces/face7.png",
    "/dice_faces/face8.png",
    "/dice_faces/face9.png",
    "/dice_faces/face10.png",
    "/dice_faces/face11.png",
    "/dice_faces/face12.png"
];


function biomeInc() {
    biomeCount++;
    biomeUpdate();
}

function biomeDec() {
    biomeCount = biomeCount > 0 ? biomeCount - 1 : 0;
    biomeUpdate();
}

function biomeUpdate() {
    bcount.textContent = biomeCount;
}

function landmarkInc() {
    landmarkCount++;
    landmarkUpdate();
}

function landmarkDec() {
    landmarkCount = landmarkCount > 0 ? landmarkCount - 1 : 0;
    landmarkUpdate();
}

function landmarkUpdate() {
    lcount.textContent = landmarkCount;
}

// Local cache of dice for interaction
let localDiceCache = [];
// Pre-load dice images to avoid flickering
const loadedDiceImages = [];

// Set initial canvas size and add resize event listener
function resizeCanvas() {
    canvas.width = window.innerWidth * 0.8;
    canvas.height = window.innerHeight * 0.8;
    redrawCanvas(); // Redraw everything when canvas resizes
}

// Preload all dice images
function preloadDiceImages() {
    for (let i = 0; i < loadedDiceImages.length; i++) {
        const img = new Image();
        img.src = loadedDiceImages[i];
        loadedDiceImages.push(img);
    };
}
preloadDiceImages();

// Function to redraw the entire canvas
function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Redraw all lines
    drawHistory.forEach((data) => {
        if (data.erase) {
            erase(data.x, data.y, data.size);
        } else {
            const lineWidth = data.width || 5 * (canvas.width / 1000);
            drawLine(data.lastX, data.lastY, data.x, data.y, "black", lineWidth);
        }
    });
    
    // Redraw all dice
    localDiceCache.forEach(drawDie);
}

// Keep local copy of draw history
let drawHistory = [];

// Initial resize
resizeCanvas();

// Handle window resize events
window.addEventListener('resize', () => {
    resizeCanvas();
});

// Helper function to get mouse position relative to canvas
function getMousePos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (evt.clientX - rect.left) * (canvas.width / rect.width),
        y: (evt.clientY - rect.top) * (canvas.height / rect.height)
    };
}

diceSpreadRange.addEventListener("change", () => {
    diceSpread = diceSpreadRange.value;
});

// Erase mode toggle
document.getElementById("eraseMode").addEventListener("click", () => {
    erasing = !erasing;
    document.getElementById("eraseMode").textContent = erasing ? "Erase Mode: ON" : "Erase Mode: OFF";
});

document.getElementById("clearCanvas").addEventListener("click", () => {
    socket.emit("clearCanvas");
    drawHistory = []; // Clear local history
    localDiceCache = []; // Clear local dice cache
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Local clear
});

document.getElementById("toggleDiceDrop").addEventListener("click", () => {
    document.getElementById("toggleDiceDrop").textContent = diceDropMode ? "Dice Mode: OFF" : "Dice Mode: ON";
    diceDropMode = !diceDropMode;
});

// Function to draw a single die
function drawDie(die) {
    if (!die) return;
    
    // Scale die size relative to canvas dimensions
    const scaledSize = die.size * (canvas.width / 1000);
    
    // Draw highlight if this die is selected
    if (selectedDie && selectedDie.id === die.id) {
        ctx.beginPath();
        ctx.arc(die.x, die.y, scaledSize / 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 0, 0.3)";
        ctx.fill();
    }
    
    // Use the preloaded image for better performance
    if (loadedDiceImages[die.value - 1] && loadedDiceImages[die.value - 1].complete) {
        ctx.drawImage(
            loadedDiceImages[die.value - 1], 
            die.x - scaledSize / 2, 
            die.y - scaledSize / 2, 
            scaledSize, 
            scaledSize
        );
    } else {
        // Fallback if image isn't loaded yet
        const img = new Image();
        img.src = diceImages[die.value - 1];
        img.onload = () => {
            ctx.drawImage(img, die.x - scaledSize / 2, die.y - scaledSize / 2, scaledSize, scaledSize);
        };
    }
}

// Function to check if mouse is over a die
function isOverDie(mouseX, mouseY, die) {
    const scaledSize = die.size * (canvas.width / 1000);
    const dx = mouseX - die.x;
    const dy = mouseY - die.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < scaledSize / 2;
}

// Function to find die under cursor
function findDieUnderCursor(mouseX, mouseY) {
    // Search in reverse order so we get the top-most die first
    for (let i = localDiceCache.length - 1; i >= 0; i--) {
        if (isOverDie(mouseX, mouseY, localDiceCache[i])) {
            return localDiceCache[i];
        }
    }
    return null;
}

// Receive and draw dice from other users
socket.on("dropDice", (diceData) => {
    if (Array.isArray(diceData)) {
        localDiceCache = diceData;
        redrawCanvas();
    }
});

// Handle single die movement updates
socket.on("moveDie", (updatedDie) => {
    // Update the die in local cache
    const dieIndex = localDiceCache.findIndex(die => die.id === updatedDie.id);
    if (dieIndex !== -1) {
        localDiceCache[dieIndex] = updatedDie;
        
        // Only redraw if we're not the one dragging
        if (!draggingDice || (selectedDie && selectedDie.id !== updatedDie.id)) {
            redrawCanvas();
        }
    }
});

socket.on("clearCanvas", () => {
    drawHistory = [];
    localDiceCache = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

canvas.addEventListener("mousedown", (event) => {
    const mousePos = getMousePos(canvas, event);
    
    if (diceDropMode) {
        // Check if clicked on an existing die
        const clickedDie = findDieUnderCursor(mousePos.x, mousePos.y);
        
        if (clickedDie) {
            // Start dragging this die
            draggingDice = true;
            selectedDie = clickedDie;
            
            // Only redraw to show selection
            redrawCanvas();
        } else {
            // Drop new dice at the cursor position
            socket.emit("dropDice", { 
                x: mousePos.x, 
                y: mousePos.y,
                size: 40 * (canvas.width / 1000), 
                bCount: biomeCount,
                lCount: landmarkCount,
                spread: diceSpread
            });
        }
    } else {
        // Normal drawing behavior
        drawing = true;
        lastX = mousePos.x;
        lastY = mousePos.y;
    }    
});

canvas.addEventListener("mouseup", (event) => {
    drawing = false;
    
    if (draggingDice && selectedDie) {
        draggingDice = false;
        selectedDie = null;
        redrawCanvas(); // Redraw once to clear selection
    }
});

canvas.addEventListener("mouseleave", () => {
    drawing = false;
    if (draggingDice) {
        draggingDice = false;
        selectedDie = null;
        redrawCanvas(); // Redraw once to clear selection
    }
});

canvas.addEventListener("mousemove", (event) => {
    const mousePos = getMousePos(canvas, event);
    const x = mousePos.x;
    const y = mousePos.y;
    
    if (draggingDice && selectedDie) {
        // For smooth dragging, first update our local selectedDie
        selectedDie.x = x;
        selectedDie.y = y;
        
        // Update the cached version too
        const dieIndex = localDiceCache.findIndex(die => die.id === selectedDie.id);
        if (dieIndex !== -1) {
            localDiceCache[dieIndex].x = x;
            localDiceCache[dieIndex].y = y;
        }
        
        // Redraw efficiently - only clear and redraw the area around the die
        redrawCanvas();
        
        // Throttle server updates for better performance
        if (!selectedDie.lastEmit || Date.now() - selectedDie.lastEmit > 30) { // 30ms throttle
            socket.emit("moveDie", {
                id: selectedDie.id,
                x: x,
                y: y
            });
            selectedDie.lastEmit = Date.now();
        }
        
        // Update cursor to indicate dragging
        canvas.style.cursor = 'grabbing';
    } else if (diceDropMode) {
        // Check if hovering over a die
        const hoveredDie = findDieUnderCursor(x, y);
        if (hoveredDie) {
            canvas.style.cursor = 'grab';
        } else {
            canvas.style.cursor = 'default';
        }
    } else if (drawing) {
        if (erasing) {
            // Scale eraser size relative to canvas size
            const eraserSize = 20 * (canvas.width / 1000);
            erase(x, y, eraserSize); // Local erasing
            socket.emit("erase", { x, y, size: eraserSize }); // Send erase action to others
        } else {
            // Scale line width relative to canvas size
            const lineWidth = 5 * (canvas.width / 1000);
            drawLine(lastX, lastY, x, y, "black", lineWidth); // Local drawing
            socket.emit("draw", { lastX, lastY, x, y, width: lineWidth }); // Send draw action to others
        }
        lastX = x;
        lastY = y;
    }
});

// Function to draw a line
function drawLine(x1, y1, x2, y2, color, width) {
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

// Function to erase
function erase(x, y, size) {
    ctx.clearRect(x - size / 2, y - size / 2, size, size);
}

// Receive drawing history
socket.on("drawHistory", (history) => {
    drawHistory = history; // Store locally
    redrawCanvas();
});

// Receive drawing updates from server
socket.on("draw", (data) => {
    drawHistory.push(data); // Add to local history
    
    // Only draw the new line without clearing
    const lineWidth = data.width || 5 * (canvas.width / 1000);
    drawLine(data.lastX, data.lastY, data.x, data.y, "black", lineWidth);
});

// Receive erase updates from server
socket.on("erase", (data) => {
    drawHistory.push({ ...data, erase: true }); // Add to local history
    erase(data.x, data.y, data.size);
});

// Request drawing history when reconnecting
socket.on("connect", () => {
    socket.emit("requestHistory");
});

// Minor update to the server to improve performance
socket.on("requestHistory", () => {
    socket.emit("drawHistory", drawHistory);
});