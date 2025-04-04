const bcount = document.getElementById("biomeCount");
const lcount = document.getElementById("landmarkCount");
const diceSpreadRange = document.getElementById("diceSpread");
const drawModeCheckbox = document.getElementById("drawMode");
const eraseModeCheckbox = document.getElementById("eraseMode");
const diceModeCheckbox = document.getElementById("toggleDiceDrop");
const stampModeCheckbox = document.getElementById("toggleStampMode");
const textModeCheckbox = document.getElementById("toggleTextMode");
const stampToolbar = document.getElementById("stamp-toolbar");
const canvas = document.getElementById("whiteboard");
const ctx = canvas.getContext("2d");
const backgroundCanvas = document.getElementById('backgroundWhiteboard');
const backgroundCtx = backgroundCanvas.getContext('2d');
const canvasContainer = document.getElementById("canvas-container");
const helpButton = document.getElementById('helpButton');
const helpModal = document.getElementById('helpModal');
const closeModal = document.getElementById('closeModal');

const socket = io();

const loadedDiceImages = [];
const loadedStampImages = [];
const drawSizeFactor = 0.0025;
const eraserSizeFactor = 0.01;
const stampSizeFactor = 0.04;
const diceSizeFactor = 0.035;
const textSizeFactor = 0.018;

let drawSize = canvas.width * drawSizeFactor;
let eraserSize = canvas.width * eraserSizeFactor;
let stampSize = canvas.width * stampSizeFactor;
let diceSize = canvas.width * diceSizeFactor;
let textSize = canvas.width * textSizeFactor;

const lineColour = "#000000";

let currentTool = 'none';
let diceSpread = 4;
let drawing = false;
let lastX = 0, lastY = 0;
let mouseDown = false;
let selectedStampValue = 1;
let draggingDie = false;
let dieBeingDragged = { id: null };
let textInput = null;
let textPosition = { x: 0, y: 0 };

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

//do the same for landmark
function biomeInc() {
    socket.emit("biomeCountChange", true);
}

function biomeDec() {
    socket.emit("biomeCountChange", false);
}

function landmarkInc() {
    socket.emit("landmarkCountChange", true);
}

function landmarkDec() {
    socket.emit("landmarkCountChange", false);
}

function diceSpreadInc() {
    diceSpread++;
    updateTextElement(diceSpreadRange, diceSpread);
}

function diceSpreadDec() {
    diceSpread = diceSpread > 0 ? diceSpread - 1 : 0;
    updateTextElement(diceSpreadRange, diceSpread);
}

function updateTextElement(element, text) {
    element.textContent = text;
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
    diceSize = canvas.width * diceSizeFactor;
    stampSize = canvas.width * stampSizeFactor;
    drawSize = canvas.width * drawSizeFactor;
    textSize = canvas.width * textSizeFactor;
    eraserSize = canvas.width * eraserSizeFactor;
    socket.emit("redrawAll");
}

function preloadDiceImages() {
    for (let i = 0; i < diceImages.length; i++) {
        const img = new Image();
        img.src = diceImages[i];
        loadedDiceImages.push(img);
    }
}

function preloadStampImages() {
    for (let i = 0; i < stampImages.length; i++) {
        const img = new Image();
        img.src = stampImages[i];
        loadedStampImages.push(img);
    }
}

function redrawStrokes(dataArray) {
    dataArray.forEach((data) => {
        if (data.erase) {
            eraseOnCanvas(backgroundCtx, data.x, data.y, eraserSize);
        } else {
            drawLineOnCanvas(backgroundCtx, data.lastX, data.lastY, data.x, data.y, lineColour, drawSize);
        }
    });
}

function redawStamps(dataArray) {
    dataArray.forEach((data) => {
        drawStampOnCanvas(backgroundCtx, data.x, data.y, stampSize, data.value);
    });
}

function redrawDice(dataArray) {
    dataArray.forEach((data) => {
        drawDiceOnCanvas(ctx, data.x, data.y, diceSize, data.value);
    });
}

function redrawText(dataArray) {
    dataArray.forEach((data) => {
        drawTextOnCanvas(backgroundCtx, data.x, data.y, data.text);
    });
}

