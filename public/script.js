const canvas = document.getElementById("whiteboard");
const bcount = document.getElementById("biomeCount");
const lcount = document.getElementById("landmarkCount");
const diceSpreadRange = document.getElementById("diceSpreadRange");
const drawModeCheckbox = document.getElementById("drawMode");
const eraseModeCheckbox = document.getElementById("eraseMode");
const diceModeCheckbox = document.getElementById("toggleDiceDrop");
const stampModeCheckbox = document.getElementById("toggleStampMode");
const debug = document.getElementById("debug");
const ctx = canvas.getContext("2d");
const socket = io();
const EMIT_THROTTLE = 50; // ms
const loadedDiceImages = [];
const loadedStampImages = [];

let lastEmitTime = 0;
let biomeCount = 3;
let landmarkCount = 1;
let diceSpread = 1;
let drawing = false;
let erasing = false;
let stamping = false;
let diceDropMode = true;
let draggingDice = false;
let selectedDie = null;
let lastX = 0, lastY = 0;
let drawHistory = [];
let localDiceCache = [];
let localStampCache = [];
let lastDragX = 0, lastDragY = 0;
let mouseDown = false;
let drawingToggle = false;
let prevCanvasWidth = canvas.width;
let prevCanvasHeight = canvas.height;

// Create a background canvas for double buffering
const backgroundCanvas = document.createElement('canvas');
const backgroundCtx = backgroundCanvas.getContext('2d');

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

const stampImages = [
    "/assets/forest.png",
    "/assets/mountain.png",
    "/assets/lake.png",
    "/assets/open-land.png",
    "/assets/encampment.png",
    "/assets/town.png",
    "/assets/city.png",
    "/assets/discovery.png"
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

function resizeCanvas() {

    if(window.innerHeight >= (9*window.innerWidth/16)) {
        canvas.width  = window.innerWidth;
        canvas.height = Math.floor(9*canvas.width/16);
        backgroundCanvas.width  = window.innerWidth;
        backgroundCanvas.height = Math.floor(9*canvas.width/16);
    }
    else {
        canvas.height = window.innerHeight;
        canvas.width  = Math.floor(16*canvas.height/9);
        backgroundCanvas.height = window.innerHeight;
        backgroundCanvas.width  = Math.floor(16*canvas.height/9);
    }
    
    // Redraw everything when canvas resizes
    redrawBackgroundCanvas();
    redrawCanvas();
}

// Preload all dice images
function preloadDiceImages() {
    for (let i = 0; i < diceImages.length; i++) {
        const img = new Image();
        img.src = diceImages[i];
        loadedDiceImages.push(img);
        
        // Ensure we can draw dice immediately when loaded
        img.onload = () => {
            if (localDiceCache.length > 0) {
                redrawBackgroundCanvas();
                redrawCanvas();
            }
        };
    }
}

function preloadStampImages() {
    for (let i = 0; i < stampImages.length; i++) {
        const img = new Image();
        img.src = stampImages[i];
        loadedStampImages.push(img);
        
        img.onload = () => {
            if (localStampCache.length > 0) {
                redrawBackgroundCanvas();
                redrawCanvas();
            }
        };
    }
}

// Function to draw the background (lines and static dice)
function redrawBackgroundCanvas() {
    backgroundCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);

    // Redraw all lines
    drawHistory.forEach((data) => {
        if (data.erase) {
            eraseOnCanvas(backgroundCtx, data.x * canvas.width, data.y * canvas.height, data.size);
        } else {
            const lineWidth = backgroundCanvas.width/300;
            drawLineOnCanvas(backgroundCtx, data.lastX * canvas.width, data.lastY * canvas.height, data.x * canvas.width, data.y * canvas.height, "black", lineWidth);
        }
    });
    
    // Draw static dice (not the one being dragged)
    localDiceCache.forEach(die => {
        if (!selectedDie || die.id !== selectedDie.id) {
            drawDieOnCanvas(backgroundCtx, die);
        }
    });

    localStampCache.forEach(stamp => {
        drawStamp(backgroundCtx, stamp);
    });

    prevCanvasWidth = canvas.width;
    prevCanvasHeight = canvas.height;
}

