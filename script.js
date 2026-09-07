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
   URL / SESSION
   ========================================================= */

const params =
    new URLSearchParams(window.location.search);

let sessionId =
    params.get("session");

if (!sessionId) {

    sessionId =
        Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase();

    const newUrl =
        `${window.location.pathname}?session=${sessionId}`;

    window.history.replaceState(
        {},
        "",
        newUrl
    );
}

const isCameraMode =
    params.get("mode") === "camera";

let cameraNumber =
    parseInt(
        params.get("cam"),
        10
    ) || 1;

if (
    cameraNumber < 1 ||
    cameraNumber > 9
) {
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
   STATE
   ========================================================= */

let channel = null;

let currentCamera = 1;

let localStream = null;

let cameraPeer = null;

const directorPeers = {};

const remoteStreams = {};

const pendingIceCandidates = {};

let recording = false;

let recordingStartTime = null;

let recordingTimerInterval = null;

let programClockStart =
    Date.now();

let cameraHelloInterval = null;


/* =========================================================
   DOM HELPER
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}


/* =========================================================
   NOTIFICATION
   ========================================================= */

function notify(message) {

    const notification =
        $("notification");

    const text =
        $("notificationText");

    if (text) {
        text.textContent =
            message;
    }

    if (!notification) {
        return;
    }

    notification.classList.add(
        "show"
    );

    clearTimeout(
        notification._timer
    );

    notification._timer =
        setTimeout(() => {

            notification.classList.remove(
                "show"
            );

        }, 2500);
}


/* =========================================================
   SUPABASE CHANNEL
   ========================================================= */

function createChannel() {

    channel =
        supabaseClient.channel(
            `live-regie-${sessionId}`,
            {
                config: {
                    broadcast: {
                        self: false
                    },
                    presence: {
                        key:
                            `${isCameraMode ? "camera" : "director"}-${Math.random()
                                .toString(36)
                                .substring(2, 10)}`
                    }
                }
            }
        );


    /* -----------------------------------------------------
       WEBRTC BROADCAST
       ----------------------------------------------------- */

    channel.on(
        "broadcast",
        {
            event: "webrtc"
        },
        ({ payload }) => {

            if (!payload) {
                return;
            }

            handleWebRTCMessage(
                payload
            );
        }
    );


    /* -----------------------------------------------------
       CAMERA STATUS
       ----------------------------------------------------- */

    channel.on(
        "broadcast",
        {
            event: "camera-status"
        },
        ({ payload }) => {

            if (!payload) {
                return;
            }

            handleCameraStatus(
                payload
            );
        }
    );


    /* -----------------------------------------------------
       PRESENCE
       ----------------------------------------------------- */

    channel.on(
        "presence",
        {
            event: "sync"
        },
        () => {

            updatePresenceStatus();
        }
    );

    channel.on(
        "presence",
        {
            event: "join"
        },
        () => {

            updatePresenceStatus();
        }
    );

    channel.on(
        "presence",
        {
            event: "leave"
        },
        () => {

            updatePresenceStatus();
        }
    );


    /* -----------------------------------------------------
       SUBSCRIBE
       ----------------------------------------------------- */

    channel.subscribe(
        async status => {

            console.log(
                "Supabase:",
                status
            );


            if (
                status ===
                "SUBSCRIBED"
            ) {

                console.log(
                    "SESSION VERBUNDEN:",
                    sessionId
                );


                await publishPresence();


                if (isCameraMode) {

                    notify(
                        `CAM ${cameraNumber} BEREIT`
                    );

                } else {

                    notify(
                        `SESSION ${sessionId} ONLINE`
                    );
                }
            }
        }
    );
}


/* =========================================================
   PRESENCE
   ========================================================= */

async function publishPresence() {

    if (!channel) {
        return;
    }

    try {

        if (isCameraMode) {

            await channel.track({

                role: "camera",

                camera:
                    cameraNumber

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

    if (
        !channel ||
        isCameraMode
    ) {
        return;
    }

    const state =
        channel.presenceState();

    let online = 0;


    Object.values(
        state
    ).forEach(entries => {

        entries.forEach(entry => {

            if (
                entry.role ===
                    "camera" &&
                Number(entry.camera) >= 1 &&
                Number(entry.camera) <= 9
            ) {

                online++;
            }

        });

    });


    updateOnlineCount(
        online
    );
}


/* =========================================================
   BROADCAST
   ========================================================= */

async function broadcast(
    payload
) {

    if (!channel) {
        return;
    }

    try {

        await channel.send({

            type: "broadcast",

            event:
                payload.event,

            payload:
                payload
        });

    } catch (error) {

        console.error(
            "Broadcast Fehler:",
            error
        );
    }
}


/* =========================================================
   WEBRTC MESSAGE ROUTER
   ========================================================= */

async function handleWebRTCMessage(
    payload
) {

    if (!payload.type) {
        return;
    }


    /* =====================================================
       CAMERA
       ===================================================== */

    if (isCameraMode) {

        if (
            Number(payload.camera) !==
            cameraNumber
        ) {
            return;
        }


        if (
            payload.type ===
            "offer"
        ) {

            await handleCameraOffer(
                payload
            );

            return;
        }


        if (
            payload.type ===
            "ice"
        ) {

            await handleCameraICE(
                payload
            );

            return;
        }


        return;
    }


    /* =====================================================
       DIRECTOR
       ===================================================== */

    if (
        payload.type ===
        "camera-hello"
    ) {

        await handleCameraHello(
            payload
        );

        return;
    }


    if (
        payload.type ===
        "answer"
    ) {

        await handleCameraAnswer(
            payload
        );

        return;
    }


    if (
        payload.type ===
        "ice"
    ) {

        await handleDirectorICE(
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
        !isCameraMode ||
        !localStream
    ) {
        return;
    }


    await broadcast({

        event: "webrtc",

        type: "camera-hello",

        camera:
            cameraNumber,

        session:
            sessionId,

        device:
            navigator.userAgent
    });
}


/* =========================================================
   CAMERA HELLO LOOP
   ========================================================= */

function startCameraHelloLoop() {

    if (!isCameraMode) {
        return;
    }


    clearInterval(
        cameraHelloInterval
    );


    sendCameraHello();


    cameraHelloInterval =
        setInterval(
            () => {

                if (
                    localStream &&
                    (
                        !cameraPeer ||
                        (
                            cameraPeer.connectionState !==
                            "connected"
                        )
                    )
                ) {

                    sendCameraHello();
                }

            },
            3000
        );
}


/* =========================================================
   DIRECTOR RECEIVES CAMERA HELLO
   ========================================================= */

async function handleCameraHello(
    payload
) {

    const cam =
        Number(payload.camera);


    if (
        cam < 1 ||
        cam > MAX_CAMERAS
    ) {
        return;
    }


    console.log(
        `CAM ${cam} meldet sich`
    );


    setCameraConnecting(
        cam,
        payload.device
    );


    await createDirectorPeer(
        cam
    );
}


/* =========================================================
   CREATE DIRECTOR PEER
   ========================================================= */

async function createDirectorPeer(
    cam
) {

    /* -----------------------------------------------------
       CLOSE OLD PEER
       ----------------------------------------------------- */

    if (
        directorPeers[cam]
    ) {

        try {
            directorPeers[cam].close();
        } catch (_) {}

        delete directorPeers[cam];
    }


    pendingIceCandidates[cam] =
        [];


    /* -----------------------------------------------------
       NEW PEER
       ----------------------------------------------------- */

    const peer =
        new RTCPeerConnection({
            iceServers:
                ICE_SERVERS
        });


    directorPeers[cam] =
        peer;


    /* -----------------------------------------------------
       RECEIVE ONLY VIDEO
       ----------------------------------------------------- */

    peer.addTransceiver(
        "video",
        {
            direction: "recvonly"
        }
    );


    /* -----------------------------------------------------
       RECEIVE ONLY AUDIO
       ----------------------------------------------------- */

    peer.addTransceiver(
        "audio",
        {
            direction: "recvonly"
        }
    );


    /* -----------------------------------------------------
       REMOTE TRACK
       ----------------------------------------------------- */

    peer.ontrack =
        event => {

            console.log(
                `CAM ${cam}: TRACK`,
                event.track.kind
            );


            let stream =
                remoteStreams[cam];


            if (!stream) {

                stream =
                    new MediaStream();

                remoteStreams[cam] =
                    stream;
            }


            const alreadyThere =
                stream
                    .getTracks()
                    .some(
                        track =>
                            track.id ===
                            event.track.id
                    );


            if (!alreadyThere) {

                stream.addTrack(
                    event.track
                );
            }


            event.track.onended =
                () => {

                    console.log(
                        `CAM ${cam}: Track beendet`
                    );
                };


            attachRemoteStream(
                cam,
                stream
            );
        };


    /* -----------------------------------------------------
       ICE
       ----------------------------------------------------- */

    peer.onicecandidate =
        async event => {

            if (
                !event.candidate
            ) {
                return;
            }


            await broadcast({

                event: "webrtc",

                type: "ice",

                camera: cam,

                candidate:
                    event.candidate
                        .toJSON()
            });
        };


    /* -----------------------------------------------------
       CONNECTION STATE
       ----------------------------------------------------- */

    peer.onconnectionstatechange =
        () => {

            const state =
                peer.connectionState;


            console.log(
                `CAM ${cam} CONNECTION:`,
                state
            );


            if (
                state ===
                "connected"
            ) {

                setCameraLive(
                    cam
                );

                notify(
                    `CAM ${cam} LIVE`
                );
            }


            if (
                state ===
                "connecting"
            ) {

                setCameraConnecting(
                    cam
                );
            }


            if (
                state ===
                    "failed" ||
                state ===
                    "disconnected"
            ) {

                console.warn(
                    `CAM ${cam}:`,
                    state
                );
            }
        };


    /* -----------------------------------------------------
       ICE CONNECTION
       ----------------------------------------------------- */

    peer.oniceconnectionstatechange =
        () => {

            console.log(
                `CAM ${cam} ICE:`,
                peer.iceConnectionState
            );
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
                    peer.localDescription
                        .type,

                sdp:
                    peer.localDescription
                        .sdp
            }
        });


        console.log(
            `OFFER CAM ${cam} GESENDET`
        );


    } catch (error) {

        console.error(
            `OFFER CAM ${cam}:`,
            error
        );
    }
}


/* =========================================================
   CAMERA RECEIVES OFFER
   ========================================================= */

async function handleCameraOffer(
    payload
) {

    if (!localStream) {

        console.warn(
            "CAMERA: Kein LocalStream"
        );

        return;
    }


    /* -----------------------------------------------------
       OLD PEER CLOSE
       ----------------------------------------------------- */

    if (cameraPeer) {

        try {
            cameraPeer.close();
        } catch (_) {}
    }


    pendingIceCandidates.camera =
        [];


    /* -----------------------------------------------------
       NEW PEER
       ----------------------------------------------------- */

    const peer =
        new RTCPeerConnection({
            iceServers:
                ICE_SERVERS
        });


    cameraPeer =
        peer;


    /* -----------------------------------------------------
       ADD CAMERA + MICROPHONE
       ----------------------------------------------------- */

    localStream
        .getTracks()
        .forEach(
            track => {

                console.log(
                    "SENDE TRACK:",
                    track.kind
                );


                peer.addTrack(
                    track,
                    localStream
                );
            }
        );


    /* -----------------------------------------------------
       ICE
       ----------------------------------------------------- */

    peer.onicecandidate =
        async event => {

            if (
                !event.candidate
            ) {
                return;
            }


            await broadcast({

                event: "webrtc",

                type: "ice",

                camera:
                    cameraNumber,

                candidate:
                    event.candidate
                        .toJSON()
            });
        };


    /* -----------------------------------------------------
       CONNECTION
       ----------------------------------------------------- */

    peer.onconnectionstatechange =
        () => {

            const state =
                peer.connectionState;


            console.log(
                "CAMERA CONNECTION:",
                state
            );


            if (
                state ===
                "connected"
            ) {

                setCameraDeviceConnected();

                broadcastCameraStatus(
                    "online"
                );
            }


            if (
                state ===
                    "failed" ||
                state ===
                    "disconnected"
            ) {

                setCameraDeviceDisconnected();
            }
        };


    peer.oniceconnectionstatechange =
        () => {

            console.log(
                "CAMERA ICE:",
                peer.iceConnectionState
            );
        };


    /* -----------------------------------------------------
       REMOTE DESCRIPTION
       ----------------------------------------------------- */

    try {

        await peer.setRemoteDescription(
            new RTCSessionDescription(
                payload.offer
            )
        );


        /* -------------------------------------------------
           ADD ANSWER
           ------------------------------------------------- */

        const answer =
            await peer.createAnswer();


        await peer.setLocalDescription(
            answer
        );


        await broadcast({

            event: "webrtc",

            type: "answer",

            camera:
                cameraNumber,

            answer: {

                type:
                    peer.localDescription
                        .type,

                sdp:
                    peer.localDescription
                        .sdp
            }
        });


        console.log(
            "ANSWER AN REGIE GESENDET"
        );


        setCameraDeviceConnecting();


    } catch (error) {

        console.error(
            "CAMERA OFFER FEHLER:",
            error
        );
    }
}


/* =========================================================
   DIRECTOR RECEIVES ANSWER
   ========================================================= */

async function handleCameraAnswer(
    payload
) {

    const cam =
        Number(payload.camera);


    const peer =
        directorPeers[cam];


    if (!peer) {

        console.warn(
            `Kein Peer CAM ${cam}`
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
            `ANSWER CAM ${cam} AKZEPTIERT`
        );


        await flushDirectorIce(
            cam
        );


    } catch (error) {

        console.error(
            `ANSWER CAM ${cam}:`,
            error
        );
    }
}


/* =========================================================
   DIRECTOR ICE
   ========================================================= */

async function handleDirectorICE(
    payload
) {

    const cam =
        Number(payload.camera);


    const peer =
        directorPeers[cam];


    if (!peer) {
        return;
    }


    if (
        !peer.remoteDescription
    ) {

        if (
            !pendingIceCandidates[cam]
        ) {

            pendingIceCandidates[cam] =
                [];
        }


        pendingIceCandidates[cam]
            .push(
                payload.candidate
            );

        return;
    }


    try {

        await peer.addIceCandidate(
            new RTCIceCandidate(
                payload.candidate
            )
        );

    } catch (error) {

        console.error(
            `DIRECTOR ICE CAM ${cam}:`,
            error
        );
    }
}


/* =========================================================
   CAMERA ICE
   ========================================================= */

async function handleCameraICE(
    payload
) {

    if (!cameraPeer) {
        return;
    }


    if (
        !cameraPeer.remoteDescription
    ) {

        if (
            !pendingIceCandidates.camera
        ) {

            pendingIceCandidates.camera =
                [];
        }


        pendingIceCandidates.camera
            .push(
                payload.candidate
            );

        return;
    }


    try {

        await cameraPeer.addIceCandidate(
            new RTCIceCandidate(
                payload.candidate
            )
        );

    } catch (error) {

        console.error(
            "CAMERA ICE FEHLER:",
            error
        );
    }
}


/* =========================================================
   FLUSH DIRECTOR ICE
   ========================================================= */

async function flushDirectorIce(
    cam
) {

    const peer =
        directorPeers[cam];


    const candidates =
        pendingIceCandidates[cam];


    if (
        !peer ||
        !candidates ||
        !candidates.length
    ) {
        return;
    }


    for (
        const candidate
        of candidates
    ) {

        try {

            await peer.addIceCandidate(
                new RTCIceCandidate(
                    candidate
                )
            );

        } catch (error) {

            console.error(
                "ICE FLUSH:",
                error
            );
        }
    }


    pendingIceCandidates[cam] =
        [];
}


/* =========================================================
   FLUSH CAMERA ICE
   ========================================================= */

async function flushCameraIce() {

    if (!cameraPeer) {
        return;
    }


    const candidates =
        pendingIceCandidates.camera;


    if (
        !candidates ||
        !candidates.length
    ) {
        return;
    }


    for (
        const candidate
        of candidates
    ) {

        try {

            await cameraPeer.addIceCandidate(
                new RTCIceCandidate(
                    candidate
                )
            );

        } catch (error) {

            console.error(
                "CAMERA ICE FLUSH:",
                error
            );
        }
    }


    pendingIceCandidates.camera =
        [];
}


/* =========================================================
   REMOTE STREAM → MULTIVIEW
   ========================================================= */

function attachRemoteStream(
    cam,
    stream
) {

    const video =
        $(`cameraVideo${cam}`);


    if (!video) {
        return;
    }


    video.srcObject =
        stream;


    /* -----------------------------------------------------
       MULTIVIEW IS MUTED
       ----------------------------------------------------- */

    video.muted = true;

    video.autoplay = true;

    video.playsInline = true;


    video.setAttribute(
        "autoplay",
        ""
    );

    video.setAttribute(
        "playsinline",
        ""
    );

    video.setAttribute(
        "muted",
        ""
    );


    video.play()
        .catch(error => {

            console.log(
                `CAM ${cam} Multiview autoplay:`,
                error
            );
        });


    const placeholder =
        $(`cameraPlaceholder${cam}`);


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


    if (
        currentCamera ===
        cam
    ) {

        updateProgramVideo();
    }
}


/* =========================================================
   CAMERA STATUS UI
   ========================================================= */

function setCameraConnecting(
    cam,
    device
) {

    const status =
        $(`cameraStatus${cam}`);


    const deviceElement =
        $(`cameraDevice${cam}`);


    if (status) {

        status.textContent =
            "CONNECTING";

        status.classList.remove(
            "waiting"
        );

        status.classList.add(
            "online"
        );
    }


    if (deviceElement) {

        deviceElement.textContent =
            device ||
            "CONNECTING";
    }
}


function setCameraLive(
    cam
) {

    const status =
        $(`cameraStatus${cam}`);


    const placeholder =
        $(`cameraPlaceholder${cam}`);


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


    if (placeholder) {

        placeholder.classList.add(
            "hidden"
        );
    }


    updateOnlineCountFromCards();
}


function handleCameraStatus(
    payload
) {

    if (isCameraMode) {
        return;
    }


    const cam =
        Number(payload.camera);


    if (
        cam < 1 ||
        cam > MAX_CAMERAS
    ) {
        return;
    }


    if (
        payload.status ===
        "online"
    ) {

        setCameraLive(
            cam
        );
    }


    if (
        payload.status ===
        "offline"
    ) {

        setCameraOffline(
            cam
        );
    }
}


function setCameraOffline(
    cam
) {

    const status =
        $(`cameraStatus${cam}`);


    const placeholder =
        $(`cameraPlaceholder${cam}`);


    const device =
        $(`cameraDevice${cam}`);


    if (status) {

        status.textContent =
            "WAITING";

        status.classList.remove(
            "online"
        );

        status.classList.add(
            "waiting"
        );
    }


    if (placeholder) {

        placeholder.classList.remove(
            "hidden"
        );
    }


    if (device) {

        device.textContent =
            "NO DEVICE";
    }


    updateOnlineCountFromCards();
}


/* =========================================================
   ONLINE COUNT
   ========================================================= */

function updateOnlineCountFromCards() {

    let count = 0;


    for (
        let i = 1;
        i <= MAX_CAMERAS;
        i++
    ) {

        const status =
            $(`cameraStatus${i}`);


        if (
            status &&
            (
                status.textContent ===
                    "LIVE" ||
                status.textContent ===
                    "ONLINE"
            )
        ) {

            count++;
        }
    }


    updateOnlineCount(
        count
    );
}


function updateOnlineCount(
    count
) {

    const onlineCount =
        $("onlineCount");


    const systemText =
        $("systemCameraText");


    if (onlineCount) {

        onlineCount.textContent =
            count;
    }


    if (systemText) {

        systemText.textContent =
            `${count} CAMERAS ONLINE`;
    }
}


/* =========================================================
   PROGRAM SWITCHING
   ========================================================= */

function selectCamera(
    cam
) {

    cam =
        Number(cam);


    if (
        cam < 1 ||
        cam > MAX_CAMERAS
    ) {
        return;
    }


    currentCamera =
        cam;


    updateProgramUI();

    updateProgramVideo();


    notify(
        `PROGRAM → CAM ${cam}`
    );
}


/* =========================================================
   PROGRAM UI
   ========================================================= */

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


/* =========================================================
   PROGRAM VIDEO
   ========================================================= */

function updateProgramVideo() {

    const programVideo =
        $("programVideo");


    const placeholder =
        $("programPlaceholder");


    if (!programVideo) {
        return;
    }


    const stream =
        remoteStreams[
            currentCamera
        ];


    if (
        stream &&
        stream.getVideoTracks()
            .length > 0
    ) {

        programVideo.srcObject =
            stream;


        /*
           PROGRAM darf Audio abspielen.
           Der Benutzer muss gegebenenfalls
           einmal auf der Seite klicken.
        */

        programVideo.muted =
            false;


        programVideo.autoplay =
            true;


        programVideo.playsInline =
            true;


        programVideo
            .play()
            .catch(error => {

                console.log(
                    "PROGRAM Audio/Video autoplay:",
                    error
                );
            });


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

function cutToCamera(
    cam
) {

    selectCamera(
        cam
    );


    const monitor =
        $("programMonitor");


    if (!monitor) {
        return;
    }


    monitor.classList.add(
        "cut-flash"
    );


    setTimeout(
        () => {

            monitor.classList.remove(
                "cut-flash"
            );

        },
        180
    );
}


/* =========================================================
   FADE
   ========================================================= */

function fadeToCamera(
    cam
) {

    const monitor =
        $("programMonitor");


    if (!monitor) {

        selectCamera(
            cam
        );

        return;
    }


    monitor.classList.add(
        "fade-transition"
    );


    setTimeout(
        () => {

            selectCamera(
                cam
            );

        },
        250
    );


    setTimeout(
        () => {

            monitor.classList.remove(
                "fade-transition"
            );

        },
        600
    );
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


        if (!button) {
            continue;
        }


        button.addEventListener(
            "click",
            () => {

                selectCamera(
                    i
                );
            }
        );
    }
}


/* =========================================================
   DIRECTOR CONTROLS
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
                    next >
                    MAX_CAMERAS
                ) {

                    next = 1;
                }


                cutToCamera(
                    next
                );
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
                    next >
                    MAX_CAMERAS
                ) {

                    next = 1;
                }


                fadeToCamera(
                    next
                );
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
        event => {

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


            /* 1-9 */

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
                    next >
                    MAX_CAMERAS
                ) {

                    next = 1;
                }


                cutToCamera(
                    next
                );

                return;
            }


            /* F = FADE */

            if (key === "f") {

                let next =
                    currentCamera + 1;


                if (
                    next >
                    MAX_CAMERAS
                ) {

                    next = 1;
                }


                fadeToCamera(
                    next
                );

                return;
            }


            /* R = RECORD */

            if (key === "r") {

                toggleRecording();

                return;
            }


            /* ESC */

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


function startRecording() {

    if (recording) {
        return;
    }


    recording =
        true;


    recordingStartTime =
        Date.now();


    const status =
        $("recordStatus");


    const button =
        $("recordButton");


    if (status) {

        status.classList.add(
            "recording"
        );
    }


    if (button) {

        button.classList.add(
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

    if (!recording) {
        return;
    }


    recording =
        false;


    clearInterval(
        recordingTimerInterval
    );


    recordingTimerInterval =
        null;


    const status =
        $("recordStatus");


    const button =
        $("recordButton");


    if (status) {

        status.classList.remove(
            "recording"
        );
    }


    if (button) {

        button.classList.remove(
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


    if (!timer) {
        return;
    }


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
            (totalSeconds % 3600) /
            60
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


    if (!element) {
        return;
    }


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
            (totalSeconds % 3600) /
            60
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

let selectedQrCamera =
    1;


function setupQr() {

    const qrButton =
        $("qrButton");


    const closeButton =
        $("closeQr");


    const modal =
        $("qrModal");


    if (qrButton) {

        qrButton.addEventListener(
            "click",
            () => {

                openQrModal(
                    currentCamera
                );
            }
        );
    }


    if (closeButton) {

        closeButton.addEventListener(
            "click",
            closeQrModal
        );
    }


    if (modal) {

        modal.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    modal
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
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        openQrModal(
                            Number(
                                button.dataset
                                    .qrCamera
                            )
                        );
                    }
                );
            }
        );
}


function openQrModal(
    cam
) {

    selectedQrCamera =
        cam;


    const modal =
        $("qrModal");


    const selected =
        $("qrSelectedCamera");


    const qr =
        $("qrcode");


    const urlText =
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


    if (!qr) {
        return;
    }


    qr.innerHTML =
        "";


    const cameraUrl =
        new URL(
            window.location.href
        );


    cameraUrl.search =
        "";


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

        new QRCode(
            qr,
            {

                text:
                    cameraUrl.toString(),

                width:
                    230,

                height:
                    230,

                correctLevel:
                    QRCode.CorrectLevel.M
            }
        );

    } else {

        qr.textContent =
            "QR-Code Bibliothek nicht geladen.";
    }


    if (urlText) {

        urlText.textContent =
            cameraUrl.toString();
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
   CAMERA DEVICE
   ========================================================= */

async function startLocalCamera() {

    if (!isCameraMode) {
        return;
    }


    const video =
        $("localCameraVideo");


    const placeholder =
        $("localCameraPlaceholder");


    try {

        /* -------------------------------------------------
           STOP OLD STREAM
           ------------------------------------------------- */

        if (localStream) {

            localStream
                .getTracks()
                .forEach(
                    track =>
                        track.stop()
                );
        }


        /* -------------------------------------------------
           GET CAMERA + MICROPHONE
           ------------------------------------------------- */

        localStream =
            await navigator.mediaDevices
                .getUserMedia({

                    video: {

                        facingMode:
                            "environment",

                        width: {
                            ideal: 1280
                        },

                        height: {
                            ideal: 720
                        },

                        frameRate: {
                            ideal: 30
                        }
                    },

                    audio: true
                });


        console.log(
            "LOCAL STREAM:",
            localStream
        );


        /* -------------------------------------------------
           SHOW LOCAL VIDEO
           ------------------------------------------------- */

        if (video) {

            video.srcObject =
                localStream;


            video.muted =
                true;


            video.autoplay =
                true;


            video.playsInline =
                true;


            video.setAttribute(
                "muted",
                ""
            );


            video.setAttribute(
                "autoplay",
                ""
            );


            video.setAttribute(
                "playsinline",
                ""
            );


            try {

                await video.play();

            } catch (error) {

                console.error(
                    "LOCAL VIDEO PLAY:",
                    error
                );
            }
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


        startCameraHelloLoop();


        notify(
            `CAM ${cameraNumber} KAMERA AKTIV`
        );


    } catch (error) {

        console.error(
            "GET USER MEDIA FEHLER:",
            error
        );


        setCameraDeviceError();


        notify(
            "KAMERA ODER MIKROFON NICHT ERLAUBT"
        );
    }
}


/* =========================================================
   SWITCH CAMERA
   ========================================================= */

async function switchCamera() {

    if (!isCameraMode) {
        return;
    }


    if (!localStream) {

        await startLocalCamera();

        return;
    }


    const oldTrack =
        localStream
            .getVideoTracks()[0];


    if (!oldTrack) {

        await startLocalCamera();

        return;
    }


    const settings =
        oldTrack.getSettings();


    const currentFacing =
        settings.facingMode ||
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
                            newFacing,

                        width: {
                            ideal: 1280
                        },

                        height: {
                            ideal: 720
                        },

                        frameRate: {
                            ideal: 30
                        }
                    },

                    audio: false
                });


        const newTrack =
            newStream
                .getVideoTracks()[0];


        const sender =
            cameraPeer
                ? cameraPeer
                    .getSenders()
                    .find(
                        item =>
                            item.track &&
                            item.track.kind ===
                            "video"
                    )
                : null;


        if (sender) {

            await sender.replaceTrack(
                newTrack
            );
        }


        oldTrack.stop();


        localStream.removeTrack(
            oldTrack
        );


        localStream.addTrack(
            newTrack
        );


        const video =
            $("localCameraVideo");


        if (video) {

            video.srcObject =
                localStream;


            video.play()
                .catch(() => {});
        }


        notify(
            "KAMERA GEWECHSELT"
        );


    } catch (error) {

        console.error(
            "SWITCH CAMERA:",
            error
        );


        notify(
            "KAMERA KANN NICHT GEWECHSELT WERDEN"
        );
    }
}


/* =========================================================
   CAMERA STATUS BROADCAST
   ========================================================= */

async function broadcastCameraStatus(
    status
) {

    if (!isCameraMode) {
        return;
    }


    await broadcast({

        event:
            "camera-status",

        camera:
            cameraNumber,

        status:
            status,

        device:
            navigator.userAgent
    });
}


/* =========================================================
   CAMERA UI
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


    const selected =
        $("selectedCameraNumber");


    if (cameraText) {

        cameraText.textContent =
            `CAM ${cameraNumber}`;
    }


    if (selected) {

        selected.textContent =
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
   DIRECTOR MODE SETUP
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

    updateOnlineCount(
        0
    );
}


/* =========================================================
   AUDIO METER
   ========================================================= */

function animateAudioMeter() {

    const meter =
        $("audioMeter");


    if (!meter) {
        return;
    }


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

        clearInterval(
            cameraHelloInterval
        );


        clearInterval(
            recordingTimerInterval
        );


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
   START APPLICATION
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        console.log(
            "===================================="
        );

        console.log(
            "LIVE REGIE START"
        );

        console.log(
            "SESSION:",
            sessionId
        );

        console.log(
            "CAMERA MODE:",
            isCameraMode
        );


        if (isCameraMode) {

            console.log(
                "CAMERA:",
                cameraNumber
            );
        }


        console.log(
            "===================================="
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
