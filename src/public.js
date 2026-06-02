import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const state = {
  options: {},
  stores: [],
  categories: [],
  products: [],
  activeStore: null,
  menuCategory: "all",
  menuSearch: "",
  cart: JSON.parse(localStorage.getItem("mf-cart") || "[]"),
  storesLoaded: false
};

function money(v){ return BRL.format(Number(v || 0)); }
function esc(v=""){ return String(v).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c])); }
function normalize(v=""){ return String(v).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,""); }
function slug(store){ return normalize(store?.slug || store?.name || "loja").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
function saveCart(){ localStorage.setItem("mf-cart", JSON.stringify(state.cart)); }
function toast(msg,type=""){ const el=document.createElement("div"); el.className="toast "+type; el.textContent=msg; $("#toastArea").append(el); setTimeout(()=>el.remove(),4200); }

function demoStore(){ return { id:"demo", name:"Demo Burger", slug:"demo", status:"open", whatsapp:"5549999999999", deliveryFee:6.5, minOrder:15, headline:"Smash burgers, combos e bebidas em uma experiência de cardápio limpa." }; }
function demoCategories(){ return [{ id:"burgers", storeId:"demo", name:"Burgers" }, { id:"combos", storeId:"demo", name:"Combos" }, { id:"drinks", storeId:"demo", name:"Bebidas" }]; }
function demoProducts(){ return [
  { id:"p1", storeId:"demo", categoryId:"burgers", name:"Smash Duplo", price:28.9, active:true, featured:true, prepTime:22, description:"Dois smash burgers, cheddar e molho forge.", emoji:"🍔" },
  { id:"p2", storeId:"demo", categoryId:"combos", name:"Combo Família", price:79.9, active:true, featured:true, prepTime:35, description:"3 burgers, batata grande e refrigerante 2L.", emoji:"🍟" },
  { id:"p3", storeId:"demo", categoryId:"drinks", name:"Refrigerante lata", price:6.5, active:true, prepTime:2, description:"Escolha o sabor nas observações.", emoji:"🥤" }
];}
function storeCategories(storeId){ const list=state.categories.filter(c=>c.storeId===storeId); return list.length ? list : storeId==="demo" ? demoCategories() : []; }
function storeProducts(storeId){ const list=state.products.filter(p=>p.storeId===storeId); return storeId==="demo" ? demoProducts() : list; }

function show(view){
  ["homeView","featuresView","menuView"].forEach(id => $("#"+id).classList.add("hidden"));
  $("#"+view).classList.remove("hidden");
}
function route(){
  const hash = location.hash || "#/";
  if(hash === "#/recursos"){ show("featuresView"); return; }
  if(hash.startsWith("#/cardapio")){
    const key = decodeURIComponent(hash.split("/")[2] || "demo");
    if(key === "demo"){
      state.activeStore = demoStore();
    }else{
      state.activeStore = state.stores.find(s => s.id === key || s.slug === key || slug(s) === key) || null;
    }
    show("menuView");
    renderMenu();
    return;
  }
  show("homeView");
}
function renderMenu(){
  const store = state.activeStore;
  if(!store){
    $("#storeHero").innerHTML = `<div class="publicMissing"><h1>Loja não encontrada</h1><p>${state.storesLoaded ? "Essa loja ainda não existe ou o link está errado." : "Carregando loja..."}</p></div>`;
    $("#categoryList").innerHTML = "";
    $("#productGrid").innerHTML = `<div class="empty">${state.storesLoaded ? "Volte ao painel e confira o slug da loja." : "Aguarde os dados carregarem."}</div>`;
    renderCart();
    return;
  }
  const categories = storeCategories(store.id);
  let products = storeProducts(store.id).filter(p => p.active !== false);
  if(state.menuCategory !== "all") products = products.filter(p => p.categoryId === state.menuCategory);
  const q = normalize(state.menuSearch);
  if(q) products = products.filter(p => normalize(p.name + " " + (p.description || "")).includes(q));

  $("#storeHero").innerHTML = `<h1>${esc(store.name)}</h1><p>${esc(store.headline || "Cardápio digital inteligente.")}</p><div class="badges"><span class="badge ok">${store.status === "closed" ? "Fechado" : "Aberto"}</span><span class="badge">Entrega ${money(store.deliveryFee)}</span><span class="badge">Mínimo ${money(store.minOrder)}</span></div>`;
  $("#categoryList").innerHTML = `<button class="cat-btn ${state.menuCategory === "all" ? "active" : ""}" data-cat="all">Tudo</button>` + categories.map(c => `<button class="cat-btn ${state.menuCategory === c.id ? "active" : ""}" data-cat="${c.id}">${esc(c.name)}</button>`).join("");
  $$("#categoryList [data-cat]").forEach(btn => btn.onclick = () => { state.menuCategory = btn.dataset.cat; renderMenu(); });
  $("#productGrid").innerHTML = products.map((p,i)=>`<article class="product-card"><div class="product-img">${p.emoji || ["🍔","🍕","🥤","🍟"][i%4]}</div><div class="product-body"><div class="badges">${p.featured ? "<span class='badge ok'>Destaque</span>" : ""}<span class="badge">${p.prepTime || 20} min</span></div><h3>${esc(p.name)}</h3><p>${esc(p.description || "Produto do cardápio.")}</p><div class="product-foot"><strong class="price">${money(p.price)}</strong><button class="btn primary" data-add="${p.id}" type="button">Adicionar</button></div></div></article>`).join("") || `<div class="empty">Nenhum produto cadastrado nesta loja ainda.</div>`;
  $$("[data-add]").forEach(btn => btn.onclick = () => addToCart(btn.dataset.add));
  renderCart();
}
function addToCart(id){
  const product = storeProducts((state.activeStore || demoStore()).id).find(p => p.id === id);
  if(!product) return;
  const item = state.cart.find(i => i.id === id);
  item ? item.qty++ : state.cart.push({ id:product.id, storeId:product.storeId, name:product.name, price:Number(product.price), qty:1 });
  saveCart(); renderCart(); toast(product.name + " adicionado.", "ok");
}
function cartTotals(){
  const subtotal = state.cart.reduce((s,i)=>s+i.price*i.qty,0);
  const delivery = state.cart.length ? Number((state.activeStore || demoStore()).deliveryFee || 0) : 0;
  return { subtotal, delivery, total:subtotal+delivery };
}
function renderCart(){
  $("#cartCount").textContent = state.cart.reduce((s,i)=>s+i.qty,0);
  $("#cartItems").innerHTML = state.cart.map(i=>`<div class="cart-item"><div><strong>${esc(i.name)}</strong><br><small>${money(i.price)} un.</small></div><div class="qty"><button data-dec="${i.id}">−</button><b>${i.qty}</b><button data-inc="${i.id}">+</button></div></div>`).join("") || `<div class="empty">Carrinho vazio.</div>`;
  $$("[data-inc]").forEach(b => b.onclick = () => qty(b.dataset.inc, 1));
  $$("[data-dec]").forEach(b => b.onclick = () => qty(b.dataset.dec, -1));
  const t = cartTotals();
  $("#cartSubtotal").textContent = money(t.subtotal);
  $("#cartDelivery").textContent = money(t.delivery);
  $("#cartTotal").textContent = money(t.total);
}
function qty(id,delta){
  const item = state.cart.find(i=>i.id===id);
  if(!item) return;
  item.qty += delta;
  if(item.qty <= 0) state.cart = state.cart.filter(i=>i.id!==id);
  saveCart(); renderCart();
}
function address(order){ const a=order.address||{}; return [a.street,a.number,a.district,a.complement,a.reference].filter(Boolean).join(", "); }
function wa(phone,msg){ const p=String(phone||"").replace(/\D/g,""); return "https://wa.me/"+p+"?text="+encodeURIComponent(msg); }
async function submitOrder(form){
  if(!state.cart.length) return toast("Carrinho vazio.", "err");
  const fd = new FormData(form);
  const store = state.activeStore || demoStore();
  const t = cartTotals();
  const order = {
    storeId: store.id,
    storeName: store.name,
    items: state.cart,
    subtotal: t.subtotal,
    deliveryFee: t.delivery,
    total: t.total,
    status: "new",
    shortId: Math.random().toString(36).slice(2,8).toUpperCase(),
    customer: { name:fd.get("name"), phone:fd.get("phone") },
    address: { street:fd.get("street"), number:fd.get("number"), district:fd.get("district"), complement:fd.get("complement"), reference:fd.get("reference") },
    payment: { method:fd.get("payment"), changeFor:fd.get("changeFor") },
    notes: fd.get("notes"),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  try{
    if(store.id !== "demo") await addDoc(collection(db,"orders"), order);
    state.cart = []; saveCart(); renderCart();
    $("#checkoutDialog").close(); $("#cartDrawer").classList.add("hidden");
    if(store.whatsapp) window.open(wa(store.whatsapp, `Novo pedido #${order.shortId}\nTotal: ${money(order.total)}\nCliente: ${order.customer.name}\nEndereço: ${address(order)}`), "_blank", "noopener,noreferrer");
    toast("Pedido criado.", "ok");
  }catch(err){ toast("Erro ao criar pedido: " + err.message, "err"); }
}

function bind(){
  $("#menuSearch").oninput = e => { state.menuSearch = e.target.value; renderMenu(); };
  $("#openCart").onclick = () => $("#cartDrawer").classList.remove("hidden");
  $("#closeCart").onclick = () => $("#cartDrawer").classList.add("hidden");
  $("#checkoutButton").onclick = () => state.cart.length ? $("#checkoutDialog").showModal() : toast("Carrinho vazio.", "err");
  $("#checkoutForm").onsubmit = e => { if(e.submitter?.value === "cancel") return; e.preventDefault(); submitOrder(e.currentTarget); };
  window.addEventListener("hashchange", route);
}
function subscribe(){
  onSnapshot(collection(db,"stores"), snap => { state.stores=snap.docs.map(d=>({id:d.id,...d.data()})); state.storesLoaded=true; route(); });
  onSnapshot(collection(db,"categories"), snap => { state.categories=snap.docs.map(d=>({id:d.id,...d.data()})); renderMenu(); });
  onSnapshot(collection(db,"products"), snap => { state.products=snap.docs.map(d=>({id:d.id,...d.data()})); renderMenu(); });
}
bind();
subscribe();
route();
renderCart();

