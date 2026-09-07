/* =========================================================
   LIVE REGIE
   WebRTC + Supabase Realtime
   ========================================================= */


/* =========================================================
   SUPABASE
   ========================================================= */

const SUPABASE_URL =
    "https://aweburrixtbmdwuysrnk.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_6NUyHWlGPe2U4-XTEn2TFw_UV1XQspK";

const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );


/* =========================================================
   SESSION
   ========================================================= */

const params = new URLSearchParams(window.location.search);

let sessionId = params.get("session");

if (!sessionId) {
    sessionId = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

    const newUrl =
        `${window.location.pathname}?session=${sessionId}`;

    window.history.replaceState({}, "", newUrl);
}

const isCameraMode =
    params.get("mode") === "camera";

let cameraNumber =
    parseInt(params.get("cam"), 10) || 1;

if (cameraNumber < 1 || cameraNumber > 9) {
    cameraNumber = 1;
}


/* =========================================================
   CONSTANTS
   ========================================================= */

const MAX_CAMERAS = 9;

const ICE_SERVERS = [
    {
        urls: "stun:stun.l.google.com:19302"
    },
    {
        urls: "stun:stun1.l.google.com:19302"
    }
];


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let currentCamera = 1;

const remoteStreams = {};

const directorPeers = {};

let localStream = null;
let cameraPeer = null;

let channel = null;

let recording = false;
let recordingStartTime = null;
let recordingTimerInterval = null;

let programClockStart = Date.now();


/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}

function notify(message) {
    const notification = $("notification");
    const text = $("notificationText");

    if (text) {
        text.textContent = message;
    }

    if (notification) {
        notification.classList.add("show");

        clearTimeout(notification._timer);

        notification._timer = setTimeout(() => {
            notification.classList.remove("show");
        }, 2500);
    }
}


/* =========================================================
   SESSION CHANNEL
   ========================================================= */

function createChannel() {

    channel = supabaseClient.channel(
        `live-regie-${sessionId}`,
        {
            config: {
                broadcast: {
                    self: false
                },
                presence: {
                    key: crypto.randomUUID
                }
            }
        }
    );

    channel
        .on(
            "broadcast",
            {
                event: "webrtc"
            },
            ({ payload }) => {

                if (!payload) return;

                handleWebRTCMessage(payload);
            }
        )
        .on(
            "broadcast",
            {
                event: "camera-status"
            },
            ({ payload }) => {

                if (!payload) return;

                handleCameraStatus(payload);
            }
        )
        .on(
            "presence",
            {
                event: "sync"
            },
            () => {

                updatePresenceStatus();
            }
        )
        .on(
            "presence",
            {
                event: "join"
            },
            () => {

                updatePresenceStatus();
            }
        )
        .on(
            "presence",
            {
                event: "leave"
            },
            () => {

                updatePresenceStatus();
            }
        );

    channel.subscribe(async (status) => {

        if (status === "SUBSCRIBED") {

            console.log(
                "Supabase Realtime verbunden:",
                sessionId
            );

            await publishPresence();

            if (!isCameraMode) {
                notify(`SESSION ${sessionId} ONLINE`);
            } else {
                notify(`CAM ${cameraNumber} BEREIT`);
            }

        } else {

            console.log(
                "Supabase Status:",
                status
            );
        }
    });
}


/* =========================================================
   PRESENCE
   ========================================================= */

async function publishPresence() {

    if (!channel) return;

    try {

        if (isCameraMode) {

            await channel.track({
                role: "camera",
                camera: cameraNumber
            });

        } else {

            await channel.track({
                role: "director"
            });

        }

    } catch (error) {

        console.error(
            "Presence Fehler:",
            error
        );
    }
}


function updatePresenceStatus() {

    if (!channel) return;

    const state = channel.presenceState();

    let online = 0;

    Object.values(state).forEach(entries => {

        entries.forEach(entry => {

            if (
                entry.role === "camera" &&
                entry.camera >= 1 &&
                entry.camera <= MAX_CAMERAS
            ) {
                online++;
            }

        });

    });

    if (!isCameraMode) {

        updateOnlineCount(online);

    }
}


/* =========================================================
   BROADCAST
   ========================================================= */

async function broadcast(payload) {

    if (!channel) return;

    try {

        await channel.send({
            type: "broadcast",
            event: payload.event,
            payload: payload
        });

    } catch (error) {

        console.error(
            "Broadcast Fehler:",
            error
        );
    }
}


