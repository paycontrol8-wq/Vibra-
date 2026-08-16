document.addEventListener("DOMContentLoaded", () => {
    const checkFB = setInterval(() => {
        if (window.db && window.FB) {
            clearInterval(checkFB);
            initApp();
        }
    }, 100);
});

function initApp() {
    const { doc, setDoc, getDoc, deleteDoc, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp, collection, getDocs, where } = window.FB;
    const db = window.db;

    let currentUser = JSON.parse(localStorage.getItem("vibraUserSession") || "null");
    let activeChatTargetId = null;
    let chatUnsubscribe = null;
    let globalMessagesUnsubscribe = null;

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
        initGlobalMessageListener();
    }

    updateUI();
    initFeed();
    initPeopleList();
    initInboxList();

    // Sistema de Alerta con Sonido Nativo
    function playNotificationSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
            oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); // A5
            
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.3);
        } catch (e) {
            // Prevenir bloqueos de autoplay del navegador
        }
    }

    // Escucha en tiempo real de mensajes nuevos para notificar con sonido y badge
    function initGlobalMessageListener() {
        if (!currentUser) return;
        if (globalMessagesUnsubscribe) globalMessagesUnsubscribe();

        const qChats = query(collection(db, "chats"));
        globalMessagesUnsubscribe = onSnapshot(qChats, (snapshot) => {
            snapshot.forEach(docSnap => {
                const chatId = docSnap.id;
                if (chatId.includes(currentUser.id) && chatId !== currentUser.id) {
                    const qMsgs = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "desc"), limit(1));
                    
                    onSnapshot(qMsgs, (msgSnap) => {
                        if (!msgSnap.empty) {
                            const latestMsg = msgSnap.docs[0].data();
                            
                            if (latestMsg.senderId !== currentUser.id) {
                                const msgTime = latestMsg.createdAt?.toMillis ? latestMsg.createdAt.toMillis() : Date.now();
                                
                                if (Date.now() - msgTime < 6000) {
                                    playNotificationSound();
                                    showToast("💬 ¡Nuevo mensaje recibido!");
                                    
                                    const badge = document.getElementById("navMsgBadge");
                                    if (badge) badge.style.display = "block";
                                }
                            }
                        }
                    });
                }
            });
        });
    }

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

    function processImageFile(fileInput) {
        return new Promise((resolve) => {
            const file = fileInput.files[0];
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }

    // PESTAÑAS EN AUTH MODAL
    const tabRegister = document.getElementById("tabRegister");
    const tabLogin = document.getElementById("tabLogin");
    const formRegister = document.getElementById("formRegisterContainer");
    const formLogin = document.getElementById("formLoginContainer");

    tabRegister.addEventListener("click", () => {
        tabRegister.classList.add("active");
        tabLogin.classList.remove("active");
        formRegister.style.display = "block";
        formLogin.style.display = "none";
    });

    tabLogin.addEventListener("click", () => {
        tabLogin.classList.add("active");
        tabRegister.classList.remove("active");
        formLogin.style.display = "block";
        formRegister.style.display = "none";
    });

    const authPhotoInput = document.getElementById("authPhotoFile");
    authPhotoInput.addEventListener("change", async () => {
        const previewImg = await processImageFile(authPhotoInput);
        if (previewImg) {
            renderAvatar(document.getElementById("authAvatarPreview"), previewImg);
        }
    });

    // REGISTRO
    document.getElementById("btnStartSession").addEventListener("click", async () => {
        const name = document.getElementById("authName").value.trim();
        const email = document.getElementById("authEmail").value.trim();
        const password = document.getElementById("authPassword").value.trim();
        const pronouns = document.getElementById("authPronouns").value.trim() || "(Él/Ella/Elle)";

        if (!name || !email || !password) {
            showToast("Completa tu nombre, correo y contraseña");
            return;
        }

        const photoBase64 = await processImageFile(authPhotoInput);
        const id = "usr_" + btoa(email.toLowerCase()).replace(/=/g, "");
        
        currentUser = { id, name, email, password, pronouns, photo: photoBase64 || null, lat: userCoords.lat, lng: userCoords.lng };

        localStorage.setItem("vibraUserSession", JSON.stringify(currentUser));
        authModal.classList.remove("active");
        updatePresence();
        updateUI();
        initInboxList();
        initGlobalMessageListener();
        showToast("¡Cuenta creada y sesión iniciada! ✨");
    });

    // INICIAR SESIÓN
    document.getElementById("btnSubmitLogin").addEventListener("click", async () => {
        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value.trim();

        if (!email || !password) {
            showToast("Ingresa tu correo y contraseña");
            return;
        }

        const id = "usr_" + btoa(email.toLowerCase()).replace(/=/g, "");
        const userDocRef = doc(db, "users", id);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
            const userData = userSnap.data();
            if (userData.password && userData.password !== password) {
                showToast("Contraseña incorrecta");
                return;
            }
            currentUser = { ...userData, id };
            localStorage.setItem("vibraUserSession", JSON.stringify(currentUser));
            authModal.classList.remove("active");
            updatePresence();
            updateUI();
            initInboxList();
            initGlobalMessageListener();
            showToast("¡Bienvenido/a de nuevo! ✨");
        } else {
            showToast("Usuario no encontrado. Regístrate primero.");
        }
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
        
        if (sectionName === "messages") {
            document.getElementById("navMsgBadge").style.display = "none";
        }

        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    document.querySelectorAll(".nav-item:not(.nav-add-btn)").forEach(i => i.addEventListener("click", () => navigateTo(i.dataset.section)));
    document.getElementById("btnProfileHeader").addEventListener("click", () => navigateTo("profile"));

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

    // CREAR PUBLICACIÓN
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

    // FEED (Con validación de existencia del usuario)
    function initFeed() {
        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(25));
        onSnapshot(q, async (snapshot) => {
            const feedList = document.getElementById("feedList");
            feedList.innerHTML = "";

            if (snapshot.empty) {
                feedList.innerHTML = '<div class="empty-state">Sé el primero en publicar algo hoy ✨</div>';
                return;
            }

            for (const docSnap of snapshot.docs) {
                const post = docSnap.data();
                
                // Verificar si el usuario todavía existe en la base de datos
                const userSnap = await getDoc(doc(db, "users", post.userId));
                if (!userSnap.exists()) {
                    // Si el usuario eliminó su cuenta, borramos la publicación huérfana automáticamente
                    await deleteDoc(docSnap.ref);
                    continue; // No renderizamos esta publicación
                }

                const userData = userSnap.data();
                const photoUrl = userData.photo || post.userPhoto;
                const isMyPost = currentUser && post.userId === currentUser.id;

                const card = document.createElement("div");
                card.className = "feed-card";

                card.innerHTML = `
                    <div class="feed-header" style="position: relative;">
                        <div class="feed-user-left">
                            <div class="mini-avatar avatar-box">
                                ${photoUrl ? `<img src="${photoUrl}" alt="${escapeHTML(userData.name)}">` : '👤'}
                            </div>
                            <div class="feed-user-info">
                                <strong>${escapeHTML(userData.name)} <small>(${escapeHTML(userData.pronouns || "")})</small></strong>
                                <small>Comunidad Vibra</small>
                            </div>
                        </div>
                        ${!isMyPost ? `
                        <button class="btn-msg-user btn-feed-msg" title="Enviar mensaje" style="background:none; border:none; color:var(--primary-color); font-size:18px; cursor:pointer; padding:5px; position: absolute; right: 0; top: 0;">
                            <i class="fa-solid fa-paper-plane"></i>
                        </button>` : ''}
                    </div>
                    <div class="feed-content">${escapeHTML(post.text)}</div>
                `;

                if (!isMyPost) {
                    const btnMsg = card.querySelector(".btn-feed-msg");
                    if (btnMsg) {
                        btnMsg.addEventListener("click", () => {
                            requireAuth(() => openChatModal(post.userId, userData.name, photoUrl, true));
                        });
                    }
                }

                feedList.appendChild(card);
            }
        });
    }

    // LISTA DE PERSONAS ORDENADAS POR CERCANÍA
    function initPeopleList() {
        const q = query(collection(db, "users"), limit(50));
        onSnapshot(q, (snapshot) => {
            const list = document.getElementById("peopleList");
            list.innerHTML = "";

            const now = Date.now();
            const myLat = currentUser ? currentUser.lat : userCoords.lat;
            const myLng = currentUser ? currentUser.lng : userCoords.lng;

            let usersList = [];

            snapshot.forEach((docSnap) => {
                const p = docSnap.data();
                const pId = docSnap.id;
                
                if (!p || !p.name || p.name.trim() === "") return;

                const nameLower = p.name.toLowerCase().trim();
                if (
                    nameLower.startsWith("jugador") || 
                    nameLower.startsWith("persona") || 
                    nameLower.includes("invitado") ||
                    !p.email
                ) {
                    return;
                }

                const distanceKmNum = calculateRawDistance(myLat, myLng, p.lat || myLat, p.lng || myLng);
                const isOnline = p.lastSeen && (now - p.lastSeen < 120000);

                usersList.push({
                    id: pId,
                    data: p,
                    distance: distanceKmNum,
                    isOnline: isOnline
                });
            });

            usersList.sort((a, b) => a.distance - b.distance);

            if (usersList.length === 0) {
                list.innerHTML = '<div class="empty-state">No hay usuarios registrados aún.</div>';
                return;
            }

            usersList.forEach(item => {
                const p = item.data;
                const pId = item.id;
                const isMe = currentUser && pId === currentUser.id;

                const card = document.createElement("div");
                card.className = "person-card";
                card.innerHTML = `
                    <div class="person-avatar-wrapper">
                        <div class="person-avatar avatar-box">
                            ${p.photo ? `<img src="${p.photo}" alt="${escapeHTML(p.name)}">` : '👤'}
                        </div>
                        <span class="status-indicator ${item.isOnline ? 'online' : 'offline'}"></span>
                    </div>
                    <div class="person-name">${escapeHTML(p.name)}</div>
                    <div class="person-dist">${isMe ? "Tú" : (item.distance < 1 ? "< 1 km" : item.distance.toFixed(1) + " km")}</div>
                `;

                card.addEventListener("click", () => {
                    if (!isMe) {
                        requireAuth(() => openChatModal(pId, p.name, p.photo, item.isOnline));
                    }
                });

                list.appendChild(card);
            });
        });
    }

    // BANDEJA DE ENTRADA ORDENADA, VISTA PREVIA Y DISTANCIA EN TIEMPO REAL
    function initInboxList() {
        const inboxList = document.getElementById("inboxList");
        if (!currentUser) {
            inboxList.innerHTML = `<div class="empty-state"><p>Debes iniciar sesión para ver tus mensajes privados.</p></div>`;
            return;
        }

        const qChats = query(collection(db, "chats"), limit(50));
        onSnapshot(qChats, (snapshot) => {
            inboxList.innerHTML = "";
            let chatsArray = [];

            snapshot.forEach(docSnap => {
                const chatId = docSnap.id;
                if (chatId.includes(currentUser.id)) {
                    chatsArray.push({ chatId, data: docSnap.data() });
                }
            });

            chatsArray.sort((a, b) => {
                const timeA = a.data.lastUpdate?.toMillis ? a.data.lastUpdate.toMillis() : 0;
                const timeB = b.data.lastUpdate?.toMillis ? b.data.lastUpdate.toMillis() : 0;
                return timeB - timeA;
            });

            if (chatsArray.length === 0) {
                inboxList.innerHTML = '<div class="empty-state">Aún no tienes mensajes en tu bandeja de entrada.</div>';
                return;
            }

            chatsArray.forEach(item => {
                const chatId = item.chatId;
                const otherUserId = chatId.replace(currentUser.id, "").replace("_", "");

                getDoc(doc(db, "users", otherUserId)).then(userSnap => {
                    if (userSnap.exists()) {
                        const otherUser = userSnap.data();

                        const myLat = currentUser.lat || userCoords.lat;
                        const myLng = currentUser.lng || userCoords.lng;
                        const otherLat = otherUser.lat || myLat;
                        const otherLng = otherUser.lng || myLng;
                        
                        const distanceKmNum = calculateRawDistance(myLat, myLng, otherLat, otherLng);
                        const distanceText = distanceKmNum < 1 ? `${Math.round(distanceKmNum * 1000)} metros` : `${distanceKmNum.toFixed(1)} km`;

                        const qMsgs = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "desc"), limit(1));
                        onSnapshot(qMsgs, (msgSnap) => {
                            let lastText = "Haz clic para conversar y responder";
                            let isUnread = false;
                            let textColor = "var(--text-muted)";

                            if (!msgSnap.empty) {
                                const lastMsg = msgSnap.docs[0].data();
                                const snippet = lastMsg.text ? lastMsg.text.substring(0, 25) : "";
                                lastText = lastMsg.senderId === currentUser.id ? `Tú: ${snippet}` : snippet;
                                
                                if (lastMsg.senderId !== currentUser.id) {
                                    isUnread = true;
                                    textColor = "#ffffff";
                                }
                            }

                            let card = document.getElementById(`inbox_card_${chatId}`);
                            if (!card) {
                                card = document.createElement("div");
                                card.className = "user-card-item";
                                card.id = `inbox_card_${chatId}`;
                                card.addEventListener("click", () => {
                                    openChatModal(otherUserId, otherUser.name, otherUser.photo, true);
                                });
                                inboxList.appendChild(card);
                            }

                            card.innerHTML = `
                                <div class="user-card-left">
                                    <div class="ranking-avatar avatar-box">${otherUser.photo ? `<img src="${otherUser.photo}">` : '👤'}</div>
                                    <div class="user-card-info">
                                        <strong>${escapeHTML(otherUser.name)} <small style="color:var(--primary-color); font-weight:normal;">• ${distanceText}</small></strong>
                                        <small style="color: ${textColor}; font-weight: ${isUnread ? '700' : '400'};">${escapeHTML(lastText)}</small>
                                    </div>
                                </div>
                                <i class="fa-solid fa-chevron-right" style="color:var(--text-muted); font-size:12px;"></i>
                            `;
                        });
                    }
                });
            });
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
    const editPhotoFileInput = document.getElementById("editPhotoFile");

    document.getElementById("btnOpenEditProfile").addEventListener("click", () => {
        requireAuth(() => {
            document.getElementById("inputEditName").value = currentUser.name;
            document.getElementById("inputEditPronouns").value = currentUser.pronouns;
            renderAvatar(document.getElementById("editAvatarPreview"), currentUser.photo);
            editModal.classList.add("active");
        });
    });

    editPhotoFileInput.addEventListener("change", async () => {
        const previewImg = await processImageFile(editPhotoFileInput);
        if (previewImg) {
            renderAvatar(document.getElementById("editAvatarPreview"), previewImg);
        }
    });

    document.getElementById("closeEditProfile").addEventListener("click", () => editModal.classList.remove("active"));

    document.getElementById("btnSaveProfile").addEventListener("click", async () => {
        const newPhotoBase64 = await processImageFile(editPhotoFileInput);

        currentUser.name = document.getElementById("inputEditName").value.trim() || currentUser.name;
        currentUser.pronouns = document.getElementById("inputEditPronouns").value.trim() || currentUser.pronouns;
        if (newPhotoBase64) currentUser.photo = newPhotoBase64;

        localStorage.setItem("vibraUserSession", JSON.stringify(currentUser));
        updatePresence();
        updateUI();
        editModal.classList.remove("active");
        showToast("¡Perfil actualizado con éxito! ✨");
    });

    document.getElementById("btnLogout").addEventListener("click", () => {
        localStorage.removeItem("vibraUserSession");
        currentUser = null;
        updateUI();
        initInboxList();
        showToast("Has cerrado sesión");
    });

    const deleteModal = document.getElementById("deleteConfirmModal");
    document.getElementById("btnDeleteAccount").addEventListener("click", () => deleteModal.classList.add("active"));
    document.getElementById("closeDeleteModal").addEventListener("click", () => deleteModal.classList.remove("active"));

    document.getElementById("btnConfirmDeleteAccount").addEventListener("click", async () => {
        if (currentUser) {
            const userId = currentUser.id;

            // 1. Eliminar el documento de usuario en la base de datos
            await deleteDoc(doc(db, "users", userId));

            // 2. Buscar y eliminar todas las publicaciones hechas por este usuario
            const postsQuery = query(collection(db, "posts"), where("userId", "==", userId));
            const postsSnapshot = await getDocs(postsQuery);
            const deletePostPromises = postsSnapshot.docs.map(postDoc => deleteDoc(postDoc.ref));
            await Promise.all(deletePostPromises);

            // 3. Limpiar sesión local y actualizar interfaz
            localStorage.removeItem("vibraUserSession");
            currentUser = null;
            deleteModal.classList.remove("active");
            updateUI();
            initInboxList();
            showToast("Tu cuenta, perfil y publicaciones han sido eliminados.");
        }
    });

    function calculateRawDistance(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
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
