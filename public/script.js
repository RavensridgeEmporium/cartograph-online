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

const socket = io();

const TEXT_CALIBRATION_FACTOR = 0.65;
const loadedDiceImages = [];
const loadedStampImages = [];
const textSize = 69;
const eraseSize = 25.0;
const drawSizeFactor = 0.004;
let drawSize = Math.min(canvas.width, canvas.height) * drawSizeFactor;
const stampSizeFactor = 0.08;
let stampSize = Math.min(canvas.width, canvas.height) * stampSizeFactor;
const diceSizeFactor = 0.075;
let diceSize = Math.min(canvas.width, canvas.height) * diceSizeFactor;

let currentTool = 'none';
let biomeCount = 3;
let landmarkCount = 1;
let diceSpread = 1;
let drawing = false;
let lastX = 0, lastY = 0;
let mouseDown = false;
let selectedStampValue = 1;
let draggingDie = false;
let dieBeingDragged = { id: null };

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
    updateTextElement(bcount, biomeCount);
}

function biomeDec() {
    biomeCount = biomeCount > 0 ? biomeCount - 1 : 0;
    updateTextElement(bcount, biomeCount);
}

function landmarkInc() {
    landmarkCount++;
    updateTextElement(lcount, landmarkCount);
}

function landmarkDec() {
    landmarkCount = landmarkCount > 0 ? landmarkCount - 1 : 0;
    updateTextElement(lcount, landmarkCount);
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
    diceSize = Math.min(canvas.width, canvas.height) * diceSizeFactor;
    stampSize = Math.min(canvas.width, canvas.height) * stampSizeFactor;
    drawSize = Math.min(canvas.width, canvas.height) * drawSizeFactor;
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
            eraseOnCanvas(backgroundCtx, data.x, data.y, eraseSize);
        } else {
            drawLineOnCanvas(backgroundCtx, data.lastX, data.lastY, data.x, data.y, "black", drawSize);
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
        updateStampToolbar();
    }
});

eraseModeCheckbox.addEventListener("change", () => {
    if (eraseModeCheckbox.checked) {
        diceModeCheckbox.checked = false;
        stampModeCheckbox.checked = false;
        drawModeCheckbox.checked = false;
        textModeCheckbox.checked = false;
        currentTool = "eraser";
        updateStampToolbar();
    }
});

diceModeCheckbox.addEventListener("change", () => {
    if (diceModeCheckbox.checked) {
        eraseModeCheckbox.checked = false;
        stampModeCheckbox.checked = false;
        drawModeCheckbox.checked = false;
        textModeCheckbox.checked = false;
        currentTool = "dice";
        drawing = false;
        updateStampToolbar();
    }
});

stampModeCheckbox.addEventListener("change", () => {
    if (stampModeCheckbox.checked) {
        eraseModeCheckbox.checked = false;
        diceModeCheckbox.checked = false;
        drawModeCheckbox.checked = false;
        textModeCheckbox.checked = false;
        currentTool = "stamp";
        drawing = false;
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
    }
eStampToolbar();
});

document.getElementById("clearCanvas").addEventListener("click", () => {
    socket.emit("clearCanvas");
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

socket.on("dieClickResult", (diceData) => {
    if (diceData.die) {
        draggingDie = true;
        dieBeingDragged = diceData.die;
    } else {
        socket.emit("dropDice", {
            bCount: biomeCount,
            lCount: landmarkCount,
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
    drawLineOnCanvas(backgroundCtx, data.lastX, data.lastY, data.x, data.y, "black", drawSize);
});

socket.on("erase", (data) => {
    eraseOnCanvas(backgroundCtx, data.x, data.y, eraseSize);
});

socket.on("dropStamp", (stampData) => {
    drawStampOnCanvas(backgroundCtx, stampData.x, stampData.y, stampSize, stampData.value);
});

socket.on("dropDice", (data) => {
    data.forEach((die) => {
        if (!die.moving) {
            drawDiceOnCanvas(ctx, die.x, die.y, diceSize, die.value);
        }
    });
});

socket.on("updateDice", (data) => {
    ctx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
    redrawDice(data);
});

socket.on("clearCanvas", () => {
    backgroundCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
    ctx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
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
