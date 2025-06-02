const bcount = document.getElementById("biomeCount");
const lcount = document.getElementById("landmarkCount");
const diceSpreadRange = document.getElementById("diceSpread");
const drawModeCheckbox = document.getElementById("drawMode");
const eraseModeCheckbox = document.getElementById("eraseMode");
const diceModeCheckbox = document.getElementById("toggleDiceDrop");
const stampModeCheckbox = document.getElementById("toggleStampMode");
const textModeCheckbox = document.getElementById("toggleTextMode");
const stampToolbar = document.getElementById("stamp-toolbar");
const drawToolbar = document.getElementById("draw-toolbar");
const diceCanvas = document.getElementById("whiteboard");
const diceCanvasCtx = diceCanvas.getContext("2d");
const backgroundCanvas = document.getElementById("backgroundWhiteboard");
const backgroundCtx = backgroundCanvas.getContext("2d");
const stampCanvas = document.getElementById("stampWhiteboard");
const stampCtx = stampCanvas.getContext("2d");
const textCanvas = document.getElementById("textWhiteboard");
const textCanvasCtx = textCanvas.getContext("2d");
const canvasContainer = document.getElementById("canvas-container");
const helpButton = document.getElementById("helpButton");
const helpModal = document.getElementById("helpModal");
const closeModal = document.getElementById("closeModal");

const socket = io();

const loadedDiceImages = [];
const loadedStampImages = [];
const drawSizeFactor = 0.0025;
const eraserSizeFactor = 0.01;
const stampSizeFactor = 0.04;
const diceSizeFactor = 0.035;
const textSizeFactor = 0.018;

let drawSize = diceCanvas.width * drawSizeFactor;
let eraserSize = diceCanvas.width * eraserSizeFactor;
let stampSize = diceCanvas.width * stampSizeFactor;
let diceSize = diceCanvas.width * diceSizeFactor;
let textSize = diceCanvas.width * textSizeFactor;

const lineColour = "#000000";

let currentTool = 'none';
let diceSpread = 4;
let drawing = false;
let lastX = 0, lastY = 0;
let mouseDown = false;
let selectedStampValue = 1;
let selectedDrawToolValue = 1;
let draggingDie = false;
let dieBeingDragged = { id: null };
let textInput = null;
let textPosition = { x: 0, y: 0 };
let draggingText = false;
let textBeingDragged = { id: null };
let debugText = null;
let strokeArray = [];
let eraseStrokeArray = [];

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

const drawImages = [
    "/assets/tool_images/stroke.png",
    "/assets/tool_images/dashed.png"
];

function biomeInc() {
    socket.emit("biomeCountChange", true);
};

function biomeDec() {
    socket.emit("biomeCountChange", false);
};

function landmarkInc() {
    socket.emit("landmarkCountChange", true);
};

function landmarkDec() {
    socket.emit("landmarkCountChange", false);
};

function diceSpreadInc() {
    diceSpread++;
    updateTextElement(diceSpreadRange, diceSpread);
};

function diceSpreadDec() {
    diceSpread = diceSpread > 0 ? diceSpread - 1 : 0;
    updateTextElement(diceSpreadRange, diceSpread);
};

function updateTextElement(element, text) {
    element.textContent = text;
};

function resizeCanvas() {
    const tempWidth = Math.floor(window.innerWidth * 9 / 16);
    if(window.innerHeight >= tempWidth) {
        diceCanvas.width  = window.innerWidth;
        diceCanvas.height = tempWidth;
    }
    else {
        diceCanvas.height = window.innerHeight;
        diceCanvas.width  = Math.floor(diceCanvas.height * 16 / 9);
    }

    textCanvas.width  = diceCanvas.width;
    textCanvas.height = diceCanvas.height;
    backgroundCanvas.width  = diceCanvas.width;
    backgroundCanvas.height = diceCanvas.height;
    stampCanvas.width  = diceCanvas.width;
    stampCanvas.height = diceCanvas.height;

    diceSize = diceCanvas.width * diceSizeFactor;
    stampSize = diceCanvas.width * stampSizeFactor;
    drawSize = diceCanvas.width * drawSizeFactor;
    textSize = diceCanvas.width * textSizeFactor;
    eraserSize = diceCanvas.width * eraserSizeFactor;
    socket.emit("redrawAll");
};

function preloadDiceImages() {
    for (let i = 0; i < diceImages.length; i++) {
        const img = new Image();
        img.src = diceImages[i];
        loadedDiceImages.push(img);
    }
};

