/**
 * TAHAP 2: WEBSITE MONITORING (COACH/PACAR)
 * Versi Final Integrasi Live Monitoring & Dashboard Lengkap
 */

const SUPABASE_URL = "https://nkvamdmbzsxlhkzhrnhl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_0GoQIhwkjs8rcJPjfzKUCA_DjFLVLOX";

let supabaseClient = null;
let coachId = 'COACH-' + Math.random().toString(36).substr(2, 9);
let partnerUserId = null;
let partnerName = '';
let peerConnection = null;
let selectedDateStr = new Date().toISOString().split('T')[0];
let weightChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log("Dashboard Coach siap dimuat!");

    // 1. Inisialisasi Supabase
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        alert("CDN Supabase belum dimuat di HTML!");
        return;
    }

    // 2. Tombol Remote Control Putar Kamera (Diperbaiki penempatannya)
    const btnSwitchCamCoach = document.getElementById('btnSwitchCamCoach');
    if (btnSwitchCamCoach) {
        btnSwitchCamCoach.addEventListener('click', async () => {
            if (!partnerUserId) return alert("Belum terhubung dengan Syakira!");
            
            btnSwitchCamCoach.textContent = "Memutar...";
            btnSwitchCamCoach.disabled = true;
            
            // Kirim sinyal putar kamera ke HP Bebeee
            await sendSignal('command', 'switch_cam', partnerUserId, coachId);
            
            setTimeout(() => {
                btnSwitchCamCoach.textContent = "🔄 Putar Kamera Syakira";
                btnSwitchCamCoach.disabled = false;
            }, 2000);
        });
    }

    const connectBtn = document.getElementById('connectBtn');
    // ... (sisa kode di bawahnya biarkan sama persis) ...
    if (!connectBtn) return;

    connectBtn.addEventListener('click', async () => {
        const code = connectCodeInput.value.trim().toUpperCase();
        if (!code) {
            alert("Masukkan kode terlebih dahulu!");
            return;
        }

        connectBtn.disabled = true;
        connectBtn.textContent = "MEMERIKSA...";
        connectError.classList.add('hidden');

        try {
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('connect_code', code)
                .maybeSingle();

            if (error || !data) {
                throw new Error("Kode tidak ditemukan di database");
            }

            partnerUserId = data.id;
            partnerName = data.name;

            connectScreen.classList.remove('active');
            connectScreen.style.display = 'none';

            dashboardScreen.classList.add('active');
            dashboardScreen.style.display = 'block';

            connectionStatusText.textContent = `🟢 ONLINE (Terhubung dengan ${partnerName})`;
            connectionStatusText.className = "status-online";

            await loadDashboardData(partnerUserId, selectedDateStr);
            await renderDashCalendar(partnerUserId);
            await loadWeightProgressChart(partnerUserId);

            setupRealtimeSubscription(partnerUserId);
            setupWebRTCSignaling(coachId);

        } catch (err) {
            console.error("Gagal connect:", err);
            connectError.classList.remove('hidden');
        } finally {
            connectBtn.disabled = false;
            connectBtn.textContent = "CONNECT 💗";
        }
    });

    const requestCamBtn = document.getElementById('requestCamBtn');
    if (requestCamBtn) {
        requestCamBtn.addEventListener('click', async () => {
            if (!partnerUserId) return;
            requestCamBtn.textContent = "MENUNGGU IZIN SYAKIRA...";
            requestCamBtn.disabled = true;
            
            // Coach mengirim permintaan akses kamera ke database untuk direspons oleh Syakira
            await supabaseClient.from('webrtc_signaling').insert([{
                session_id: partnerUserId,
                sender_id: coachId,
                receiver_id: partnerUserId,
                type: 'request',
                payload: {}
            }]);

            setTimeout(() => {
                requestCamBtn.textContent = "REQUEST CAMERA 🔴";
                requestCamBtn.disabled = false;
            }, 4000);
        });
    }

    const dashCloseModal = document.getElementById('dashCloseModal');
    const dashImgModal = document.getElementById('dashImgModal');
    if (dashCloseModal && dashImgModal) {
        dashCloseModal.addEventListener('click', () => dashImgModal.classList.add('hidden'));
    }
});