// Function to redraw the entire visible canvas
function redrawCanvas() {
    // First copy the background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(backgroundCanvas, 0, 0);
    
    // Then draw only the die being dragged on top
    if (draggingDice && selectedDie) {
        drawDieOnCanvas(ctx, selectedDie);
    }
}

// Helper function to draw a line on any context
function drawLineOnCanvas(context, x1, y1, x2, y2, color, width) {
    context.lineWidth = width;
    context.lineCap = "round";
    context.strokeStyle = color;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
}

// Helper function to erase on any context
function eraseOnCanvas(context, x, y, size) {
    context.clearRect(x - size / 2, y - size / 2, size, size);
}

// Helper function to get mouse position relative to canvas
function getMousePos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (evt.clientX - rect.left) * (canvas.width / rect.width),
        y: (evt.clientY - rect.top) * (canvas.height / rect.height)
    };
}

// Init
resizeCanvas();
preloadDiceImages();
preloadStampImages();

// Handle window resize events
window.addEventListener('resize', () => {
    resizeCanvas();
});

diceSpreadRange.addEventListener("change", () => {
    diceSpread = diceSpreadRange.value;
});

drawModeCheckbox.addEventListener("change", () => {
    if (drawModeCheckbox.checked) {
        diceModeCheckbox.checked = false;
        eraseModeCheckbox.checked = false;
        stampModeCheckbox.checked = false;
        stamping = false;
        erasing = false;
        diceDropMode = false;
        drawingToggle = true;
    } else {
        drawingToggle = false;
    }
});

eraseModeCheckbox.addEventListener("change", () => {
    if (eraseModeCheckbox.checked) {
        diceModeCheckbox.checked = false;
        stampModeCheckbox.checked = false;
        drawModeCheckbox.checked = false;
        stamping = false;
        erasing = true;
        diceDropMode = false;
        drawingToggle = false;
    } else {
        erasing = false;
    }
});

diceModeCheckbox.addEventListener("change", () => {
    if (diceModeCheckbox.checked) {
        eraseModeCheckbox.checked = false;
        stampModeCheckbox.checked = false;
        drawModeCheckbox.checked = false;
        diceDropMode = true;
        erasing = false;
        stamping = false;
        drawingToggle = false;
    } else {
        diceDropMode = false;
    }
});

stampModeCheckbox.addEventListener("change", () => {
    if (stampModeCheckbox.checked) {
        eraseModeCheckbox.checked = false;
        diceModeCheckbox.checked = false;
        drawModeCheckbox.checked = false;
        erasing = false;
        diceDropMode = false;
        drawingToggle = false;
        stamping = true;
    } else {
        stamping = true;
    }
});

document.getElementById("clearCanvas").addEventListener("click", () => {
    socket.emit("clearCanvas");
    localDiceCache = []; // Clear local dice cache
    redrawBackgroundCanvas();
    redrawCanvas();
});

document.getElementById("downloadCanvas").addEventListener("click", () => {
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");

    // Set canvas size to match the original
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

    // Draw a solid white background
    tempCtx.fillStyle = "white";
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Draw the background canvas (preserves drawings)
    tempCtx.drawImage(backgroundCanvas, 0, 0);

    // Draw the main canvas layer (active drawings & dice)
    tempCtx.drawImage(canvas, 0, 0);

    // Convert canvas to an image
    const image = tempCanvas.toDataURL("image/png");

    // Create a download link
    const link = document.createElement("a");
    link.href = image;
    link.download = "cartograph_map.png";
    link.click();
});