function preloadStampImages() {
    for (let i = 0; i < stampImages.length; i++) {
        const img = new Image();
        img.src = stampImages[i];
        loadedStampImages.push(img);
    }
};

function redrawStrokes(dataArray) {
    clearDrawCanvas();
    dataArray.forEach((data) => {
        if (data.erase) {
            eraseOnCanvas(backgroundCtx, data.strokeArray, eraserSize);
        } else {
            drawLineOnCanvas(backgroundCtx, data.strokeArray, lineColour, drawSize, data.dashed);
        }
    });
};

function redrawStamps(dataArray) {
    clearStampCanvas();
    dataArray.forEach((data) => {
        drawStampOnCanvas(stampCtx, data.x, data.y, stampSize, data.value);
    });
};

function redrawDice(dataArray) {
    clearDiceCanvas();
    dataArray.forEach((data) => {
        drawDiceOnCanvas(diceCanvasCtx, data.x, data.y, diceSize, data.value);
    });
};

function redrawText(dataArray) {
    clearTextCanvas();
    dataArray.forEach((data) => {
        drawTextOnCanvas(textCanvasCtx, data.x, data.y, data.text);
    });
};

function drawLineOnCanvas(context, strokeDrawArray, color, size, dashed) {
    if (dashed) {
        context.setLineDash([10, 45]);
    } else {
        context.setLineDash([]);
    }
    context.lineWidth = size;
    context.lineCap = "round";
    context.strokeStyle = color;
    context.beginPath();
    context.moveTo(strokeDrawArray[0].x * diceCanvas.width, strokeDrawArray[0].y * diceCanvas.height);
    for (let i = 1; i < strokeDrawArray.length; i++) {
        context.lineTo(strokeDrawArray[i].x * diceCanvas.width, strokeDrawArray[i].y * diceCanvas.height);
    }
    context.stroke();
};

function eraseOnCanvas(context, strokeEraseArray, size) {
    for (let i = 1; i < strokeEraseArray.length; i++) {
        context.clearRect((strokeEraseArray[i].x * diceCanvas.width) - size / 2, (strokeEraseArray[i].y * diceCanvas.height) - size / 2, size, size);
    }
};

function drawStampOnCanvas(context, x, y, size, stampValue) {
    const stampIndex = stampValue - 1;
    if (stampIndex >= 0) {
        context.drawImage(
            loadedStampImages[stampIndex], 
            (x * diceCanvas.width) - size / 2, 
            (y * diceCanvas.height) - size / 2, 
            size, 
            size
        );
    }
};

function drawDiceOnCanvas(context, x, y, size, value) {
    const diceIndex = value - 1;
    if (diceIndex >= 0) {
        context.drawImage(
            loadedDiceImages[diceIndex], 
            (x * diceCanvas.width) - size / 2, 
            (y * diceCanvas.height) - size / 2, 
            size, 
            size
        );
    }
};

function drawTextOnCanvas(context, x, y, text) {
    context.font = textSize + 'px Crimson Pro';
    context.fillStyle = lineColour;
    context.fillText(text, x * diceCanvas.width, y * diceCanvas.height);
};

function commitText() {
    if (!textInput) return;

    const text = textInput.innerText || textInput.textContent;

    if (text.trim() !== '') {
        socket.emit("commitText", {
            text: text,
            x: textPosition.x, 
            y: textPosition.y + (textSize*0.51),
            canvasWidth: diceCanvas.width,
            canvasHeight: diceCanvas.height
        });
    }
    if (textInput.parentNode === canvasContainer) {
        canvasContainer.removeChild(textInput);
    }
    textInput = null;
};

function createTextInput(x, y) {
    if (textInput) {
        canvasContainer.removeChild(textInput);
    }
    textPosition = { x, y };

    textInput = document.createElement('div');
    textInput.contentEditable = true;
    textInput.style.position = 'absolute';
    textInput.style.textAlign = 'center';
    textInput.style.left = `${(x / diceCanvas.width) * diceCanvas.offsetWidth}px`;
    textInput.style.top = `${(y / diceCanvas.height) * diceCanvas.offsetHeight - (textSize/2)}px`;
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
            if (textInput && textInput.parentNode === canvasContainer) {
                canvasContainer.removeChild(textInput);
            }
            textInput = null;
        }
        if (e.key === 'Escape') {
            textInput.innerText = '';
            if (textInput.parentNode === canvasContainer) {
                canvasContainer.removeChild(textInput);
            }
            textInput = null;
        }
    });
};

