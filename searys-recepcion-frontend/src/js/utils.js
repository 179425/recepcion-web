// ============================================
// UTILS.JS - MÓDULO BASE (sin dependencias)
// ============================================
// Este archivo no importa nada de otros módulos del proyecto.
// Las funciones que necesitan colaborar con OfflineManager o history.js
// usan inyección de dependencias: reciben las funciones como parámetros,
// o se registran mediante setters después de la carga de cada módulo.
// Esto rompe cualquier posible ciclo de imports.
// ============================================


// ============================================
// SISTEMA DE LOGGING
// ============================================

export const logger = {
    info:    (msg) => console.log('ℹ️',  msg),
    success: (msg) => console.log('✅', msg),
    error:   (msg) => console.error('❌', msg),
    warn:    (msg) => console.warn('⚠️',  msg)
};


// ============================================
// ATAJO getElementById
// ============================================

export function $(id) {
    const element = document.getElementById(id);
    if (!element) {
        logger.warn(`Elemento no encontrado: ${id}`);
    }
    return element;
}


// ============================================
// NOTIFICACIONES
// ============================================

export function notify(msg, type = 'success') {
    try {
        const box = $('msgBox');
        if (!box) return;

        box.textContent = msg;
        box.style.background = type === 'error' ? '#ef4444' : '#10b981';
        box.style.display = 'block';

        setTimeout(() => { box.style.display = 'none'; }, 3000);
    } catch (error) {
        logger.error('Error en notify: ' + error.message);
    }
}


// ============================================
// VIBRACIÓN
// ============================================

export function vibrate(pattern) {
    try {
        if ('vibrate' in navigator) navigator.vibrate(pattern);
    } catch (error) {
        logger.error('Error en vibrate: ' + error.message);
    }
}


// ============================================
// BADGE DE SINCRONIZACIÓN
// Depende de OfflineManager, que a su vez importa utils.js.
// Solución: OfflineManager se inyecta desde main.js con setOfflineManager()
// después de que ambos módulos estén cargados.
// ============================================

let _offlineManager = null;

/** Llamar desde main.js: setOfflineManager(OfflineManager) */
export function setOfflineManager(om) {
    _offlineManager = om;
}

export function updateSyncBadge() {
    try {
        const syncButton = $('syncButton');
        const badge      = $('syncBadge');
        if (!syncButton || !badge) return;

        if (!_offlineManager) {
            logger.warn('updateSyncBadge: OfflineManager no inyectado aún');
            return;
        }

        const stats             = _offlineManager.getCacheStats();
        const pendingReceptions = stats.pendingReceptions || 0;
        const pendingProducts   = stats.pendingProducts   || 0;
        const pendingSuppliers  = stats.pendingSuppliers  || 0;
        const totalPending      = pendingReceptions + pendingProducts + pendingSuppliers;

        logger.info(`Actualizando badge: ${totalPending} items pendientes`);

        if (totalPending > 0) {
            syncButton.style.display = 'block';
            badge.textContent = totalPending;

            if (pendingProducts > 0) {
                badge.style.background = '#f59e0b';   // naranja — productos
            } else if (pendingSuppliers > 0) {
                badge.style.background = '#8b5cf6';   // púrpura — proveedores
            } else {
                badge.style.background = '#ef4444';   // rojo — recepciones
            }
        } else {
            syncButton.style.display = 'none';
        }
    } catch (error) {
        logger.error('Error en updateSyncBadge: ' + error.message);
    }
}

export function showDetailedSyncStatus() {
    if (!_offlineManager) {
        alert('OfflineManager no disponible');
        return;
    }

    const stats            = _offlineManager.getCacheStats();
    const pendingProducts  = JSON.parse(localStorage.getItem('searys_pending_products')  || '[]');
    const pendingSuppliers = JSON.parse(localStorage.getItem('searys_pending_suppliers') || '[]');
    const pendingReceptions = _offlineManager.loadPendingReceptions().filter(r => !r.synced);

    let message = '📊 ESTADO DE SINCRONIZACIÓN\n\n';

    message += `📦 PRODUCTOS PENDIENTES: ${stats.pendingProducts}\n`;
    if (pendingProducts.length > 0) {
        message += '\nProductos:\n';
        pendingProducts.forEach((p, i) => {
            message += `${i + 1}. ${p.product.name} (ID temp: ${p.tempId.substr(0, 15)}...)\n`;
        });
    }

    message += `\n👥 PROVEEDORES PENDIENTES: ${stats.pendingSuppliers}\n`;
    if (pendingSuppliers.length > 0) {
        message += '\nProveedores:\n';
        pendingSuppliers.forEach((s, i) => {
            message += `${i + 1}. ${s.supplier.name}\n`;
        });
    }

    message += `\n📤 RECEPCIONES PENDIENTES: ${stats.pendingReceptions}\n`;
    if (pendingReceptions.length > 0) {
        message += '\nRecepciones:\n';
        pendingReceptions.forEach((r, i) => {
            message += `${i + 1}. Factura #${r.invoice_number} (${r.total_items} items)\n`;
        });
    }

    message += `\n✅ RECEPCIONES SINCRONIZADAS: ${stats.syncedReceptions}`;
    message += `\n📅 Última sincronización: ${stats.lastSync ? new Date(stats.lastSync).toLocaleString('es-CO') : 'Nunca'}`;
    message += `\n💾 Inventario: ${stats.inventoryCount} productos`;
    message += `\n🏢 Proveedores: ${stats.suppliersCount}`;

    alert(message);
}


