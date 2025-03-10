const canvas = document.getElementById("whiteboard");
const bcount = document.getElementById("biomeCount");
const lcount = document.getElementById("landmarkCount");
const diceSpreadRange = document.getElementById("diceSpread");
const drawModeCheckbox = document.getElementById("drawMode");
const eraseModeCheckbox = document.getElementById("eraseMode");
const diceModeCheckbox = document.getElementById("toggleDiceDrop");
const stampModeCheckbox = document.getElementById("toggleStampMode");
const textModeCheckbox = document.getElementById("toggleTextMode");
const stampToolbar = document.getElementById("stamp-toolbar");
const debug = document.getElementById("debug");
const ctx = canvas.getContext("2d");
const socket = io();
const EMIT_THROTTLE = 50; // ms
const TEXT_CALIBRATION_FACTOR = 0.65;
const loadedDiceImages = [];
const loadedStampImages = [];
const diceSize = 24; //Larger number decreases the size 
const textSize = 69;

let lastEmitTime = 0;
let biomeCount = 3;
let landmarkCount = 1;
let diceSpread = 1;
let drawing = false;
let erasing = false;
let stamping = false;
let writing = false;
let diceDropMode = false;
let draggingDice = false;
let selectedDie = null;
let lastX = 0, lastY = 0;
let drawHistory = [];
let localDiceCache = [];
let localStampCache = [];
let localTextCache = [];
let lastDragX = 0, lastDragY = 0;
let mouseDown = false;
let drawingToggle = false;
let prevCanvasWidth = canvas.width;
let prevCanvasHeight = canvas.height;
let selectedStampValue = 1;
let textString = "Hello World!";
let inTextbox = false;

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
    "/assets/discovery.png",
    "/assets/ruin.png"
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

function diceSpreadInc() {
    diceSpread++;
    diceSpreadUpdate();
}

function diceSpreadDec() {
    diceSpread = diceSpread > 0 ? diceSpread - 1 : 0;
    diceSpreadUpdate();
}

function diceSpreadUpdate() {
    diceSpreadRange.textContent = diceSpread;
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

    const textInput = document.getElementById("text-tool-input");
    if (textInput.style.display === "block") {
        textInput.style.fontSize = `${(canvas.width / textSize) * TEXT_CALIBRATION_FACTOR}px`;
    }
    
    // Redraw everything when canvas resizes
    redrawBackgroundCanvas();
    redrawCanvas();
}

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
        drawStampOnCanvas(backgroundCtx, stamp);
    });

    localTextCache.forEach(text => {
        drawTextOnCanvas(backgroundCtx, text);
    });

    prevCanvasWidth = canvas.width;
    prevCanvasHeight = canvas.height;
}

function redrawCanvas() {
    // First copy the background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(backgroundCanvas, 0, 0);
    
    // Then draw only the die being dragged on top
    if (draggingDice && selectedDie) {
        drawDieOnCanvas(ctx, selectedDie);
    }
}

function drawLineOnCanvas(context, x1, y1, x2, y2, color, width) {
    context.lineWidth = width;
    context.lineCap = "round";
    context.strokeStyle = color;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
}

function eraseOnCanvas(context, x, y, size) {
    context.clearRect(x - size / 2, y - size / 2, size, size);
}

function getMousePos(canvas, evt, absolute=false) {
    if (absolute) {
        return {
            x: evt.clientX,
            y: evt.clientY,
        }
    }
    const rect = canvas.getBoundingClientRect();
    return {
        x: (evt.clientX - rect.left) * (canvas.width / canvas.clientWidth),
        y: (evt.clientY - rect.top) * (canvas.height / canvas.clientHeight)
    };
}

function highlightSelectedStamp() {
    const images = document.querySelectorAll("#stamp-toolbar img");
    images.forEach(img => {
        img.classList.toggle("selected", parseInt(img.dataset.index) === selectedStampValue);
    });
}

function updateStampToolbar() {
    if (stamping) {
        stampToolbar.innerHTML = "";
        
        stampImages.forEach((imgSrc, index) => {
            const img = document.createElement("img");
            img.src = imgSrc;
            img.alt = `Stamp ${index + 1}`;
            img.dataset.index = index + 1;

            img.addEventListener("click", () => {
                selectedStampValue = index + 1;
                highlightSelectedStamp(); // Update UI to show selected stamp
            });

            stampToolbar.appendChild(img);
        });
        highlightSelectedStamp();

        stampToolbar.classList.add("show");
    } else {
        stampToolbar.classList.remove("show");
    }
}