/* =========================================================
   CAMERA STATUS
   ========================================================= */

function handleCameraStatus(payload) {

    const cam = Number(payload.camera);

    if (
        !cam ||
        cam < 1 ||
        cam > MAX_CAMERAS
    ) {
        return;
    }

    if (!isCameraMode) {

        if (payload.status === "online") {

            setCameraOnline(
                cam,
                payload.device || "CAMERA DEVICE"
            );

        }

        if (payload.status === "offline") {

            setCameraOffline(cam);

        }

        updateOnlineCountFromCards();
    }
}


function setCameraOnline(cam, deviceName) {

    const status = $(`cameraStatus${cam}`);
    const placeholder = $(`cameraPlaceholder${cam}`);
    const device = $(`cameraDevice${cam}`);

    if (status) {

        status.textContent = "ONLINE";

        status.classList.remove("waiting");
        status.classList.add("online");
    }

    if (placeholder) {
        placeholder.classList.add("hidden");
    }

    if (device) {
        device.textContent =
            deviceName || "CAMERA DEVICE";
    }
}


function setCameraOffline(cam) {

    const status = $(`cameraStatus${cam}`);
    const placeholder = $(`cameraPlaceholder${cam}`);
    const device = $(`cameraDevice${cam}`);

    if (status) {

        status.textContent = "WAITING";

        status.classList.remove("online");
        status.classList.add("waiting");
    }

    if (placeholder) {
        placeholder.classList.remove("hidden");
    }

    if (device) {
        device.textContent = "NO DEVICE";
    }
}


function updateOnlineCountFromCards() {

    let count = 0;

    for (let i = 1; i <= MAX_CAMERAS; i++) {

        const status = $(`cameraStatus${i}`);

        if (
            status &&
            status.classList.contains("online")
        ) {
            count++;
        }
    }

    updateOnlineCount(count);
}


function updateOnlineCount(count) {

    const onlineCount = $("onlineCount");
    const systemCameraText =
        $("systemCameraText");

    if (onlineCount) {
        onlineCount.textContent = count;
    }

    if (systemCameraText) {

        systemCameraText.textContent =
            `${count} CAMERAS ONLINE`;
    }
}


/* =========================================================
   WEBRTC MESSAGE ROUTER
   ========================================================= */

async function handleWebRTCMessage(payload) {

    const type = payload.type;

    if (!type) return;


    /* -----------------------------------------------------
       CAMERA SIDE
       ----------------------------------------------------- */

    if (isCameraMode) {

        if (payload.camera !== cameraNumber) {
            return;
        }

        if (type === "offer") {

            await handleCameraOffer(payload);
        }

        if (type === "ice") {

            await handleCameraICE(payload);
        }

        return;
    }


    /* -----------------------------------------------------
       DIRECTOR SIDE
       ----------------------------------------------------- */

    if (!isCameraMode) {

        if (type === "camera-hello") {

            await handleCameraHello(payload);
        }

        if (type === "answer") {

            await handleCameraAnswer(payload);
        }

        if (type === "ice") {

            await handleDirectorICE(payload);
        }
    }
}


/* =========================================================
   CAMERA HELLO
   ========================================================= */

async function sendCameraHello() {

    if (!isCameraMode) return;

    await broadcast({

        event: "webrtc",

        type: "camera-hello",

        camera: cameraNumber,

        session: sessionId,

        device:
            navigator.userAgent
    });

}


/* =========================================================
   DIRECTOR RECEIVES CAMERA HELLO
   ========================================================= */

async function handleCameraHello(payload) {

    const cam = Number(payload.camera);

    if (
        !cam ||
        cam < 1 ||
        cam > MAX_CAMERAS
    ) {
        return;
    }

    console.log(
        `CAM ${cam} meldet sich an`
    );

    setCameraOnline(
        cam,
        payload.device || "CAMERA DEVICE"
    );

    updateOnlineCountFromCards();

    notify(`CAM ${cam} VERBINDET`);

    await createDirectorOffer(cam);
}


/* =========================================================
   DIRECTOR CREATE OFFER
   ========================================================= */

