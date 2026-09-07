/* =========================================================
   LIVE REGIE
   WebRTC + Supabase Realtime
   ECHTE VIDEO-VERIFIKATION
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

    window.history.replaceState(
        {},
        "",
        `${window.location.pathname}?session=${sessionId}`
    );
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
   STATE
   ========================================================= */

let channel = null;

let currentCamera = 1;

let localStream = null;

let cameraPeer = null;

const directorPeers = {};

const remoteStreams = {};

const pendingIceCandidates = {};

const cameraVideoVerified = {};

const cameraFrameWatchers = {};

let cameraHelloInterval = null;

let recording = false;

let recordingStartTime = null;

let recordingTimerInterval = null;

let programClockStart = Date.now();


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
        text.textContent = message;
    }

    if (!notification) {
        return;
    }

    notification.classList.add("show");

    clearTimeout(
        notification._timer
    );

    notification._timer =
        setTimeout(() => {
            notification.classList.remove("show");
        }, 3000);
}


/* =========================================================
   CAMERA DIAGNOSTIC UI
   ========================================================= */

function createDiagnosticBox() {

    if (!isCameraMode) {
        return;
    }

    let box =
        $("cameraDiagnostic");

    if (box) {
        return;
    }

    box =
        document.createElement("div");

    box.id =
        "cameraDiagnostic";

    box.style.marginTop =
        "15px";

    box.style.padding =
        "15px";

    box.style.border =
        "1px solid rgba(255,255,255,.15)";

    box.style.borderRadius =
        "12px";

    box.style.background =
        "rgba(0,0,0,.35)";

    box.style.fontFamily =
        "monospace";

    box.innerHTML = `
        <div style="font-weight:bold;margin-bottom:10px;">
            KAMERA-VERIFIKATION
        </div>

        <div id="diagCamera">⚪ Kamera: TEST</div>
        <div id="diagVideoTrack">⚪ Video-Track: TEST</div>
        <div id="diagLocalVideo">⚪ Lokales Bild: TEST</div>
        <div id="diagMicrophone">⚪ Mikrofon: TEST</div>
        <div id="diagWebRTC">⚪ WebRTC: WARTE</div>
        <div id="diagRemoteVideo">⚪ Bildübertragung: WARTE</div>
        <div id="diagFrames">⚪ Videoframes: WARTE</div>

        <div
            id="diagResult"
            style="margin-top:10px;font-weight:bold;"
        >
            ⚪ Noch kein Test
        </div>
    `;

    const cameraMode =
        $("cameraMode");

    if (cameraMode) {
        cameraMode.appendChild(box);
    } else {
        document.body.appendChild(box);
    }
}