function toggleAllButtonsOff() {
    diceModeCheckbox.checked = false;
    eraseModeCheckbox.checked = false;
    stampModeCheckbox.checked = false;
    drawModeCheckbox.checked = false;
    textModeCheckbox.checked = false;
}

// Init
resizeCanvas();
preloadDiceImages();
preloadStampImages();
updateStampToolbar();
toggleAllButtonsOff();

// Handle window resize events
window.addEventListener('resize', () => {
    resizeCanvas();
});

drawModeCheckbox.addEventListener("change", () => {
    if (drawModeCheckbox.checked) {
        diceModeCheckbox.checked = false;
        eraseModeCheckbox.checked = false;
        stampModeCheckbox.checked = false;
        textModeCheckbox.checked = false;
        stamping = false;
        erasing = false;
        writing = false;
        diceDropMode = false;
        drawingToggle = true;
        updateStampToolbar();
    } else {
        drawingToggle = false;
    }
});

eraseModeCheckbox.addEventListener("change", () => {
    if (eraseModeCheckbox.checked) {
        diceModeCheckbox.checked = false;
        stampModeCheckbox.checked = false;
        drawModeCheckbox.checked = false;
        textModeCheckbox.checked = false;
        stamping = false;
        erasing = true;
        writing = false;
        diceDropMode = false;
        drawingToggle = false;
        updateStampToolbar();
    } else {
        erasing = false;
    }
});

diceModeCheckbox.addEventListener("change", () => {
    if (diceModeCheckbox.checked) {
        eraseModeCheckbox.checked = false;
        stampModeCheckbox.checked = false;
        drawModeCheckbox.checked = false;
        textModeCheckbox.checked = false;
        diceDropMode = true;
        erasing = false;
        writing = false;
        stamping = false;
        drawingToggle = false;
        updateStampToolbar();
    } else {
        diceDropMode = false;
    }
});

stampModeCheckbox.addEventListener("change", () => {
    if (stampModeCheckbox.checked) {
        eraseModeCheckbox.checked = false;
        diceModeCheckbox.checked = false;
        drawModeCheckbox.checked = false;
        textModeCheckbox.checked = false;
        erasing = false;
        writing = false;
        diceDropMode = false;
        drawingToggle = false;
        stamping = true;
    } else {
        stamping = false;
    }
    updateStampToolbar();
});

textModeCheckbox.addEventListener("change", () => {
    if (textModeCheckbox.checked) {
        eraseModeCheckbox.checked = false;
        diceModeCheckbox.checked = false;
        drawModeCheckbox.checked = false;
        stampModeCheckbox.checked = false;
        erasing = false;
        diceDropMode = false;
        drawingToggle = false;
        stamping = false;
        writing = true;
    } else {
        writing = false;
    }
    updateStampToolbar();
});

document.getElementById("clearDice").addEventListener("click", () => {
    socket.emit("clearDice");
    localDiceCache = []; // Clear local dice cache
    redrawBackgroundCanvas();
    redrawCanvas();
});

