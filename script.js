/* =========================================================
   LIVE REGIE
   Director + Camera Device
   Supabase Realtime + WebRTC
========================================================= */


/* =========================================================
   SUPABASE
========================================================= */

const SUPABASE_URL =
    "https://aweburrixtbmdwuysrnk.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "DEIN_PUBLISHABLE_KEY_HIER";

const supabase =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );


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

const params =
    new URLSearchParams(
        window.location.search
    );

const pageMode =
    params.get("mode");

const cameraParameter =
    parseInt(
        params.get("cam"),
        10
    );

const sessionParameter =
    params.get("session");

const isCameraMode =
    pageMode === "camera";


/* =========================================================
   SESSION
========================================================= */

let sessionId =
    sessionParameter;

if (!sessionId) {

    sessionId =
        generateSessionId();

    if (!isCameraMode) {

        const newUrl =
            `${window.location.pathname}?session=${sessionId}`;

        window.history.replaceState(
            {},
            "",
            newUrl
        );
    }
}


/* =========================================================
   WEBRTC
========================================================= */

const peerConnections = {};

const pendingIceCandidates = {};

const remoteStreams = {};

const ICE_SERVERS = {

    iceServers: [

        {
            urls:
                "stun:stun.l.google.com:19302"
        },

        {
            urls:
                "stun:stun1.l.google.com:19302"
        }

    ]

};


/* =========================================================
   SUPABASE CHANNEL
========================================================= */

let realtimeChannel = null;

let realtimeReady = false;


/* =========================================================
   DOM
========================================================= */

const programCamera =
    document.getElementById(
        "programCamera"
    );

const programCameraBig =
    document.getElementById(
        "programCameraBig"
    );

const programVideo =
    document.getElementById(
        "programVideo"
    );

const programPlaceholder =
    document.getElementById(
        "programPlaceholder"
    );

const programMonitor =
    document.getElementById(
        "programMonitor"
    );

const programTime =
    document.getElementById(
        "programTime"
    );

const recordTimer =
    document.getElementById(
        "recordTimer"
    );

const recordStatus =
    document.getElementById(
        "recordStatus"
    );

const recordButton =
    document.getElementById(
        "recordButton"
    );

const cutButton =
    document.getElementById(
        "cutButton"
    );

const fadeButton =
    document.getElementById(
        "fadeButton"
    );

const notification =
    document.getElementById(
        "notification"
    );

const notificationText =
    document.getElementById(
        "notificationText"
    );

const onlineCount =
    document.getElementById(
        "onlineCount"
    );

const systemCameraText =
    document.getElementById(
        "systemCameraText"
    );


/* =========================================================
   CAMERA STATE
========================================================= */

const cameraStates = {};

for (
    let i = 1;
    i <= TOTAL_CAMERAS;
    i++
) {

    cameraStates[i] = {

        online: false,

        device: "NO DEVICE",

        stream: null,

        connected: false

    };

}


/* =========================================================
   INITIALIZE
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initializeRealtime();

        if (isCameraMode) {

            initializeCameraPage();

        } else {

            initializeDirector();

        }

    }
);


/* =========================================================
   SESSION ID
========================================================= */

function generateSessionId() {

    return Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

}


/* =========================================================
   INITIALIZE REALTIME
========================================================= */