function diagnostic(id, text) {

    const element =
        $(id);

    if (element) {
        element.textContent =
            text;
    }
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
       WEBRTC
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

            handleWebRTCMessage(payload);
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

            handleCameraStatus(payload);
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
        updatePresenceStatus
    );

    channel.on(
        "presence",
        {
            event: "join"
        },
        updatePresenceStatus
    );

    channel.on(
        "presence",
        {
            event: "leave"
        },
        updatePresenceStatus
    );


    /* -----------------------------------------------------
       CONNECT
       ----------------------------------------------------- */

    channel.subscribe(
        async status => {

            console.log(
                "SUPABASE:",
                status
            );

            if (
                status ===
                "SUBSCRIBED"
            ) {

                console.log(
                    "SESSION:",
                    sessionId
                );

                await publishPresence();

                if (isCameraMode) {

                    notify(
                        `CAM ${cameraNumber} VERBUNDEN`
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
                camera: cameraNumber
            });

        } else {

            await channel.track({
                role: "director"
            });
        }

    } catch (error) {

        console.error(
            "PRESENCE:",
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

    Object.values(state)
        .forEach(entries => {

            entries.forEach(entry => {

                if (
                    entry.role === "camera" &&
                    Number(entry.camera) >= 1 &&
                    Number(entry.camera) <= 9
                ) {
                    online++;
                }

            });

        });

    updateOnlineCount(online);
}


/* =========================================================
   BROADCAST
   ========================================================= */

async function broadcast(payload) {

    if (!channel) {
        return;
    }

    try {

        await channel.send({
            type: "broadcast",
            event: payload.event,
            payload: payload
        });

    } catch (error) {

        console.error(
            "BROADCAST:",
            error
        );
    }
}


/* =========================================================
   WEBRTC ROUTER
   ========================================================= */

async function handleWebRTCMessage(payload) {

    if (!payload.type) {
        return;
    }


    /* =====================================================
       CAMERA DEVICE
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

            await handleCameraOffer(payload);

            return;
        }

        if (
            payload.type ===
            "ice"
        ) {

            await handleCameraICE(payload);

            return;
        }

        return;
    }


    /* =====================================================
       REGIE
       ===================================================== */

    if (
        payload.type ===
        "camera-hello"
    ) {

        await handleCameraHello(payload);

        return;
    }

    if (
        payload.type ===
        "answer"
    ) {

        await handleCameraAnswer(payload);

        return;
    }

    if (
        payload.type ===
        "ice"
    ) {

        await handleDirectorICE(payload);

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

    const videoTrack =
        localStream.getVideoTracks()[0];

    await broadcast({

        event: "webrtc",

        type: "camera-hello",

        camera:
            cameraNumber,

        session:
            sessionId,

        videoTrack:
            !!videoTrack,

        videoTrackEnabled:
            videoTrack
                ? videoTrack.enabled
                : false,

        videoTrackReadyState:
            videoTrack
                ? videoTrack.readyState
                : "none"
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
        setInterval(() => {

            if (localStream) {
                sendCameraHello();
            }

        }, 3000);
}


/* =========================================================
   DIRECTOR RECEIVES CAMERA HELLO
   ========================================================= */

async function handleCameraHello(payload) {

    const cam =
        Number(payload.camera);

    if (
        cam < 1 ||
        cam > MAX_CAMERAS
    ) {
        return;
    }

    console.log(
        `CAM ${cam} HELLO`,
        payload
    );

    setCameraConnecting(
        cam
    );

    await createDirectorPeer(cam);
}


/* =========================================================
   DIRECTOR PEER
   ========================================================= */

async function createDirectorPeer(cam) {

    if (directorPeers[cam]) {

        try {
            directorPeers[cam].close();
        } catch (_) {}

        delete directorPeers[cam];
    }

    remoteStreams[cam] =
        new MediaStream();

    cameraVideoVerified[cam] =
        false;

    pendingIceCandidates[cam] =
        [];


    const peer =
        new RTCPeerConnection({
            iceServers:
                ICE_SERVERS
        });

    directorPeers[cam] =
        peer;


    /* -----------------------------------------------------
       IMPORTANT:
       REGIE SENDS NOTHING.
       REGIE DOES NOT REQUEST MICROPHONE.
       REGIE ONLY RECEIVES.
       ----------------------------------------------------- */

    peer.addTransceiver(
        "video",
        {
            direction: "recvonly"
        }
    );

    peer.addTransceiver(
        "audio",
        {
            direction: "recvonly"
        }
    );


    /* -----------------------------------------------------
       TRACK RECEIVED
       ----------------------------------------------------- */

    peer.ontrack =
        event => {

            console.log(
                `CAM ${cam} TRACK:`,
                event.track.kind
            );

            const stream =
                remoteStreams[cam];

            if (
                !stream
                    .getTracks()
                    .some(
                        track =>
                            track.id ===
                            event.track.id
                    )
            ) {

                stream.addTrack(
                    event.track
                );
            }


            if (
                event.track.kind ===
                "video"
            ) {

                console.log(
                    `CAM ${cam}: VIDEO TRACK EMPFANGEN`
                );

                startRemoteVideoVerification(
                    cam,
                    stream
                );
            }


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

            if (!event.candidate) {
                return;
            }

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

                setCameraConnecting(
                    cam
                );

                /*
                 * NICHT LIVE!
                 *
                 * LIVE wird erst gesetzt,
                 * wenn echte Videoframes
                 * angekommen sind.
                 */
            }

            if (
                state ===
                "failed"
            ) {

                setCameraOffline(
                    cam
                );

                notify(
                    `CAM ${cam} WEBRTC FEHLER`
                );
            }

            if (
                state ===
                "disconnected"
            ) {

                setCameraConnecting(
                    cam
                );
            }
        };


    /* -----------------------------------------------------
       ICE STATE
       ----------------------------------------------------- */

    peer.oniceconnectionstatechange =
        () => {

            console.log(
                `CAM ${cam} ICE:`,
                peer.iceConnectionState
            );
        };


    /* -----------------------------------------------------
       OFFER
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
            `CAM ${cam}: OFFER GESENDET`
        );

    } catch (error) {

        console.error(
            `CAM ${cam} OFFER:`,
            error
        );
    }
}


/* =========================================================
   CAMERA RECEIVES OFFER
   ========================================================= */

async function handleCameraOffer(payload) {

    if (!localStream) {

        console.error(
            "CAMERA: KEIN LOCAL STREAM"
        );

        diagnostic(
            "diagResult",
            "❌ Kein Kamerastream vorhanden"
        );

        return;
    }


    if (cameraPeer) {

        try {
            cameraPeer.close();
        } catch (_) {}
    }


    pendingIceCandidates.camera =
        [];


    const peer =
        new RTCPeerConnection({
            iceServers:
                ICE_SERVERS
        });

    cameraPeer =
        peer;


    /* -----------------------------------------------------
       VERIFY LOCAL TRACKS
       ----------------------------------------------------- */

    const videoTrack =
        localStream
            .getVideoTracks()[0];

    const audioTrack =
        localStream
            .getAudioTracks()[0];


    console.log(
        "VIDEO TRACK:",
        videoTrack
    );

    console.log(
        "AUDIO TRACK:",
        audioTrack
    );


    if (videoTrack) {

        peer.addTrack(
            videoTrack,
            localStream
        );

        diagnostic(
            "diagVideoTrack",
            "🟢 Video-Track: WIRD ÜBERTRAGEN"
        );

    } else {

        diagnostic(
            "diagVideoTrack",
            "🔴 Video-Track: FEHLT"
        );
    }


    if (audioTrack) {

        peer.addTrack(
            audioTrack,
            localStream
        );

        diagnostic(
            "diagMicrophone",
            "🟢 Mikrofon: WIRD ÜBERTRAGEN"
        );

    } else {

        diagnostic(
            "diagMicrophone",
            "🔴 Mikrofon: FEHLT"
        );
    }


    /* -----------------------------------------------------
       ICE
       ----------------------------------------------------- */

    peer.onicecandidate =
        async event => {

            if (!event.candidate) {
                return;
            }

            await broadcast({

                event: "webrtc",

                type: "ice",

                camera:
                    cameraNumber,

                candidate:
                    event.candidate.toJSON()
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
                "CAMERA WEBRTC:",
                state
            );


            if (
                state ===
                "connected"
            ) {

                diagnostic(
                    "diagWebRTC",
                    "🟢 WebRTC: VERBUNDEN"
                );

                setCameraDeviceConnected();

                broadcastCameraStatus(
                    "connected"
                );
            }


            if (
                state ===
                "failed"
            ) {

                diagnostic(
                    "diagWebRTC",
                    "🔴 WebRTC: FEHLER"
                );

                setCameraDeviceDisconnected();
            }


            if (
                state ===
                "disconnected"
            ) {

                diagnostic(
                    "diagWebRTC",
                    "🟡 WebRTC: GETRENNT"
                );
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
       OFFER SETZEN
       ----------------------------------------------------- */

    try {

        await peer.setRemoteDescription(
            new RTCSessionDescription(
                payload.offer
            )
        );


        await flushCameraIce();


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
                    peer.localDescription.type,

                sdp:
                    peer.localDescription.sdp
            }
        });


        console.log(
            "CAMERA: ANSWER GESENDET"
        );


        setCameraDeviceConnecting();


    } catch (error) {

        console.error(
            "CAMERA OFFER FEHLER:",
            error
        );

        diagnostic(
            "diagResult",
            "🔴 WebRTC-Angebot konnte nicht verarbeitet werden"
        );
    }
}


/* =========================================================
   CAMERA ANSWER
   ========================================================= */

async function handleCameraAnswer(payload) {

    const cam =
        Number(payload.camera);

    const peer =
        directorPeers[cam];

    if (!peer) {
        return;
    }

    try {

        await peer.setRemoteDescription(
            new RTCSessionDescription(
                payload.answer
            )
        );

        await flushDirectorIce(cam);

        console.log(
            `CAM ${cam}: ANSWER AKZEPTIERT`
        );

    } catch (error) {

        console.error(
            `CAM ${cam} ANSWER:`,
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

    if (!peer) {
        return;
    }

    if (!peer.remoteDescription) {

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

async function handleCameraICE(payload) {

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
            "CAMERA ICE:",
            error
        );
    }
}


/* =========================================================
   FLUSH ICE
   ========================================================= */

async function flushDirectorIce(cam) {

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
                "DIRECTOR ICE FLUSH:",
                error
            );
        }
    }

    pendingIceCandidates[cam] =
        [];
}


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
   LOCAL CAMERA VERIFICATION
   ========================================================= */

async function verifyLocalCamera() {

    if (
        !isCameraMode ||
        !localStream
    ) {
        return false;
    }


    const videoTrack =
        localStream
            .getVideoTracks()[0];


    diagnostic(
        "diagCamera",
        videoTrack
            ? "🟢 Kamera: ERKANNT"
            : "🔴 Kamera: NICHT ERKANNT"
    );


    diagnostic(
        "diagVideoTrack",
        videoTrack
            ? "🟢 Video-Track: VORHANDEN"
            : "🔴 Video-Track: FEHLT"
    );


    const video =
        $("localCameraVideo");


    if (!video) {

        diagnostic(
            "diagLocalVideo",
            "🔴 Lokales Bild: VIDEO-ELEMENT FEHLT"
        );

        return false;
    }


    if (
        video.videoWidth > 0 &&
        video.videoHeight > 0
    ) {

        diagnostic(
            "diagLocalVideo",
            `🟢 Lokales Bild: ${video.videoWidth}×${video.videoHeight}`
        );

    } else {

        diagnostic(
            "diagLocalVideo",
            "🟡 Lokales Bild: WARTE AUF FRAME"
        );
    }


    const audioTrack =
        localStream
            .getAudioTracks()[0];


    diagnostic(
        "diagMicrophone",
        audioTrack
            ? "🟢 Mikrofon: VORHANDEN"
            : "🔴 Mikrofon: FEHLT"
    );


    return !!videoTrack;
}


/* =========================================================
   REMOTE VIDEO VERIFICATION
   ========================================================= */

function startRemoteVideoVerification(
    cam,
    stream
) {

    if (
        cameraFrameWatchers[cam]
    ) {

        clearInterval(
            cameraFrameWatchers[cam]
        );
    }


    cameraFrameWatchers[cam] =
        setInterval(() => {

            const video =
                $(`cameraVideo${cam}`);


            if (!video) {
                return;
            }


            const tracks =
                stream.getVideoTracks();


            if (!tracks.length) {

                return;
            }


            const track =
                tracks[0];


            if (
                track.readyState !==
                "live"
            ) {

                return;
            }


            if (
                video.videoWidth > 0 &&
                video.videoHeight > 0
            ) {

                cameraVideoVerified[cam] =
                    true;


                console.log(
                    `CAM ${cam}: ECHTES VIDEO BESTÄTIGT`,
                    video.videoWidth,
                    video.videoHeight
                );


                setCameraLive(
                    cam
                );


                stopRemoteVideoVerification(
                    cam
                );


                notify(
                    `CAM ${cam} VIDEO LIVE`
                );


                if (
                    currentCamera ===
                    cam
                ) {

                    updateProgramVideo();
                }
            }

        }, 250);
}


/* =========================================================
   STOP VIDEO WATCHER
   ========================================================= */

function stopRemoteVideoVerification(
    cam
) {

    if (
        cameraFrameWatchers[cam]
    ) {

        clearInterval(
            cameraFrameWatchers[cam]
        );

        delete cameraFrameWatchers[cam];
    }
}


/* =========================================================
   REMOTE STREAM
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


    video.play()
        .catch(error => {

            console.warn(
                `CAM ${cam} PLAY:`,
                error
            );
        });


    const placeholder =
        $(`cameraPlaceholder${cam}`);


    /*
     * Wichtig:
     * Placeholder erst ausblenden,
     * wenn wirklich ein Bild existiert.
     */

    if (
        video.videoWidth > 0 &&
        video.videoHeight > 0
    ) {

        if (placeholder) {
            placeholder.classList.add("hidden");
        }
    }


    const device =
        $(`cameraDevice${cam}`);


    if (device) {

        device.textContent =
            "WEBRTC";
    }


    startRemoteVideoVerification(
        cam,
        stream
    );
}


/* =========================================================
   CAMERA UI
   ========================================================= */

function setCameraConnecting(
    cam
) {

    const status =
        $(`cameraStatus${cam}`);

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
}


function setCameraLive(
    cam
) {

    /*
     * LIVE darf NUR nach echter
     * Video-Verifikation entstehen.
     */

    if (
        !cameraVideoVerified[cam]
    ) {
        return;
    }


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


function setCameraOffline(
    cam
) {

    cameraVideoVerified[cam] =
        false;


    stopRemoteVideoVerification(
        cam
    );


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
            "NO VIDEO";
    }


    updateOnlineCountFromCards();
}


/* =========================================================
   CAMERA STATUS
   ========================================================= */

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


    /*
     * connected = nur WebRTC-Verbindung.
     * Noch NICHT LIVE.
     */

    if (
        payload.status ===
        "connected"
    ) {

        setCameraConnecting(
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
            status.textContent ===
            "LIVE"
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
            `${count} CAMERAS LIVE`;
    }
}


/* =========================================================
   PROGRAM
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


    /*
     * Kein verifiziertes Bild:
     * PROGRAM bleibt leer.
     */

    if (
        !stream ||
        !cameraVideoVerified[currentCamera]
    ) {

        programVideo.srcObject =
            null;

        if (placeholder) {
            placeholder.classList.remove(
                "hidden"
            );
        }

        return;
    }


    programVideo.srcObject =
        stream;


    programVideo.muted =
        false;

    programVideo.autoplay =
        true;

    programVideo.playsInline =
        true;


    programVideo.play()
        .catch(error => {

            console.warn(
                "PROGRAM PLAY:",
                error
            );
        });


    if (placeholder) {

        placeholder.classList.add(
            "hidden"
        );
    }
}


/* =========================================================
   CUT / FADE
   ========================================================= */

function cutToCamera(
    cam
) {

    selectCamera(cam);

    const monitor =
        $("programMonitor");


    if (monitor) {

        monitor.classList.add(
            "cut-flash"
        );

        setTimeout(() => {

            monitor.classList.remove(
                "cut-flash"
            );

        }, 180);
    }
}


function fadeToCamera(
    cam
) {

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


        if (!button) {
            continue;
        }


        button.addEventListener(
            "click",
            () => {

                selectCamera(i);
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
                    next >
                    MAX_CAMERAS
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


            if (
                key >= "1" &&
                key <= "9"
            ) {

                selectCamera(
                    Number(key)
                );

                return;
            }


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

                cutToCamera(next);

                return;
            }


            if (key === "f") {

                let next =
                    currentCamera + 1;

                if (
                    next >
                    MAX_CAMERAS
                ) {
                    next = 1;
                }

                fadeToCamera(next);

                return;
            }


            if (key === "r") {

                toggleRecording();

                return;
            }


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
   RECORDING TIMER
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
   QR
   ========================================================= */

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
}


function openQrModal(cam) {

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
   START LOCAL CAMERA
   ========================================================= */

async function startLocalCamera() {

    if (!isCameraMode) {
        return;
    }


    createDiagnosticBox();


    diagnostic(
        "diagResult",
        "🟡 Kamera wird getestet..."
    );


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
           CAMERA + MICROPHONE
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
           TRACK CHECK
           ------------------------------------------------- */

        const videoTrack =
            localStream
                .getVideoTracks()[0];

        const audioTrack =
            localStream
                .getAudioTracks()[0];


        diagnostic(
            "diagCamera",
            videoTrack
                ? "🟢 Kamera: ERKANNT"
                : "🔴 Kamera: FEHLT"
        );


        diagnostic(
            "diagVideoTrack",
            videoTrack
                ? "🟢 Video-Track: VORHANDEN"
                : "🔴 Video-Track: FEHLT"
        );


        diagnostic(
            "diagMicrophone",
            audioTrack
                ? "🟢 Mikrofon: VORHANDEN"
                : "🔴 Mikrofon: FEHLT"
        );


        if (!videoTrack) {

            throw new Error(
                "Kein Video-Track"
            );
        }


        /* -------------------------------------------------
           LOCAL VIDEO
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


        /* -------------------------------------------------
           WAIT FOR ACTUAL LOCAL FRAME
           ------------------------------------------------- */

        await waitForLocalVideoFrame();


        diagnostic(
            "diagLocalVideo",
            `🟢 Lokales Bild: ${video.videoWidth}×${video.videoHeight}`
        );


        diagnostic(
            "diagResult",
            "🟢 KAMERA-CHECK BESTANDEN – WARTE AUF REGIE"
        );


        updateCameraDeviceInfo();

        setCameraDeviceReady();


        await publishPresence();

        await broadcastCameraStatus(
            "online"
        );


        startCameraHelloLoop();


        notify(
            `CAM ${cameraNumber}: KAMERA BEREIT`
        );


    } catch (error) {

        console.error(
            "KAMERA FEHLER:",
            error
        );


        diagnostic(
            "diagResult",
            `🔴 KAMERA-CHECK FEHLGESCHLAGEN: ${error.message}`
        );


        setCameraDeviceError();


        notify(
            "KAMERA-CHECK FEHLGESCHLAGEN"
        );
    }
}


/* =========================================================
   WAIT FOR LOCAL VIDEO FRAME
   ========================================================= */

function waitForLocalVideoFrame() {

    return new Promise(
        resolve => {

            const video =
                $("localCameraVideo");


            if (!video) {

                resolve();

                return;
            }


            const start =
                Date.now();


            const check =
                () => {

                    if (
                        video.videoWidth > 0 &&
                        video.videoHeight > 0
                    ) {

                        resolve();

                        return;
                    }


                    if (
                        Date.now() -
                        start >
                        5000
                    ) {

                        resolve();

                        return;
                    }


                    requestAnimationFrame(
                        check
                    );
                };


            check();
        }
    );
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

            video.muted =
                true;

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
            status
    });
}


/* =========================================================
   CAMERA DEVICE UI
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
            "KAMERA BEREIT";
    }

    if (mic) {
        mic.textContent =
            "AKTIV";
    }

    if (modeStatus) {
        modeStatus.textContent =
            "WAITING FOR REGIE";
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
            "WEBRTC CONNECTING";
    }


    diagnostic(
        "diagWebRTC",
        "🟡 WebRTC: VERBINDET..."
    );
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
            "WEBRTC CONNECTED";
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
   CAMERA MODE
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


    createDiagnosticBox();

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
   DIRECTOR MODE
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


        Object.values(
            cameraFrameWatchers
        ).forEach(
            watcher =>
                clearInterval(watcher)
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
   START
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        console.log(
            "========================================"
        );

        console.log(
            "LIVE REGIE – VIDEO VERIFICATION"
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
            "REGIE REQUESTS NO CAMERA/MICROPHONE"
        );

        console.log(
            "========================================"
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