async function createDirectorOffer(cam) {

    if (directorPeers[cam]) {

        try {
            directorPeers[cam].close();
        } catch (_) {}

        delete directorPeers[cam];
    }


    const peer =
        new RTCPeerConnection({
            iceServers: ICE_SERVERS
        });

    directorPeers[cam] = peer;


    /* -----------------------------------------------------
       RECEIVE CAMERA VIDEO
       ----------------------------------------------------- */

    peer.addTransceiver(
        "video",
        {
            direction: "recvonly"
        }
    );


    /* -----------------------------------------------------
       RECEIVE CAMERA AUDIO
       ----------------------------------------------------- */

    peer.addTransceiver(
        "audio",
        {
            direction: "recvonly"
        }
    );


    /* -----------------------------------------------------
       REMOTE STREAM
       ----------------------------------------------------- */

    peer.ontrack = (event) => {

        console.log(
            `CAM ${cam}: Track empfangen`
        );

        let stream =
            remoteStreams[cam];

        if (!stream) {

            stream =
                new MediaStream();

            remoteStreams[cam] =
                stream;
        }


        if (
            !stream.getTracks().some(
                track =>
                    track.id === event.track.id
            )
        ) {

            stream.addTrack(event.track);
        }


        attachRemoteStream(
            cam,
            stream
        );
    };


    /* -----------------------------------------------------
       ICE
       ----------------------------------------------------- */

    peer.onicecandidate = async (event) => {

        if (!event.candidate) return;

        await broadcast({

            event: "webrtc",

            type: "ice",

            camera: cam,

            candidate:
                event.candidate.toJSON()
        });
    };


    /* -----------------------------------------------------
       CONNECTION STATE
       ----------------------------------------------------- */

    peer.onconnectionstatechange = () => {

        const state =
            peer.connectionState;

        console.log(
            `CAM ${cam} WebRTC:`,
            state
        );


        if (
            state === "connected"
        ) {

            setCameraOnline(
                cam,
                "CAMERA CONNECTED"
            );

            updateOnlineCountFromCards();

            notify(
                `CAM ${cam} VERBUNDEN`
            );
        }


        if (
            state === "failed" ||
            state === "disconnected" ||
            state === "closed"
        ) {

            console.log(
                `CAM ${cam} Verbindung beendet`
            );
        }
    };


    /* -----------------------------------------------------
       CREATE OFFER
       ----------------------------------------------------- */

    try {

        const offer =
            await peer.createOffer();

        await peer.setLocalDescription(
            offer
        );


        await broadcast({

            event: "webrtc",

            type: "offer",

            camera: cam,

            offer: {
                type:
                    peer.localDescription.type,

                sdp:
                    peer.localDescription.sdp
            }
        });


        console.log(
            `Offer für CAM ${cam} gesendet`
        );

    } catch (error) {

        console.error(
            `Offer CAM ${cam}:`,
            error
        );
    }
}


/* =========================================================
   CAMERA RECEIVES OFFER
   ========================================================= */

async function handleCameraOffer(payload) {

    if (!localStream) {

        console.warn(
            "Kamera noch nicht gestartet"
        );

        return;
    }


    if (cameraPeer) {

        try {
            cameraPeer.close();
        } catch (_) {}
    }


    const peer =
        new RTCPeerConnection({
            iceServers: ICE_SERVERS
        });

    cameraPeer = peer;


    /* -----------------------------------------------------
       ADD LOCAL CAMERA + MICROPHONE
       ----------------------------------------------------- */

    localStream
        .getTracks()
        .forEach(track => {

            peer.addTrack(
                track,
                localStream
            );
        });


    /* -----------------------------------------------------
       ICE
       ----------------------------------------------------- */

    peer.onicecandidate = async (event) => {

        if (!event.candidate) return;

        await broadcast({

            event: "webrtc",

            type: "ice",

            camera: cameraNumber,

            candidate:
                event.candidate.toJSON()
        });
    };


    /* -----------------------------------------------------
       CONNECTION STATE
       ----------------------------------------------------- */

    peer.onconnectionstatechange = () => {

        const state =
            peer.connectionState;

        console.log(
            "Kamera WebRTC:",
            state
        );


        if (
            state === "connected"
        ) {

            setCameraDeviceConnected();

            broadcastCameraStatus(
                "online"
            );
        }


        if (
            state === "failed" ||
            state === "disconnected"
        ) {

            setCameraDeviceDisconnected();
        }
    };


    /* -----------------------------------------------------
       REMOTE DIRECTOR TRACKS
       ----------------------------------------------------- */

    peer.ontrack = () => {
        // Die Kamera sendet aktuell nur.
    };


    try {

        await peer.setRemoteDescription(
            new RTCSessionDescription(
                payload.offer
            )
        );


        const answer =
            await peer.createAnswer();


        await peer.setLocalDescription(
            answer
        );


        await broadcast({

            event: "webrtc",

            type: "answer",

            camera: cameraNumber,

            answer: {
                type:
                    peer.localDescription.type,

                sdp:
                    peer.localDescription.sdp
            }
        });


        console.log(
            "Answer an Regie gesendet"
        );


        setCameraDeviceConnecting();

    } catch (error) {

        console.error(
            "Camera Offer Fehler:",
            error
        );
    }
}