async function initializeRealtime() {

    if (
        !SUPABASE_URL ||
        !SUPABASE_PUBLISHABLE_KEY ||
        SUPABASE_PUBLISHABLE_KEY ===
            "DEIN_PUBLISHABLE_KEY_HIER"
    ) {

        console.error(
            "Supabase Key fehlt."
        );

        showNotification(
            "SUPABASE KEY FEHLT"
        );

        return;

    }


    const channelName =
        `live-regie-${sessionId}`;


    realtimeChannel =
        supabase.channel(
            channelName,
            {
                config: {

                    broadcast: {
                        self: false

                    },

                    presence: {
                        key:
                            isCameraMode
                                ? `cam-${cameraParameter || 1}`
                                : "director"
                    }

                }

            }
        );


    realtimeChannel.on(
        "broadcast",
        {
            event: "webrtc"
        },
        async ({
            payload
        }) => {

            await handleWebRTCMessage(
                payload
            );

        }
    );


    realtimeChannel.on(
        "broadcast",
        {
            event: "camera-status"
        },
        ({
            payload
        }) => {

            if (!isCameraMode) {

                handleCameraStatus(
                    payload
                );

            }

        }
    );


    realtimeChannel.on(
        "presence",
        {
            event: "sync"
        },
        () => {

            handlePresenceSync();

        }
    );


    realtimeChannel.on(
        "presence",
        {
            event: "join"
        },
        ({
            key
        }) => {

            handlePresenceJoin(
                key
            );

        }
    );


    realtimeChannel.on(
        "presence",
        {
            event: "leave"
        },
        ({
            key
        }) => {

            handlePresenceLeave(
                key
            );

        }
    );


    realtimeChannel.subscribe(
        async (status) => {

            console.log(
                "Supabase:",
                status
            );


            if (
                status ===
                "SUBSCRIBED"
            ) {

                realtimeReady =
                    true;


                console.log(
                    "Realtime verbunden:",
                    channelName
                );


                if (isCameraMode) {

                    await realtimeChannel.track(
                        {
                            role:
                                "camera",

                            cam:
                                cameraParameter || 1,

                            online:
                                true
                        }
                    );


                    sendCameraStatus(
                        true
                    );

                } else {

                    await realtimeChannel.track(
                        {
                            role:
                                "director",

                            online:
                                true
                        }
                    );


                    showNotification(
                        `SESSION ${sessionId}`
                    );

                }

            }

        }
    );

}


/* =========================================================
   PRESENCE
========================================================= */

function handlePresenceSync() {

    if (isCameraMode) {

        return;

    }


    if (!realtimeChannel) {

        return;

    }


    const state =
        realtimeChannel.presenceState();


    let camerasOnline = 0;


    for (
        let i = 1;
        i <= TOTAL_CAMERAS;
        i++
    ) {

        const key =
            `cam-${i}`;

        if (
            state[key]
        ) {

            camerasOnline++;

            setCameraOnline(
                i,
                `CAM ${i}`
            );

        } else {

            setCameraOffline(
                i
            );

        }

    }


    console.log(
        "Cameras online:",
        camerasOnline
    );

}


function handlePresenceJoin(
    key
) {

    if (isCameraMode) {

        return;

    }


    if (
        key.startsWith(
            "cam-"
        )
    ) {

        const cam =
            parseInt(
                key.replace(
                    "cam-",
                    ""
                ),
                10
            );


        if (
            cam >= 1 &&
            cam <= TOTAL_CAMERAS
        ) {

            setCameraOnline(
                cam,
                `CAM ${cam}`
            );


            sendDirectorHello(
                cam
            );

        }

    }

}


function handlePresenceLeave(
    key
) {

    if (isCameraMode) {

        return;

    }


    if (
        key.startsWith(
            "cam-"
        )
    ) {

        const cam =
            parseInt(
                key.replace(
                    "cam-",
                    ""
                ),
                10
            );


        if (
            cam >= 1 &&
            cam <= TOTAL_CAMERAS
        ) {

            setCameraOffline(
                cam
            );

        }

    }

}


/* =========================================================
   CAMERA STATUS
========================================================= */

function handleCameraStatus(
    payload
) {

    if (!payload) {

        return;

    }


    const cam =
        parseInt(
            payload.cam,
            10
        );


    if (
        !cam ||
        cam < 1 ||
        cam > TOTAL_CAMERAS
    ) {

        return;

    }


    if (
        payload.online
    ) {

        setCameraOnline(
            cam,
            payload.device ||
                `CAM ${cam}`
        );

    } else {

        setCameraOffline(
            cam
        );

    }

}


function sendCameraStatus(
    online
) {

    if (
        !realtimeChannel ||
        !realtimeReady
    ) {

        return;

    }


    const cam =
        cameraParameter || 1;


    realtimeChannel.send({

        type: "broadcast",

        event: "camera-status",

        payload: {

            cam: cam,

            online: online,

            device:
                `CAM ${cam}`

        }

    });

}


