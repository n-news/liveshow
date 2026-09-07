/* =========================================================
   LIVE REGIE
   Director + Camera Device
========================================================= */


/* =========================================================
   GLOBAL STATE
========================================================= */

let currentCamera = 1;

let recording = false;
let recordSeconds = 0;
let recordInterval = null;

let notificationTimeout = null;

let localStream = null;
let currentFacingMode = "environment";


/* =========================================================
   CAMERA COUNT
========================================================= */

const TOTAL_CAMERAS = 9;


/* =========================================================
   URL / MODE
========================================================= */

const params = new URLSearchParams(window.location.search);

const pageMode = params.get("mode");
const cameraParameter = parseInt(params.get("cam"), 10);

const isCameraMode =
    pageMode === "camera";


/* =========================================================
   DOM
========================================================= */

const programCamera =
    document.getElementById("programCamera");

const programCameraBig =
    document.getElementById("programCameraBig");

const programVideo =
    document.getElementById("programVideo");

const programPlaceholder =
    document.getElementById("programPlaceholder");

const programMonitor =
    document.getElementById("programMonitor");

const programTime =
    document.getElementById("programTime");

const recordTimer =
    document.getElementById("recordTimer");

const recordStatus =
    document.getElementById("recordStatus");

const recordButton =
    document.getElementById("recordButton");

const cutButton =
    document.getElementById("cutButton");

const fadeButton =
    document.getElementById("fadeButton");

const notification =
    document.getElementById("notification");

const notificationText =
    document.getElementById("notificationText");

const onlineCount =
    document.getElementById("onlineCount");

const systemCameraText =
    document.getElementById("systemCameraText");


/* =========================================================
   CAMERA STATE
========================================================= */

const cameraStates = {};

for (let i = 1; i <= TOTAL_CAMERAS; i++) {
    cameraStates[i] = {
        online: false,
        device: "NO DEVICE"
    };
}


/* =========================================================
   INITIALIZE
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    if (isCameraMode) {
        initializeCameraPage();
    } else {
        initializeDirector();
    }

});


/* =========================================================
   DIRECTOR INITIALIZATION
========================================================= */

function initializeDirector() {

    document.body.classList.remove("camera-page");

    updateProgramDisplay();

    setupCameraButtons();

    setupCameraCards();

    setupKeyboard();

    setupQrSystem();

    updateOnlineCount();

    showNotification(
        "REGIE SYSTEM READY"
    );

    console.log(
        "LIVE REGIE initialized"
    );

}


/* =========================================================
   CAMERA BUTTONS
========================================================= */

function setupCameraButtons() {

    for (let i = 1; i <= TOTAL_CAMERAS; i++) {

        const button =
            document.getElementById(
                `cameraButton${i}`
            );

        if (!button) continue;

        button.addEventListener(
            "click",
            () => {

                switchCamera(
                    i,
                    "cut"
                );

            }
        );

    }

}


/* =========================================================
   CAMERA CARDS
========================================================= */

function setupCameraCards() {

    for (let i = 1; i <= TOTAL_CAMERAS; i++) {

        const card =
            document.getElementById(
                `cameraCard${i}`
            );

        if (!card) continue;

        card.addEventListener(
            "click",
            () => {

                switchCamera(
                    i,
                    "cut"
                );

            }
        );

    }

}


/* =========================================================
   SWITCH CAMERA
========================================================= */

function switchCamera(
    cameraNumber,
    transition = "cut"
) {

    if (
        cameraNumber < 1 ||
        cameraNumber > TOTAL_CAMERAS
    ) {
        return;
    }


    if (cameraNumber === currentCamera) {

        showNotification(
            `CAM ${cameraNumber} BEREITS PROGRAM`
        );

        return;
    }


    currentCamera =
        cameraNumber;


    updateProgramDisplay();


    if (transition === "fade") {

        playFadeTransition();

        showNotification(
            `FADE → CAM ${cameraNumber}`
        );

    } else {

        showNotification(
            `CUT → CAM ${cameraNumber}`
        );

    }


    console.log(
        `PROGRAM switched to CAM ${cameraNumber}`
    );

}


/* =========================================================
   UPDATE PROGRAM DISPLAY
========================================================= */

function updateProgramDisplay() {

    programCamera.textContent =
        currentCamera;

    programCameraBig.textContent =
        currentCamera;


    for (
        let i = 1;
        i <= TOTAL_CAMERAS;
        i++
    ) {

        const card =
            document.getElementById(
                `cameraCard${i}`
            );

        const button =
            document.getElementById(
                `cameraButton${i}`
            );


        if (card) {

            card.classList.toggle(
                "active",
                i === currentCamera
            );

        }


        if (button) {

            button.classList.toggle(
                "active",
                i === currentCamera
            );

        }

    }


    updateProgramVideo();

}