function drawStamp(context, stamp) {
    if (!stamp) return;

    const scaledSize = canvas.width / 23;

    const stampIndex = stamp.value - 1;
    if (stampIndex >= 0 && stampIndex < loadedStampImages.length && loadedStampImages[stampIndex] && loadedStampImages[stampIndex].complete) {
        context.drawImage(
            loadedStampImages[stampIndex], 
            stamp.x - scaledSize / 2, 
            stamp.y - scaledSize / 2, 
            scaledSize, 
            scaledSize
        );
    }
}
// Function to draw a die on any context
function drawDieOnCanvas(context, die) {
    if (!die) return;
    // Scale die size relative to canvas dimensions
    const scaledSize = canvas.width / 20;
    const alreadyScaled = die.x > 1 || die.y > 1;
    const absoluteX = alreadyScaled ? die.x : die.x * canvas.width;
    const absoluteY = alreadyScaled ? die.y : die.y * canvas.height;

    // Draw highlight if this die is selected
    if (selectedDie && selectedDie.id === die.id) {
        context.beginPath();
        context.arc(absoluteX, absoluteY, scaledSize / 1.5, 0, Math.PI * 2);
        context.fillStyle = "rgba(255, 255, 0, 0.3)";
        context.fill();
    }
    
    // Use the preloaded image for better performance
    const dieIndex = die.value - 1;
    if (dieIndex >= 0 && dieIndex < loadedDiceImages.length && loadedDiceImages[dieIndex] && loadedDiceImages[dieIndex].complete) {
        context.drawImage(
            loadedDiceImages[dieIndex], 
            absoluteX- scaledSize / 2, 
            absoluteY- scaledSize / 2, 
            scaledSize, 
            scaledSize
        );
    }
}

// Function to check if mouse is over a die
function isOverDie(mouseX, mouseY, die) {
    const scaledSize = canvas.width / 22;
    const dx = mouseX - (die.x * canvas.width);
    const dy = mouseY - (die.y * canvas.height);
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
        redrawBackgroundCanvas();
        redrawCanvas();
    }
});

socket.on("dropStamp", (stampData) => {
    if (Array.isArray(stampData)) {
        localStampCache = stampData
        redrawBackgroundCanvas();
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
            redrawBackgroundCanvas();
            redrawCanvas();
        }
    }
});

socket.on("clearCanvas", () => {
    localDiceCache = [];
    redrawBackgroundCanvas();
    redrawCanvas();
});

canvas.addEventListener("mousedown", (event) => {
    const mousePos = getMousePos(canvas, event);
    mouseDown = true;
    if (diceDropMode) {
        // Check if clicked on an existing die
        const clickedDie = findDieUnderCursor(mousePos.x, mousePos.y);
        
        if (clickedDie) {
            // Start dragging this die
            draggingDice = true;
            selectedDie = clickedDie;
            
            // Redraw background once before starting drag
            redrawBackgroundCanvas();
            redrawCanvas();
        } else {
            // Drop new dice at the cursor position
            socket.emit("dropDice", { 
                canvasWidth: canvas.width,
                canvasHeight: canvas.height,
                x: mousePos.x,
                y: mousePos.y,
                size: 20, 
                bCount: biomeCount,
                lCount: landmarkCount,
                spread: diceSpread
            });
        }
    } else if (stamping) {
        // Drop new stamp at the cursor position
        socket.emit("dropStamp", { 
            x: mousePos.x, 
            y: mousePos.y,
            size: 40, 
            value: 1
        })
    } else {
        // Normal drawing behavior
        drawing = true;
        lastX = mousePos.x;
        lastY = mousePos.y;
    } 
});

canvas.addEventListener("mouseup", () => {
    if (drawingToggle) {
        drawing = false;
    }
    mouseDown = false;
    
    if (draggingDice && selectedDie) {
        draggingDice = false;
        
        const notMoved = selectedDie.x < 1 && selectedDie.y < 1;

        let diceX = notMoved ? selectedDie.x * canvas.width : selectedDie.x;
        let diceY = notMoved ? selectedDie.y * canvas.height : selectedDie.y;

        if (notMoved) {
            diceX = diceX * canvas.width;
            diceY = diceY * canvas.height;
        }
        // Final update to server
        socket.emit("moveDie", {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            id: selectedDie.id,
            x: diceX,
            y: diceY
        });
        
        // Reset selection and redraw everything
        selectedDie = null;
        redrawBackgroundCanvas();
        redrawCanvas();
    }
});