/* =========================================================
   DIRECTOR HELLO
========================================================= */

async function sendDirectorHello(
    cameraNumber
) {

    if (
        !realtimeChannel ||
        !realtimeReady
    ) {

        return;

    }


    await realtimeChannel.send({

        type: "broadcast",

        event: "webrtc",

        payload: {

            type:
                "director-hello",

            cam:
                cameraNumber

        }

    });

}


/* =========================================================
   WEBRTC MESSAGE
========================================================= */

async function handleWebRTCMessage(
    payload
) {

    if (!payload) {

        return;

    }


    const messageCamera =
        parseInt(
            payload.cam,
            10
        );


    if (
        !messageCamera ||
        messageCamera < 1 ||
        messageCamera > TOTAL_CAMERAS
    ) {

        return;

    }


    if (
        isCameraMode &&
        messageCamera !==
            (cameraParameter || 1)
    ) {

        return;

    }


    if (
        !isCameraMode &&
        payload.type ===
            "camera-hello"
    ) {

        await handleCameraHello(
            messageCamera
        );

        return;

    }


    if (
        !isCameraMode &&
        payload.type ===
            "answer"
    ) {

        await handleAnswer(
            messageCamera,
            payload
        );

        return;

    }


    if (
        !isCameraMode &&
        payload.type ===
            "ice"
    ) {

        await handleRemoteIce(
            messageCamera,
            payload
        );

        return;

    }


    if (
        isCameraMode &&
        payload.type ===
            "director-hello"
    ) {

        await createCameraOffer(
            messageCamera
        );

        return;

    }


    if (
        isCameraMode &&
        payload.type ===
            "offer"
    ) {

        await handleOffer(
            messageCamera,
            payload
        );

        return;

    }


    if (
        isCameraMode &&
        payload.type ===
            "ice"
    ) {

        await handleRemoteIce(
            messageCamera,
            payload
        );

        return;

    }

}


/* =========================================================
   CAMERA HELLO
========================================================= */

async function sendCameraHello() {

    if (
        !realtimeChannel ||
        !realtimeReady
    ) {

        return;

    }


    const cam =
        cameraParameter || 1;


    await realtimeChannel.send({

        type: "broadcast",

        event: "webrtc",

        payload: {

            type:
                "camera-hello",

            cam: cam

        }

    });


    console.log(
        `CAM ${cam}: hello`
    );

}


/* =========================================================
   HANDLE CAMERA HELLO
========================================================= */

async function handleCameraHello(
    cameraNumber
) {

    console.log(
        `REGIE: CAM ${cameraNumber} möchte verbinden`
    );


    setCameraOnline(
        cameraNumber,
        `CAM ${cameraNumber}`
    );


    await createDirectorOffer(
        cameraNumber
    );

}


/* =========================================================
   CREATE DIRECTOR OFFER
========================================================= */

async function createDirectorOffer(
    cameraNumber
) {

    if (
        !realtimeChannel ||
        !realtimeReady
    ) {

        return;

    }


    closePeerConnection(
        cameraNumber
    );


    const pc =
        createPeerConnection(
            cameraNumber
        );


    const offer =
        await pc.createOffer({

            offerToReceiveAudio:
                true,

            offerToReceiveVideo:
                true

        });


    await pc.setLocalDescription(
        offer
    );


    await realtimeChannel.send({

        type: "broadcast",

        event: "webrtc",

        payload: {

            type:
                "offer",

            cam:
                cameraNumber,

            sdp:
                pc.localDescription

        }

    });


    console.log(
        `REGIE → CAM ${cameraNumber}: OFFER`
    );

}


/* =========================================================
   CAMERA OFFER
========================================================= */

