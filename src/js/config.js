// ============================================
// CONFIG.JS - MÓDULO DE CONFIGURACIÓN Y ESTADO
// ============================================
// Exporta constantes de Supabase y los arrays de estado compartido.
// IMPORTANTE: inventory, suppliers y cart son arrays mutables compartidos.
// Otros módulos los importan y los mutan EN SITIO (push, splice, .length=0)
// porque los bindings ES6 son de solo lectura — nunca hacer array = [].
// ============================================
import { logger } from './utils.js';

// ── Supabase ────────────────────────────────────────────────────────────────

export const SUPABASE_URL = 'https://megjcvscblwxikirqchw.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZ2pjdnNjYmx3eGlraXJxY2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzNDE4OTQsImV4cCI6MjA3ODkxNzg5NH0.Kd9ZdnUf5hF92B84vh3RUA00vsR5ohbFjHkqRp645QA';

export let sb = null;

export function initSupabase() {
    if (typeof supabase !== 'undefined' && !sb) {
        sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        logger.success('Cliente Supabase inicializado');
        return true;
    }
    return false;
}

// Auto-inicializar si la librería ya está disponible al cargar este módulo
if (typeof supabase !== 'undefined') {
    initSupabase();
}

// ── Estado global compartido ─────────────────────────────────────────────────
// Mutar siempre en sitio. Ejemplo correcto:
//   inventory.length = 0; inventory.push(...data);  ✅
//   inventory = data;                                ❌ rompe otros imports

export let inventory        = [];
export let suppliers        = [];
export let cart             = [];
export let currentSupplier  = null;
export let currentTaxEdit   = null;
export let historyPage      = 1;

export const HISTORY_PAGE_SIZE = 10;

// ── Setters para las variables primitivas ────────────────────────────────────
// Los primitivos y referencias a objetos (null/objeto) no se pueden mutar
// en sitio, así que exponemos setters explícitos que otros módulos usan
// en lugar de reasignar el binding directamente.

export function setCurrentSupplier(value)      { currentSupplier       = value; }
export function setCurrentTaxEdit(value)        { currentTaxEdit        = value; }
export function setHistoryPage(value)           { historyPage           = value; }

logger.success('config.js cargado - Variables inicializadas');