/* =========================================================
   DIRECTOR RECEIVES ANSWER
   ========================================================= */

async function handleCameraAnswer(payload) {

    const cam =
        Number(payload.camera);

    const peer =
        directorPeers[cam];

    if (!peer) {

        console.warn(
            `Kein Peer für CAM ${cam}`
        );

        return;
    }


    try {

        await peer.setRemoteDescription(
            new RTCSessionDescription(
                payload.answer
            )
        );

        console.log(
            `Answer CAM ${cam} akzeptiert`
        );

    } catch (error) {

        console.error(
            `Answer CAM ${cam}:`,
            error
        );
    }
}


/* =========================================================
   DIRECTOR ICE
   ========================================================= */

async function handleDirectorICE(payload) {

    const cam =
        Number(payload.camera);

    const peer =
        directorPeers[cam];

    if (!peer) return;

    try {

        await peer.addIceCandidate(
            new RTCIceCandidate(
                payload.candidate
            )
        );

    } catch (error) {

        console.error(
            `ICE CAM ${cam}:`,
            error
        );
    }
}


/* =========================================================
   CAMERA ICE
   ========================================================= */

async function handleCameraICE(payload) {

    if (!cameraPeer) return;

    try {

        await cameraPeer.addIceCandidate(
            new RTCIceCandidate(
                payload.candidate
            )
        );

    } catch (error) {

        console.error(
            "Camera ICE:",
            error
        );
    }
}


/* =========================================================
   REMOTE VIDEO
   ========================================================= */

function attachRemoteStream(
    cam,
    stream
) {

    const video =
        $(`cameraVideo${cam}`);

    const placeholder =
        $(`cameraPlaceholder${cam}`);

    if (!video) return;


    video.srcObject =
        stream;


    video.muted = true;


    video.play()
        .catch(() => {});


    if (placeholder) {
        placeholder.classList.add(
            "hidden"
        );
    }


    const status =
        $(`cameraStatus${cam}`);

    if (status) {

        status.textContent =
            "LIVE";

        status.classList.remove(
            "waiting"
        );

        status.classList.add(
            "online"
        );
    }


    const device =
        $(`cameraDevice${cam}`);

    if (device) {
        device.textContent =
            "WEBRTC CAMERA";
    }


    updateOnlineCountFromCards();


    if (currentCamera === cam) {

        updateProgramVideo();
    }
}


/* =========================================================
   PROGRAM
   ========================================================= */

function selectCamera(cam) {

    cam = Number(cam);

    if (
        cam < 1 ||
        cam > MAX_CAMERAS
    ) {
        return;
    }

    currentCamera = cam;

    updateProgramUI();

    updateProgramVideo();

    notify(
        `PROGRAM → CAM ${cam}`
    );
}


function updateProgramUI() {

    const programCamera =
        $("programCamera");

    const programCameraBig =
        $("programCameraBig");

    if (programCamera) {
        programCamera.textContent =
            currentCamera;
    }

    if (programCameraBig) {
        programCameraBig.textContent =
            currentCamera;
    }


    for (
        let i = 1;
        i <= MAX_CAMERAS;
        i++
    ) {

        const card =
            $(`cameraCard${i}`);

        const button =
            $(`cameraButton${i}`);

        const badge =
            $(`cameraProgramBadge${i}`);


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


        if (badge) {

            badge.classList.toggle(
                "hidden",
                i !== currentCamera
            );
        }
    }
}