function drawLineOnCanvas(context, x1, y1, x2, y2, color, size) {
    context.lineWidth = size;
    context.lineCap = "round";
    context.strokeStyle = color;
    context.beginPath();
    context.moveTo(x1 * canvas.width, y1 * canvas.height);
    context.lineTo(x2 * canvas.width, y2 * canvas.height);
    context.stroke();
}

function eraseOnCanvas(context, x, y, size) {
    context.clearRect((x * canvas.width) - size / 2, (y * canvas.height) - size / 2, size, size);
}

function drawStampOnCanvas(context, x, y, size, stampValue) {
    const stampIndex = stampValue - 1;
    if (stampIndex >= 0) {
        context.drawImage(
            loadedStampImages[stampIndex], 
            (x * canvas.width) - size / 2, 
            (y * canvas.height) - size / 2, 
            size, 
            size
        );
    }
}

function drawDiceOnCanvas(context, x, y, size, value) {
    const diceIndex = value - 1;
    if (diceIndex >= 0) {
        context.drawImage(
            loadedDiceImages[diceIndex], 
            (x * canvas.width) - size / 2, 
            (y * canvas.height) - size / 2, 
            size, 
            size
        );
    }
}

function drawTextOnCanvas(context, x, y, text) {
    context.font = textSize + 'px Crimson Pro';
    context.fillStyle = lineColour;
    context.fillText(text, x * canvas.width, (y * canvas.height));
}

function commitText() {
    if (!textInput) return;

    const text = textInput.innerText || textInput.textContent;

    if (text.trim() !== '') {
        socket.emit("commitText", {
            text: text,
            x: textPosition.x, 
            y: textPosition.y + (textSize*0.51),
            canvasWidth: canvas.width,
            canvasHeight: canvas.height
        });
    }
    canvasContainer.removeChild(textInput);
    textInput = null;
}

function createTextInput(x, y) {
    if (textInput) {
        canvasContainer.removeChild(textInput);
    }
    textPosition = { x, y };

    textInput = document.createElement('div');
    textInput.contentEditable = true;
    textInput.style.position = 'absolute';
    textInput.style.textAlign = 'center';
    textInput.style.left = `${(x / canvas.width) * canvas.offsetWidth}px`;
    textInput.style.top = `${(y / canvas.height) * canvas.offsetHeight - (textSize/2)}px`;
    textInput.style.minWidth = '20px';
    textInput.style.padding = '0';
    textInput.style.margin = '0';
    textInput.style.background = 'transparent';
    textInput.style.border = '1px dashed #999';
    textInput.style.font = textSize + 'px Crimson Pro';
    textInput.style.color = lineColour;
    textInput.style.zIndex = '4';

    canvasContainer.appendChild(textInput);
    setTimeout(() => {
        textInput.focus();
      }, 0);

    textInput.addEventListener('blur', commitText);
    textInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commitText();
        }
        if (e.key === 'Escape') {
            canvasContainer.removeChild(textInput);
            textInput = null;
        }
    });
}

