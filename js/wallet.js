// Carteira (USDT): 100 gemas = 1 USDT. Compra de gemas por depósito confirmado pelo dono, saque só de gemas
// recebidas de outros jogadores, com taxa, limite diário e conferência do fundo de lastro. Tudo validado no servidor.
import { S, fmt } from "./sim.js";
import { api } from "./net.js";
import { act, toast } from "./ui.js";

const $ = id => document.getElementById(id);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NET = { polygon: "Polygon (USDT)", bep20: "BEP-20 BSC (USDT)", trc20: "TRC-20 TRON (USDT)", pix: "PIX" };
const ST = { pending: ["esperando", "var(--gold)"], confirmed: ["confirmado", "var(--green)"], rejected: ["recusado", "var(--red)"], approved: ["aprovado", "var(--blue)"], paid: ["pago", "var(--green)"] };
const usd = v => "US$ " + Number(v).toFixed(2);

export async function renderWallet(box) {
  box.innerHTML = `<div class="muted">carregando…</div>`;
  let w; try { w = await api.wallet(); } catch (e) { box.innerHTML = esc(e.message); return; }
  const k = w.config, rate = k.gems_per_usdt, rec = k.receive || {};
  box.innerHTML = `<div class="walletTop"><div class="wcard"><small>Gemas</small><b>💎 ${fmt(w.gems)}</b><small>≈ ${usd(w.gems / rate)}</small></div><div class="wcard"><small>Sacáveis</small><b>💎 ${fmt(w.withdrawable)}</b><small>≈ ${usd(w.withdrawable / rate)} · só o que veio de outros jogadores</small></div><div class="wcard"><small>Lastro do jogo</small><b>${usd(w.backing.usdt)}</b><small>${usd(w.backing.pending_usdt)} em saques pendentes</small></div></div>
    <p class="muted">${rate} gemas = 1 USDT. O jogo nunca paga mais do que o fundo de lastro tem: cada compra de gemas põe ${Math.round(85)}% no fundo dos jogadores. Gemas que você recebe vendendo no Market, em ordens de compra ou em trocas podem ser sacadas.</p>
    <div class="split"><div><h4>Comprar gemas</h4>
      ${k.packages.map(p => `<label class="pkg"><input type="radio" name="pkg" value="${p.id}"><b>💎 ${fmt(p.gems)}</b><span>${usd(p.usdt)}</span></label>`).join("")}
      <label class="auto"><span>Pagar com</span><select id="dMethod">${Object.keys(rec).some(m => rec[m]) ? "" : `<option value="">nenhum método configurado ainda</option>`}${Object.entries(NET).map(([id, n]) => `<option value="${id}" ${rec[id] ? "" : "disabled"}>${n}${rec[id] ? "" : " (sem endereço)"}</option>`).join("")}</select></label>
      <div id="dAddr" class="addr"></div>
      <label class="auto"><span>Hash da transação ou código do PIX</span><input id="dRef" type="text" placeholder="cole aqui depois de pagar"></label>
      <div class="actions"><button class="primary" id="dGo">Avisar pagamento</button></div><p class="muted">As gemas entram quando o pagamento é conferido.</p></div>
    <div><h4>Sacar em USDT</h4>
      <label class="auto"><span>Gemas</span><input id="wGems" type="number" min="${k.withdraw_min_gems}" step="100" value="${Math.max(k.withdraw_min_gems, Math.floor(w.withdrawable / 100) * 100)}"></label>
      <label class="auto"><span>Rede</span><select id="wNet">${k.networks.map(n => `<option value="${n}">${NET[n]}</option>`).join("")}</select></label>
      <label class="auto"><span>Endereço da sua carteira</span><input id="wAddr" type="text" placeholder="0x… ou T…"></label>
      <div id="wSum" class="muted"></div>
      <div class="actions"><button class="primary" id="wGo">Pedir saque</button></div>
      <p class="muted">Mínimo ${fmt(k.withdraw_min_gems)} gemas, taxa de ${k.withdraw_fee_pct}% (volta pro fundo), até ${fmt(k.withdraw_daily_max_gems)} gemas por dia (hoje: ${fmt(w.today)}). Nível ${k.withdraw_min_level}+ e conta com ${k.withdraw_min_account_days}+ dias.</p></div></div>
    <div class="split"><div><h4>Meus depósitos</h4>${w.deposits.map(d => `<div class="row"><span>${new Date(d.created_at).toLocaleDateString("pt-BR")} · 💎 ${fmt(d.gems)} · ${NET[d.method]}</span><b style="color:${ST[d.status][1]}">${ST[d.status][0]}</b></div>`).join("") || '<div class="muted">Nenhum.</div>'}</div>
      <div><h4>Meus saques</h4>${w.withdrawals.map(x => `<div class="row"><span>${new Date(x.created_at).toLocaleDateString("pt-BR")} · ${usd(x.usdt)} · ${NET[x.network]}</span><b style="color:${ST[x.status][1]}">${ST[x.status][0]}</b></div>${x.tx_hash ? `<small class="muted mono">tx ${esc(x.tx_hash)}</small>` : ""}`).join("") || '<div class="muted">Nenhum.</div>'}</div></div>
    ${w.admin ? `<div id="adminBox" class="adminbox"><div class="muted">carregando painel do dono…</div></div>` : ""}`;
  const showAddr = () => { const m = $("dMethod").value; $("dAddr").innerHTML = rec[m] ? `Envie pra: <b class="mono">${esc(rec[m])}</b>` : `<span class="warn">Esse método ainda não tem endereço de recebimento.</span>`; };
  $("dMethod").onchange = showAddr; const first = Object.keys(NET).find(m => rec[m]); if (first) $("dMethod").value = first; showAddr();
  $("dGo").onclick = () => { const p = box.querySelector("input[name=pkg]:checked"); if (!p) return toast("Escolha um pacote.", true); act(() => api.deposit(p.value, $("dMethod").value, $("dRef").value.trim()).then(() => null), "Pagamento avisado. Aguarde a confirmação.").then(() => renderWallet(box)); };
  const sum = () => { const g = +$("wGems").value || 0, fee = Math.ceil(g * k.withdraw_fee_pct / 100); $("wSum").textContent = `Você recebe ${usd((g - fee) / rate)} (taxa de ${fmt(fee)} gemas).`; };
  $("wGems").oninput = sum; sum();
  $("wGo").onclick = () => act(() => api.withdraw(+$("wGems").value, $("wNet").value, $("wAddr").value.trim()).then(() => api.state()), "Saque pedido. As gemas ficam reservadas até o pagamento.").then(() => renderWallet(box));
  if (w.admin) renderAdmin($("adminBox"), box, rec);
}
async function renderAdmin(el, box, rec) {
  let a; try { a = await api.adminP2e(); } catch (e) { el.innerHTML = esc(e.message); return; }
  const t = a.treasury;
  el.innerHTML = `<h4>Painel do dono</h4><div class="walletTop"><div class="wcard"><small>Fundo de lastro</small><b>${usd(t.usdt_balance)}</b></div><div class="wcard"><small>Receita da plataforma</small><b>${usd(t.platform_revenue)}</b></div><div class="wcard"><small>Gemas emitidas / queimadas</small><b>${fmt(t.gems_issued)} / ${fmt(t.gems_burned)}</b></div></div>
    <h4>Endereços de recebimento</h4>${["polygon", "bep20", "trc20", "pix"].map(m => `<label class="auto"><span>${NET[m]}</span><input type="text" data-rec="${m}" value="${esc(rec[m] || "")}" placeholder="vazio = desligado"></label>`).join("")}<div class="actions"><button id="recSave">Salvar endereços</button></div>
    <h4>Depósitos esperando (${a.deposits.length})</h4>${a.deposits.map(d => `<div class="order"><div class="row"><b>${esc(d.name)}</b><span>💎 ${fmt(d.gems)} · ${usd(d.usdt)} · ${NET[d.method]}</span></div><small class="mono">${esc(d.reference)}</small><div class="actions"><button class="primary" data-adep="${d.id}" data-a="confirmar">Confirmar (credita gemas)</button><button class="danger" data-adep="${d.id}" data-a="rejeitar">Recusar</button></div></div>`).join("") || '<div class="muted">Nenhum.</div>'}
    <h4>Saques abertos (${a.withdrawals.length})</h4>${a.withdrawals.map(w => `<div class="order"><div class="row"><b>${esc(w.name)}</b><span>${usd(w.usdt)} · ${NET[w.network]} · ${w.status === "approved" ? "aprovado" : "esperando"}</span></div><small class="mono">${esc(w.address)}</small><div class="actions">${w.status === "pending" ? `<button data-awd="${w.id}" data-a="aprovar">Aprovar</button>` : ""}<input type="text" placeholder="hash da transferência" data-tx="${w.id}"><button class="primary" data-awd="${w.id}" data-a="pagar">Marcar pago</button><button class="danger" data-awd="${w.id}" data-a="rejeitar">Recusar e devolver</button></div></div>`).join("") || '<div class="muted">Nenhum.</div>'}`;
  $("recSave").onclick = () => { const o = {}; el.querySelectorAll("[data-rec]").forEach(i => o[i.dataset.rec] = i.value.trim()); act(() => api.adminReceive(o).then(() => null), "Endereços salvos").then(() => renderWallet(box)); };
  el.querySelectorAll("[data-adep]").forEach(b => b.onclick = () => act(() => api.adminDeposit(b.dataset.adep, b.dataset.a).then(() => null), b.dataset.a === "confirmar" ? "Depósito confirmado" : "Depósito recusado").then(() => renderWallet(box)));
  el.querySelectorAll("[data-awd]").forEach(b => b.onclick = () => act(() => api.adminWithdrawal(b.dataset.awd, b.dataset.a, el.querySelector(`[data-tx="${b.dataset.awd}"]`)?.value.trim()).then(() => null), "Feito").then(() => renderWallet(box)));
}
