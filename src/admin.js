import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  updateEmail,
  updatePassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const OWNER_EMAIL = "davicostadua480@gmail.com";
const BOOT_ADMIN_EMAIL = "admin@forgecms.local";
const BOOT_ADMIN_PASSWORD = "admin123";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const contentTypes = [
  { key:"post", label:"Posts", singular:"Post", icon:"📝" },
  { key:"page", label:"Páginas", singular:"Página", icon:"📄" },
  { key:"banner", label:"Banners", singular:"Banner", icon:"🎯" },
  { key:"coupon", label:"Cupons", singular:"Cupom", icon:"🏷️" },
  { key:"custom", label:"Custom", singular:"Custom", icon:"🧱" }
];

const roles = {
  super_admin: ["read","manage_everything","manage_users","manage_settings","manage_plugins","manage_themes","publish_content","manage_menuforge"],
  administrator: ["read","manage_users","manage_settings","manage_plugins","manage_themes","publish_content","manage_menuforge"],
  editor: ["read","publish_content","edit_content","manage_media","moderate_comments"],
  author: ["read","create_content","edit_own_content"],
  contributor: ["read","create_content"],
  subscriber: ["read"],
  merchant: ["read","manage_menuforge"],
  courier: ["read","manage_deliveries"],
  customer: ["read"],
  pending: ["read"]
};

const pluginDefinitions = [
  { key:"menuforge", name:"MenuForge Delivery", description:"Lojas, produtos, pedidos, entregadores, WhatsApp e rotas.", version:"1.0.0", locked:true },
  { key:"seo", name:"SEO Básico", description:"Campos de título, descrição e slug amigável para conteúdo.", version:"0.2.0" },
  { key:"backup", name:"Backup JSON", description:"Exportação manual de conteúdo, mídia, usuários e pedidos.", version:"0.4.0" },
  { key:"themeStudio", name:"Theme Studio", description:"Paletas, densidade visual, menus e widgets.", version:"0.3.0" },
  { key:"approvals", name:"Aprovação de contas", description:"Fluxo de aprovação para estabelecimentos e entregadores.", version:"0.5.0", locked:true }
];

const state = {
  user: null,
  profile: null,
  users: [],
  content: [],
  media: [],
  taxonomies: [],
  comments: [],
  options: {},
  plugins: [],
  themes: [],
  stores: [],
  categories: [],
  products: [],
  orders: [],
  activeStore: null,
  activeStoreId: null,
  route: "#/dashboard",
  unsub: []
};