/* =========================================================
   PROGRAM VIDEO
========================================================= */

function updateProgramVideo() {

    const video =
        document.getElementById(
            `cameraVideo${currentCamera}`
        );

    if (!video) {
        return;
    }


    if (
        video.srcObject &&
        video.readyState >= 2
    ) {

        programVideo.srcObject =
            video.srcObject;

        programVideo.style.display =
            "block";

        programPlaceholder.style.display =
            "none";

    } else {

        programVideo.srcObject =
            null;

        programVideo.style.display =
            "none";

        programPlaceholder.style.display =
            "flex";

    }

}


/* =========================================================
   FADE
========================================================= */

function playFadeTransition() {

    programMonitor.animate(
        [
            {
                opacity: 1
            },
            {
                opacity: .1
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


/* =========================================================
   CUT
========================================================= */

function cutToOtherCamera() {

    let nextCamera =
        currentCamera + 1;

    if (
        nextCamera >
        TOTAL_CAMERAS
    ) {
        nextCamera = 1;
    }


    switchCamera(
        nextCamera,
        "cut"
    );

}


/* =========================================================
   FADE
========================================================= */

function fadeToOtherCamera() {

    let nextCamera =
        currentCamera + 1;

    if (
        nextCamera >
        TOTAL_CAMERAS
    ) {
        nextCamera = 1;
    }


    switchCamera(
        nextCamera,
        "fade"
    );

}


/* =========================================================
   KEYBOARD
========================================================= */

function setupKeyboard() {

    document.addEventListener(
        "keydown",
        (event) => {

            /*
             * Don't trigger shortcuts while
             * typing into an input.
             */

            if (
                event.target.tagName === "INPUT" ||
                event.target.tagName === "TEXTAREA"
            ) {
                return;
            }


            /*
             * 1 - 9
             */

            if (
                event.key >= "1" &&
                event.key <= "9"
            ) {

                switchCamera(
                    parseInt(event.key, 10),
                    "cut"
                );

                return;
            }


            /*
             * SPACE = CUT
             */

            if (
                event.code === "Space"
            ) {

                event.preventDefault();

                cutToOtherCamera();

                return;
            }


            /*
             * F = FADE
             */

            if (
                event.key.toLowerCase() === "f"
            ) {

                fadeToOtherCamera();

                return;
            }


            /*
             * R = RECORD
             */

            if (
                event.key.toLowerCase() === "r"
            ) {

                toggleRecording();

                return;
            }


            /*
             * ESC = STOP RECORDING
             */

            if (
                event.key === "Escape" &&
                recording
            ) {

                stopRecording();

            }

        }
    );

}


/* =========================================================
   RECORDING
========================================================= */

function toggleRecording() {

    if (recording) {

        stopRecording();

    } else {

        startRecording();

    }

}


/*
 * IMPORTANT:
 * This is currently the REGIE RECORDING STATE.
 *
 * Real recording of the switched WebRTC
 * PROGRAM output will be added once
 * the WebRTC connection is implemented.
 */

function startRecording() {

    if (recording) {
        return;
    }


    recording = true;

    recordSeconds = 0;


    recordStatus.classList.add(
        "recording"
    );

    recordButton.classList.add(
        "recording"
    );


    recordTimer.textContent =
        "00:00:00";


    programTime.textContent =
        "00:00:00";


    recordInterval =
        setInterval(
            () => {

                recordSeconds++;

                const formatted =
                    formatTime(
                        recordSeconds
                    );

                recordTimer.textContent =
                    formatted;

                programTime.textContent =
                    formatted;

            },
            1000
        );


    showNotification(
        "● AUFNAHME GESTARTET"
    );

}


function stopRecording() {

    if (!recording) {
        return;
    }


    recording = false;


    clearInterval(
        recordInterval
    );

    recordInterval = null;


    recordStatus.classList.remove(
        "recording"
    );

    recordButton.classList.remove(
        "recording"
    );


    showNotification(
        "AUFNAHME GESTOPPT"
    );

}


/* =========================================================
   TIME FORMAT
========================================================= */

function formatTime(totalSeconds) {

    const hours =
        Math.floor(
            totalSeconds / 3600
        );

    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );

    const seconds =
        totalSeconds % 60;


    return [
        hours,
        minutes,
        seconds
    ]
        .map(
            value =>
                String(value).padStart(
                    2,
                    "0"
                )
        )
        .join(":");

}


/* =========================================================
   BUTTON EVENTS
========================================================= */

if (cutButton) {

    cutButton.addEventListener(
        "click",
        cutToOtherCamera
    );

}


if (fadeButton) {

    fadeButton.addEventListener(
        "click",
        fadeToOtherCamera
    );

}


if (recordButton) {

    recordButton.addEventListener(
        "click",
        toggleRecording
    );

}


/* =========================================================
   NOTIFICATIONS
========================================================= */

function showNotification(message) {

    if (
        !notification ||
        !notificationText
    ) {
        return;
    }


    notificationText.textContent =
        message;


    notification.classList.add(
        "show"
    );


    clearTimeout(
        notificationTimeout
    );


    notificationTimeout =
        setTimeout(
            () => {

                notification.classList.remove(
                    "show"
                );

            },
            1800
        );

}


/* =========================================================
   QR SYSTEM
========================================================= */

function setupQrSystem() {

    const qrButton =
        document.getElementById(
            "qrButton"
        );

    const qrModal =
        document.getElementById(
            "qrModal"
        );

    const closeQr =
        document.getElementById(
            "closeQr"
        );


    if (!qrButton) {
        return;
    }


    qrButton.addEventListener(
        "click",
        () => {

            qrModal.classList.remove(
                "hidden"
            );

            generateQrCode(
                1
            );

        }
    );


    closeQr.addEventListener(
        "click",
        () => {

            qrModal.classList.add(
                "hidden"
            );

        }
    );


    qrModal.addEventListener(
        "click",
        (event) => {

            if (
                event.target ===
                qrModal
            ) {

                qrModal.classList.add(
                    "hidden"
                );

            }

        }
    );


    const selectorButtons =
        document.querySelectorAll(
            "[data-qr-camera]"
        );


    selectorButtons.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const camera =
                        parseInt(
                            button.dataset.qrCamera,
                            10
                        );

                    generateQrCode(
                        camera
                    );

                }
            );

        }
    );

}