document.getElementById("clearCanvas").addEventListener("click", () => {
    socket.emit("clearCanvas");
    localDiceCache = []; // Clear local dice cache
    localStampCache = [];
    drawHistory = [];
    localTextCache = [];
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

function drawStampOnCanvas(context, stamp) {
    if (!stamp) return;

    const scaledSize = canvas.width / 23;
    const alreadyScaled = stamp.x > 1 || stamp.y > 1;
    const absoluteX = alreadyScaled ? stamp.x : stamp.x * canvas.width;
    const absoluteY = alreadyScaled ? stamp.y : stamp.y * canvas.height;

    const stampIndex = stamp.value - 1;
    if (stampIndex >= 0 && stampIndex < loadedStampImages.length && loadedStampImages[stampIndex] && loadedStampImages[stampIndex].complete) {
        context.drawImage(
            loadedStampImages[stampIndex], 
            absoluteX - scaledSize / 2, 
            absoluteY - scaledSize / 2, 
            scaledSize, 
            scaledSize
        );
    }
};

function drawTextOnCanvas(context, text) {
    if (!text) return;
    const fontsize = canvas.width / textSize;
    const alreadyScaled = text.x > 1 || text.y > 1;
    const absoluteX = alreadyScaled ? text.x : text.x * canvas.width;
    const absoluteY = alreadyScaled ? text.y : text.y * canvas.height;
    context.font = `${fontsize}px 'IM Fell English SC', serif`;
    context.fillText(text.value, absoluteX, absoluteY);
};

function drawDieOnCanvas(context, die) {
    if (!die) return;
    // Scale die size relative to canvas dimensions
    const scaledSize = canvas.width / diceSize;
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

function isOverDie(mouseX, mouseY, die) {
    const scaledSize = canvas.width / diceSize;
    const dx = mouseX - (die.x * canvas.width);
    const dy = mouseY - (die.y * canvas.height);
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < scaledSize / 2;
}

function findDieUnderCursor(mouseX, mouseY) {
    // Search in reverse order so we get the top-most die first
    for (let i = localDiceCache.length - 1; i >= 0; i--) {
        if (isOverDie(mouseX, mouseY, localDiceCache[i])) {
            return localDiceCache[i];
        }
    }
    return null;
}

function commitTextToCanvas(textInput, x, y) {
    textString = textInput.value.trim();

    if (textString) {
        const baselineAdjustment = (canvas.width / textSize) * 0.1;

        socket.emit("writeText", {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height, 
            x: x, 
            y: y + baselineAdjustment,
            size: textSize, 
            value: textString
        })
    }
    inTextbox = false;
    textInput.value = "";
    textInput.style.display = "none";
}

function showTextInput(screenX, screenY, canvasX, canvasY) {
    inTextbox = true;
    const textInput = document.getElementById("text-tool-input");
    const fontsize = (canvas.width / textSize) * TEXT_CALIBRATION_FACTOR;
    const textBoxHeight = 40;

    textInput.style.left = `${screenX}px`;
    textInput.style.top = `${screenY  - textBoxHeight/2}px`;
    textInput.style.width = "700px";
    textInput.style.height = `${textBoxHeight}px`;
    textInput.style.display = "block";
    textInput.style.fontSize = `${fontsize}px`
    setTimeout(() => textInput.focus(), 10);
    textInput.onblur = function() {
        commitTextToCanvas(textInput, canvasX, canvasY);
    }
};

//User Inputs
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
                size: diceSize, 
                bCount: biomeCount,
                lCount: landmarkCount,
                spread: diceSpread
            });
        }
    } else if (stamping) {
        // Drop new stamp at the cursor position
        socket.emit("dropStamp", {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height, 
            x: mousePos.x, 
            y: mousePos.y,
            size: 40, 
            value: selectedStampValue
        })
    } else if (writing && !inTextbox) {
        const screenPos = getMousePos(canvas, event, true);
        const canvasPos = getMousePos(canvas, event);
        showTextInput(screenPos.x, screenPos.y, canvasPos.x, canvasPos.y);
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
            drawHistory.push({ x: x / canvas.width, y: y / canvas.height, size: eraserSize, erase: true });
            
            // Erase on both canvases
            eraseOnCanvas(ctx, x, y, eraserSize);
            eraseOnCanvas(backgroundCtx, x, y, eraserSize);
            
            // Send erase action to others
            socket.emit("erase", { x, y, size: eraserSize, canvasWidth: canvas.width, canvasHeight: canvas.height });
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
        localStampCache = stampData;
        redrawBackgroundCanvas();
        redrawCanvas();
    }
});
socket.on("writeText", (textData) => {
    if (Array.isArray(textData)) {
        localTextCache = textData;
        redrawBackgroundCanvas();
        redrawCanvas();
    }
});

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

socket.on("clearDice", () => {
    localDiceCache = [];
    redrawBackgroundCanvas();
    redrawCanvas();
});

socket.on("clearCanvas", () => {
    localStampCache = [];
    localDiceCache = [];
    localTextCache = [];
    drawHistory = [];
    redrawBackgroundCanvas();
    redrawCanvas();
});

socket.on("drawHistory", (history) => {
    drawHistory = history; // Store locally
    redrawBackgroundCanvas();
    redrawCanvas();
});

socket.on("draw", (data) => {
    drawHistory.push(data); // Add to local history
    
    // Draw the new line on both canvases
    const lineWidth = data.width;
    drawLineOnCanvas(ctx, data.lastX, data.lastY, data.x, data.y, "black", lineWidth);
    drawLineOnCanvas(backgroundCtx, data.lastX, data.lastY, data.x, data.y, "black", lineWidth);
});

socket.on("erase", (data) => {
    drawHistory.push({ ...data, erase: true }); // Add to local history
    
    // Erase on both canvases
    eraseOnCanvas(ctx, data.x, data.y, data.size);
    eraseOnCanvas(backgroundCtx, data.x, data.y, data.size);
});

socket.on("connect", () => {
    socket.emit("requestHistory");
});

socket.on("requestHistory", () => {
    socket.emit("drawHistory", drawHistory);
});