function getMousePos(diceCanvas, evt) {
    const rect = diceCanvas.getBoundingClientRect();
    return {
        x: (evt.clientX - rect.left) * (diceCanvas.width / diceCanvas.clientWidth),
        y: (evt.clientY - rect.top) * (diceCanvas.height / diceCanvas.clientHeight)
    };
};

function highlightSelectedStamp() {
    const images = document.querySelectorAll("#stamp-toolbar img");
    images.forEach(img => {
        img.classList.toggle("selected", parseInt(img.dataset.index) === selectedStampValue);
    });
};

function highlightSelectedDrawTool() {
    const images = document.querySelectorAll("#draw-toolbar img");
    images.forEach(img => {
        img.classList.toggle("selected", parseInt(img.dataset.index) === selectedDrawToolValue);
    });
};


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
};

function updateDrawToolbar() {
    if (currentTool === "pen") {
        drawToolbar.innerHTML = "";

        drawImages.forEach((imgSrc, index) => {
            const img = document.createElement("img");
            img.src = imgSrc;
            img.alt = `Stroke ${index + 1}`;
            img.dataset.index = index + 1;

            img.addEventListener("click", () => {
              selectedDrawToolValue = index + 1;
              highlightSelectedDrawTool();  
            });

            drawToolbar.appendChild(img);
        });
        highlightSelectedDrawTool();

        drawToolbar.classList.add("show");
    } else {
        drawToolbar.classList.remove("show");
    }
};

function toggleAllButtonsOff() {
    diceModeCheckbox.checked = false;
    eraseModeCheckbox.checked = false;
    stampModeCheckbox.checked = false;
    drawModeCheckbox.checked = false;
    textModeCheckbox.checked = false;
};

function clearToolActions() {
    drawing = false;
    draggingDie = false;
    dieBeingDragged = { id: null };
    draggingText = false;
    textBeingDragged = { id: null };
    mouseDown = false;
};

function checkForDieUnderMouse(x, y, callback) {
    socket.emit("checkDieClick", {
        canvasWidth: diceCanvas.width,
        canvasHeight: diceCanvas.height, 
        x: x, 
        y: y,
        size: diceSize
    });
    
    socket.once("dieClickResult", (diceData) => {
        callback(diceData);
    });
};

function checkForTextUnderMouse(x, y, callback) {
    socket.emit("checkTextClick", {
        canvasWidth: diceCanvas.width,
        canvasHeight: diceCanvas.height, 
        x: x, 
        y: y
    });
    
    socket.once("textClickResult", (textData) => {
        callback(textData);
    });
};

function initialise() {
    resizeCanvas();
    preloadDiceImages();
    preloadStampImages();
    updateStampToolbar();
    updateDrawToolbar();
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
    updateDrawToolbar();
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
    updateDrawToolbar();
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
    updateDrawToolbar();
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
    updateDrawToolbar();
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
    updateDrawToolbar();
});

document.getElementById("clearCanvas").addEventListener("click", () => {
    socket.emit("clearCanvas");
});

document.getElementById("undoAction").addEventListener("click", () => {
    socket.emit("undoAction");
});

document.getElementById("clearDice").addEventListener("click", () => {
    socket.emit("clearDice");
});

document.getElementById("downloadCanvas").addEventListener("click", () => {
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");

    tempCanvas.width = diceCanvas.width;
    tempCanvas.height = diceCanvas.height;

    tempCtx.fillStyle = "white";
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    tempCtx.drawImage(backgroundCanvas, 0, 0);
    tempCtx.drawImage(textCanvas, 0, 0);
    tempCtx.drawImage(diceCanvas, 0, 0);

    const image = tempCanvas.toDataURL("image/png");

    const link = document.createElement("a");
    link.href = image;
    link.download = "cartograph_map.png";
    link.click();
});

window.addEventListener("resize", () => {
    resizeCanvas();
});

