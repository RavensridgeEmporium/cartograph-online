const canvas = document.getElementById("whiteboard");
const ctx = canvas.getContext("2d");
const socket = io();

canvas.width = window.innerWidth * 0.8;
canvas.height = window.innerHeight * 0.8;

let drawing = false;
let erasing = false;
let diceDropMode = false; // Starts OFF
let lastX = 0, lastY = 0;

const diceImages = [
    "/dice_faces/face1.png",
    "/dice_faces/face2.png",
    "/dice_faces/face3.png",
    "/dice_faces/face4.png",
    "/dice_faces/face5.png",
    "/dice_faces/face6.png"
];

function resizeCanvas() {
    canvas.width = window.innerWidth * 0.8;
    canvas.height = window.innerHeight * 0.8;
}

resizeCanvas();

function getMousePos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (evt.clientX - rect.left) * (canvas.width / rect.width),
        y: (evt.clientY - rect.top) * (canvas.height / rect.height)
    };
}

// Erase mode toggle
document.getElementById("eraseMode").addEventListener("click", () => {
    erasing = !erasing;
    document.getElementById("eraseMode").textContent = erasing ? "Erase Mode: ON" : "Erase Mode: OFF";
});

document.getElementById("clearCanvas").addEventListener("click", () => {
    socket.emit("clearCanvas");
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Local clear
});

document.getElementById("toggleDiceDrop").addEventListener("click", () => {
    document.getElementById("toggleDiceDrop").textContent = diceDropMode ? "Dice Mode: OFF" : "Dice Mode: ON";
    diceDropMode = !diceDropMode;
    console.log("Dice drop mode: ", diceDropMode);
});

// Function to draw a single die
function drawDie(die) {
    const img = new Image();
    img.src = diceImages[die.value - 1]; // Get the correct face
    img.onload = () => {
        const scaledSize = die.size * (canvas.width / 1000); // Adjust base scale as needed
        ctx.drawImage(img, die.x - scaledSize / 2, die.y - scaledSize / 2, scaledSize, scaledSize);
    };
}

// Receive and draw dice from other users
socket.on("dropDice", (diceData) => {
    diceData.forEach(drawDie);
});

socket.on("clearCanvas", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

canvas.addEventListener("mousedown", (event) => {
    const mousePos = getMousePos(canvas, event);

    if (diceDropMode) {
        // Drop dice at the cursor position
        socket.emit("dropDice", { 
            x: mousePos.x, 
            y: mousePos.y,
            size: 40 * (canvas.width / 1000) // Scale dice size based on canvas width
        });
    
    } else {
        // Normal drawing behavior
        drawing = true;
        lastX = mousePos.x;
        lastY = mousePos.y;
    }    
});

canvas.addEventListener("mouseup", () => drawing = false);
canvas.addEventListener("mouseleave", () => drawing = false);

canvas.addEventListener("mousemove", (event) => {
    if (!drawing) return;

    const mousePos = getMousePos(canvas, event);
    const x = mousePos.x;
    const y = mousePos.y;

    if (erasing) {
        const eraserSize = 20 * (canvas.width / 1000);
        erase(x, y, eraserSize); // Local erasing
        socket.emit("erase", { x, y, size: eraserSize });
    } else {
        const lineWidth = 5 * (canvas.width / 1000);
        drawLine(lastX, lastY, x, y, "black", lineWidth); // Local drawing
        socket.emit("draw", { lastX, lastY, x, y, width: lineWidth });
    }
    lastX = x;
    lastY = y;
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
    history.forEach((data) => {
        if (data.erase) {
            erase(data.x, data.y, data.size);
        } else {
            const lineWidth = data.width || 5 * (canvas.width / 1000);
            drawLine(data.lastX, data.lastY, data.x, data.y, "black", lineWidth);
        }
    });
});

// Receive drawing updates from server
socket.on("draw", (data) => {
    const lineWidth = data.width || 5 * (canvas.width / 1000);
    drawLine(data.lastX, data.lastY, data.x, data.y, "black", lineWidth);
});

// Receive erase updates from server
socket.on("erase", (data) => {
    erase(data.x, data.y, data.size);
});