function updateProgramVideo() {

    const programVideo =
        $("programVideo");

    const placeholder =
        $("programPlaceholder");

    if (!programVideo) return;


    const stream =
        remoteStreams[currentCamera];


    if (
        stream &&
        stream.getTracks().length > 0
    ) {

        programVideo.srcObject =
            stream;

        programVideo
            .play()
            .catch(() => {});


        if (placeholder) {
            placeholder.classList.add(
                "hidden"
            );
        }

    } else {

        programVideo.srcObject =
            null;

        if (placeholder) {
            placeholder.classList.remove(
                "hidden"
            );
        }
    }
}


/* =========================================================
   CUT
   ========================================================= */

function cutToCamera(cam) {

    selectCamera(cam);

    const monitor =
        $("programMonitor");

    if (!monitor) return;

    monitor.classList.add(
        "cut-flash"
    );

    setTimeout(() => {

        monitor.classList.remove(
            "cut-flash"
        );

    }, 180);
}


/* =========================================================
   FADE
   ========================================================= */

function fadeToCamera(cam) {

    const monitor =
        $("programMonitor");

    if (!monitor) {

        selectCamera(cam);
        return;
    }


    monitor.classList.add(
        "fade-transition"
    );


    setTimeout(() => {

        selectCamera(cam);

    }, 250);


    setTimeout(() => {

        monitor.classList.remove(
            "fade-transition"
        );

    }, 600);
}


/* =========================================================
   CAMERA BUTTONS
   ========================================================= */

function setupCameraButtons() {

    for (
        let i = 1;
        i <= MAX_CAMERAS;
        i++
    ) {

        const button =
            $(`cameraButton${i}`);

        if (!button) continue;

        button.addEventListener(
            "click",
            () => {

                selectCamera(i);
            }
        );
    }
}


/* =========================================================
   TRANSITION BUTTONS
   ========================================================= */

function setupDirectorControls() {

    const cutButton =
        $("cutButton");

    const fadeButton =
        $("fadeButton");

    const recordButton =
        $("recordButton");


    if (cutButton) {

        cutButton.addEventListener(
            "click",
            () => {

                let next =
                    currentCamera + 1;

                if (
                    next > MAX_CAMERAS
                ) {
                    next = 1;
                }

                cutToCamera(next);
            }
        );
    }


    if (fadeButton) {

        fadeButton.addEventListener(
            "click",
            () => {

                let next =
                    currentCamera + 1;

                if (
                    next > MAX_CAMERAS
                ) {
                    next = 1;
                }

                fadeToCamera(next);
            }
        );
    }


    if (recordButton) {

        recordButton.addEventListener(
            "click",
            toggleRecording
        );
    }
}


/* =========================================================
   KEYBOARD
   ========================================================= */