async function loadDashboardData(userId, dateStr) {
    if (!userId || !supabaseClient) return;
    const dashSelectedDateLabel = document.getElementById('dashSelectedDateLabel');
    const dashFoodBody = document.getElementById('dashFoodBody');
    const dashTotalKcal = document.getElementById('dashTotalKcal');
    const dashProgressBar = document.getElementById('dashProgressBar');
    const targetStatusBadge = document.getElementById('targetStatusBadge');

    if (dashSelectedDateLabel) {
        dashSelectedDateLabel.textContent = (dateStr === new Date().toISOString().split('T')[0]) ? "Hari Ini" : dateStr;
    }

    try {
        const { data } = await supabaseClient
            .from('daily_calories')
            .select('*')
            .eq('user_id', userId)
            .eq('date', dateStr)
            .order('created_at', { ascending: true });

        if (dashFoodBody) {
            dashFoodBody.innerHTML = '';
            let totalKcal = 0;

            if (!data || data.length === 0) {
                dashFoodBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#888; font-style:italic; padding: 1.5rem;">Belum ada makanan dicatat.</td></tr>`;
            } else {
                data.forEach(item => {
                    totalKcal += item.calories;
                    dashFoodBody.innerHTML += `
                        <tr style="border-bottom: 1px solid #f1f1f1;">
                            <td style="padding: 10px;"><img src="${item.photo_path}" class="dash-thumb" onclick="openDashImg('${item.photo_path}')" alt="Foto"></td>
                            <td style="padding: 10px;"><strong>${item.food_name}</strong></td>
                            <td style="padding: 10px;">${item.weight} ${item.unit}</td>
                            <td style="padding: 10px; color: #FF1493; font-weight: 600;">${item.calories} kcal</td>
                        </tr>
                    `;
                });
            }

            if (dashTotalKcal) dashTotalKcal.textContent = totalKcal;
            let pct = (totalKcal / 1200) * 100;
            if (dashProgressBar) dashProgressBar.style.width = `${Math.min(pct, 100)}%`;

            if (targetStatusBadge && dashProgressBar) {
                if (totalKcal > 1200) {
                    targetStatusBadge.textContent = "MELEBIHI TARGET ⚠️";
                    targetStatusBadge.className = "target-badge danger";
                    dashProgressBar.style.background = "#e74c3c";
                } else {
                    targetStatusBadge.textContent = "AMAN 💗";
                    targetStatusBadge.className = "target-badge safe";
                    dashProgressBar.style.background = "#FF1493";
                }
            }
        }
    } catch (err) {
        console.error("Load data error:", err);
    }
}

function setupRealtimeSubscription(userId) {
    if (!supabaseClient || !userId) return;
    try {
        supabaseClient
            .channel('public:daily_calories:' + userId)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_calories', filter: `user_id=eq.${userId}` }, payload => {
                // Memuat ulang data dashboard secara otomatis baik saat ada penambahan (INSERT) maupun penghapusan/reset (DELETE)
                loadDashboardData(userId, selectedDateStr);
                renderDashCalendar(userId);
            })
            .subscribe();
    } catch (e) {
        console.log("Realtime handled:", e);
    }
}

// ==========================================
// PERBAIKAN WEBRTC SIGNALING DI DASHBOARD.JS
// ==========================================
let coachIceQueue = []; // Tambahkan ini di luar agar bisa menampung antrean

