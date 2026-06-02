import { firebaseConfig } from "./firebase-config.js";

const OWNER_EMAIL = "davicostadua480@gmail.com";
const BOOT_ADMIN_EMAIL = "admin@forgecms.local";
const BOOT_ADMIN_PASSWORD = "admin123";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const state = {
  firebaseReady: false,
  app: null,
  auth: null,
  db: null,
  user: null,
  profile: null,
  stores: [],
  products: [],
  orders: [],
  users: [],
  options: {},
  modules: null
};

function toast(message, type = "") {
  const area = $("#toastArea");
  if (!area) return alert(message);
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = message;
  area.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

function showLogin() {
  $("#boot")?.setAttribute("hidden", "");
  $("#loginScreen")?.classList.remove("hidden");
  $("#adminShell")?.classList.add("hidden");
}

function showShell() {
  $("#boot")?.setAttribute("hidden", "");
  $("#loginScreen")?.classList.add("hidden");
  $("#adminShell")?.classList.remove("hidden");
}

function setBusy(isBusy, text = "Entrar") {
  const btn = $("#loginSubmit");
  if (!btn) return;
  btn.disabled = isBusy;
  btn.textContent = isBusy ? text : "Entrar";
}

function loginIdentifierToEmail(value) {
  const raw = String(value || "").trim();
  return raw.toLowerCase() === "admin" ? BOOT_ADMIN_EMAIL : raw;
}

async function loadFirebase() {
  if (state.firebaseReady) return state.modules;

  setBusy(true, "Carregando Firebase...");

  const [
    appMod,
    authMod,
    firestoreMod
  ] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
  ]);

  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = firestoreMod.getFirestore(app);

  state.app = app;
  state.auth = auth;
  state.db = db;
  state.modules = { appMod, authMod, firestoreMod };
  state.firebaseReady = true;

  setBusy(false);
  return state.modules;
}

function role() {
  return state.profile?.role || "pending";
}

function isAdmin() {
  return state.user?.email === OWNER_EMAIL ||
    state.user?.email === BOOT_ADMIN_EMAIL ||
    ["super_admin", "administrator"].includes(role());
}