// ============================================
// NAVEGACIÓN ENTRE VISTAS
// Depende de cargarHistorial (history.js), que importa utils.js.
// Solución: history.js llama setCargarHistorial() al cargarse.
// ============================================

let _cargarHistorial = null;

/** Llamar desde history.js: setCargarHistorial(cargarHistorial) */
export function setCargarHistorial(fn) {
    _cargarHistorial = fn;
}

export function switchView(view) {
    try {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

        if (view === 'recepcion') {
            const viewRecepcion = $('viewRecepcion');
            const tabRecepcion  = $('tabRecepcion');
            if (viewRecepcion) viewRecepcion.classList.add('active');
            if (tabRecepcion)  tabRecepcion.classList.add('active');

        } else if (view === 'historial') {
            const viewHistorial = $('viewHistorial');
            const tabHistorial  = $('tabHistorial');
            if (viewHistorial) viewHistorial.classList.add('active');
            if (tabHistorial)  tabHistorial.classList.add('active');

            if (_cargarHistorial) {
                _cargarHistorial(true);
            } else {
                logger.warn('switchView: cargarHistorial no inyectado aún');
            }
        }
    } catch (error) {
        logger.error('Error en switchView: ' + error.message);
    }
}


// ============================================
// DETECCIÓN DE TECLADO VIRTUAL
// ============================================

export function setupKeyboardDetection() {
    try {
        const summary = $('cartSummary');
        if (!summary) return;

        let lastHeight    = window.innerHeight;
        let isKeyboardOpen = false;
        let hideTimeout   = null;

        const hideResumen = () => {
            const isRecepcionView = $('viewRecepcion')?.classList.contains('active');
            if (summary && isRecepcionView) {
                summary.style.display      = 'none';
                summary.style.opacity      = '0';
                summary.style.pointerEvents = 'none';
                summary.style.transform    = 'translateY(100%)';
                isKeyboardOpen = true;
                document.body.classList.add('keyboard-open');
            }
        };

        const showResumen = () => {
            const isRecepcionView = $('viewRecepcion')?.classList.contains('active');
            if (summary && isRecepcionView) {
                summary.style.display      = 'block';
                summary.style.opacity      = '1';
                summary.style.pointerEvents = 'auto';
                summary.style.transform    = 'translateY(0)';
                isKeyboardOpen = false;
                document.body.classList.remove('keyboard-open');
            }
        };

        // MÉTODO 1: Cambio de altura de ventana
        const checkHeight = () => {
            const currentHeight = window.innerHeight;
            const heightDiff    = lastHeight - currentHeight;
            if (heightDiff > 100  && !isKeyboardOpen) hideResumen();
            if (heightDiff < -100 &&  isKeyboardOpen) showResumen();
            lastHeight = currentHeight;
        };
        window.addEventListener('resize', checkHeight);

        // MÉTODO 2: Focus en inputs
        document.addEventListener('focusin', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
                hideResumen();
            }
        });

        document.addEventListener('focusout', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                hideTimeout = setTimeout(() => {
                    const active = document.activeElement;
                    if (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA') {
                        showResumen();
                    }
                    hideTimeout = null;
                }, 200);
            }
        });

        // MÉTODO 3: VisualViewport API
        if (window.visualViewport) {
            let vpHeight = window.visualViewport.height;
            window.visualViewport.addEventListener('resize', () => {
                const currentVpHeight = window.visualViewport.height;
                const vpDiff          = vpHeight - currentVpHeight;
                if (vpDiff > 50  && !isKeyboardOpen) hideResumen();
                if (vpDiff < -50 &&  isKeyboardOpen) showResumen();
                vpHeight = currentVpHeight;
            });
        }

        // Scroll suave al enfocar input de búsqueda
        const findInput = $('find');
        if (findInput) {
            findInput.addEventListener('focus', () => {
                hideResumen();
                setTimeout(() => findInput.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
            });
        }

        logger.success('Detección de teclado configurada');
    } catch (error) {
        logger.error('Error en setupKeyboardDetection: ' + error.message);
    }
}

logger.success('utils.js cargado');