function getMousePos(canvas, evt) {
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
    if (currentTool === "stamp") {
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

function initialise() {
    resizeCanvas();
    preloadDiceImages();
    preloadStampImages();
    updateStampToolbar();
    toggleAllButtonsOff();
    socket.emit("redrawAll");
};

initialise();

drawModeCheckbox.addEventListener("change", () => {
    if (drawModeCheckbox.checked) {
        diceModeCheckbox.checked = false;
        eraseModeCheckbox.checked = false;
        stampModeCheckbox.checked = false;
        textModeCheckbox.checked = false;
        currentTool = "pen";
    } else {
        currentTool = "none";
    }
    updateStampToolbar();
});

eraseModeCheckbox.addEventListener("change", () => {
    if (eraseModeCheckbox.checked) {
        diceModeCheckbox.checked = false;
        stampModeCheckbox.checked = false;
        drawModeCheckbox.checked = false;
        textModeCheckbox.checked = false;
        currentTool = "eraser";
    } else {
        currentTool = "none";
    }
    updateStampToolbar();
});

diceModeCheckbox.addEventListener("change", () => {
    if (diceModeCheckbox.checked) {
        eraseModeCheckbox.checked = false;
        stampModeCheckbox.checked = false;
        drawModeCheckbox.checked = false;
        textModeCheckbox.checked = false;
        currentTool = "dice";
        drawing = false;
    } else {
        currentTool = "none";
    }
    updateStampToolbar();
});

stampModeCheckbox.addEventListener("change", () => {
    if (stampModeCheckbox.checked) {
        eraseModeCheckbox.checked = false;
        diceModeCheckbox.checked = false;
        drawModeCheckbox.checked = false;
        textModeCheckbox.checked = false;
        currentTool = "stamp";
        drawing = false;
    } else {
        currentTool = "none";
    }
    updateStampToolbar();
});

textModeCheckbox.addEventListener("change", () => {
    if (textModeCheckbox.checked) {
        eraseModeCheckbox.checked = false;
        diceModeCheckbox.checked = false;
        drawModeCheckbox.checked = false;
        stampModeCheckbox.checked = false;
        currentTool = "text";
        drawing = false;
    } else {
        currentTool = "none";
    }
    updateStampToolbar();
});

document.getElementById("clearCanvas").addEventListener("click", () => {
    socket.emit("clearCanvas");
});

document.getElementById("clearDice").addEventListener("click", () => {
    socket.emit("clearDice");
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

window.addEventListener("resize", () => {
    resizeCanvas();
});

//User Inputs
canvas.addEventListener("mousedown", (event) => {
    const mousePos = getMousePos(canvas, event);
    mouseDown = true;
    if (currentTool === "stamp") {
        socket.emit("dropStamp", {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height, 
            x: mousePos.x, 
            y: mousePos.y,
            value: selectedStampValue
        });
    } else if (currentTool === "dice") {
        socket.emit("checkDieClick", {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height, 
            x: mousePos.x, 
            y: mousePos.y,
            size: diceSize
        });
    } else if (currentTool == "text") {
        if (textInput) {
            commitText();
        } else {
            createTextInput(mousePos.x, mousePos.y);
        }  
    } else if (currentTool === "pen" || currentTool === "eraser") {
        drawing = true;
        lastX = mousePos.x;
        lastY = mousePos.y;
    } 
});

canvas.addEventListener("mouseup", () => {
    if (currentTool === "pen") {
        drawing = false;
    } else if (draggingDie && dieBeingDragged) {
        draggingDie = false;
        dieBeingDragged = { id: null };
    }
    mouseDown = false;
});

canvas.addEventListener("mouseleave", () => {
    if (currentTool === "pen") {
        drawing = false;
    } else if (draggingDie && dieBeingDragged) {
        draggingDie = false;
        dieBeingDragged = { id: null };
    }
    mouseDown = false;
});

canvas.addEventListener("mousemove", (event) => {
    const mousePos = getMousePos(canvas, event);
    const x = mousePos.x;
    const y = mousePos.y;
    
    if (drawing) {
        if (currentTool === "eraser" && mouseDown) {
            socket.emit("erase", { x, y, canvasWidth: canvas.width, canvasHeight: canvas.height, erase: true });
        } else if (currentTool === "pen" && mouseDown) {
            socket.emit("draw", { lastX, lastY, x, y, canvasWidth: canvas.width, canvasHeight: canvas.height });
        }
        lastX = x;
        lastY = y;
    } else if (draggingDie && dieBeingDragged) {
        socket.emit("moveDie", {
            id: dieBeingDragged.id,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height, 
            x: mousePos.x, 
            y: mousePos.y,
        });
    }
});

canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
canvas.addEventListener("touchend", handleTouchEnd);
canvas.addEventListener("touchcancel", handleTouchCancel);

function handleTouchStart(event) {
    event.preventDefault(); // Prevent scrolling when drawing
    if (event.touches.length === 1) { // Only handle single touch
        const touch = event.touches[0];
        const rect = canvas.getBoundingClientRect();
        const touchPos = {
            x: (touch.clientX - rect.left) * (canvas.width / canvas.clientWidth),
            y: (touch.clientY - rect.top) * (canvas.height / canvas.clientHeight)
        };
        
        mouseDown = true;
        
        if (currentTool === "stamp") {
            socket.emit("dropStamp", {
                canvasWidth: canvas.width,
                canvasHeight: canvas.height, 
                x: touchPos.x, 
                y: touchPos.y,
                value: selectedStampValue
            });
        } else if (currentTool === "dice") {
            socket.emit("checkDieClick", {
                canvasWidth: canvas.width,
                canvasHeight: canvas.height, 
                x: touchPos.x, 
                y: touchPos.y,
                size: diceSize
            });
        } else if (currentTool === "text") {
            if (textInput) {
                commitText();
            } else {
                createTextInput(touchPos.x, touchPos.y);
            }
        } else if (currentTool === "pen" || currentTool === "eraser") {
            drawing = true;
            lastX = touchPos.x;
            lastY = touchPos.y;
        }
    }
}

function handleTouchMove(event) {
    event.preventDefault(); // Prevent scrolling when drawing
    if (event.touches.length === 1 && mouseDown) { // Only handle single touch
        const touch = event.touches[0];
        const rect = canvas.getBoundingClientRect();
        const touchPos = {
            x: (touch.clientX - rect.left) * (canvas.width / canvas.clientWidth),
            y: (touch.clientY - rect.top) * (canvas.height / canvas.clientHeight)
        };
        
        if (drawing) {
            if (currentTool === "eraser") {
                socket.emit("erase", { 
                    x: touchPos.x, 
                    y: touchPos.y, 
                    canvasWidth: canvas.width, 
                    canvasHeight: canvas.height, 
                    erase: true 
                });
            } else if (currentTool === "pen") {
                socket.emit("draw", { 
                    lastX, 
                    lastY, 
                    x: touchPos.x, 
                    y: touchPos.y, 
                    canvasWidth: canvas.width, 
                    canvasHeight: canvas.height 
                });
            }
            lastX = touchPos.x;
            lastY = touchPos.y;
        } else if (draggingDie && dieBeingDragged) {
            socket.emit("moveDie", {
                id: dieBeingDragged.id,
                canvasWidth: canvas.width,
                canvasHeight: canvas.height, 
                x: touchPos.x, 
                y: touchPos.y,
            });
        }
    }
}

function handleTouchEnd() {
    if (currentTool === "pen") {
        drawing = false;
    } else if (draggingDie && dieBeingDragged) {
        draggingDie = false;
        dieBeingDragged = { id: null };
    }
    mouseDown = false;
}

function handleTouchCancel() {
    if (currentTool === "pen") {
        drawing = false;
    } else if (draggingDie && dieBeingDragged) {
        draggingDie = false;
        dieBeingDragged = { id: null };
    }
    mouseDown = false;
}

socket.on("dieClickResult", (diceData) => {
    if (diceData.die) {
        draggingDie = true;
        dieBeingDragged = diceData.die;
    } else {
        socket.emit("dropDice", {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height, 
            x: diceData.x, 
            y: diceData.y,
            spread: diceSpread,
            size: diceSize
        });
    }
});

socket.on("draw", (data) => {   
    drawLineOnCanvas(backgroundCtx, data.lastX, data.lastY, data.x, data.y, lineColour, drawSize);
});

socket.on("erase", (data) => {
    eraseOnCanvas(backgroundCtx, data.x, data.y, eraserSize);
});

socket.on("dropStamp", (stampData) => {
    drawStampOnCanvas(backgroundCtx, stampData.x, stampData.y, stampSize, stampData.value);
});

socket.on("dropDice", (data) => {
    data.forEach((die) => {
        drawDiceOnCanvas(ctx, die.x, die.y, diceSize, die.value);
    });
});

socket.on("updateDice", (data) => {
    ctx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
    redrawDice(data);
});

socket.on("writeText", (data) => {
    drawTextOnCanvas(backgroundCtx, data.x, data.y, data.text);
});

socket.on("clearCanvas", () => {
    backgroundCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
    ctx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
});

socket.on("clearDice", () => {
    ctx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
});

socket.on("updateBiomeCount", (biomeCount) => {
    updateTextElement(bcount, biomeCount);
});

socket.on("updateLandmarkCount", (landmarkCount) => {
    updateTextElement(lcount, landmarkCount);
});

socket.on("drawExistingCanvas", (data) => {
    redrawStrokes(data);
});

socket.on("drawExistingStamps", (data) => {
    redawStamps(data);
});

socket.on("drawExistingDice", (data) => {
    redrawDice(data);
});

socket.on("drawExistingText", (data) => {
    redrawText(data);
});

helpButton.addEventListener('click', function() {
    helpModal.style.display = 'block';
});

closeModal.addEventListener('click', function() {
    helpModal.style.display = 'none';
});

window.addEventListener('click', function(event) {
    if (event.target === helpModal) {
        helpModal.style.display = 'none';
    }
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && helpModal.style.display === 'block') {
        helpModal.style.display = 'none';
    }
});