function money(v){ return BRL.format(Number(v || 0)); }
function normalize(v=""){ return String(v).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,""); }
function slugify(v=""){ return normalize(v).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "item"; }
function esc(v=""){ return String(v).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c])); }
function stamp(v){ return v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds*1000 : Date.parse(v) || 0; }
function toNumber(v){ const n = Number(String(v || "").replace(/\./g,"").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function toast(msg,type=""){ const el=document.createElement("div"); el.className="toast "+type; el.textContent=msg; $("#toastArea").append(el); setTimeout(()=>el.remove(),5200); }
function role(){ return state.profile?.role || "pending"; }
function isOwner(){ return state.user?.email === OWNER_EMAIL || state.user?.email === BOOT_ADMIN_EMAIL; }
function isAdmin(){ return isOwner() || ["super_admin","administrator"].includes(role()); }
function can(cap){ return isOwner() || (roles[role()] || []).includes(cap) || (roles[role()] || []).includes("manage_everything"); }
function approved(){ return state.profile?.status === "approved" || isOwner() || role() === "customer"; }
function loginIdentifierToEmail(value){ const raw=String(value||"").trim(); return raw.toLowerCase()==="admin" ? BOOT_ADMIN_EMAIL : raw; }
function currentStoreId(){ return state.activeStoreId || state.profile?.currentStoreId || state.stores.find(s=>s.ownerId===state.user?.uid)?.id || state.stores[0]?.id || null; }
function address(order){ const a=order.address||{}; return [a.street,a.number,a.district,a.complement,a.reference].filter(Boolean).join(", "); }
function mapsUrl(order){ return "https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(address(order)); }
function wazeUrl(order){ return "https://waze.com/ul?q="+encodeURIComponent(address(order))+"&navigate=yes"; }

function option(key, fallback={}){
  return state.options[key] || fallback;
}
async function saveOption(key, data){
  await setDoc(doc(db,"cms_options",key), { ...data, key, updatedAt:serverTimestamp() }, { merge:true });
}
function applyTheme(){
  const ui = option("appearance", JSON.parse(localStorage.getItem("forgecms-ui") || "{}"));
  document.body.classList.toggle("light", ui.mode === "light");
  document.body.classList.toggle("compact", ui.density === "compact");
  ["warm","forest","royal"].forEach(c=>document.body.classList.remove(c));
  if(ui.palette && ui.palette !== "default") document.body.classList.add(ui.palette);
}

function showLogin(){
  $("#boot").hidden = true;
  const loginSubmit = $("#loginSubmit");
  if (loginSubmit) {
    loginSubmit.disabled = false;
    loginSubmit.textContent = "Entrar";
  }
  $("#loginScreen").classList.remove("hidden");
  $("#adminShell").classList.add("hidden");
}
function showShell(){
  $("#boot").hidden = true;
  const loginSubmit = $("#loginSubmit");
  if (loginSubmit) {
    loginSubmit.disabled = false;
    loginSubmit.textContent = "Entrar";
  }
  $("#loginScreen").classList.add("hidden");
  $("#adminShell").classList.remove("hidden");
}

function openSidebar(){ $("#sidebar").classList.add("open"); $("#sidebarBackdrop").classList.remove("hidden"); }
function closeSidebar(){ $("#sidebar").classList.remove("open"); $("#sidebarBackdrop").classList.add("hidden"); }

function setTitle(title, crumb="ForgeCMS"){
  $("#routeTitle").textContent = title;
  $("#routeCrumb").textContent = crumb;
}
function navigate(hash){ location.hash = hash; }
function route(){
  if(!state.user){ showLogin(); return; }
  showShell();
  state.route = location.hash || "#/dashboard";
  renderNav();
  renderScreenOptions();
  const r = state.route;

  if(r === "#/dashboard") return renderDashboard();
  if(r.startsWith("#/content/")) return renderContent(r.split("/")[2] || "all");
  if(r === "#/media") return renderMedia();
  if(r === "#/comments") return renderComments();
  if(r === "#/appearance") return renderAppearance();
  if(r === "#/plugins") return renderPlugins();
  if(r === "#/users") return renderUsers();
  if(r === "#/approvals") return renderApprovals();
  if(r === "#/tools") return renderTools();
  if(r === "#/settings") return renderSettings();
  if(r === "#/menuforge/stores") return renderMFStores();
  if(r === "#/menuforge/products") return renderMFProducts();
  if(r === "#/menuforge/orders") return renderMFOrders();
  if(r === "#/menuforge/couriers") return renderMFCouriers();
  return renderDashboard();
}

const navGroups = [
  ["Painel", [["#/dashboard","Dashboard"]]],
  ["Conteúdo", [["#/content/all","Todos"],["#/content/post","Posts"],["#/content/page","Páginas"],["#/media","Mídia"],["#/comments","Comentários"]]],
  ["Sistema", [["#/appearance","Aparência"],["#/plugins","Módulos"],["#/users","Usuários"],["#/approvals","Aprovações"],["#/tools","Ferramentas"],["#/settings","Configurações"]]],
  ["MenuForge", [["#/menuforge/stores","Lojas"],["#/menuforge/products","Produtos"],["#/menuforge/orders","Pedidos"],["#/menuforge/couriers","Entregadores"]]]
];

function navAllowed(hash){
  if(isAdmin()) return true;
  if(hash.includes("approvals") || hash.includes("users") || hash.includes("plugins")) return false;
  if(hash.includes("menuforge")) return can("manage_menuforge") || can("manage_deliveries");
  if(hash.includes("appearance") || hash.includes("settings") || hash.includes("tools")) return can("manage_settings");
  return true;
}
function renderNav(){
  $("#roleLabel").textContent = role();
  $("#siteChipTitle").textContent = option("general", { siteTitle:"MenuForge" }).siteTitle || "MenuForge";
  $("#adminNav").innerHTML = navGroups.map(([group, items]) => {
    const visible = items.filter(([hash])=>navAllowed(hash));
    if(!visible.length) return "";
    return `<div class="nav-section">${group}</div>` + visible.map(([hash,label])=>`<button class="nav-btn ${state.route===hash || (hash.includes("/content/") && state.route===hash) ? "active" : ""}" data-go="${hash}" type="button"><span>${label}</span></button>`).join("");
  }).join("");
  $$("[data-go]").forEach(btn => btn.onclick = () => { closeSidebar(); navigate(btn.dataset.go); });
}
function renderScreenOptions(){
  const isDash = (location.hash || "#/dashboard") === "#/dashboard";
  $("#screenOptionsBtn").style.display = isDash ? "" : "none";
  if(!isDash) $("#screenOptionsPanel").classList.add("hidden");
  const prefs = JSON.parse(localStorage.getItem("forgecms-screen") || '{"atGlance":true,"activity":true,"quickDraft":true,"welcome":true,"health":true}');
  $("#screenOptionsPanel").innerHTML = Object.entries({
    atGlance:"Resumo",
    activity:"Atividade",
    quickDraft:"Rascunho rápido",
    welcome:"Boas-vindas",
    health:"Saúde do sistema"
  }).map(([key,label])=>`<label><input type="checkbox" data-screen="${key}" ${prefs[key] ? "checked" : ""}> ${label}</label>`).join("");
  $$("[data-screen]").forEach(input => input.onchange = () => {
    prefs[input.dataset.screen] = input.checked;
    localStorage.setItem("forgecms-screen", JSON.stringify(prefs));
    renderDashboard();
  });
}

function dashboardPrefs(){
  return JSON.parse(localStorage.getItem("forgecms-screen") || '{"atGlance":true,"activity":true,"quickDraft":true,"welcome":true,"health":true}');
}
function renderDashboard(){
  setTitle("Dashboard", "ForgeCMS");
  const prefs = dashboardPrefs();
  const posts = state.content.filter(c=>c.type==="post");
  const pages = state.content.filter(c=>c.type==="page");
  const pending = state.users.filter(u=>u.status==="pending" || u.role==="pending");
  const openOrders = state.orders.filter(o=>!["delivered","cancelled"].includes(o.status));
  let html = `<div class="workspace-grid grid-4">
    <article class="metric-card"><span>Posts</span><strong>${posts.length}</strong></article>
    <article class="metric-card"><span>Páginas</span><strong>${pages.length}</strong></article>
    <article class="metric-card"><span>Pedidos abertos</span><strong>${openOrders.length}</strong></article>
    <article class="metric-card"><span>Aprovações</span><strong>${pending.length}</strong></article>
  </div><div class="workspace-grid grid-2" style="margin-top:16px">`;

  if(prefs.atGlance) html += `<article class="panel"><div class="panel-head"><h2>At a Glance</h2><span class="badge">ForgeCMS</span></div><div class="activity-list"><div>${state.content.length} conteúdos</div><div>${state.media.length} arquivos de mídia</div><div>${state.users.length} usuários</div><div>${state.products.length} produtos MenuForge</div></div></article>`;
  if(prefs.activity) html += `<article class="panel"><div class="panel-head"><h2>Atividade</h2><span class="badge ok">ao vivo</span></div><div class="activity-list">${[...state.content.slice(0,4).map(c=>`<div>${esc(c.title || "Sem título")} · ${esc(c.type || "content")}</div>`), ...state.orders.slice(0,3).map(o=>`<div>Pedido #${esc(o.shortId || o.id?.slice(0,6))} · ${esc(o.status || "new")}</div>`)].join("") || "<div>Nenhuma atividade ainda.</div>"}</div></article>`;
  if(prefs.quickDraft) html += `<article class="panel"><div class="panel-head"><h2>Quick Draft</h2></div><form id="quickDraftForm" class="quick-draft"><input name="title" placeholder="Título do rascunho"><textarea name="content" rows="4" placeholder="Ideia rápida..."></textarea><button class="btn primary" type="submit">Salvar rascunho</button></form></article>`;
  if(prefs.welcome) html += `<article class="panel"><div class="panel-head"><h2>Bem-vindo</h2></div><p class="muted">Use o ForgeCMS para administrar conteúdo, mídia, usuários, módulos e o MenuForge Delivery.</p><div class="split-actions"><button class="btn primary" data-go="#/content/page">Criar página</button><button class="btn soft" data-go="#/menuforge/products">Cadastrar produto</button><button class="btn ghost" data-go="#/settings">Configurar</button></div></article>`;
  if(prefs.health) html += `<article class="panel"><div class="panel-head"><h2>Saúde do sistema</h2></div><div class="activity-list"><div>Auth: ${state.user ? "conectado" : "offline"}</div><div>Firestore: ${state.profile ? "perfil carregado" : "perfil pendente"}</div><div>Admin: ${isAdmin() ? "sim" : "não"}</div></div></article>`;

  html += `</div>`;
  $("#adminView").innerHTML = html;
  const quick = $("#quickDraftForm");
  if(quick) quick.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await saveContent({ type:"post", status:"draft", title:fd.get("title"), content:fd.get("content"), excerpt:"", slug:slugify(fd.get("title")), featuredImage:"" });
    e.currentTarget.reset();
    toast("Rascunho salvo.", "ok");
  };
  $$("[data-go]").forEach(btn => btn.onclick = () => navigate(btn.dataset.go));
}

function filteredContent(type){
  return state.content.filter(c => type === "all" ? c.status !== "trash" : c.type === type && c.status !== "trash").sort((a,b)=>stamp(b.updatedAt)-stamp(a.updatedAt));
}
function renderContent(type="all"){
  const typeLabel = type === "all" ? "Conteúdo" : (contentTypes.find(t=>t.key===type)?.label || type);
  setTitle(typeLabel, "Conteúdo");
  const docs = filteredContent(type);
  $("#adminView").innerHTML = `<div class="panel">
    <div class="panel-head"><h2>${typeLabel}</h2><button class="btn primary" id="newContentBtn">+ Novo</button></div>
    <div class="stack">${docs.map(c=>`<article class="content-row"><div class="content-meta"><span class="badge">${esc(c.type)}</span><span class="badge ${c.status === "published" ? "ok" : "warn"}">${esc(c.status || "draft")}</span><span class="badge">${esc(c.slug || "")}</span></div><h3>${esc(c.title || "Sem título")}</h3><p class="muted">${esc(c.excerpt || c.content || "").slice(0,180)}</p><div class="row-actions"><button class="btn soft" data-edit-content="${c.id}">Editar</button><button class="btn danger" data-trash-content="${c.id}">Lixeira</button></div></article>`).join("") || "<div class='empty'>Nenhum conteúdo ainda.</div>"}</div>
  </div>`;
  $("#newContentBtn").onclick = () => openContentDialog(null, type === "all" ? "post" : type);
  $$("[data-edit-content]").forEach(btn => btn.onclick = () => openContentDialog(btn.dataset.editContent));
  $$("[data-trash-content]").forEach(btn => btn.onclick = async () => { await updateDoc(doc(db,"cms_content",btn.dataset.trashContent), { status:"trash", updatedAt:serverTimestamp() }); toast("Movido para lixeira.", "ok"); });
}
function openContentDialog(id=null, forcedType="post"){
  const form = $("#contentForm");
  form.reset();
  form.elements.id.value = "";
  form.elements.type.value = forcedType;
  if(id){
    const item = state.content.find(c=>c.id===id);
    if(item) Object.entries(item).forEach(([k,v]) => { if(form.elements[k]) form.elements[k].value = String(v ?? ""); });
    form.elements.id.value = id;
  }
  $("#contentDialog").showModal();
}
async function saveContent(payload, id=null){
  const data = {
    type: payload.type || "post",
    title: payload.title || "Sem título",
    slug: payload.slug || slugify(payload.title),
    status: payload.status || "draft",
    excerpt: payload.excerpt || "",
    content: payload.content || "",
    featuredImage: payload.featuredImage || "",
    authorId: state.user.uid,
    updatedAt: serverTimestamp()
  };
  if(id) await updateDoc(doc(db,"cms_content",id), data);
  else await addDoc(collection(db,"cms_content"), { ...data, createdAt:serverTimestamp() });
}
async function onContentSubmit(e){
  if(e.submitter?.value === "cancel") return;
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const id = fd.get("id");
  await saveContent({
    type: fd.get("type"),
    status: fd.get("status"),
    title: fd.get("title"),
    slug: fd.get("slug"),
    featuredImage: fd.get("featuredImage"),
    excerpt: fd.get("excerpt"),
    content: fd.get("content")
  }, id || null);
  $("#contentDialog").close();
  toast("Conteúdo salvo.", "ok");
}

function renderMedia(){
  setTitle("Mídia", "Biblioteca");
  $("#adminView").innerHTML = `<div class="panel"><div class="panel-head"><h2>Biblioteca de mídia</h2><button id="newMedia" class="btn primary">+ Mídia</button></div><div class="media-grid">${state.media.map(m=>`<article class="media-card"><div class="media-thumb">${m.url && m.type === "image" ? `<img src="${esc(m.url)}" alt="">` : "📎"}</div><h3>${esc(m.title || "Mídia")}</h3><p class="muted">${esc(m.url || "")}</p><button class="btn soft" data-edit-media="${m.id}">Editar</button></article>`).join("") || "<div class='empty'>Sem mídia.</div>"}</div></div>`;
  $("#newMedia").onclick = () => openMediaDialog();
  $$("[data-edit-media]").forEach(btn => btn.onclick = () => openMediaDialog(btn.dataset.editMedia));
}
function openMediaDialog(id=null){
  const form = $("#mediaForm");
  form.reset();
  form.elements.id.value = "";
  if(id){
    const m = state.media.find(x=>x.id===id);
    if(m) Object.entries(m).forEach(([k,v]) => { if(form.elements[k]) form.elements[k].value = String(v ?? ""); });
    form.elements.id.value = id;
  }
  $("#mediaDialog").showModal();
}
async function onMediaSubmit(e){
  if(e.submitter?.value === "cancel") return;
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const id = fd.get("id");
  const data = { title:fd.get("title"), type:fd.get("type"), url:fd.get("url"), alt:fd.get("alt"), updatedAt:serverTimestamp() };
  if(id) await updateDoc(doc(db,"cms_media",id), data);
  else await addDoc(collection(db,"cms_media"), { ...data, createdAt:serverTimestamp(), authorId:state.user.uid });
  $("#mediaDialog").close();
  toast("Mídia salva.", "ok");
}

function renderComments(){
  setTitle("Comentários", "Moderação");
  $("#adminView").innerHTML = `<div class="panel"><div class="panel-head"><h2>Comentários e feedback</h2><button class="btn soft" id="fakeComment">Gerar exemplo</button></div><div class="stack">${state.comments.map(c=>`<article class="comment-card"><div class="badges"><span class="badge ${c.status === "approved" ? "ok" : "warn"}">${esc(c.status || "pending")}</span><span class="badge">${esc(c.authorName || "Anônimo")}</span></div><p>${esc(c.content || "")}</p><div class="row-actions"><button class="btn primary" data-comment-status="${c.id}:approved">Aprovar</button><button class="btn danger" data-comment-status="${c.id}:spam">Spam</button></div></article>`).join("") || "<div class='empty'>Sem comentários.</div>"}</div></div>`;
  $("#fakeComment").onclick = async () => addDoc(collection(db,"cms_comments"), { authorName:"Cliente exemplo", content:"Comentário de teste para moderação.", status:"pending", createdAt:serverTimestamp() });
  $$("[data-comment-status]").forEach(btn => btn.onclick = async () => {
    const [id,status] = btn.dataset.commentStatus.split(":");
    await updateDoc(doc(db,"cms_comments",id), { status, updatedAt:serverTimestamp() });
  });
}

function renderAppearance(){
  setTitle("Aparência", "Temas, menus e widgets");
  const appearance = option("appearance", { mode:"dark", palette:"default", density:"normal", activeTheme:"aurora" });
  $("#adminView").innerHTML = `<div class="workspace-grid grid-2">
    <article class="panel"><div class="panel-head"><h2>Temas</h2><span class="badge">${esc(appearance.activeTheme || "aurora")}</span></div><div class="theme-grid">
      ${[
        ["aurora","Aurora Admin","default","Tema escuro premium com gradiente azul."],
        ["classic","Classic CMS","default","Mais próximo de um admin tradicional."],
        ["warm","Warm Delivery","warm","Laranja/amarelo para alimentação."],
        ["forest","Forest Fresh","forest","Verde/azul para saúde e natural."]
      ].map(t=>`<article class="theme-card theme-${t[0]}"><div class="theme-preview"></div><h3>${t[1]}</h3><p>${t[3]}</p><button class="btn ${appearance.activeTheme===t[0]?"primary":"soft"}" data-theme="${t[0]}:${t[2]}">Ativar</button></article>`).join("")}
    </div></article>
    <article class="panel"><h2>Menus e widgets</h2><p class="muted">Simulação do sistema de menus/widgets do WordPress. Salva em cms_options/navigation e cms_options/widgets.</p><label>Menu principal<textarea id="navLinks" rows="6">${esc(JSON.stringify(option("navigation", { links:["Início","Cardápio","Contato"] }).links || [], null, 2))}</textarea></label><label>Widgets<textarea id="widgets" rows="6">${esc(JSON.stringify(option("widgets", { sidebar:["Busca","Categorias","Promoções"] }).sidebar || [], null, 2))}</textarea></label><button id="saveMenus" class="btn primary">Salvar menus/widgets</button></article>
  </div>`;
  $$("[data-theme]").forEach(btn => btn.onclick = async () => {
    const [activeTheme,palette] = btn.dataset.theme.split(":");
    await saveOption("appearance", { ...appearance, activeTheme, palette });
    applyTheme(); toast("Tema ativado.", "ok"); renderAppearance();
  });
  $("#saveMenus").onclick = async () => {
    try{
      await saveOption("navigation", { links: JSON.parse($("#navLinks").value) });
      await saveOption("widgets", { sidebar: JSON.parse($("#widgets").value) });
      toast("Menus/widgets salvos.", "ok");
    }catch{ toast("JSON inválido.", "err"); }
  };
}
function renderPlugins(){
  setTitle("Módulos", "Plugins");
  const pluginMap = Object.fromEntries(state.plugins.map(p=>[p.key,p]));
  $("#adminView").innerHTML = `<div class="plugin-grid">${pluginDefinitions.map(p => {
    const active = pluginMap[p.key]?.active ?? p.locked ?? false;
    return `<article class="plugin-card"><div class="badges"><span class="badge ${active ? "ok" : "warn"}">${active ? "Ativo" : "Inativo"}</span><span class="badge">v${p.version}</span></div><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><button class="btn ${active ? "danger" : "primary"}" data-plugin="${p.key}:${active ? "off" : "on"}" ${p.locked ? "disabled" : ""}>${active ? "Desativar" : "Ativar"}</button></article>`;
  }).join("")}</div>`;
  $$("[data-plugin]").forEach(btn => btn.onclick = async () => {
    const [key,mode] = btn.dataset.plugin.split(":");
    await setDoc(doc(db,"cms_plugins",key), { key, active:mode==="on", updatedAt:serverTimestamp() }, { merge:true });
    toast("Módulo atualizado.", "ok");
  });
}

function renderUsers(){
  setTitle("Usuários", "Roles e capacidades");
  if(!isAdmin()){ $("#adminView").innerHTML = `<div class="empty">Acesso restrito.</div>`; return; }
  $("#adminView").innerHTML = `<div class="panel"><div class="panel-head"><h2>Usuários</h2><span class="badge">${state.users.length} registros</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>E-mail</th><th>Role</th><th>Status</th><th>Ações</th></tr></thead><tbody>${state.users.map(u=>`<tr><td>${esc(u.name || "-")}</td><td>${esc(u.email || "-")}</td><td><select data-role="${u.id || u.uid}">${Object.keys(roles).map(r=>`<option value="${r}" ${u.role===r?"selected":""}>${r}</option>`).join("")}</select></td><td><select data-status="${u.id || u.uid}"><option value="approved" ${u.status==="approved"?"selected":""}>approved</option><option value="pending" ${u.status==="pending"?"selected":""}>pending</option><option value="rejected" ${u.status==="rejected"?"selected":""}>rejected</option></select></td><td><button class="btn primary" data-save-user="${u.id || u.uid}">Salvar</button></td></tr>`).join("")}</tbody></table></div></div>`;
  $$("[data-save-user]").forEach(btn => btn.onclick = async () => {
    const uid = btn.dataset.saveUser;
    await setDoc(doc(db,"users",uid), { role:$(`[data-role="${uid}"]`).value, status:$(`[data-status="${uid}"]`).value, updatedAt:serverTimestamp() }, { merge:true });
    toast("Usuário atualizado.", "ok");
  });
}
function renderApprovals(){
  setTitle("Aprovações", "Contas pendentes");
  if(!isAdmin()){ $("#adminView").innerHTML = `<div class="empty">Acesso restrito.</div>`; return; }
  const pending = state.users.filter(u => u.status === "pending" || u.role === "pending");
  $("#adminView").innerHTML = `<div class="panel"><div class="panel-head"><h2>Contas aguardando aprovação</h2><span class="badge warn">${pending.length} pendentes</span></div><div class="stack">${pending.map(u=>`<article class="approval-card"><div class="badges"><span class="badge warn">Pendente</span><span class="badge">${esc(u.requestedRole || "merchant")}</span></div><h3>${esc(u.name || u.email)}</h3><p>${esc(u.email)}</p><div class="approval-actions"><button class="btn primary" data-approve="${u.id || u.uid}:${u.requestedRole || "merchant"}">Aprovar</button><button class="btn danger" data-reject="${u.id || u.uid}">Rejeitar</button></div></article>`).join("") || "<div class='empty'>Nenhuma conta pendente.</div>"}</div></div>`;
  $$("[data-approve]").forEach(btn => btn.onclick = async () => {
    const [uid,requestedRole] = btn.dataset.approve.split(":");
    await setDoc(doc(db,"users",uid), { role:requestedRole, status:"approved", approvedBy:state.user.uid, approvedAt:serverTimestamp(), updatedAt:serverTimestamp() }, { merge:true });
    toast("Conta aprovada.", "ok");
  });
  $$("[data-reject]").forEach(btn => btn.onclick = async () => {
    await setDoc(doc(db,"users",btn.dataset.reject), { status:"rejected", updatedAt:serverTimestamp() }, { merge:true });
    toast("Conta rejeitada.", "ok");
  });
}

function renderSettings(){
  setTitle("Configurações", "Geral, leitura, discussão, mídia, permalinks, segurança");
  const general = option("general", { siteTitle:"MenuForge", tagline:"Cardápio digital com ForgeCMS", adminEmail: state.user?.email || "" });
  const reading = option("reading", { frontPage:"home", postsPerPage:10 });
  const discussion = option("discussion", { comments:true, moderation:true });
  const media = option("media", { maxImageWidth:1600, maxImageHeight:1600 });
  const permalinks = option("permalinks", { pattern:"/%type%/%slug%" });
  const appearance = option("appearance", { mode:"dark", palette:"default", density:"normal" });
  $("#adminView").innerHTML = `<div class="workspace-grid grid-2">
    <article class="settings-card"><h2>Geral</h2><label>Título do site<input id="siteTitle" value="${esc(general.siteTitle)}"></label><label>Descrição<input id="tagline" value="${esc(general.tagline)}"></label><label>E-mail admin<input id="adminEmail" value="${esc(general.adminEmail)}"></label><button class="btn primary" id="saveGeneral">Salvar geral</button></article>
    <article class="settings-card"><h2>Aparência do admin</h2><label>Modo<select id="uiMode"><option value="dark">Escuro</option><option value="light">Claro</option></select></label><label>Densidade<select id="uiDensity"><option value="normal">Normal</option><option value="compact">Compacto</option></select></label><div class="color-dots"><button class="color-dot" data-palette="default"></button><button class="color-dot" data-palette="warm"></button><button class="color-dot" data-palette="forest"></button><button class="color-dot" data-palette="royal"></button></div><button class="btn primary" id="saveAppearance">Salvar aparência</button></article>
    <article class="settings-card"><h2>Leitura</h2><label>Página inicial<input id="frontPage" value="${esc(reading.frontPage)}"></label><label>Itens por página<input id="postsPerPage" value="${reading.postsPerPage}"></label><button class="btn primary" id="saveReading">Salvar leitura</button></article>
    <article class="settings-card"><h2>Discussão</h2><label>Comentários<select id="commentsEnabled"><option value="true">Ativados</option><option value="false">Desativados</option></select></label><label>Moderação<select id="moderationEnabled"><option value="true">Obrigatória</option><option value="false">Automática</option></select></label><button class="btn primary" id="saveDiscussion">Salvar discussão</button></article>
    <article class="settings-card"><h2>Mídia</h2><label>Largura máxima<input id="maxImageWidth" value="${media.maxImageWidth}"></label><label>Altura máxima<input id="maxImageHeight" value="${media.maxImageHeight}"></label><button class="btn primary" id="saveMediaSettings">Salvar mídia</button></article>
    <article class="settings-card"><h2>Permalinks</h2><label>Padrão de URL<input id="permalinkPattern" value="${esc(permalinks.pattern)}"></label><button class="btn primary" id="savePermalinks">Salvar permalinks</button></article>
    <article class="settings-card"><h2>Segurança</h2><p>Troque o e-mail/senha do admin inicial. Pode exigir login recente do Firebase.</p><label>Novo e-mail<input id="newAdminEmail" type="email" placeholder="novo@email.com"></label><label>Nova senha<input id="newAdminPassword" type="password" minlength="6"></label><button class="btn primary" id="changeCredentials">Atualizar credenciais</button></article>
  </div>`;
  $("#uiMode").value = appearance.mode || "dark";
  $("#uiDensity").value = appearance.density || "normal";
  $("#commentsEnabled").value = String(discussion.comments);
  $("#moderationEnabled").value = String(discussion.moderation);
  $("#saveGeneral").onclick = async () => { await saveOption("general", { siteTitle:$("#siteTitle").value, tagline:$("#tagline").value, adminEmail:$("#adminEmail").value }); toast("Configurações gerais salvas.","ok"); };
  $("#saveAppearance").onclick = async () => { await saveOption("appearance", { ...appearance, mode:$("#uiMode").value, density:$("#uiDensity").value }); applyTheme(); toast("Aparência salva.","ok"); };
  $$(".color-dot").forEach(btn => btn.onclick = async () => { await saveOption("appearance", { ...appearance, mode:$("#uiMode").value, density:$("#uiDensity").value, palette:btn.dataset.palette }); applyTheme(); toast("Paleta aplicada.","ok"); });
  $("#saveReading").onclick = async () => { await saveOption("reading", { frontPage:$("#frontPage").value, postsPerPage:Number($("#postsPerPage").value || 10) }); toast("Leitura salva.","ok"); };
  $("#saveDiscussion").onclick = async () => { await saveOption("discussion", { comments:$("#commentsEnabled").value==="true", moderation:$("#moderationEnabled").value==="true" }); toast("Discussão salva.","ok"); };
  $("#saveMediaSettings").onclick = async () => { await saveOption("media", { maxImageWidth:Number($("#maxImageWidth").value||1600), maxImageHeight:Number($("#maxImageHeight").value||1600) }); toast("Mídia salva.","ok"); };
  $("#savePermalinks").onclick = async () => { await saveOption("permalinks", { pattern:$("#permalinkPattern").value }); toast("Permalinks salvos.","ok"); };
  $("#changeCredentials").onclick = async () => {
    try{
      const email = $("#newAdminEmail").value.trim();
      const pass = $("#newAdminPassword").value.trim();
      if(email) await updateEmail(auth.currentUser, email);
      if(pass) await updatePassword(auth.currentUser, pass);
      await setDoc(doc(db,"users",state.user.uid), { email:auth.currentUser.email, bootstrapAdmin:false, updatedAt:serverTimestamp() }, { merge:true });
      toast("Credenciais atualizadas. No próximo login use o novo e-mail.", "ok");
    }catch(err){ toast("Erro ao trocar credenciais: " + err.message, "err"); }
  };
}

function renderTools(){
  setTitle("Ferramentas", "Importar, exportar, saúde");
  $("#adminView").innerHTML = `<div class="workspace-grid grid-3">
    <article class="tool-card"><h2>Exportar JSON</h2><p>Baixa um backup bruto do CMS e do MenuForge.</p><button class="btn primary" id="exportJson">Exportar</button></article>
    <article class="tool-card"><h2>Saúde do sistema</h2><p>Auth, Firestore, coleções e permissões básicas.</p><div class="activity-list"><div>Usuário: ${esc(state.user?.email || "-")}</div><div>Role: ${esc(role())}</div><div>Conteúdos: ${state.content.length}</div><div>Pedidos: ${state.orders.length}</div></div></article>
    <article class="tool-card"><h2>Importar</h2><p>Preparado para futura importação JSON validada. No MVP, exportação é segura; importação manual deve ser feita com cuidado.</p></article>
  </div>`;
  $("#exportJson").onclick = () => {
    const payload = { exportedAt:new Date().toISOString(), content:state.content, media:state.media, users:state.users, stores:state.stores, products:state.products, categories:state.categories, orders:state.orders, options:state.options, plugins:state.plugins };
    const blob = new Blob([JSON.stringify(payload,null,2)], { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "forgecms-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

/* MenuForge plugin */
function currentStoreId(){ return state.activeStoreId || state.profile?.currentStoreId || state.stores.find(s=>s.ownerId===state.user?.uid)?.id || state.stores[0]?.id || null; }
function storeCategories(id=currentStoreId()){ return state.categories.filter(c=>c.storeId===id); }
function storeProducts(id=currentStoreId()){ return state.products.filter(p=>p.storeId===id); }
function renderMFStores(){
  setTitle("Lojas", "MenuForge");
  $("#adminView").innerHTML = `<div class="workspace-grid grid-2">
    <article class="panel"><div class="panel-head"><h2>Configurar loja</h2><button id="createStore" class="btn primary">Salvar/Criar</button></div><div class="form-grid"><label>Nome<input id="storeName" value="${esc(state.activeStore?.name || "")}"></label><label>Slug<input id="storeSlug" value="${esc(state.activeStore?.slug || "")}"></label><label>WhatsApp<input id="storeWhatsapp" value="${esc(state.activeStore?.whatsapp || "")}"></label><label>Taxa entrega<input id="storeFee" value="${state.activeStore?.deliveryFee || 0}"></label><label>Pedido mínimo<input id="storeMin" value="${state.activeStore?.minOrder || 0}"></label><label class="wide">Chamada<input id="storeHeadline" value="${esc(state.activeStore?.headline || "")}"></label></div></article>
    <article class="panel"><h2>Lojas existentes</h2><div class="stack">${state.stores.map(s=>`<div class="data-card"><h3>${esc(s.name)}</h3><p class="muted">${esc(s.slug || "")}</p><button class="btn soft" data-select-store="${s.id}">Selecionar</button></div>`).join("") || "<div class='empty'>Nenhuma loja.</div>"}</div></article>
  </div>`;
  $("#createStore").onclick = saveStore;
  $$("[data-select-store]").forEach(btn => btn.onclick = () => { state.activeStoreId = btn.dataset.selectStore; state.activeStore = state.stores.find(s=>s.id===state.activeStoreId); renderMFStores(); });
}
async function saveStore(){
  const payload = { name:$("#storeName").value.trim(), slug:$("#storeSlug").value.trim() || slugify($("#storeName").value), whatsapp:$("#storeWhatsapp").value.trim(), deliveryFee:toNumber($("#storeFee").value), minOrder:toNumber($("#storeMin").value), headline:$("#storeHeadline").value.trim(), ownerId:state.user.uid, updatedAt:serverTimestamp() };
  if(state.activeStore?.id) await updateDoc(doc(db,"stores",state.activeStore.id), payload);
  else{
    const ref = await addDoc(collection(db,"stores"), { ...payload, createdAt:serverTimestamp() });
    state.activeStoreId = ref.id;
    await setDoc(doc(db,"users",state.user.uid), { currentStoreId:ref.id, updatedAt:serverTimestamp() }, { merge:true });
  }
  toast("Loja salva.", "ok");
}
function renderMFProducts(){
  setTitle("Produtos", "MenuForge");
  const storeId = currentStoreId();
  $("#adminView").innerHTML = `<div class="workspace-grid grid-2">
    <article class="panel"><div class="panel-head"><h2>Categorias</h2><button class="btn primary" id="addCategory">+ Categoria</button></div><div class="stack">${storeCategories(storeId).map(c=>`<div class="data-card"><strong>${esc(c.name)}</strong></div>`).join("") || "<div class='empty'>Sem categorias.</div>"}</div></article>
    <article class="panel"><div class="panel-head"><h2>Produtos</h2><button class="btn primary" id="addProduct">+ Produto</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Preço</th><th>Status</th><th></th></tr></thead><tbody>${storeProducts(storeId).map(p=>`<tr><td>${esc(p.name)}</td><td>${money(p.price)}</td><td>${p.active===false?"Oculto":"Ativo"}</td><td><button class="btn soft" data-edit-product="${p.id}">Editar</button></td></tr>`).join("")}</tbody></table></div></article>
  </div>`;
  $("#addCategory").onclick = async () => {
    const name = prompt("Nome da categoria");
    if(name) await addDoc(collection(db,"categories"), { storeId, name, createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
  };
  $("#addProduct").onclick = () => openProductDialog();
  $$("[data-edit-product]").forEach(btn => btn.onclick = () => openProductDialog(btn.dataset.editProduct));
}
function openProductDialog(id=null){
  const form = $("#productForm");
  form.reset();
  form.elements.id.value = "";
  form.elements.categoryId.innerHTML = storeCategories(currentStoreId()).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  if(id){
    const p = state.products.find(x=>x.id===id);
    if(p) Object.entries(p).forEach(([k,v]) => { if(form.elements[k]) form.elements[k].value = String(v ?? ""); });
    form.elements.id.value = id;
  }
  $("#productDialog").showModal();
}
async function onProductSubmit(e){
  if(e.submitter?.value === "cancel") return;
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const id = fd.get("id");
  const payload = { storeId:currentStoreId(), categoryId:fd.get("categoryId"), name:fd.get("name"), price:toNumber(fd.get("price")), active:fd.get("active")==="true", featured:fd.get("featured")==="true", prepTime:Number(fd.get("prepTime") || 20), description:fd.get("description"), emoji:"🍽️", updatedAt:serverTimestamp() };
  if(id) await updateDoc(doc(db,"products",id), payload);
  else await addDoc(collection(db,"products"), { ...payload, createdAt:serverTimestamp() });
  $("#productDialog").close();
  toast("Produto salvo.", "ok");
}
function renderMFOrders(){
  setTitle("Pedidos", "MenuForge");
  const flow = [["new","Novo"],["accepted","Aceito"],["preparing","Preparo"],["ready","Saiu"],["delivered","Finalizado"]];
  const orders = state.orders.filter(o => isAdmin() || o.storeId === currentStoreId() || o.assignedCourierId === state.user?.uid);
  $("#adminView").innerHTML = `<div class="kanban">${flow.map(([s,label])=>`<section class="kanban-col"><h3>${label}</h3>${orders.filter(o=>o.status===s).map(orderCard).join("") || "<div class='empty'>Vazio</div>"}</section>`).join("")}</div>`;
  wireOrderButtons();
}
function orderCard(o){
  return `<article class="order-card"><h4>#${esc(o.shortId || o.id.slice(0,6))} · ${esc(o.customer?.name || "Cliente")}</h4><div class="badges"><span class="badge warn">${esc(o.status || "new")}</span><span class="badge">${money(o.total)}</span></div><p class="muted">${esc(address(o))}</p><div class="order-actions">${["accepted","preparing","ready","delivered"].map(s=>`<button class="btn ghost" data-order-status="${o.id}:${s}">${s}</button>`).join("")}<a class="btn soft" target="_blank" href="${mapsUrl(o)}">GPS</a><a class="btn ghost" target="_blank" href="${wazeUrl(o)}">Waze</a></div></article>`;
}
function wireOrderButtons(){
  $$("[data-order-status]").forEach(btn => btn.onclick = async () => {
    const [id,status] = btn.dataset.orderStatus.split(":");
    await updateDoc(doc(db,"orders",id), { status, updatedAt:serverTimestamp() });
    toast("Pedido atualizado.", "ok");
  });
}
function renderMFCouriers(){
  setTitle("Entregadores", "MenuForge");
  const couriers = state.users.filter(u => u.role === "courier" || u.requestedRole === "courier");
  $("#adminView").innerHTML = `<div class="panel"><div class="panel-head"><h2>Entregadores</h2><span class="badge">${couriers.length}</span></div><div class="stack">${couriers.map(u=>`<div class="data-card"><h3>${esc(u.name || u.email)}</h3><p class="muted">${esc(u.email)} · ${esc(u.status || "")}</p></div>`).join("") || "<div class='empty'>Nenhum entregador.</div>"}</div></div>`;
}

/* Auth and data */
async function ensureProfile(user, requestedRole="merchant"){
  const ref = doc(db,"users",user.uid);
  const owner = user.email === OWNER_EMAIL || user.email === BOOT_ADMIN_EMAIL;
  const base = { uid:user.uid, email:user.email, name:user.displayName || user.email?.split("@")[0] || "Usuário", role: owner ? "super_admin" : requestedRole === "customer" ? "customer" : "pending", requestedRole, status: owner || requestedRole === "customer" ? "approved" : "pending" };
  const snap = await getDoc(ref);
  if(snap.exists()){
    const data = { ...base, ...snap.data() };
    if(owner && (data.role !== "super_admin" || data.status !== "approved")){
      await setDoc(ref, { role:"super_admin", requestedRole:"super_admin", status:"approved", updatedAt:serverTimestamp() }, { merge:true });
      return { ...data, role:"super_admin", requestedRole:"super_admin", status:"approved" };
    }
    return data;
  }
  await setDoc(ref, { ...base, createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
  return base;
}
function stopSubscriptions(){ state.unsub.forEach(fn=>fn&&fn()); state.unsub=[]; }
function listen(name, setter){
  state.unsub.push(onSnapshot(collection(db,name), snap => { setter(snap.docs.map(d=>({id:d.id,...d.data()}))); renderAfterData(); }, err => toast(name + ": " + err.message, "err")));
}
function subscribe(){
  stopSubscriptions();
  listen("users", data => state.users = data.sort((a,b)=>(a.email||"").localeCompare(b.email||"")));
  listen("cms_content", data => state.content = data.sort((a,b)=>stamp(b.updatedAt)-stamp(a.updatedAt)));
  listen("cms_media", data => state.media = data.sort((a,b)=>stamp(b.updatedAt)-stamp(a.updatedAt)));
  listen("cms_taxonomies", data => state.taxonomies = data);
  listen("cms_comments", data => state.comments = data.sort((a,b)=>stamp(b.createdAt)-stamp(a.createdAt)));
  listen("cms_plugins", data => state.plugins = data);
  listen("cms_themes", data => state.themes = data);
  listen("stores", data => {
    state.stores = data.sort((a,b)=>(a.name||"").localeCompare(b.name||""));
    const id = currentStoreId();
    state.activeStore = state.stores.find(s=>s.id===id) || state.activeStore || state.stores.find(s=>s.ownerId===state.user?.uid) || null;
    state.activeStoreId = state.activeStore?.id || null;
  });
  listen("categories", data => state.categories = data);
  listen("products", data => state.products = data.sort((a,b)=>(a.name||"").localeCompare(b.name||"")));
  listen("orders", data => state.orders = data.sort((a,b)=>stamp(b.createdAt)-stamp(a.createdAt)));
  state.unsub.push(onSnapshot(collection(db,"cms_options"), snap => {
    state.options = Object.fromEntries(snap.docs.map(d=>[d.id,{id:d.id,...d.data()}]));
    applyTheme();
    renderAfterData();
  }));
}
function renderAfterData(){
  if(state.user && !$("#adminShell").classList.contains("hidden")) route();
}
async function seedCore(){
  await setDoc(doc(db,"cms_plugins","menuforge"), { key:"menuforge", active:true, locked:true, installedAt:serverTimestamp() }, { merge:true });
  await setDoc(doc(db,"cms_plugins","approvals"), { key:"approvals", active:true, locked:true, installedAt:serverTimestamp() }, { merge:true });
  await setDoc(doc(db,"cms_options","general"), { siteTitle:"MenuForge", tagline:"Cardápio digital com ForgeCMS", updatedAt:serverTimestamp() }, { merge:true });
  await setDoc(doc(db,"cms_options","appearance"), { activeTheme:"aurora", mode:"dark", palette:"default", density:"normal", updatedAt:serverTimestamp() }, { merge:true });
}
async function enter(user, requestedRole="merchant"){
  state.user = user;
  state.profile = await ensureProfile(user, requestedRole);
  await seedCore();
  subscribe();
  showShell();
  if(!location.hash || location.hash === "#") location.hash = "#/dashboard";
  route();
}
async function login(e){
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const identifier = String(fd.get("identifier") || "").trim();
  const password = String(fd.get("password") || "");
  const email = loginIdentifierToEmail(identifier);
  try{
    let cred;
    if(identifier.toLowerCase() === "admin" && password === BOOT_ADMIN_PASSWORD){
      try{
        cred = await createUserWithEmailAndPassword(auth, BOOT_ADMIN_EMAIL, BOOT_ADMIN_PASSWORD);
        await updateProfile(cred.user, { displayName:"Administrador" });
      }catch(createErr){
        if(createErr.code === "auth/email-already-in-use") cred = await signInWithEmailAndPassword(auth, BOOT_ADMIN_EMAIL, BOOT_ADMIN_PASSWORD);
        else throw createErr;
      }
      await setDoc(doc(db,"users",cred.user.uid), { uid:cred.user.uid, email:cred.user.email, name:"Administrador", role:"super_admin", requestedRole:"super_admin", status:"approved", bootstrapAdmin:true, updatedAt:serverTimestamp() }, { merge:true });
    }else{
      cred = await signInWithEmailAndPassword(auth, email, password);
    }
    await enter(cred.user, "merchant");
    toast("Login realizado.", "ok");
  }catch(err){ toast("Login falhou: " + err.message, "err"); }
}
async function requestAccess(e){
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  try{
    const cred = await createUserWithEmailAndPassword(auth, fd.get("email"), fd.get("password"));
    await updateProfile(cred.user, { displayName: fd.get("name") });
    const requestedRole = fd.get("requestedRole");
    await setDoc(doc(db,"users",cred.user.uid), { uid:cred.user.uid, email:cred.user.email, name:fd.get("name"), requestedRole, role: requestedRole === "customer" ? "customer" : "pending", status: requestedRole === "customer" ? "approved" : "pending", createdAt:serverTimestamp(), updatedAt:serverTimestamp() }, { merge:true });
    await enter(cred.user, requestedRole);
    toast("Conta criada.", "ok");
  }catch(err){ toast("Cadastro falhou: " + err.message, "err"); }
}
async function googleAuth(){
  try{
    const cred = await signInWithPopup(auth, provider);
    await enter(cred.user, "merchant");
  }catch(err){
    if(err.code === "auth/unauthorized-domain") toast("Google bloqueado: adicione davicostadua480-oss.github.io em Firebase Auth > Settings > Authorized domains.", "err");
    else toast("Google falhou: " + err.message, "err");
  }
}

function bind(){
  window.FORGECMS_READY = true;
  if (window.FORGECMS_BOOT_TIMER) clearTimeout(window.FORGECMS_BOOT_TIMER);
  document.getElementById("forgecmsBootWarning")?.remove();
  $("#boot").hidden = true;
  const loginSubmit = $("#loginSubmit");
  if (loginSubmit) {
    loginSubmit.disabled = false;
    loginSubmit.textContent = "Entrar";
  }
  if ($("#loginForm")) $("#loginForm").onsubmit = login;
  if ($("#requestForm")) $("#requestForm").onsubmit = requestAccess;
  if ($("#googleLogin")) $("#googleLogin").onclick = googleAuth;
  $$("[data-auth-tab]").forEach(btn => btn.onclick = () => {
    $$("[data-auth-tab]").forEach(b=>b.classList.toggle("active", b === btn));
    $("#loginForm").classList.toggle("hidden", btn.dataset.authTab !== "login");
    $("#requestForm").classList.toggle("hidden", btn.dataset.authTab !== "request");
  });
  $("#openSidebar").onclick = openSidebar;
  $("#closeSidebar").onclick = closeSidebar;
  $("#sidebarBackdrop").onclick = closeSidebar;
  $("#logoutBtn").onclick = () => signOut(auth);
  $("#screenOptionsBtn").onclick = () => $("#screenOptionsPanel").classList.toggle("hidden");
  $("#newContentTop").onclick = () => openContentDialog();
  $("#quickDraftBtn").onclick = () => { navigate("#/dashboard"); setTimeout(()=>$("#quickDraftForm input")?.focus(),100); };
  $("#contentForm").onsubmit = onContentSubmit;
  $("#mediaForm").onsubmit = onMediaSubmit;
  $("#productForm").onsubmit = onProductSubmit;
  window.addEventListener("hashchange", route);
}
function init(){
  try{
    bind();
    onAuthStateChanged(auth, async user => {
      try{
        if(!user){
          state.user=null; state.profile=null; stopSubscriptions(); showLogin(); return;
        }
        if(!state.user) await enter(user, "merchant");
      }catch(err){
        console.error("ForgeCMS auth state error:", err);
        showLogin();
        toast("Erro ao preparar painel: " + (err.message || err), "err");
      }
    });
  }catch(err){
    console.error("ForgeCMS init error:", err);
    const boot = document.getElementById("boot");
    const login = document.getElementById("loginScreen");
    if(boot) boot.hidden = true;
    if(login) login.classList.remove("hidden");
  }
}
init();

