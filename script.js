// =========================================================
// LIVE REGIE — CONTROL SYSTEM
// =========================================================

let currentCamera = 1;
let recordSeconds = 0;
let recording = false;
let recordInterval = null;


// =========================================================
// ELEMENTS
// =========================================================

const programCamera = document.getElementById("programCamera");
const programCameraBig = document.getElementById("programCameraBig");
const programTime = document.getElementById("programTime");
const recordTimer = document.getElementById("recordTimer");

const cameraCard1 = document.getElementById("cameraCard1");
const cameraCard2 = document.getElementById("cameraCard2");

const cameraButton1 = document.getElementById("cameraButton1");
const cameraButton2 = document.getElementById("cameraButton2");

const cutButton = document.getElementById("cutButton");
const fadeButton = document.getElementById("fadeButton");

const notification = document.getElementById("notification");
const notificationText = document.getElementById("notificationText");


// =========================================================
// CAMERA SWITCHING
// =========================================================

function switchCamera(cameraNumber, transition = "cut") {

    if (cameraNumber !== 1 && cameraNumber !== 2) {
        return;
    }

    if (cameraNumber === currentCamera) {
        showNotification(`CAM ${cameraNumber} ist bereits PROGRAM`);
        return;
    }

    const oldCamera = currentCamera;

    currentCamera = cameraNumber;

    updateProgramDisplay();

    if (transition === "fade") {
        playFadeTransition();
    }

    showNotification(
        `${transition === "fade" ? "FADE" : "CUT"} → CAM ${cameraNumber}`
    );

    console.log(
        `Switch: CAM ${oldCamera} → CAM ${cameraNumber}`
    );
}


// =========================================================
// UPDATE PROGRAM DISPLAY
// =========================================================

function updateProgramDisplay() {

    programCamera.textContent = currentCamera;
    programCameraBig.textContent = currentCamera;

    cameraCard1.classList.remove("active");
    cameraCard2.classList.remove("active");

    cameraButton1.classList.remove("active");
    cameraButton2.classList.remove("active");

    cameraCard1.querySelector(".camera-status").classList.remove("online");
    cameraCard1.querySelector(".camera-status").classList.remove("waiting");

    cameraCard2.querySelector(".camera-status").classList.remove("online");
    cameraCard2.querySelector(".camera-status").classList.remove("waiting");


    if (currentCamera === 1) {

        cameraCard1.classList.add("active");
        cameraButton1.classList.add("active");

        cameraButton1.querySelector(".button-state").textContent =
            "PROGRAM";

        cameraButton2.querySelector(".button-state").textContent =
            "PREVIEW";

    } else {

        cameraCard2.classList.add("active");
        cameraButton2.classList.add("active");

        cameraButton2.querySelector(".button-state").textContent =
            "PROGRAM";

        cameraButton1.querySelector(".button-state").textContent =
            "PREVIEW";
    }
}


// =========================================================
// FADE TRANSITION
// =========================================================

function playFadeTransition() {

    const monitor = document.querySelector(".program-monitor");

    monitor.animate(
        [
            {
                opacity: 1
            },
            {
                opacity: 0.15
            },
            {
                opacity: 1
            }
        ],
        {
            duration: 450,
            easing: "ease-in-out"
        }
    );
}


// =========================================================
// CUT BUTTON
// =========================================================

cutButton.addEventListener("click", () => {

    const nextCamera =
        currentCamera === 1 ? 2 : 1;

    switchCamera(nextCamera, "cut");
});


// =========================================================
// FADE BUTTON
// =========================================================

fadeButton.addEventListener("click", () => {

    const nextCamera =
        currentCamera === 1 ? 2 : 1;

    switchCamera(nextCamera, "fade");
});


// =========================================================
// CAMERA BUTTONS
// =========================================================

cameraButton1.addEventListener("click", () => {
    switchCamera(1, "cut");
});

cameraButton2.addEventListener("click", () => {
    switchCamera(2, "cut");
});


// =========================================================
// KEYBOARD CONTROL
// =========================================================

document.addEventListener("keydown", (event) => {

    // Don't trigger controls while typing
    if (
        event.target.tagName === "INPUT" ||
        event.target.tagName === "TEXTAREA"
    ) {
        return;
    }


    // CAMERA 1
    if (event.key === "1") {
        switchCamera(1, "cut");
    }


    // CAMERA 2
    if (event.key === "2") {
        switchCamera(2, "cut");
    }


    // CUT
    if (event.code === "Space") {

        event.preventDefault();

        const nextCamera =
            currentCamera === 1 ? 2 : 1;

        switchCamera(nextCamera, "cut");
    }


    // FADE
    if (event.key.toLowerCase() === "f") {

        const nextCamera =
            currentCamera === 1 ? 2 : 1;

        switchCamera(nextCamera, "fade");
    }


    // RECORD
    if (event.key.toLowerCase() === "r") {

        toggleRecording();
    }


    // ESC
    if (event.key === "Escape") {

        if (recording) {
            stopRecording();
        }
    }

});


// =========================================================
// NOTIFICATION
// =========================================================

let notificationTimeout;

function showNotification(message) {

    notificationText.textContent = message;

    notification.classList.add("show");

    clearTimeout(notificationTimeout);

    notificationTimeout = setTimeout(() => {

        notification.classList.remove("show");

    }, 1800);
}


// =========================================================
// RECORDING TIMER
// =========================================================

function toggleRecording() {

    if (recording) {
        stopRecording();
    } else {
        startRecording();
    }
}


function startRecording() {

    if (recording) {
        return;
    }

    recording = true;
    recordSeconds = 0;

    updateRecordTimer();

    recordInterval = setInterval(() => {

        recordSeconds++;

        updateRecordTimer();

    }, 1000);

    showNotification("● AUFNAHME GESTARTET");

    console.log("Recording started");
}


function stopRecording() {

    if (!recording) {
        return;
    }

    recording = false;

    clearInterval(recordInterval);

    recordInterval = null;

    showNotification("■ AUFNAHME GESTOPPT");

    console.log("Recording stopped");
}


function updateRecordTimer() {

    recordTimer.textContent =
        formatTime(recordSeconds);

    programTime.textContent =
        formatTime(recordSeconds);
}


// =========================================================
// TIME FORMAT
// =========================================================

function formatTime(totalSeconds) {

    const hours =
        Math.floor(totalSeconds / 3600);

    const minutes =
        Math.floor((totalSeconds % 3600) / 60);

    const seconds =
        totalSeconds % 60;


    return (
        String(hours).padStart(2, "0") +
        ":" +
        String(minutes).padStart(2, "0") +
        ":" +
        String(seconds).padStart(2, "0")
    );
}


// =========================================================
// INITIAL STATE
// =========================================================

updateProgramDisplay();

console.log("=================================");
console.log("LIVE REGIE SYSTEM");
console.log("Control system initialized");
console.log("CAM 1 / CAM 2 ready");
console.log("Keyboard: 1 / 2 / SPACE / F / R");
console.log("=================================");