async function ensureProfile(user, requestedRole = "merchant") {
  const { doc, getDoc, setDoc, serverTimestamp } = state.modules.firestoreMod;
  const ref = doc(state.db, "users", user.uid);
  const owner = user.email === OWNER_EMAIL || user.email === BOOT_ADMIN_EMAIL;

  const base = {
    uid: user.uid,
    email: user.email,
    name: user.displayName || user.email?.split("@")[0] || "Usuário",
    role: owner ? "super_admin" : requestedRole === "customer" ? "customer" : "pending",
    requestedRole: owner ? "super_admin" : requestedRole,
    status: owner || requestedRole === "customer" ? "approved" : "pending"
  };

  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = { ...base, ...snap.data() };
    if (owner && data.role !== "super_admin") {
      await setDoc(ref, {
        role: "super_admin",
        requestedRole: "super_admin",
        status: "approved",
        updatedAt: serverTimestamp()
      }, { merge: true });
      return { ...data, role: "super_admin", status: "approved" };
    }
    return data;
  }

  await setDoc(ref, {
    ...base,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return base;
}

async function seedCore() {
  const { doc, setDoc, serverTimestamp } = state.modules.firestoreMod;

  await setDoc(doc(state.db, "cms_options", "general"), {
    siteTitle: "MenuForge",
    tagline: "Cardápio digital com ForgeCMS",
    updatedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(state.db, "cms_plugins", "menuforge"), {
    key: "menuforge",
    name: "MenuForge Delivery",
    active: true,
    locked: true,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function renderNav() {
  const nav = $("#adminNav");
  if (!nav) return;

  const items = [
    ["#/dashboard", "Dashboard"],
    ["#/content", "Conteúdo"],
    ["#/media", "Mídia"],
    ["#/appearance", "Aparência"],
    ["#/plugins", "Módulos"],
    ["#/users", "Usuários"],
    ["#/approvals", "Aprovações"],
    ["#/settings", "Configurações"],
    ["#/menuforge", "MenuForge"]
  ];

  nav.innerHTML = `
    <div class="nav-section">ForgeCMS</div>
    ${items.map(([hash, label]) => `
      <button class="nav-btn ${location.hash === hash ? "active" : ""}" data-go="${hash}" type="button">
        <span>${label}</span>
      </button>
    `).join("")}
  `;

  $$("[data-go]").forEach(btn => {
    btn.onclick = () => {
      location.hash = btn.dataset.go;
      closeSidebar();
      route();
    };
  });

  $("#roleLabel").textContent = role();
  $("#siteChipTitle").textContent = "MenuForge";
}

function setTitle(title, crumb = "ForgeCMS") {
  $("#routeTitle").textContent = title;
  $("#routeCrumb").textContent = crumb;
}

function renderDashboard() {
  setTitle("Dashboard", "ForgeCMS");
  $("#adminView").innerHTML = `
    <div class="workspace-grid grid-4">
      <article class="metric-card"><span>Usuário</span><strong>${isAdmin() ? "Admin" : "OK"}</strong></article>
      <article class="metric-card"><span>Auth</span><strong>ON</strong></article>
      <article class="metric-card"><span>DB</span><strong>ON</strong></article>
      <article class="metric-card"><span>CMS</span><strong>v5</strong></article>
    </div>

    <div class="workspace-grid grid-2" style="margin-top:16px">
      <article class="panel">
        <div class="panel-head"><h2>Bem-vindo ao ForgeCMS</h2><span class="badge ok">online</span></div>
        <p class="muted">O painel agora carrega primeiro a interface e só depois conecta ao Firebase. Isso evita o travamento infinito.</p>
        <div class="split-actions">
          <button class="btn primary" data-go="#/settings">Configurar</button>
          <button class="btn soft" data-go="#/menuforge">Abrir MenuForge</button>
        </div>
      </article>

      <article class="panel">
        <div class="panel-head"><h2>Status da conta</h2></div>
        <div class="activity-list">
          <div>E-mail: ${state.user?.email || "-"}</div>
          <div>Role: ${role()}</div>
          <div>Status: ${state.profile?.status || "-"}</div>
        </div>
      </article>
    </div>
  `;

  $$("[data-go]").forEach(btn => btn.onclick = () => {
    location.hash = btn.dataset.go;
    route();
  });
}

function renderSimple(title, body) {
  setTitle(title);
  $("#adminView").innerHTML = `<article class="panel">${body}</article>`;
}

function renderSettings() {
  setTitle("Configurações", "Geral e Segurança");
  $("#adminView").innerHTML = `
    <div class="workspace-grid grid-2">
      <article class="settings-card">
        <h2>Geral</h2>
        <p>Configurações principais do ForgeCMS.</p>
        <label>Título do site <input id="siteTitle" value="MenuForge"></label>
        <label>Descrição <input id="tagline" value="Cardápio digital com ForgeCMS"></label>
        <button id="saveGeneral" class="btn primary">Salvar geral</button>
      </article>

      <article class="settings-card">
        <h2>Segurança</h2>
        <p>Troque as credenciais iniciais. O Firebase pode exigir login recente.</p>
        <label>Novo e-mail <input id="newAdminEmail" type="email" placeholder="novo@email.com"></label>
        <label>Nova senha <input id="newAdminPassword" type="password" minlength="6"></label>
        <button id="changeCredentials" class="btn primary">Atualizar credenciais</button>
      </article>
    </div>
  `;

  $("#saveGeneral").onclick = async () => {
    const { doc, setDoc, serverTimestamp } = state.modules.firestoreMod;
    await setDoc(doc(state.db, "cms_options", "general"), {
      siteTitle: $("#siteTitle").value,
      tagline: $("#tagline").value,
      updatedAt: serverTimestamp()
    }, { merge: true });
    toast("Configurações salvas.", "ok");
  };

  $("#changeCredentials").onclick = async () => {
    const { updateEmail, updatePassword } = state.modules.authMod;
    const { doc, setDoc, serverTimestamp } = state.modules.firestoreMod;

    const email = $("#newAdminEmail").value.trim();
    const pass = $("#newAdminPassword").value.trim();

    if (!email && !pass) return toast("Informe novo e-mail ou nova senha.", "err");

    if (email) await updateEmail(state.auth.currentUser, email);
    if (pass) await updatePassword(state.auth.currentUser, pass);

    await setDoc(doc(state.db, "users", state.user.uid), {
      email: state.auth.currentUser.email,
      bootstrapAdmin: false,
      updatedAt: serverTimestamp()
    }, { merge: true });

    toast("Credenciais atualizadas. No próximo login use o novo e-mail.", "ok");
  };
}

function renderMenuForge() {
  setTitle("MenuForge", "Módulo Delivery");
  $("#adminView").innerHTML = `
    <div class="workspace-grid grid-3">
      <article class="plugin-card">
        <h2>Lojas</h2>
        <p>Cadastro de estabelecimentos e identidade pública.</p>
        <button class="btn primary" id="createStore">Criar loja inicial</button>
      </article>

      <article class="plugin-card">
        <h2>Produtos</h2>
        <p>Cardápio, categorias, preços e status.</p>
        <button class="btn soft" disabled>Em expansão</button>
      </article>

      <article class="plugin-card">
        <h2>Pedidos</h2>
        <p>Esteira de status, entrega e GPS.</p>
        <button class="btn soft" disabled>Em expansão</button>
      </article>
    </div>
  `;

  $("#createStore").onclick = async () => {
    const { collection, addDoc, serverTimestamp } = state.modules.firestoreMod;
    await addDoc(collection(state.db, "stores"), {
      name: "Minha Loja MenuForge",
      slug: "minha-loja",
      ownerId: state.user.uid,
      status: "open",
      deliveryFee: 7,
      minOrder: 20,
      headline: "Cardápio digital da minha loja.",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    toast("Loja inicial criada.", "ok");
  };
}

function route() {
  renderNav();

  const hash = location.hash || "#/dashboard";

  if (hash === "#/settings") return renderSettings();
  if (hash === "#/menuforge") return renderMenuForge();
  if (hash === "#/content") return renderSimple("Conteúdo", "<h2>Conteúdo</h2><p class='muted'>Área base para posts, páginas, banners e tipos customizados.</p>");
  if (hash === "#/media") return renderSimple("Mídia", "<h2>Mídia</h2><p class='muted'>Biblioteca de mídia do ForgeCMS.</p>");
  if (hash === "#/appearance") return renderSimple("Aparência", "<h2>Aparência</h2><p class='muted'>Temas, menus, widgets e paletas.</p>");
  if (hash === "#/plugins") return renderSimple("Módulos", "<h2>Módulos</h2><p class='muted'>MenuForge Delivery, aprovações, backup, SEO e Theme Studio.</p>");
  if (hash === "#/users") return renderSimple("Usuários", "<h2>Usuários</h2><p class='muted'>Roles e permissões serão administrados aqui.</p>");
  if (hash === "#/approvals") return renderSimple("Aprovações", "<h2>Aprovações</h2><p class='muted'>Contas pendentes de estabelecimentos e entregadores.</p>");

  return renderDashboard();
}

function openSidebar() {
  $("#sidebar")?.classList.add("open");
  $("#sidebarBackdrop")?.classList.remove("hidden");
}

function closeSidebar() {
  $("#sidebar")?.classList.remove("open");
  $("#sidebarBackdrop")?.classList.add("hidden");
}

async function enter(user, requestedRole = "merchant") {
  state.user = user;
  state.profile = await ensureProfile(user, requestedRole);
  await seedCore();

  showShell();
  if (!location.hash || location.hash === "#") location.hash = "#/dashboard";
  route();
}

async function login(event) {
  event.preventDefault();

  const fd = new FormData(event.currentTarget);
  const identifier = String(fd.get("identifier") || "").trim();
  const password = String(fd.get("password") || "");
  const email = loginIdentifierToEmail(identifier);

  try {
    setBusy(true, "Entrando...");
    await loadFirebase();

    const {
      createUserWithEmailAndPassword,
      signInWithEmailAndPassword,
      updateProfile
    } = state.modules.authMod;

    const { doc, setDoc, serverTimestamp } = state.modules.firestoreMod;

    let cred;

    if (identifier.toLowerCase() === "admin" && password === BOOT_ADMIN_PASSWORD) {
      try {
        cred = await createUserWithEmailAndPassword(state.auth, BOOT_ADMIN_EMAIL, BOOT_ADMIN_PASSWORD);
        await updateProfile(cred.user, { displayName: "Administrador" });
      } catch (err) {
        if (err.code === "auth/email-already-in-use") {
          cred = await signInWithEmailAndPassword(state.auth, BOOT_ADMIN_EMAIL, BOOT_ADMIN_PASSWORD);
        } else {
          throw err;
        }
      }

      await setDoc(doc(state.db, "users", cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email,
        name: "Administrador",
        role: "super_admin",
        requestedRole: "super_admin",
        status: "approved",
        bootstrapAdmin: true,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } else {
      cred = await signInWithEmailAndPassword(state.auth, email, password);
    }

    await enter(cred.user, "merchant");
    toast("Login realizado.", "ok");
  } catch (err) {
    console.error(err);
    toast("Login falhou: " + (err.message || err), "err");
  } finally {
    setBusy(false);
  }
}

async function requestAccess(event) {
  event.preventDefault();

  const fd = new FormData(event.currentTarget);

  try {
    setBusy(true, "Criando...");
    await loadFirebase();

    const { createUserWithEmailAndPassword, updateProfile } = state.modules.authMod;
    const { doc, setDoc, serverTimestamp } = state.modules.firestoreMod;

    const cred = await createUserWithEmailAndPassword(state.auth, fd.get("email"), fd.get("password"));
    await updateProfile(cred.user, { displayName: fd.get("name") });

    const requestedRole = fd.get("requestedRole");

    await setDoc(doc(state.db, "users", cred.user.uid), {
      uid: cred.user.uid,
      email: cred.user.email,
      name: fd.get("name"),
      requestedRole,
      role: requestedRole === "customer" ? "customer" : "pending",
      status: requestedRole === "customer" ? "approved" : "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    await enter(cred.user, requestedRole);
  } catch (err) {
    console.error(err);
    toast("Cadastro falhou: " + (err.message || err), "err");
  } finally {
    setBusy(false);
  }
}

async function googleAuth() {
  try {
    setBusy(true, "Google...");
    await loadFirebase();

    const { GoogleAuthProvider, signInWithPopup } = state.modules.authMod;
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(state.auth, provider);

    await enter(cred.user, "merchant");
  } catch (err) {
    if (err.code === "auth/unauthorized-domain") {
      toast("Google bloqueado: adicione davicostadua480-oss.github.io em Firebase Auth → Settings → Authorized domains.", "err");
    } else {
      toast("Google falhou: " + (err.message || err), "err");
    }
  } finally {
    setBusy(false);
  }
}

function bind() {
  window.FORGECMS_READY = true;
  if (window.FORGECMS_BOOT_TIMER) clearTimeout(window.FORGECMS_BOOT_TIMER);

  showLogin();
  setBusy(false);

  $("#loginForm").addEventListener("submit", login);
  $("#requestForm").addEventListener("submit", requestAccess);
  $("#googleLogin").addEventListener("click", googleAuth);

  $$("[data-auth-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      $$("[data-auth-tab]").forEach(b => b.classList.toggle("active", b === btn));
      $("#loginForm").classList.toggle("hidden", btn.dataset.authTab !== "login");
      $("#requestForm").classList.toggle("hidden", btn.dataset.authTab !== "request");
    });
  });

  $("#openSidebar")?.addEventListener("click", openSidebar);
  $("#closeSidebar")?.addEventListener("click", closeSidebar);
  $("#sidebarBackdrop")?.addEventListener("click", closeSidebar);
  $("#logoutBtn")?.addEventListener("click", async () => {
    if (state.auth) await state.modules.authMod.signOut(state.auth);
    location.reload();
  });
  $("#screenOptionsBtn")?.addEventListener("click", route);
  $("#newContentTop")?.addEventListener("click", () => {
    location.hash = "#/content";
    route();
  });

  window.addEventListener("hashchange", route);
}

bind();