async function createCameraOffer(
    cameraNumber
) {

    if (
        !localStream
    ) {

        console.log(
            "Kamera noch nicht gestartet."
        );

        return;

    }


    const pc =
        createPeerConnection(
            cameraNumber
        );


    localStream
        .getTracks()
        .forEach(
            track => {

                pc.addTrack(
                    track,
                    localStream
                );

            }
        );


    const offer =
        await pc.createOffer();


    await pc.setLocalDescription(
        offer
    );


    await realtimeChannel.send({

        type: "broadcast",

        event: "webrtc",

        payload: {

            type:
                "offer",

            cam:
                cameraNumber,

            sdp:
                pc.localDescription

        }

    });


    console.log(
        `CAM ${cameraNumber} → REGIE: OFFER`
    );

}


/* =========================================================
   CREATE PEER CONNECTION
========================================================= */

function createPeerConnection(
    cameraNumber
) {

    closePeerConnection(
        cameraNumber
    );


    const pc =
        new RTCPeerConnection(
            ICE_SERVERS
        );


    peerConnections[
        cameraNumber
    ] = pc;


    pendingIceCandidates[
        cameraNumber
    ] = [];


    pc.onicecandidate =
        async event => {

            if (
                !event.candidate
            ) {

                return;

            }


            await sendIceCandidate(
                cameraNumber,
                event.candidate
            );

        };


    pc.onconnectionstatechange =
        () => {

            console.log(
                `CAM ${cameraNumber} WebRTC:`,
                pc.connectionState
            );


            if (
                pc.connectionState ===
                    "connected"
            ) {

                cameraStates[
                    cameraNumber
                ].connected = true;


                setCameraOnline(
                    cameraNumber,
                    `CAM ${cameraNumber}`
                );


                showNotification(
                    `CAM ${cameraNumber} VERBUNDEN`
                );

            }


            if (
                pc.connectionState ===
                    "failed" ||
                pc.connectionState ===
                    "disconnected" ||
                pc.connectionState ===
                    "closed"
            ) {

                cameraStates[
                    cameraNumber
                ].connected = false;

            }

        };


    pc.ontrack =
        event => {

            if (
                isCameraMode
            ) {

                return;

            }


            const stream =
                event.streams &&
                event.streams[0];


            if (!stream) {

                return;

            }


            remoteStreams[
                cameraNumber
            ] = stream;


            const video =
                document.getElementById(
                    `cameraVideo${cameraNumber}`
                );


            if (video) {

                video.srcObject =
                    stream;

                video.muted =
                    true;

                video.playsInline =
                    true;

                video.autoplay =
                    true;

                video.style.display =
                    "block";

            }


            cameraStates[
                cameraNumber
            ].stream =
                stream;


            setCameraOnline(
                cameraNumber,
                `CAM ${cameraNumber}`
            );


            updateProgramVideo();

        };


    return pc;

}


/* =========================================================
   SEND ICE
========================================================= */

async function sendIceCandidate(
    cameraNumber,
    candidate
) {

    if (
        !realtimeChannel ||
        !realtimeReady
    ) {

        return;

    }


    await realtimeChannel.send({

        type: "broadcast",

        event: "webrtc",

        payload: {

            type:
                "ice",

            cam:
                cameraNumber,

            candidate:
                candidate

        }

    });

}


/* =========================================================
   HANDLE OFFER
========================================================= */

async function handleOffer(
    cameraNumber,
    payload
) {

    if (
        !isCameraMode ||
        !localStream
    ) {

        return;

    }


    const pc =
        createPeerConnection(
            cameraNumber
        );


    await pc.setRemoteDescription(
        new RTCSessionDescription(
            payload.sdp
        )
    );


    const answer =
        await pc.createAnswer();


    await pc.setLocalDescription(
        answer
    );


    await realtimeChannel.send({

        type: "broadcast",

        event: "webrtc",

        payload: {

            type:
                "answer",

            cam:
                cameraNumber,

            sdp:
                pc.localDescription

        }

    });


    console.log(
        `CAM ${cameraNumber} → REGIE: ANSWER`
    );


    await addPendingIceCandidates(
        cameraNumber
    );

}


/* =========================================================
   HANDLE ANSWER
========================================================= */

