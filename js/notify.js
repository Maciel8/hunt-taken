// Avisos de troca e convite de clã: aviso na tela, brilho no botão da aba, som curto e notificação do navegador quando o jogo está em segundo plano.
// O que existe vem sempre do servidor (get_state); o canal em tempo real só avisa o outro navegador pra buscar o estado na hora.
import { S } from "./sim.js";
import { toast } from "./ui.js";
import { log } from "./sim.js";

const seen = { trades: null, invites: null };
const KEY = "ht_notif";
export const notifOn = () => { try { return localStorage.getItem(KEY) !== "0"; } catch (e) { return true; } };
export const notifPerm = () => ("Notification" in window) ? Notification.permission : "indisponível";
export async function enableNotif() {
  try { localStorage.setItem(KEY, "1"); } catch (e) { }
  if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
  return notifPerm();
}
export function disableNotif() { try { localStorage.setItem(KEY, "0"); } catch (e) { } }
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.type = "triangle"; o.frequency.value = 880; o.frequency.setValueAtTime(1320, a.currentTime + .09); g.gain.setValueAtTime(.08, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .3); o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + .3); } catch (e) { } }
function system(title, body, tab) {
  if (!notifOn() || !("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
  try { const n = new Notification(title, { body, tag: tab, icon: "favicon.png" }); n.onclick = () => { window.focus(); document.querySelector(`[data-tab="${tab}"]`)?.click(); n.close(); }; } catch (e) { }
}
function glow(tab, on) { document.querySelector(`nav [data-tab="${tab}"], [data-tab="${tab}"]`)?.classList.toggle("ping", !!on); }

// chamado depois de cada atualização de estado
export function checkNotices() {
  const inc = (S.trades || []).filter(t => !t.mine), ids = new Set(inc.map(t => t.id));
  if (seen.trades) for (const t of inc) if (!seen.trades.has(t.id)) {
    const what = [t.items?.length ? `${t.items.length} item(ns)` : "", t.offer_gold ? `${t.offer_gold} gold` : "", t.offer_gems ? `${t.offer_gems} gemas` : ""].filter(Boolean).join(" + ") || "nada";
    toast(`${t.from} propôs uma troca`); log(`<b>${t.from}</b> te propôs uma troca: ${what}. Veja em Trocas.`, "good"); beep();
    system("Nova proposta de troca", `${t.from} oferece ${what}`, "trades");
  }
  // mesa bilateral: avisa quando o outro lado mexe na oferta ou confirma
  for (const t of (S.trades || []).filter(t => t.mode === "bilateral")) { const k = t.id + ":" + t.version + ":" + (t.mine ? t.accepted_b : t.accepted_a); if (seen.ver && seen.ver[t.id] && seen.ver[t.id] !== k && Date.now() - (window.__myTradeAct || 0) > 25000) { const other = t.mine ? t.to : t.from; toast(`${other} mexeu na mesa de troca`); beep(); system("Mesa de troca", `${other} mudou ou confirmou a troca`, "trades"); } (seen.ver = seen.ver || {})[t.id] = k; }
  const pend = (S.trades || []).some(t => t.mode === "bilateral" ? !(t.mine ? t.accepted_a : t.accepted_b) : !t.mine);
  seen.trades = ids; glow("trades", pend);
  glow("market", (S.marketNews || 0) > 0); glow("char", (S.pointsFree || 0) > 0);
  const inv = S.clanInvites || [], iids = new Set(inv.map(i => i.clan_id));
  if (seen.invites) for (const i of inv) if (!seen.invites.has(i.clan_id)) {
    toast(`Convite do clã [${i.tag}] ${i.name}`); log(`<b>${i.by || "Um líder"}</b> te convidou pro clã <b>[${i.tag}] ${i.name}</b>. Veja na aba Clã.`, "good"); beep();
    system("Convite de clã", `${i.by || "Um líder"} te convidou pro [${i.tag}] ${i.name}`, "clan");
  }
  seen.invites = iids; glow("clan", inv.length > 0 || (S.clan && S.clan.role !== "membro" && S.clan.requests?.length > 0));
}