canvas.addEventListener("mouseleave", () => {
    if (drawingToggle) {
        drawing = false;
    }

    if (draggingDice) {
        draggingDice = false;
        
        // Final update to server if we have a selected die
        if (selectedDie) {
            socket.emit("moveDie", {
                canvasWidth: canvas.width,
                canvasHeight: canvas.height,
                id: selectedDie.id,
                x: selectedDie.x,
                y: selectedDie.y
            });
            selectedDie = null;
        }
        
        redrawBackgroundCanvas();
        redrawCanvas();
    }
    mouseDown = false;
});

canvas.addEventListener("mousemove", (event) => {
    const mousePos = getMousePos(canvas, event);
    const x = mousePos.x;
    const y = mousePos.y;
    
    if (draggingDice && selectedDie) {
        // Update the die position
        selectedDie.x = x;
        selectedDie.y = y;
        // Update the cached version too
        const dieIndex = localDiceCache.findIndex(die => die.id === selectedDie.id);
        if (dieIndex !== -1) {
            localDiceCache[dieIndex].x = x;
            localDiceCache[dieIndex].y = y;
        }
        
        // Only redraw the main canvas, not the background
        redrawCanvas();
        
        // Throttle server updates for better performance
        const now = Date.now();
        if (now - lastEmitTime > EMIT_THROTTLE) {
            socket.emit("moveDie", {
                canvasWidth: canvas.width,
                canvasHeight: canvas.height,
                id: selectedDie.id,
                x: x,
                y: y
            });
            lastEmitTime = now;
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
        if (erasing && mouseDown) {
            // Scale eraser size relative to canvas size
            const eraserSize = canvas.width/50;
            
            // Add to drawing history
            drawHistory.push({ x, y, size: eraserSize, erase: true });
            
            // Erase on both canvases
            eraseOnCanvas(ctx, x, y, eraserSize);
            eraseOnCanvas(backgroundCtx, x, y, eraserSize);
            
            // Send erase action to others
            socket.emit("erase", { x, y, size: eraserSize });
        } else if (drawingToggle && mouseDown) {
            // Scale line width relative to canvas size
            const lineWidth = canvas.width/300;
            
            const lastXScaled = lastX / canvas.width;
            const lastYScaled = lastY / canvas.height;
            const xScaled = x / canvas.width;
            const yScaled = y / canvas.height;

            // Add to drawing history
            drawHistory.push({ lastX: lastXScaled, lastY: lastYScaled, x: xScaled, y: yScaled, width: lineWidth });
            
            // Draw on both canvases

            drawLineOnCanvas(ctx, lastX, lastY, x, y, "black", lineWidth);
            drawLineOnCanvas(backgroundCtx, lastX, lastY, x, y, "black", lineWidth);
            
            // Send draw action to others
            socket.emit("draw", { lastX, lastY, x, y, width: lineWidth });
        }
        lastX = x;
        lastY = y;
    }
});


// Receive drawing history
socket.on("drawHistory", (history) => {
    drawHistory = history; // Store locally
    redrawBackgroundCanvas();
    redrawCanvas();
});

// Receive drawing updates from server
socket.on("draw", (data) => {
    drawHistory.push(data); // Add to local history
    
    // Draw the new line on both canvases
    const lineWidth = data.width;
    drawLineOnCanvas(ctx, data.lastX, data.lastY, data.x, data.y, "black", lineWidth);
    drawLineOnCanvas(backgroundCtx, data.lastX, data.lastY, data.x, data.y, "black", lineWidth);
});

// Receive erase updates from server
socket.on("erase", (data) => {
    drawHistory.push({ ...data, erase: true }); // Add to local history
    
    // Erase on both canvases
    erase(data.x, data.y, data.size);
    eraseOnCanvas(ctx, data.x, data.y, data.size);
    eraseOnCanvas(backgroundCtx, data.x, data.y, data.size);
});

// Request drawing history when reconnecting
socket.on("connect", () => {
    socket.emit("requestHistory");
});

socket.on("requestHistory", () => {
    socket.emit("drawHistory", drawHistory);
});