async function handleAnswer(
    cameraNumber,
    payload
) {

    if (
        isCameraMode
    ) {

        return;

    }


    const pc =
        peerConnections[
            cameraNumber
        ];


    if (!pc) {

        return;

    }


    if (
        pc.signalingState !==
        "have-local-offer"
    ) {

        return;

    }


    await pc.setRemoteDescription(
        new RTCSessionDescription(
            payload.sdp
        )
    );


    await addPendingIceCandidates(
        cameraNumber
    );


    console.log(
        `REGIE ← CAM ${cameraNumber}: ANSWER`
    );

}


/* =========================================================
   HANDLE REMOTE ICE
========================================================= */

async function handleRemoteIce(
    cameraNumber,
    payload
) {

    const candidate =
        payload.candidate;


    if (!candidate) {

        return;

    }


    const pc =
        peerConnections[
            cameraNumber
        ];


    if (
        !pc ||
        !pc.remoteDescription
    ) {

        if (
            !pendingIceCandidates[
                cameraNumber
            ]
        ) {

            pendingIceCandidates[
                cameraNumber
            ] = [];

        }


        pendingIceCandidates[
            cameraNumber
        ].push(
            candidate
        );

        return;

    }


    try {

        await pc.addIceCandidate(
            new RTCIceCandidate(
                candidate
            )
        );

    } catch (error) {

        console.error(
            "ICE Fehler:",
            error
        );

    }

}


/* =========================================================
   ADD PENDING ICE
========================================================= */

async function addPendingIceCandidates(
    cameraNumber
) {

    const pc =
        peerConnections[
            cameraNumber
        ];


    const candidates =
        pendingIceCandidates[
            cameraNumber
        ] || [];


    for (
        const candidate
        of candidates
    ) {

        try {

            await pc.addIceCandidate(
                new RTCIceCandidate(
                    candidate
                )
            );

        } catch (error) {

            console.error(
                "Pending ICE Fehler:",
                error
            );

        }

    }


    pendingIceCandidates[
        cameraNumber
    ] = [];

}


/* =========================================================
   CLOSE PEER
========================================================= */

function closePeerConnection(
    cameraNumber
) {

    const oldPc =
        peerConnections[
            cameraNumber
        ];


    if (oldPc) {

        try {

            oldPc.close();

        } catch (
            error
        ) {

            console.warn(
                error
            );

        }

    }


    delete peerConnections[
        cameraNumber
    ];


    pendingIceCandidates[
        cameraNumber
    ] = [];

}


/* =========================================================
   DIRECTOR INITIALIZATION
========================================================= */

function initializeDirector() {

    document.body.classList.remove(
        "camera-page"
    );


    updateProgramDisplay();

    setupCameraButtons();

    setupCameraCards();

    setupKeyboard();

    setupQrSystem();

    updateOnlineCount();


    showNotification(
        `REGIE READY — SESSION ${sessionId}`
    );


    console.log(
        "LIVE REGIE initialized"
    );


    console.log(
        "Session:",
        sessionId
    );

}


/* =========================================================
   CAMERA BUTTONS
========================================================= */