//User Inputs
diceCanvas.addEventListener("mousedown", (event) => {
    const mousePos = getMousePos(diceCanvas, event);
    mouseDown = true;
    
    checkForDieUnderMouse(mousePos.x, mousePos.y, (diceData) => {
        if (diceData.die) {
            draggingDie = true;
            dieBeingDragged = diceData.die;
            
            drawing = false;
        } else {
            if (currentTool === "stamp") {
                socket.emit("dropStamp", {
                    canvasWidth: diceCanvas.width,
                    canvasHeight: diceCanvas.height, 
                    x: mousePos.x, 
                    y: mousePos.y,
                    value: selectedStampValue
                });
            } else if (currentTool === "dice") {
                socket.emit("dropDice", {
                    canvasWidth: diceCanvas.width,
                    canvasHeight: diceCanvas.height, 
                    x: mousePos.x, 
                    y: mousePos.y,
                    spread: diceSpread,
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
        }
    });
});

diceCanvas.addEventListener("mouseup", () => {
    clearToolActions();
    if(strokeArray.length > 0) {
        socket.emit("draw", { strokeArray: strokeArray, canvasWidth: diceCanvas.width, canvasHeight: diceCanvas.height, dashed: selectedDrawToolValue === 2 });
    };
    if(eraseStrokeArray.length > 0) {
        socket.emit("erase", { strokeArray: eraseStrokeArray, canvasWidth: diceCanvas.width, canvasHeight: diceCanvas.height, erase: true });
    };
    strokeArray = [];
    eraseStrokeArray = [];
});

diceCanvas.addEventListener("mouseleave", () => {
    clearToolActions();
    if(strokeArray.length > 0) {
        socket.emit("draw", { strokeArray: strokeArray, canvasWidth: diceCanvas.width, canvasHeight: diceCanvas.height, dashed: selectedDrawToolValue === 2 });
    };
    if(eraseStrokeArray.length > 0) {
        socket.emit("erase", { strokeArray: eraseStrokeArray, canvasWidth: diceCanvas.width, canvasHeight: diceCanvas.height, erase: true });
    };
    strokeArray = [];
    eraseStrokeArray = [];
});

diceCanvas.addEventListener("mousemove", (event) => {
    const mousePos = getMousePos(diceCanvas, event);
    const x = mousePos.x;
    const y = mousePos.y;
    
    if (drawing) {
        if (currentTool === "eraser" && mouseDown) {
            eraseStrokeArray.push({x, y});
            socket.emit("client erase", { strokeArray: eraseStrokeArray, canvasWidth: diceCanvas.width, canvasHeight: diceCanvas.height, erase: true });
        } else if (currentTool === "pen" && mouseDown) {
            strokeArray.push({x, y});
            socket.emit("client draw", { strokeArray: strokeArray, canvasWidth: diceCanvas.width, canvasHeight: diceCanvas.height, dashed: selectedDrawToolValue === 2 });
        }
        lastX = x;
        lastY = y;
    } else if (draggingDie && dieBeingDragged) {
        socket.emit("moveDie", {
            id: dieBeingDragged.id,
            canvasWidth: diceCanvas.width,
            canvasHeight: diceCanvas.height, 
            x: mousePos.x, 
            y: mousePos.y,
        });
    } else if (draggingText && textBeingDragged) {
        socket.emit("moveText", {
            id: textBeingDragged.id,
            canvasWidth: diceCanvas.width,
            canvasHeight: diceCanvas.height, 
            x: mousePos.x, 
            y: mousePos.y,
        });
    }
});

diceCanvas.addEventListener("touchstart", handleTouchStart, { passive: false });
diceCanvas.addEventListener("touchmove", handleTouchMove, { passive: false });
diceCanvas.addEventListener("touchend", handleTouchEnd);
diceCanvas.addEventListener("touchcancel", handleTouchCancel);

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

function handleTouchStart(event) {
    event.preventDefault();
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        const rect = diceCanvas.getBoundingClientRect();
        const touchPos = {
            x: (touch.clientX - rect.left) * (diceCanvas.width / diceCanvas.clientWidth),
            y: (touch.clientY - rect.top) * (diceCanvas.height / diceCanvas.clientHeight)
        };
        
        mouseDown = true;
        
        checkForDieUnderMouse(touchPos.x, touchPos.y, (diceData) => {
            if (diceData.die) {
                draggingDie = true;
                dieBeingDragged = diceData.die;
                drawing = false;
            } else {
                if (currentTool === "stamp") {
                    socket.emit("dropStamp", {
                        canvasWidth: diceCanvas.width,
                        canvasHeight: diceCanvas.height, 
                        x: touchPos.x, 
                        y: touchPos.y,
                        value: selectedStampValue
                    });
                } else if (currentTool === "dice") {
                    socket.emit("dropDice", {
                        canvasWidth: diceCanvas.width,
                        canvasHeight: diceCanvas.height, 
                        x: touchPos.x, 
                        y: touchPos.y,
                        spread: diceSpread,
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
        });
    }
}

function handleTouchMove(event) {
    event.preventDefault();
    if (event.touches.length === 1 && mouseDown) {
        const touch = event.touches[0];
        const rect = diceCanvas.getBoundingClientRect();
        const touchPos = {
            x: (touch.clientX - rect.left) * (diceCanvas.width / diceCanvas.clientWidth),
            y: (touch.clientY - rect.top) * (diceCanvas.height / diceCanvas.clientHeight)
        };
        
        if (drawing) {
            if (currentTool === "eraser") {
                socket.emit("erase", { 
                    x: touchPos.x, 
                    y: touchPos.y, 
                    canvasWidth: diceCanvas.width, 
                    canvasHeight: diceCanvas.height, 
                    erase: true 
                });
            } else if (currentTool === "pen") {
                socket.emit("draw", { 
                    lastX, 
                    lastY, 
                    x: touchPos.x, 
                    y: touchPos.y, 
                    canvasWidth: diceCanvas.width, 
                    canvasHeight: diceCanvas.height,
                    dashed: selectedDrawToolValue === 2 
                });
            }
            lastX = touchPos.x;
            lastY = touchPos.y;
        } else if (draggingDie && dieBeingDragged) {
            socket.emit("moveDie", {
                id: dieBeingDragged.id,
                canvasWidth: diceCanvas.width,
                canvasHeight: diceCanvas.height, 
                x: touchPos.x, 
                y: touchPos.y,
            });
        } else if (draggingText && textBeingDragged) {
            socket.emit("moveText", {
                id: textBeingDragged.id,
                canvasWidth: diceCanvas.width,
                canvasHeight: diceCanvas.height, 
                x: touchPos.x, 
                y: touchPos.y,
            });
        }
    }
}

function handleTouchEnd() {
    clearToolActions();
};

function handleTouchCancel() {
    if (currentTool === "pen") {
        drawing = false;
    } else if (draggingDie && dieBeingDragged) {
        draggingDie = false;
        dieBeingDragged = { id: null };
    }
    mouseDown = false;
};

function clearDrawCanvas() {
    backgroundCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
}

function clearTextCanvas() {
    textCanvasCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
}

function clearDiceCanvas() {
    diceCanvasCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
}

function clearStampCanvas() {
    stampCtx.clearRect(0, 0, stampCanvas.width, stampCanvas.height);
}

socket.on("dieClickResult", (diceData) => {
    if (diceData.die) {
        draggingDie = true;
        dieBeingDragged = diceData.die;
    } else {
        socket.emit("dropDice", {
            canvasWidth: diceCanvas.width,
            canvasHeight: diceCanvas.height, 
            x: diceData.x, 
            y: diceData.y,
            spread: diceSpread,
            size: diceSize
        });
    }
});

socket.on("textClickResult", (textData) => {
    if (textData.text) {
        draggingText = true;
        textBeingDragged = textData.text;
    }
});

socket.off("textClickResult");
socket.off("dieClickResult");

socket.on("draw", (data) => {
    drawLineOnCanvas(backgroundCtx, data.strokeArray, lineColour, drawSize, data.dashed);
});

socket.on("client draw", (data) => {
    drawLineOnCanvas(backgroundCtx, data.strokeArray, lineColour, drawSize, data.dashed);
});

socket.on("erase", (data) => {
    eraseOnCanvas(backgroundCtx, data.strokeArray, eraserSize);
});

socket.on("client erase", (data) => {
    eraseOnCanvas(backgroundCtx, data.strokeArray, eraserSize);
});

socket.on("dropStamp", (stampData) => {
    drawStampOnCanvas(stampCtx, stampData.x, stampData.y, stampSize, stampData.value);
});

socket.on("dropDice", (data) => {
    data.forEach((die) => {
        drawDiceOnCanvas(diceCanvasCtx, die.x, die.y, diceSize, die.value);
    });
});

socket.on("updateDice", (data) => {
    diceCanvasCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
    redrawDice(data);
});

socket.on("writeText", (data) => {
    drawTextOnCanvas(textCanvasCtx, data.x, data.y, data.text);
});

socket.on("clearCanvas", () => {
    clearDrawCanvas();
    clearTextCanvas();
    clearDiceCanvas();
    clearStampCanvas();
});

socket.on("undoAction", () => {
    //@TODO
});

socket.on("clearDice", () => {
    diceCanvasCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
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
    redrawStamps(data);
});

socket.on("drawExistingDice", (data) => {
    redrawDice(data);
});

socket.on("drawExistingText", (data) => {
    redrawText(data);
});