/* =========================================================
   GENERATE QR
========================================================= */

function generateQrCode(
    cameraNumber
) {

    const qrContainer =
        document.getElementById(
            "qrcode"
        );

    const selected =
        document.getElementById(
            "qrSelectedCamera"
        );

    const urlText =
        document.getElementById(
            "qrUrlText"
        );


    if (!qrContainer) {
        return;
    }


    qrContainer.innerHTML = "";


    const baseUrl =
        window.location.origin +
        window.location.pathname;


    const cameraUrl =
        `${baseUrl}?mode=camera&cam=${cameraNumber}`;


    new QRCode(
        qrContainer,
        {
            text: cameraUrl,

            width: 190,
            height: 190,

            colorDark: "#000000",
            colorLight: "#ffffff",

            correctLevel:
                QRCode.CorrectLevel.M
        }
    );


    selected.textContent =
        cameraNumber;


    urlText.textContent =
        cameraUrl;


    document
        .querySelectorAll(
            "[data-qr-camera]"
        )
        .forEach(
            button => {

                button.classList.toggle(
                    "active",
                    parseInt(
                        button.dataset.qrCamera,
                        10
                    ) === cameraNumber
                );

            }
        );

}


/* =========================================================
   ONLINE CAMERA COUNT
========================================================= */

function updateOnlineCount() {

    let count = 0;


    for (
        let i = 1;
        i <= TOTAL_CAMERAS;
        i++
    ) {

        if (
            cameraStates[i].online
        ) {
            count++;
        }

    }


    if (onlineCount) {

        onlineCount.textContent =
            count;

    }


    if (systemCameraText) {

        systemCameraText.textContent =
            `${count} CAMERAS ONLINE`;

    }

}


/* =========================================================
   SET CAMERA ONLINE
========================================================= */

function setCameraOnline(
    cameraNumber,
    deviceName = "CAMERA DEVICE"
) {

    if (
        cameraNumber < 1 ||
        cameraNumber > TOTAL_CAMERAS
    ) {
        return;
    }


    cameraStates[
        cameraNumber
    ].online = true;


    cameraStates[
        cameraNumber
    ].device = deviceName;


    const status =
        document.getElementById(
            `cameraStatus${cameraNumber}`
        );

    const device =
        document.getElementById(
            `cameraDevice${cameraNumber}`
        );

    const placeholder =
        document.getElementById(
            `cameraPlaceholder${cameraNumber}`
        );


    if (status) {

        status.textContent =
            "ONLINE";

        status.classList.remove(
            "waiting",
            "offline"
        );

        status.classList.add(
            "online"
        );

    }


    if (device) {

        device.textContent =
            deviceName;

    }


    if (placeholder) {

        placeholder.style.display =
            "flex";

    }


    updateOnlineCount();

    updateProgramVideo();

}


/* =========================================================
   CAMERA DEVICE PAGE
========================================================= */