function setupCameraButtons() {

    for (
        let i = 1;
        i <= TOTAL_CAMERAS;
        i++
    ) {

        const button =
            document.getElementById(
                `cameraButton${i}`
            );


        if (!button) {

            continue;

        }


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

    for (
        let i = 1;
        i <= TOTAL_CAMERAS;
        i++
    ) {

        const card =
            document.getElementById(
                `cameraCard${i}`
            );


        if (!card) {

            continue;

        }


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


    if (
        cameraNumber ===
        currentCamera
    ) {

        showNotification(
            `CAM ${cameraNumber} BEREITS PROGRAM`
        );

        updateProgramVideo();

        return;

    }


    currentCamera =
        cameraNumber;


    updateProgramDisplay();


    if (
        transition === "fade"
    ) {

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

    if (
        !programVideo
    ) {

        return;

    }


    const stream =
        remoteStreams[
            currentCamera
        ];


    if (
        stream
    ) {

        programVideo.srcObject =
            stream;

        programVideo.muted =
            false;

        programVideo.autoplay =
            true;

        programVideo.playsInline =
            true;

        programVideo.style.display =
            "block";


        if (
            programPlaceholder
        ) {

            programPlaceholder.style.display =
                "none";

        }


        const playPromise =
            programVideo.play();


        if (
            playPromise &&
            playPromise.catch
        ) {

            playPromise.catch(
                () => {}
            );

        }


    } else {

        programVideo.srcObject =
            null;


        programVideo.style.display =
            "none";


        if (
            programPlaceholder
        ) {

            programPlaceholder.style.display =
                "flex";

        }

    }

}


/* =========================================================
   FADE
========================================================= */

function playFadeTransition() {

    if (
        !programMonitor
    ) {

        return;

    }


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

            easing:
                "ease-in-out"

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
        event => {

            if (
                event.target.tagName ===
                    "INPUT" ||
                event.target.tagName ===
                    "TEXTAREA"
            ) {

                return;

            }


            if (
                event.key >= "1" &&
                event.key <= "9"
            ) {

                switchCamera(
                    parseInt(
                        event.key,
                        10
                    ),
                    "cut"
                );

                return;

            }


            if (
                event.code ===
                "Space"
            ) {

                event.preventDefault();

                cutToOtherCamera();

                return;

            }


            if (
                event.key.toLowerCase() ===
                "f"
            ) {

                fadeToOtherCamera();

                return;

            }


            if (
                event.key.toLowerCase() ===
                "r"
            ) {

                toggleRecording();

                return;

            }


            if (
                event.key ===
                    "Escape" &&
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

    if (
        recording
    ) {

        stopRecording();

    } else {

        startRecording();

    }

}


function startRecording() {

    if (
        recording
    ) {

        return;

    }


    recording =
        true;

    recordSeconds =
        0;


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


    if (recordTimer) {

        recordTimer.textContent =
            "00:00:00";

    }


    if (programTime) {

        programTime.textContent =
            "00:00:00";

    }


    recordInterval =
        setInterval(
            () => {

                recordSeconds++;


                const formatted =
                    formatTime(
                        recordSeconds
                    );


                if (recordTimer) {

                    recordTimer.textContent =
                        formatted;

                }


                if (programTime) {

                    programTime.textContent =
                        formatted;

                }

            },
            1000
        );


    showNotification(
        "● AUFNAHME GESTARTET"
    );

}


function stopRecording() {

    if (
        !recording
    ) {

        return;

    }


    recording =
        false;


    clearInterval(
        recordInterval
    );


    recordInterval =
        null;


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


    showNotification(
        "AUFNAHME GESTOPPT"
    );

}


/* =========================================================
   TIME FORMAT
========================================================= */

function formatTime(
    totalSeconds
) {

    const hours =
        Math.floor(
            totalSeconds / 3600
        );


    const minutes =
        Math.floor(
            (totalSeconds % 3600) /
            60
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
                String(
                    value
                ).padStart(
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

function showNotification(
    message
) {

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


    if (closeQr) {

        closeQr.addEventListener(
            "click",
            () => {

                qrModal.classList.add(
                    "hidden"
                );

            }
        );

    }


    if (qrModal) {

        qrModal.addEventListener(
            "click",
            event => {

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

    }


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


    if (
        !qrContainer
    ) {

        return;

    }


    qrContainer.innerHTML =
        "";


    const baseUrl =
        window.location.origin +
        window.location.pathname;


    const cameraUrl =
        `${baseUrl}?mode=camera&session=${encodeURIComponent(sessionId)}&cam=${cameraNumber}`;


    if (
        typeof QRCode ===
        "undefined"
    ) {

        console.error(
            "QRCode library fehlt."
        );

        return;

    }


    new QRCode(
        qrContainer,
        {

            text:
                cameraUrl,

            width:
                190,

            height:
                190,

            colorDark:
                "#000000",

            colorLight:
                "#ffffff",

            correctLevel:
                QRCode.CorrectLevel.M

        }
    );


    if (selected) {

        selected.textContent =
            cameraNumber;

    }


    if (urlText) {

        urlText.textContent =
            cameraUrl;

    }


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
    deviceName =
        "CAMERA DEVICE"
) {

    if (
        cameraNumber < 1 ||
        cameraNumber > TOTAL_CAMERAS
    ) {

        return;

    }


    cameraStates[
        cameraNumber
    ].online =
        true;


    cameraStates[
        cameraNumber
    ].device =
        deviceName;


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


    if (
        placeholder &&
        remoteStreams[
            cameraNumber
        ]
    ) {

        placeholder.style.display =
            "none";

    }


    updateOnlineCount();

    updateProgramVideo();

}


/* =========================================================
   SET CAMERA OFFLINE
========================================================= */

function setCameraOffline(
    cameraNumber
) {

    if (
        cameraNumber < 1 ||
        cameraNumber > TOTAL_CAMERAS
    ) {

        return;

    }


    cameraStates[
        cameraNumber
    ].online =
        false;


    cameraStates[
        cameraNumber
    ].connected =
        false;


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
            "OFFLINE";


        status.classList.remove(
            "online",
            "waiting"
        );


        status.classList.add(
            "offline"
        );

    }


    if (device) {

        device.textContent =
            "NO DEVICE";

    }


    if (placeholder) {

        placeholder.style.display =
            "flex";

    }


    updateOnlineCount();

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


    if (selectedCameraNumber) {

        selectedCameraNumber.textContent =
            selectedCamera;

    }


    if (deviceCameraText) {

        deviceCameraText.textContent =
            `CAM ${selectedCamera}`;

    }


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


    if (startButton) {

        startButton.addEventListener(
            "click",
            startLocalCamera
        );

    }


    if (switchButton) {

        switchButton.addEventListener(
            "click",
            switchLocalCamera
        );

    }


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
                .getUserMedia(

                    {

                        video: {

                            facingMode:
                                currentFacingMode,

                            width: {

                                ideal:
                                    1920

                            },

                            height: {

                                ideal:
                                    1080

                            }

                        },

                        audio: true

                    }

                );


        if (video) {

            video.srcObject =
                localStream;

            video.style.display =
                "block";

        }


        if (placeholder) {

            placeholder.style.display =
                "none";

        }


        if (deviceStatus) {

            deviceStatus.textContent =
                "ONLINE";

            deviceStatus.style.color =
                "var(--green)";

        }


        if (deviceMic) {

            deviceMic.textContent =
                "ONLINE";

            deviceMic.style.color =
                "var(--green)";

        }


        if (startButton) {

            startButton.textContent =
                "● KAMERA ONLINE";

        }


        showCameraStatus(
            "CAMERA ONLINE",
            true
        );


        console.log(
            "Local camera started",
            localStream
        );


        /*
         * Sobald die Kamera läuft,
         * Verbindung zur Regie aufbauen.
         */

        if (
            realtimeReady
        ) {

            await sendCameraHello();

        }


        /*
         * Falls die Regie später beitritt,
         * regelmäßig erneut melden.
         */

        startCameraHelloLoop();


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
   CAMERA HELLO LOOP
========================================================= */

let cameraHelloInterval =
    null;


function startCameraHelloLoop() {

    if (
        cameraHelloInterval
    ) {

        clearInterval(
            cameraHelloInterval
        );

    }


    cameraHelloInterval =
        setInterval(
            () => {

                if (
                    localStream &&
                    realtimeReady
                ) {

                    sendCameraHello();

                }

            },
            3000
        );

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


    if (status) {

        status.textContent =
            text;

    }


    if (!dot) {

        return;

    }


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
   CLEANUP
========================================================= */

window.addEventListener(
    "beforeunload",
    () => {

        if (cameraHelloInterval) {

            clearInterval(
                cameraHelloInterval
            );

        }


        if (localStream) {

            localStream
                .getTracks()
                .forEach(
                    track =>
                        track.stop()
                );

        }


        Object.keys(
            peerConnections
        ).forEach(
            cam => {

                closePeerConnection(
                    parseInt(
                        cam,
                        10
                    )
                );

            }
        );


        if (
            realtimeChannel
        ) {

            realtimeChannel.untrack();

            supabase.removeChannel(
                realtimeChannel
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


console.log(
    "Session:",
    sessionId
);