function setupWebRTCSignaling(cId) {
    if (!supabaseClient || !partnerUserId) return;
    try {
        supabaseClient
            .channel('public:webrtc_signaling:' + partnerUserId)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'webrtc_signaling', 
                filter: `session_id=eq.${partnerUserId}` 
            }, async (payload) => {
                const signal = payload.new;
                if (!signal || signal.sender_id === cId) return;

                const remoteVideo = document.getElementById('remoteVideo');
                const camOverlay = document.getElementById('camOverlay');
                const camOverlayText = document.getElementById('camOverlayText');

                if (signal.type === 'offer') {
                    if (camOverlayText) camOverlayText.textContent = "Syakira membuka kamera, menghubungkan...";
                    
                    if (peerConnection) {
                        peerConnection.close();
                    }

                    peerConnection = new RTCPeerConnection({
                        iceServers: [
                            { urls: "stun:stun.l.google.com:19302" },
                            { urls: "stun:stun1.l.google.com:19302" }
                        ]
                    });

                    // Penanganan track khusus agar tembus iOS/Safari
                    peerConnection.ontrack = (event) => {
                        console.log("STREAM VIDEO BERHASIL DITERIMA DI COACH!", event.streams);
                        
                        let incomingStream = event.streams[0];
                        if (!incomingStream) {
                            incomingStream = new MediaStream();
                            incomingStream.addTrack(event.track);
                        }

                        if (remoteVideo) {
                            remoteVideo.srcObject = incomingStream;
                            remoteVideo.muted = true;
                            remoteVideo.setAttribute('autoplay', 'true');
                            remoteVideo.setAttribute('playsinline', 'true');
                            
                            // Paksa play secara eksplisit untuk Safari/iOS
                            const playPromise = remoteVideo.play();
                            if (playPromise !== undefined) {
                                playPromise.then(_ => {
                                    console.log("Video berhasil diputar di Coach");
                                }).catch(error => {
                                    console.log("Autoplay dicegah browser, mencoba ulang...", error);
                                });
                            }

                            if (camOverlay) camOverlay.classList.add('hidden');
                        }
                    };

                    peerConnection.onicecandidate = (event) => {
                        if (event.candidate) {
                            sendSignal('candidate', event.candidate, partnerUserId, cId);
                        }
                    };

                    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.payload));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    
                    await sendSignal('answer', answer, partnerUserId, cId);
                }

                if (signal.type === 'candidate' && peerConnection) {
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.payload));
                    } catch (e) {
                        console.log("Gagal tambah ICE candidate:", e);
                    }
                }
            })
            .subscribe();
    } catch (e) {
        console.log("Signaling error:", e);
    }
}

async function sendSignal(type, payload, targetUserId, cId) {
    if (!supabaseClient) return;
    await supabaseClient.from('webrtc_signaling').insert([{
        session_id: targetUserId,
        sender_id: cId,
        receiver_id: targetUserId,
        type: type,
        payload: payload
    }]);
}

let currentDashCalDate = new Date();

async function renderDashCalendar(userId) {
    if (!userId || !supabaseClient) return;
    const dashCalendarGrid = document.getElementById('dashCalendarGrid');
    const dashMonthYear = document.getElementById('dashMonthYear');
    if (!dashCalendarGrid) return;

    dashCalendarGrid.innerHTML = '';
    const year = currentDashCalDate.getFullYear();
    const month = currentDashCalDate.getMonth();
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    if (dashMonthYear) dashMonthYear.textContent = `${monthNames[month]} ${year}`;

    const startOfMonth = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const endOfMonth = `${year}-${String(month+1).padStart(2,'0')}-${daysInMonth}`;

    const { data } = await supabaseClient
        .from('daily_calories')
        .select('date')
        .eq('user_id', userId)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);

    const activeDates = data ? [...new Set(data.map(d => d.date))] : [];

    for (let i = 0; i < firstDay; i++) {
        dashCalendarGrid.innerHTML += `<div></div>`;
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const div = document.createElement('div');
        div.className = 'dash-cal-day';
        div.textContent = i;

        if (activeDates.includes(dStr)) div.classList.add('has-data');
        if (dStr === selectedDateStr) div.classList.add('selected');

        div.addEventListener('click', () => {
            selectedDateStr = dStr;
            renderDashCalendar(userId);
            loadDashboardData(userId, selectedDateStr);
        });

        dashCalendarGrid.appendChild(div);
    }
}

async function loadWeightProgressChart(userId) {
    if (!userId || !supabaseClient) return;
    const { data, error } = await supabaseClient
        .from('weight_progress')
        .select('date, weight')
        .eq('user_id', userId)
        .order('date', { ascending: true });

    if (error || !data) return;

    const labels = data.map(d => new Date(d.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
    const weights = data.map(d => d.weight);

    const canvasCtx = document.getElementById('dashWeightChart');
    if (!canvasCtx) return;

    const ctx = canvasCtx.getContext('2d');
    if (weightChartInstance) weightChartInstance.destroy();

    weightChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Berat Badan (kg)',
                data: weights,
                borderColor: '#FF1493',
                backgroundColor: 'rgba(255, 20, 147, 0.1)',
                borderWidth: 3,
                tension: 0.3,
                fill: true,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#FF1493',
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: false } }
        }
    });
}

function openDashImg(url) {
    const dashViewerImg = document.getElementById('dashViewerImg');
    const dashImgModal = document.getElementById('dashImgModal');
    if (dashViewerImg && dashImgModal) {
        dashViewerImg.src = url;
        dashImgModal.classList.remove('hidden');
    }
}