function setupKeyboard() {

    document.addEventListener(
        "keydown",
        (event) => {

            if (
                event.target.tagName ===
                    "INPUT" ||
                event.target.tagName ===
                    "TEXTAREA" ||
                event.target.tagName ===
                    "SELECT"
            ) {
                return;
            }


            const key =
                event.key.toLowerCase();


            /* 1-9 = CAMERA */

            if (
                key >= "1" &&
                key <= "9"
            ) {

                selectCamera(
                    Number(key)
                );

                return;
            }


            /* SPACE = CUT */

            if (
                event.code ===
                "Space"
            ) {

                event.preventDefault();

                let next =
                    currentCamera + 1;

                if (
                    next > MAX_CAMERAS
                ) {
                    next = 1;
                }

                cutToCamera(next);

                return;
            }


            /* F = FADE */

            if (key === "f") {

                let next =
                    currentCamera + 1;

                if (
                    next > MAX_CAMERAS
                ) {
                    next = 1;
                }

                fadeToCamera(next);

                return;
            }


            /* R = RECORD */

            if (key === "r") {

                toggleRecording();

                return;
            }


            /* ESC = STOP RECORDING */

            if (
                event.key ===
                "Escape"
            ) {

                if (recording) {
                    stopRecording();
                }
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
   Aktuell wird hier der Aufnahme-Zustand
   und Timer gesteuert.

   Die echte kombinierte MediaRecorder-Aufnahme
   kommt als nächster Schritt.
*/

function startRecording() {

    if (recording) return;

    recording = true;

    recordingStartTime =
        Date.now();


    const recordStatus =
        $("recordStatus");

    const recordButton =
        $("recordButton");


    if (recordStatus) {
        recordStatus.classList.add(
            "recording"
        );
    }


    if (recordButton) {

        recordButton.classList.add(
            "recording"
        );
    }


    updateRecordingTimer();


    recordingTimerInterval =
        setInterval(
            updateRecordingTimer,
            1000
        );


    notify(
        "AUFNAHME GESTARTET"
    );
}


function stopRecording() {

    if (!recording) return;

    recording = false;


    clearInterval(
        recordingTimerInterval
    );


    recordingTimerInterval =
        null;


    const recordStatus =
        $("recordStatus");

    const recordButton =
        $("recordButton");


    if (recordStatus) {
        recordStatus.classList.remove(
            "recording"
        );
    }


    if (recordButton) {
        recordButton.classList.remove(
            "recording"
        );
    }


    notify(
        "AUFNAHME GESTOPPT"
    );
}


function updateRecordingTimer() {

    const timer =
        $("recordTimer");

    if (!timer) return;


    if (!recording) {

        timer.textContent =
            "00:00:00";

        return;
    }


    const elapsed =
        Date.now() -
        recordingStartTime;


    const totalSeconds =
        Math.floor(
            elapsed / 1000
        );


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


    timer.textContent =
        `${String(hours).padStart(2, "0")}:` +
        `${String(minutes).padStart(2, "0")}:` +
        `${String(seconds).padStart(2, "0")}`;
}


/* =========================================================
   PROGRAM CLOCK
   ========================================================= */

function updateProgramClock() {

    const element =
        $("programTime");

    if (!element) return;


    const elapsed =
        Date.now() -
        programClockStart;


    const totalSeconds =
        Math.floor(
            elapsed / 1000
        );


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


    element.textContent =
        `${String(hours).padStart(2, "0")}:` +
        `${String(minutes).padStart(2, "0")}:` +
        `${String(seconds).padStart(2, "0")}`;
}


/* =========================================================
   QR CODE
   ========================================================= */

let selectedQrCamera = 1;


function setupQr() {

    const qrButton =
        $("qrButton");

    const qrModal =
        $("qrModal");

    const closeQr =
        $("closeQr");


    if (qrButton) {

        qrButton.addEventListener(
            "click",
            () => {

                selectedQrCamera =
                    currentCamera;

                openQrModal(
                    selectedQrCamera
                );
            }
        );
    }


    if (closeQr) {

        closeQr.addEventListener(
            "click",
            closeQrModal
        );
    }


    if (qrModal) {

        qrModal.addEventListener(
            "click",
            (event) => {

                if (
                    event.target ===
                    qrModal
                ) {
                    closeQrModal();
                }
            }
        );
    }


    document
        .querySelectorAll(
            "[data-qr-camera]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const cam =
                        Number(
                            button.dataset
                                .qrCamera
                        );

                    openQrModal(cam);
                }
            );
        });
}


function openQrModal(cam) {

    selectedQrCamera = cam;


    const modal =
        $("qrModal");

    const selected =
        $("qrSelectedCamera");

    const qr =
        $("qrcode");

    const qrUrlText =
        $("qrUrlText");


    if (selected) {
        selected.textContent =
            cam;
    }


    if (modal) {
        modal.classList.remove(
            "hidden"
        );
    }


    if (qr) {

        qr.innerHTML = "";

        const cameraUrl =
            new URL(
                window.location.href
            );


        cameraUrl.search = "";


        cameraUrl.searchParams.set(
            "mode",
            "camera"
        );

        cameraUrl.searchParams.set(
            "session",
            sessionId
        );

        cameraUrl.searchParams.set(
            "cam",
            cam
        );


        if (
            typeof QRCode !==
            "undefined"
        ) {

            new QRCode(qr, {

                text:
                    cameraUrl.toString(),

                width: 230,

                height: 230,

                correctLevel:
                    QRCode.CorrectLevel.M

            });

        } else {

            qr.textContent =
                "QR-Code Bibliothek nicht geladen.";
        }


        if (qrUrlText) {

            qrUrlText.textContent =
                cameraUrl.toString();
        }
    }
}


function closeQrModal() {

    const modal =
        $("qrModal");

    if (modal) {

        modal.classList.add(
            "hidden"
        );
    }
}


/* =========================================================
   CAMERA DEVICE MODE
   ========================================================= */

async function startLocalCamera() {

    if (!isCameraMode) return;


    const video =
        $("localCameraVideo");

    const placeholder =
        $("localCameraPlaceholder");


    try {

        if (localStream) {

            localStream
                .getTracks()
                .forEach(
                    track =>
                        track.stop()
                );
        }


        localStream =
            await navigator.mediaDevices
                .getUserMedia({

                    video: {
                        facingMode:
                            "environment"
                    },

                    audio: true

                });


        if (video) {

            video.srcObject =
                localStream;

            await video.play()
                .catch(() => {});
        }


        if (placeholder) {

            placeholder.classList.add(
                "hidden"
            );
        }


        updateCameraDeviceInfo();

        setCameraDeviceReady();


        await publishPresence();

        await broadcastCameraStatus(
            "online"
        );


        await sendCameraHello();


        /*
           Noch einmal senden, falls die Regie
           gerade erst den Channel geöffnet hat.
        */

        setTimeout(
            sendCameraHello,
            1000
        );

        setTimeout(
            sendCameraHello,
            2500
        );

        setTimeout(
            sendCameraHello,
            5000
        );


        notify(
            `CAM ${cameraNumber} KAMERA AKTIV`
        );


    } catch (error) {

        console.error(
            "Kamera Fehler:",
            error
        );


        setCameraDeviceError();


        notify(
            "KAMERA ODER MIKROFON NICHT ERLAUBT"
        );
    }
}


/* =========================================================
   CAMERA SWITCH
   ========================================================= */

async function switchCamera() {

    if (!isCameraMode) return;

    if (!localStream) {

        await startLocalCamera();

        return;
    }


    const currentVideoTrack =
        localStream.getVideoTracks()[0];


    if (!currentVideoTrack) {

        await startLocalCamera();

        return;
    }


    const currentSettings =
        currentVideoTrack.getSettings();


    const currentFacing =
        currentSettings.facingMode ||
        "environment";


    const newFacing =
        currentFacing ===
        "environment"
            ? "user"
            : "environment";


    try {

        const newStream =
            await navigator.mediaDevices
                .getUserMedia({

                    video: {
                        facingMode:
                            newFacing
                    },

                    audio: false

                });


        const newVideoTrack =
            newStream.getVideoTracks()[0];


        currentVideoTrack.stop();


        const videoSender =
            cameraPeer
                ? cameraPeer
                    .getSenders()
                    .find(
                        sender =>
                            sender.track &&
                            sender.track.kind ===
                            "video"
                    )
                : null;


        if (videoSender) {

            await videoSender.replaceTrack(
                newVideoTrack
            );
        }


        localStream.removeTrack(
            currentVideoTrack
        );

        localStream.addTrack(
            newVideoTrack
        );


        const video =
            $("localCameraVideo");

        if (video) {

            video.srcObject =
                localStream;
        }


        notify(
            "KAMERA GEWECHSELT"
        );


    } catch (error) {

        console.error(
            "Kamera wechseln:",
            error
        );

        notify(
            "KAMERA KANN NICHT GEWECHSELT WERDEN"
        );
    }
}


/* =========================================================
   CAMERA STATUS
   ========================================================= */

async function broadcastCameraStatus(
    status
) {

    if (!isCameraMode) return;

    await broadcast({

        event: "camera-status",

        camera: cameraNumber,

        status: status,

        device:
            navigator.userAgent
    });
}


/* =========================================================
   CAMERA UI STATES
   ========================================================= */

function setCameraDeviceReady() {

    const status =
        $("deviceStatusText");

    const mic =
        $("deviceMicText");

    const modeStatus =
        $("cameraModeStatus");

    const dot =
        $("cameraModeDot");


    if (status) {
        status.textContent =
            "BEREIT";
    }

    if (mic) {
        mic.textContent =
            "AKTIV";
    }

    if (modeStatus) {
        modeStatus.textContent =
            "CAMERA READY";
    }

    if (dot) {

        dot.classList.remove(
            "red"
        );

        dot.classList.add(
            "green"
        );
    }
}


function setCameraDeviceConnecting() {

    const status =
        $("deviceStatusText");

    const modeStatus =
        $("cameraModeStatus");


    if (status) {
        status.textContent =
            "VERBINDET";
    }

    if (modeStatus) {
        modeStatus.textContent =
            "CONNECTING...";
    }
}


function setCameraDeviceConnected() {

    const status =
        $("deviceStatusText");

    const modeStatus =
        $("cameraModeStatus");

    const dot =
        $("cameraModeDot");


    if (status) {
        status.textContent =
            "LIVE";
    }

    if (modeStatus) {
        modeStatus.textContent =
            "CAMERA LIVE";
    }

    if (dot) {

        dot.classList.remove(
            "red"
        );

        dot.classList.add(
            "green"
        );
    }
}


function setCameraDeviceDisconnected() {

    const status =
        $("deviceStatusText");

    const modeStatus =
        $("cameraModeStatus");

    const dot =
        $("cameraModeDot");


    if (status) {
        status.textContent =
            "GETRENNT";
    }

    if (modeStatus) {
        modeStatus.textContent =
            "DISCONNECTED";
    }

    if (dot) {

        dot.classList.remove(
            "green"
        );

        dot.classList.add(
            "red"
        );
    }
}


function setCameraDeviceError() {

    const status =
        $("deviceStatusText");

    const mic =
        $("deviceMicText");

    const modeStatus =
        $("cameraModeStatus");


    if (status) {
        status.textContent =
            "FEHLER";
    }

    if (mic) {
        mic.textContent =
            "NICHT VERFÜGBAR";
    }

    if (modeStatus) {
        modeStatus.textContent =
            "CAMERA ERROR";
    }
}


function updateCameraDeviceInfo() {

    const cameraText =
        $("deviceCameraText");

    const selectedNumber =
        $("selectedCameraNumber");


    if (cameraText) {

        cameraText.textContent =
            `CAM ${cameraNumber}`;
    }


    if (selectedNumber) {

        selectedNumber.textContent =
            cameraNumber;
    }
}


/* =========================================================
   CAMERA MODE SETUP
   ========================================================= */

function setupCameraMode() {

    if (!isCameraMode) {
        return;
    }


    document.body.classList.add(
        "camera-page"
    );


    const cameraMode =
        $("cameraMode");

    const controlRoom =
        document.querySelector(
            ".control-room"
        );

    const topbar =
        document.querySelector(
            ".topbar"
        );


    if (cameraMode) {

        cameraMode.classList.add(
            "active"
        );
    }


    if (controlRoom) {

        controlRoom.style.display =
            "none";
    }


    if (topbar) {

        topbar.style.display =
            "none";
    }


    updateCameraDeviceInfo();


    const startButton =
        $("startCameraButton");

    const switchButton =
        $("switchCameraButton");


    if (startButton) {

        startButton.addEventListener(
            "click",
            startLocalCamera
        );
    }


    if (switchButton) {

        switchButton.addEventListener(
            "click",
            switchCamera
        );
    }
}


/* =========================================================
   REGIE MODE SETUP
   ========================================================= */

function setupDirectorMode() {

    if (isCameraMode) {
        return;
    }


    setupCameraButtons();

    setupDirectorControls();

    setupKeyboard();

    setupQr();

    updateProgramUI();

    updateOnlineCount(0);
}


/* =========================================================
   AUDIO METER VISUAL
   ========================================================= */

function animateAudioMeter() {

    const meter =
        $("audioMeter");

    if (!meter) return;


    const bars =
        meter.querySelectorAll(
            "span"
        );


    bars.forEach(
        bar => {

            const height =
                Math.random() *
                100;

            bar.style.height =
                `${Math.max(
                    10,
                    height
                )}%`;
        }
    );


    setTimeout(
        animateAudioMeter,
        120
    );
}


/* =========================================================
   CLEANUP
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


        if (cameraPeer) {

            try {
                cameraPeer.close();
            } catch (_) {}
        }


        Object.values(
            directorPeers
        ).forEach(
            peer => {

                try {
                    peer.close();
                } catch (_) {}

            }
        );


        if (channel) {

            try {
                channel.untrack();
            } catch (_) {}
        }
    }
);


/* =========================================================
   START
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        console.log(
            "================================="
        );

        console.log(
            "LIVE REGIE START"
        );

        console.log(
            "Session:",
            sessionId
        );

        console.log(
            "Camera Mode:",
            isCameraMode
        );

        if (isCameraMode) {

            console.log(
                "Camera:",
                cameraNumber
            );
        }

        console.log(
            "================================="
        );


        createChannel();


        if (isCameraMode) {

            setupCameraMode();

        } else {

            setupDirectorMode();

            setInterval(
                updateProgramClock,
                1000
            );

            animateAudioMeter();
        }
    }
);
