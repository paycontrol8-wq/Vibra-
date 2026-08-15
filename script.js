document.addEventListener("DOMContentLoaded", () => {
    const checkFB = setInterval(() => {
        if (window.db && window.FB) {
            clearInterval(checkFB);
            initApp();
        }
    }, 100);
});

function initApp() {
    const { doc, setDoc, getDoc, deleteDoc, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp, collection } = window.FB;
    const db = window.db;

    let currentUser = JSON.parse(localStorage.getItem("vibraUserSession") || "null");
    let activeChatTargetId = null;
    let chatUnsubscribe = null;

    let userCoords = { lat: 7.1193, lng: -73.1227 };
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => { userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude }; updatePresence(); },
            () => { updatePresence(); }
        );
    }

    const authModal = document.getElementById("authModal");
    const createPostModal = document.getElementById("createPostModal");

    if (currentUser) {
        updatePresence();
        setInterval(updatePresence, 30000);
    }

    updateUI();
    initFeed();
    initPeopleList();
    initInboxList();

    function requireAuth(actionCallback) {
        if (!currentUser) {
            authModal.classList.add("active");
            showToast("Inicia sesión para realizar esta acción ✨");
            return false;
        }
        actionCallback();
        return true;
    }

    document.getElementById("closeAuthModal").addEventListener("click", () => authModal.classList.remove("active"));

    // CONVERTIR IMAGEN A BASE64 (GRATIS)
    function processImageFile(fileInput) {
        return new Promise((resolve) => {
            const file = fileInput.files[0];
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }

    // REGISTRO / LOGIN
    document.getElementById("btnStartSession").addEventListener("click", async () => {
        const name = document.getElementById("authName").value.trim();
        const email = document.getElementById("authEmail").value.trim();
        const pronouns = document.getElementById("authPronouns").value.trim() || "(Él/Ella/Elle)";
        const photoFile = document.getElementById("authPhotoFile");

        if (!name || !email) {
            showToast("Completa tu nombre y correo por favor");
            return;
        }

        const photoBase64 = await processImageFile(photoFile);
        const id = "usr_" + btoa(email.toLowerCase()).replace(/=/g, "");
        currentUser = { id, name, email, pronouns, photo: photoBase64 || null, lat: userCoords.lat, lng: userCoords.lng };

        localStorage.setItem("vibraUserSession", JSON.stringify(currentUser));
        authModal.classList.remove("active");
        updatePresence();
        updateUI();
        initInboxList();
        showToast("¡Sesión iniciada correctamente! ✨");
    });

    function updatePresence() {
        if (!currentUser) return;
        currentUser.lastSeen = Date.now();
        currentUser.lat = userCoords.lat;
        currentUser.lng = userCoords.lng;
        setDoc(doc(db, "users", currentUser.id), currentUser, { merge: true });
    }

    // NAVEGACIÓN
    const sections = {
        home: document.getElementById("homeSection"),
        people: document.getElementById("peopleSection"),
        messages: document.getElementById("messagesSection"),
        profile: document.getElementById("profileSection")
    };

    function navigateTo(sectionName) {
        if (!sections[sectionName]) return;
        Object.values(sections).forEach(s => s.classList.remove("active"));
        sections[sectionName].classList.add("active");
        document.querySelectorAll(".nav-item:not(.nav-add-btn)").forEach(item => {
            item.classList.remove("active");
            if (item.dataset.section === sectionName) item.classList.add("active");
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    document.querySelectorAll(".nav-item:not(.nav-add-btn)").forEach(i => i.addEventListener("click", () => navigateTo(i.dataset.section)));
    document.getElementById("btnProfileHeader").addEventListener("click", () => navigateTo("profile"));

    // AVATAR RENDER
    function renderAvatar(element, photoUrl) {
        if (photoUrl) {
            element.innerHTML = `<img src="${photoUrl}" alt="Avatar">`;
        } else {
            element.innerHTML = `👤`;
        }
    }

    function updateUI() {
        const btnToggleLogin = document.getElementById("btnProfileLoginToggle");
        const loggedInBlock = document.getElementById("userLoggedInActions");

        if (currentUser) {
            renderAvatar(document.getElementById("headerAvatar"), currentUser.photo);
            renderAvatar(document.getElementById("modalPostAvatar"), currentUser.photo);
            renderAvatar(document.getElementById("profileAvatar"), currentUser.photo);

            document.getElementById("profileName").textContent = currentUser.name;
            document.getElementById("profilePronouns").textContent = currentUser.pronouns;
            document.getElementById("profileEmail").textContent = currentUser.email;

            btnToggleLogin.style.display = "none";
            loggedInBlock.style.display = "flex";
        } else {
            renderAvatar(document.getElementById("headerAvatar"), null);
            renderAvatar(document.getElementById("modalPostAvatar"), null);
            renderAvatar(document.getElementById("profileAvatar"), null);

            document.getElementById("profileName").textContent = "Invitado/a";
            document.getElementById("profilePronouns").textContent = "(Sin registro)";
            document.getElementById("profileEmail").textContent = "Explora o inicia sesión para interactuar";

            btnToggleLogin.style.display = "block";
            loggedInBlock.style.display = "none";
        }
    }

    document.getElementById("btnProfileLoginToggle").addEventListener("click", () => authModal.classList.add("active"));

    // CREAR PUBLICACIÓN CON BOTÓN MAS (+)
    document.getElementById("btnOpenCreatePost").addEventListener("click", () => {
        requireAuth(() => {
            createPostModal.classList.add("active");
        });
    });
    document.getElementById("closeCreatePostModal").addEventListener("click", () => createPostModal.classList.remove("active"));

    document.getElementById("btnPublishPost").addEventListener("click", () => {
        const text = document.getElementById("postInput").value.trim();
        if (!text) return;

        addDoc(collection(db, "posts"), {
            userId: currentUser.id,
            userName: currentUser.name,
            userPhoto: currentUser.photo || null,
            userPronouns: currentUser.pronouns,
            text: text,
            createdAt: serverTimestamp()
        });

        document.getElementById("postInput").value = "";
        createPostModal.classList.remove("active");
        showToast("¡Publicación realizada! 🚀");
    });

    // FEED CON BOTÓN DE MENSAJE DIRECTO EN CADA PUBLICACIÓN
    function initFeed() {
        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(25));
        onSnapshot(q, (snapshot) => {
            const feedList = document.getElementById("feedList");
            feedList.innerHTML = "";

            if (snapshot.empty) {
                feedList.innerHTML = '<div class="empty-state">Sé el primero en publicar algo hoy ✨</div>';
                return;
            }

            snapshot.forEach(docSnap => {
                const post = docSnap.data();
                const isMyPost = currentUser && post.userId === currentUser.id;

                const card = document.createElement("div");
                card.className = "feed-card";
                card.innerHTML = `
                    <div class="feed-header">
                        <div class="feed-user-left">
                            <div class="mini-avatar avatar-box">${post.userPhoto ? `<img src="${post.userPhoto}">` : '👤'}</div>
                            <div class="feed-user-info">
                                <strong>${escapeHTML(post.userName)} <small>(${escapeHTML(post.userPronouns || "")})</small></strong>
                                <small>Comunidad Vibra</small>
                            </div>
                        </div>
                    </div>
                    <div class="feed-content">${escapeHTML(post.text)}</div>
                    ${!isMyPost ? `
                    <div class="feed-actions">
                        <button class="btn-msg-user btn-feed-msg">
                            <i class="fa-solid fa-paper-plane"></i> Enviar mensaje
                        </button>
                    </div>` : ''}
                `;

                if (!isMyPost) {
                    const btnMsg = card.querySelector(".btn-feed-msg");
                    btnMsg.addEventListener("click", () => {
                        requireAuth(() => openChatModal(post.userId, post.userName, post.userPhoto, true));
                    });
                }

                feedList.appendChild(card);
            });
        });
    }

    // LISTA DE PERSONAS
    function initPeopleList() {
        const q = query(collection(db, "users"), orderBy("lastSeen", "desc"), limit(30));
        onSnapshot(q, (snapshot) => {
            const list = document.getElementById("peopleList");
            list.innerHTML = "";

            const now = Date.now();

            snapshot.forEach((docSnap) => {
                const p = docSnap.data();
                const pId = docSnap.id;
                
                const isOnline = p.lastSeen && (now - p.lastSeen < 120000);
                const statusDot = isOnline ? `<span class="online-dot"></span>` : `<span class="offline-dot"></span>`;
                const statusText = isOnline ? `<span style="color:var(--green); font-weight:700;">En línea</span>` : `Hace un momento`;

                const myLat = currentUser ? currentUser.lat : userCoords.lat;
                const myLng = currentUser ? currentUser.lng : userCoords.lng;
                const distanceKm = calculateDistance(myLat, myLng, p.lat || myLat, p.lng || myLng);
                
                const isMe = currentUser && pId === currentUser.id;
                const distanceText = isMe ? "Tú" : `A ${distanceKm} km`;

                const card = document.createElement("div");
                card.className = "user-card-item";
                card.innerHTML = `
                    <div class="user-card-left">
                        <div class="avatar-wrapper">
                            <div class="ranking-avatar avatar-box">${p.photo ? `<img src="${p.photo}">` : '👤'}</div>
                            ${statusDot}
                        </div>
                        <div class="user-card-info">
                            <strong>${escapeHTML(p.name || "Usuario")} <small>(${escapeHTML(p.pronouns || "")})</small></strong>
                            <small>${statusText} • ${distanceText}</small>
                        </div>
                    </div>
                    ${!isMe ? `<button class="btn-msg-user"><i class="fa-solid fa-comment"></i> Mensaje</button>` : ''}
                `;

                card.addEventListener("click", () => {
                    if (!isMe) {
                        requireAuth(() => openChatModal(pId, p.name, p.photo, isOnline));
                    }
                });

                list.appendChild(card);
            });
        });
    }

    // BANDEJA DE ENTRADA: RESPONDE HACIENDO CLIC EN CUALQUIER CONVERSACIÓN
    function initInboxList() {
        const inboxList = document.getElementById("inboxList");
        if (!currentUser) {
            inboxList.innerHTML = `
                <div class="empty-state">
                    <p>Debes iniciar sesión para ver tus mensajes privados.</p>
                </div>`;
            return;
        }

        const qChats = query(collection(db, "chats"), limit(50));
        onSnapshot(qChats, (snapshot) => {
            inboxList.innerHTML = "";
            let chatCount = 0;

            snapshot.forEach(docSnap => {
                const chatId = docSnap.id;

                if (chatId.includes(currentUser.id)) {
                    const otherUserId = chatId.replace(currentUser.id, "").replace("_", "");
                    chatCount++;

                    getDoc(doc(db, "users", otherUserId)).then(userSnap => {
                        if (userSnap.exists()) {
                            const otherUser = userSnap.data();
                            const card = document.createElement("div");
                            card.className = "user-card-item";
                            card.innerHTML = `
                                <div class="user-card-left">
                                    <div class="ranking-avatar avatar-box">${otherUser.photo ? `<img src="${otherUser.photo}">` : '👤'}</div>
                                    <div class="user-card-info">
                                        <strong>${escapeHTML(otherUser.name)}</strong>
                                        <small style="color:#ff7597;">Haz clic para conversar y responder</small>
                                    </div>
                                </div>
                                <i class="fa-solid fa-chevron-right" style="color:var(--text-muted); font-size:12px;"></i>
                            `;
                            
                            // ABRIR CHAT DIRECTO AL HACER CLIC
                            card.addEventListener("click", () => {
                                openChatModal(otherUserId, otherUser.name, otherUser.photo, true);
                            });

                            inboxList.appendChild(card);
                        }
                    });
                }
            });

            if (chatCount === 0) {
                inboxList.innerHTML = '<div class="empty-state">Aún no tienes mensajes en tu bandeja de entrada.</div>';
            }
        });
    }

    // CHAT MODAL
    const chatModal = document.getElementById("chatModal");
    const chatMessages = document.getElementById("chatMessages");
    const chatInput = document.getElementById("chatInput");

    function openChatModal(targetId, targetName, targetPhoto, isOnline) {
        activeChatTargetId = targetId;
        document.getElementById("chatTargetName").textContent = targetName;
        renderAvatar(document.getElementById("chatTargetAvatar"), targetPhoto);
        document.getElementById("chatTargetStatus").textContent = isOnline ? "En línea" : "Desconectado";
        
        chatModal.classList.add("active");
        loadChatMessages();
    }

    document.getElementById("closeChatModal").addEventListener("click", () => {
        chatModal.classList.remove("active");
        if (chatUnsubscribe) chatUnsubscribe();
    });

    function loadChatMessages() {
        if (chatUnsubscribe) chatUnsubscribe();
        chatMessages.innerHTML = "";

        const chatId = [currentUser.id, activeChatTargetId].sort().join("_");
        const qChat = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"), limit(50));

        chatUnsubscribe = onSnapshot(qChat, (snapshot) => {
            chatMessages.innerHTML = "";
            snapshot.forEach(docSnap => {
                const msg = docSnap.data();
                const bubble = document.createElement("div");
                bubble.className = `chat-bubble ${msg.senderId === currentUser.id ? "me" : "them"}`;
                bubble.textContent = msg.text;
                chatMessages.appendChild(bubble);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }

    document.getElementById("btnSendMessage").addEventListener("click", sendMessage);
    chatInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || !activeChatTargetId) return;

        const chatId = [currentUser.id, activeChatTargetId].sort().join("_");
        
        await setDoc(doc(db, "chats", chatId), { lastUpdate: serverTimestamp() }, { merge: true });

        addDoc(collection(db, "chats", chatId, "messages"), {
            senderId: currentUser.id,
            text: text,
            createdAt: serverTimestamp()
        });

        chatInput.value = "";
    }

    // EDITAR PERFIL
    const editModal = document.getElementById("editProfileModal");
    document.getElementById("btnOpenEditProfile").addEventListener("click", () => {
        requireAuth(() => {
            document.getElementById("inputEditName").value = currentUser.name;
            document.getElementById("inputEditPronouns").value = currentUser.pronouns;
            editModal.classList.add("active");
        });
    });

    document.getElementById("closeEditProfile").addEventListener("click", () => editModal.classList.remove("active"));

    document.getElementById("btnSaveProfile").addEventListener("click", async () => {
        const editPhotoFile = document.getElementById("editPhotoFile");
        const newPhotoBase64 = await processImageFile(editPhotoFile);

        currentUser.name = document.getElementById("inputEditName").value.trim() || currentUser.name;
        currentUser.pronouns = document.getElementById("inputEditPronouns").value.trim() || currentUser.pronouns;
        if (newPhotoBase64) currentUser.photo = newPhotoBase64;

        localStorage.setItem("vibraUserSession", JSON.stringify(currentUser));
        updatePresence();
        updateUI();
        editModal.classList.remove("active");
        showToast("¡Perfil actualizado con éxito!");
    });

    // CERRAR SESIÓN
    document.getElementById("btnLogout").addEventListener("click", () => {
        localStorage.removeItem("vibraUserSession");
        currentUser = null;
        updateUI();
        initInboxList();
        showToast("Has cerrado sesión");
    });

    // ELIMINAR CUENTA
    const deleteModal = document.getElementById("deleteConfirmModal");
    document.getElementById("btnDeleteAccount").addEventListener("click", () => deleteModal.classList.add("active"));
    document.getElementById("closeDeleteModal").addEventListener("click", () => deleteModal.classList.remove("active"));

    document.getElementById("btnConfirmDeleteAccount").addEventListener("click", async () => {
        if (currentUser) {
            await deleteDoc(doc(db, "users", currentUser.id));
            localStorage.removeItem("vibraUserSession");
            currentUser = null;
            deleteModal.classList.remove("active");
            updateUI();
            initInboxList();
            showToast("Tu cuenta ha sido eliminada.");
        }
    });

    function calculateDistance(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return "1.0";
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const d = R * c;
        return d < 1 ? "Menos de 1" : d.toFixed(1);
    }

    function escapeHTML(str) {
        const div = document.createElement("div");
        div.textContent = str || "";
        return div.innerHTML;
    }

    function showToast(msg) {
        const toast = document.getElementById("toast");
        document.getElementById("toastMessage").textContent = msg;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 2500);
    }
}
