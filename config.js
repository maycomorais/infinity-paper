// config.js — Papelaria & Xerox Manager

const SUPABASE_URL = 'https://sgwiroapucpxknmqgqfj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnd2lyb2FwdWNweGtubXFncWZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MzIxNzMsImV4cCI6MjA5ODEwODE3M30.HjP09ER72eOHHvuFAfjv9eb8e3iUcE_u3Vw7mHFYcsk';

const APP_CONFIG = {
  nome: 'Papelaria Manager',
  versao: '1.0.0',
  // Cotação padrão inicial (Gs por R$1)
  cotacaoBRL: 1150,
  caixa_aberto_key: 'pm_caixa_sessao',
  cotacao_key: 'pm_cotacao_brl',
};
 
// Carrega cotação salva
APP_CONFIG.cotacaoBRL = parseFloat(localStorage.getItem(APP_CONFIG.cotacao_key) || APP_CONFIG.cotacaoBRL);
 
function setCotacao(valor) {
  APP_CONFIG.cotacaoBRL = parseFloat(valor) || 1150;
  localStorage.setItem(APP_CONFIG.cotacao_key, String(APP_CONFIG.cotacaoBRL));
}
 
// Formata Guaraní (₲) — sem decimais
function formatMoney(value) {
  const v = Math.round(value || 0);
  return '₲\u202f' + v.toLocaleString('es-PY');
}
 
// Formata Real brasileiro
function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}
 
// Converte BRL → PYG
function brlToGs(valorBRL) {
  return Math.round((parseFloat(valorBRL) || 0) * APP_CONFIG.cotacaoBRL);
}
 
// Converte PYG → BRL
function gsToBRL(valorGs) {
  if (!APP_CONFIG.cotacaoBRL) return 0;
  return (parseFloat(valorGs) || 0) / APP_CONFIG.cotacaoBRL;
}
 
function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(dateStr));
}
 
function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(dateStr));
}
 
function toast(msg, type = 'info', duration = 3500) {
  const existing = document.getElementById('pm-toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'pm-toast';
  el.className = `pm-toast pm-toast--${type}`;
  el.innerHTML = `<span>${msg}</span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('pm-toast--show'));
  setTimeout(() => { el.classList.remove('pm-toast--show'); setTimeout(() => el.remove(), 400); }, duration);
}
 
function debounce(fn, delay = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
 
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Adicione ao final do arquivo, antes de exportar
async function loadEmpresaConfig() {
  try {
    const { data } = await sb.from('empresa').select('config').single();
    if (data?.config) {
      State.empresa.config = data.config;
    }
  } catch (_) {}
}
window.loadEmpresaConfig = loadEmpresaConfig;
 
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.APP_CONFIG = APP_CONFIG;
window.formatMoney = formatMoney;
window.formatBRL = formatBRL;
window.brlToGs = brlToGs;
window.gsToBRL = gsToBRL;
window.setCotacao = setCotacao;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.toast = toast;
window.debounce = debounce;
window.uuid = uuid;