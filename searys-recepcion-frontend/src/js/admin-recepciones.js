// ============================================
// ADMIN-RECEPCIONES.JS - MÓDULO ES6
// ============================================
import { logger, notify, updateSyncBadge } from './utils.js';
import { OfflineManager } from './offline-manager.js';

// Las funciones del panel admin se exponen en window porque el HTML
// generado dinámicamente las llama por nombre en atributos onclick.
// Cuando el HTML use event delegation esto se puede limpiar.

// ============================================
// ABRIR / CERRAR PANEL
// ============================================

export function showAdminPanel() {
    const modal = document.createElement('div');
    modal.id = 'adminModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.8); z-index: 10000;
        display: flex; align-items: center; justify-content: center; padding: 20px;
    `;

    modal.innerHTML = `
        <div style="
            background: white; border-radius: 15px; max-width: 500px;
            width: 100%; max-height: 90vh; overflow-y: auto; padding: 20px;
        ">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <h2 style="margin:0;color:#4f46e5">🔧 Administración</h2>
                <button onclick="closeAdminPanel()" style="
                    border:none;background:none;font-size:28px;cursor:pointer;color:#64748b
                ">×</button>
            </div>
            <div id="adminContent"></div>
        </div>
    `;

    document.body.appendChild(modal);
    loadAdminContent();
}

export function closeAdminPanel() {
    const modal = document.getElementById('adminModal');
    if (modal) modal.remove();
}

// ============================================
// CONTENIDO DEL PANEL
// ============================================

async function loadAdminContent() {
    const content = document.getElementById('adminContent');
    if (!content) return;

    content.innerHTML = `
        <div style="text-align:center;padding:20px">
            <div style="font-size:40px;margin-bottom:10px">⏳</div>
            <div>Cargando información...</div>
        </div>
    `;

    const pending          = JSON.parse(localStorage.getItem('searys_pending_receptions') || '[]');
    const notSynced        = pending.filter(r => !r.synced);
    const synced           = pending.filter(r => r.synced);
    const blocked          = pending.filter(r => (r.syncAttempts || 0) >= 5);
    const pendingProducts  = JSON.parse(localStorage.getItem('searys_pending_products')  || '[]');
    const pendingSuppliers = JSON.parse(localStorage.getItem('searys_pending_suppliers') || '[]');

    let html = `
        <div style="
            background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
            color:white;padding:20px;border-radius:10px;margin-bottom:20px
        ">
            <div style="font-size:14px;opacity:.9;margin-bottom:10px">ESTADO DEL SISTEMA</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px">
                <div>
                    <div style="font-size:28px;font-weight:900">${notSynced.length}</div>
                    <div style="font-size:12px;opacity:.8">Pendientes</div>
                </div>
                <div>
                    <div style="font-size:28px;font-weight:900">${synced.length}</div>
                    <div style="font-size:12px;opacity:.8">Sincronizadas</div>
                </div>
            </div>
        </div>

        <div style="margin-bottom:20px">
            <div style="font-weight:700;margin-bottom:10px;color:#1e293b">⚡ ACCIONES RÁPIDAS</div>
    `;

    if (synced.length > 0) {
        html += `
            <button onclick="adminLimpiarSincronizadas()" style="
                width:100%;padding:15px;background:linear-gradient(135deg,#10b981 0%,#34d399 100%);
                color:white;border:none;border-radius:8px;font-weight:700;font-size:14px;
                margin-bottom:10px;cursor:pointer
            ">
                ✅ Limpiar ${synced.length} recepción${synced.length > 1 ? 'es' : ''} sincronizada${synced.length > 1 ? 's' : ''}
            </button>
        `;
    }

    if (blocked.length > 0) {
        html += `
            <button onclick="adminDesbloquear()" style="
                width:100%;padding:15px;background:linear-gradient(135deg,#f59e0b 0%,#fbbf24 100%);
                color:white;border:none;border-radius:8px;font-weight:700;font-size:14px;
                margin-bottom:10px;cursor:pointer
            ">
                🔓 Desbloquear ${blocked.length} recepción${blocked.length > 1 ? 'es' : ''}
            </button>
        `;
    }

    if (notSynced.length > 0) {
        html += `
            <button onclick="adminForzarSync()" style="
                width:100%;padding:15px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);
                color:white;border:none;border-radius:8px;font-weight:700;font-size:14px;
                margin-bottom:10px;cursor:pointer
            ">
                🔄 Intentar sincronizar ahora
            </button>
        `;
    }

    html += `</div>`;

    if (pending.length > 0) {
        html += `<div style="margin-bottom:20px"><div style="font-weight:700;margin-bottom:10px;color:#1e293b">📋 RECEPCIONES</div>`;

        pending.forEach(r => {
            const status      = r.synced ? '✅' : (r.syncAttempts >= 5 ? '🚫' : '⏳');
            const statusText  = r.synced ? 'Sincronizada' : (r.syncAttempts >= 5 ? 'Bloqueada' : 'Pendiente');
            const bgColor     = r.synced ? '#ecfdf5' : (r.syncAttempts >= 5 ? '#fef2f2' : '#fef3c7');
            const borderColor = r.synced ? '#10b981' : (r.syncAttempts >= 5 ? '#ef4444' : '#f59e0b');

            html += `
                <div style="
                    background:${bgColor};border:2px solid ${borderColor};
                    border-radius:8px;padding:12px;margin-bottom:10px
                ">
                    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
                        <div>
                            <div style="font-weight:700;font-size:16px;color:#1e293b">
                                ${status} Factura #${r.invoice_number}
                            </div>
                            <div style="font-size:12px;color:#64748b;margin-top:3px">
                                ${statusText} | ${r.total_items} items | $${(r.total_amount || 0).toLocaleString('es-CO')}
                            </div>
                        </div>
                    </div>
                    ${!r.synced ? `
                        <button onclick="adminEliminarRecepcion('${r.invoice_number}')" style="
                            width:100%;padding:8px;background:white;color:#ef4444;
                            border:1px solid #ef4444;border-radius:6px;
                            font-weight:600;font-size:12px;cursor:pointer
                        ">🗑️ Eliminar</button>
                    ` : ''}
                </div>
            `;
        });

        html += `</div>`;
    }

    if (pendingProducts.length > 0 || pendingSuppliers.length > 0) {
        html += `
            <div style="
                background:#fef3c7;border:2px solid #f59e0b;
                border-radius:8px;padding:12px;margin-bottom:15px
            ">
                <div style="font-weight:700;margin-bottom:8px;color:#d97706">⚠️ PENDIENTES DE SINCRONIZAR</div>
                ${pendingProducts.length  > 0 ? `<div style="font-size:13px;color:#92400e">📦 ${pendingProducts.length} producto(s)</div>`   : ''}
                ${pendingSuppliers.length > 0 ? `<div style="font-size:13px;color:#92400e">👥 ${pendingSuppliers.length} proveedor(es)</div>` : ''}
                <div style="font-size:12px;color:#78350f;margin-top:8px">
                    Sincroniza primero estos usando el botón 🔄 principal
                </div>
            </div>
        `;
    }

    if (pending.length > 0) {
        html += `
            <div style="margin-top:20px;padding-top:20px;border-top:1px solid #e2e8f0">
                <button onclick="adminBorrarTodo()" style="
                    width:100%;padding:12px;background:white;color:#ef4444;
                    border:2px solid #ef4444;border-radius:8px;
                    font-weight:700;font-size:13px;cursor:pointer
                ">⚠️ BORRAR TODAS (Peligroso)</button>
            </div>
        `;
    }

    content.innerHTML = html;
}

// ============================================
// ACCIONES DE ADMINISTRACIÓN
// (en window por los onclick inline del HTML generado)
// ============================================

window.showAdminPanel  = showAdminPanel;
window.closeAdminPanel = closeAdminPanel;

window.adminLimpiarSincronizadas = function() {
    const pending = JSON.parse(localStorage.getItem('searys_pending_receptions') || '[]');
    const synced  = pending.filter(r => r.synced);

    if (synced.length === 0) { alert('✅ No hay recepciones sincronizadas que limpiar'); return; }

    if (confirm(`¿Eliminar ${synced.length} recepción(es) ya sincronizada(s)?\n\nEstas ya están guardadas en el servidor.`)) {
        localStorage.setItem('searys_pending_receptions', JSON.stringify(pending.filter(r => !r.synced)));
        updateSyncBadge();
        notify(`✅ ${synced.length} recepción(es) limpiadas`, 'success');
        loadAdminContent();
    }
};

window.adminDesbloquear = function() {
    const pending = JSON.parse(localStorage.getItem('searys_pending_receptions') || '[]');
    let count = 0;

    pending.forEach(r => {
        if ((r.syncAttempts || 0) >= 5) {
            r.syncAttempts = 0;
            r.lastAttempt  = null;
            count++;
        }
    });

    if (count > 0) {
        localStorage.setItem('searys_pending_receptions', JSON.stringify(pending));
        notify(`✅ ${count} recepción(es) desbloqueadas`, 'success');
        loadAdminContent();
    }
};

window.adminForzarSync = async function() {
    closeAdminPanel();
    notify('🔄 Sincronizando...', 'success');

    // forceSyncPendingReceptions se define en main.js; si no está disponible,
    // caemos al OfflineManager directamente.
    if (typeof window.forceSyncPendingReceptions === 'function') {
        await window.forceSyncPendingReceptions();
    } else {
        const hasConnection = await OfflineManager.checkConnection(2);
        if (!hasConnection) { notify('❌ Sin conexión a internet', 'error'); return; }

        try {
            const result = await OfflineManager.syncPendingReceptions();
            if (result.synced > 0)       notify(`✅ ${result.synced} recepción(es) sincronizadas`, 'success');
            if (result.errors.length > 0) notify(`⚠️ ${result.errors.length} error(es)`, 'error');
            updateSyncBadge();
        } catch (e) {
            notify('❌ Error: ' + e.message, 'error');
        }
    }
};

window.adminEliminarRecepcion = function(invoiceNumber) {
    if (confirm(`⚠️ ¿ELIMINAR recepción #${invoiceNumber}?\n\nEsta acción NO se puede deshacer.`)) {
        const pending = JSON.parse(localStorage.getItem('searys_pending_receptions') || '[]');
        localStorage.setItem('searys_pending_receptions',
            JSON.stringify(pending.filter(r => r.invoice_number !== invoiceNumber)));
        updateSyncBadge();
        notify(`✅ Recepción #${invoiceNumber} eliminada`, 'success');
        loadAdminContent();
    }
};

window.adminBorrarTodo = function() {
    const pending   = JSON.parse(localStorage.getItem('searys_pending_receptions') || '[]');
    const notSynced = pending.filter(r => !r.synced);

    let msg = `⚠️⚠️⚠️ ADVERTENCIA ⚠️⚠️⚠️\n\n`;
    msg += `Esto eliminará ${pending.length} recepciones:\n`;
    msg += `- ${pending.length - notSynced.length} sincronizadas\n`;
    msg += `- ${notSynced.length} pendientes\n\n`;
    if (notSynced.length > 0) msg += `PERDERÁS ${notSynced.length} RECEPCIÓN(ES) NO SINCRONIZADA(S)\n\n`;
    msg += `¿Estás ABSOLUTAMENTE SEGURO?`;

    if (!confirm(msg)) return;
    if (!confirm('ÚLTIMA CONFIRMACIÓN\n\n¿Borrar TODAS las recepciones?')) return;

    localStorage.removeItem('searys_pending_receptions');
    updateSyncBadge();
    notify(`✅ Todas las recepciones eliminadas`, 'success');
    closeAdminPanel();
};

logger.success('admin-recepciones.js cargado');