function initializeCameraPage() {

    document.body.classList.add(
        "camera-page"
    );


    let selectedCamera =
        cameraParameter;


    if (
        !selectedCamera ||
        selectedCamera < 1 ||
        selectedCamera > TOTAL_CAMERAS
    ) {

        selectedCamera = 1;

    }


    const selectedCameraNumber =
        document.getElementById(
            "selectedCameraNumber"
        );

    const deviceCameraText =
        document.getElementById(
            "deviceCameraText"
        );


    selectedCameraNumber.textContent =
        selectedCamera;

    deviceCameraText.textContent =
        `CAM ${selectedCamera}`;


    document.title =
        `LIVE REGIE — CAM ${selectedCamera}`;


    const startButton =
        document.getElementById(
            "startCameraButton"
        );

    const switchButton =
        document.getElementById(
            "switchCameraButton"
        );


    startButton.addEventListener(
        "click",
        startLocalCamera
    );


    switchButton.addEventListener(
        "click",
        switchLocalCamera
    );


    showCameraStatus(
        "READY",
        false
    );

}


/* =========================================================
   START LOCAL CAMERA
========================================================= */

async function startLocalCamera() {

    const video =
        document.getElementById(
            "localCameraVideo"
        );

    const placeholder =
        document.getElementById(
            "localCameraPlaceholder"
        );

    const startButton =
        document.getElementById(
            "startCameraButton"
        );

    const deviceStatus =
        document.getElementById(
            "deviceStatusText"
        );

    const deviceMic =
        document.getElementById(
            "deviceMicText"
        );


    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {

        showCameraError(
            "KAMERA WIRD VON DIESEM BROWSER NICHT UNTERSTÜTZT."
        );

        return;

    }


    try {

        /*
         * Stop previous stream.
         */

        if (localStream) {

            localStream
                .getTracks()
                .forEach(
                    track =>
                        track.stop()
                );

        }


        localStream =
            await navigator.mediaDevices.getUserMedia(
                {
                    video: {
                        facingMode:
                            currentFacingMode,

                        width: {
                            ideal: 1920
                        },

                        height: {
                            ideal: 1080
                        }
                    },

                    audio: true
                }
            );


        video.srcObject =
            localStream;


        video.style.display =
            "block";

        placeholder.style.display =
            "none";


        deviceStatus.textContent =
            "ONLINE";

        deviceStatus.style.color =
            "var(--green)";


        deviceMic.textContent =
            "ONLINE";

        deviceMic.style.color =
            "var(--green)";


        startButton.textContent =
            "● KAMERA ONLINE";


        showCameraStatus(
            "CAMERA ONLINE",
            true
        );


        /*
         * This event is ready for WebRTC.
         */

        window.dispatchEvent(
            new CustomEvent(
                "cameraStreamReady",
                {
                    detail: {
                        stream:
                            localStream,

                        camera:
                            cameraParameter || 1
                    }
                }
            )
        );


        console.log(
            "Local camera started",
            localStream
        );


    } catch (error) {

        console.error(
            "Camera error:",
            error
        );


        showCameraError(
            "KAMERA-ZUGRIFF WURDE NICHT ERLAUBT."
        );

    }

}


/* =========================================================
   SWITCH FRONT / BACK CAMERA
========================================================= */

async function switchLocalCamera() {

    if (
        !localStream
    ) {

        await startLocalCamera();

        return;

    }


    currentFacingMode =
        currentFacingMode ===
        "environment"
            ? "user"
            : "environment";


    await startLocalCamera();

}


/* =========================================================
   CAMERA STATUS
========================================================= */

function showCameraStatus(
    text,
    online
) {

    const status =
        document.getElementById(
            "cameraModeStatus"
        );

    const dot =
        document.getElementById(
            "cameraModeDot"
        );


    status.textContent =
        text;


    if (online) {

        dot.classList.remove(
            "red"
        );

        dot.classList.add(
            "green"
        );

    } else {

        dot.classList.remove(
            "green"
        );

        dot.classList.add(
            "red"
        );

    }

}


/* =========================================================
   CAMERA ERROR
========================================================= */

function showCameraError(
    message
) {

    const deviceStatus =
        document.getElementById(
            "deviceStatusText"
        );


    if (deviceStatus) {

        deviceStatus.textContent =
            "FEHLER";

        deviceStatus.style.color =
            "var(--red)";

    }


    showCameraStatus(
        "CAMERA ERROR",
        false
    );


    alert(
        message
    );

}


/* =========================================================
   CLEANUP CAMERA
========================================================= */

window.addEventListener(
    "beforeunload",
    () => {

        if (localStream) {

            localStream
                .getTracks()
                .forEach(
                    track =>
                        track.stop()
                );

        }

    }
);


/* =========================================================
   DEBUG
========================================================= */

console.log(
    "LIVE REGIE script loaded."
);

console.log(
    "Mode:",
    isCameraMode
        ? "CAMERA"
        : "DIRECTOR"
);

console.log(
    "Camera:",
    cameraParameter || "REGIE"
);
