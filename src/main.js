// ============================================
// MAIN.JS - ORQUESTADOR PRINCIPAL (ES6)
// ============================================
// Este es el único punto de entrada. Importa todos los módulos,
// inyecta las dependencias circulares resueltas y arranca la app.
// ============================================
import { $, logger, notify, updateSyncBadge, setupKeyboardDetection,
         setOfflineManager, switchView } from './js/utils.js';
import { initSupabase, inventory, suppliers, cart } from './js/config.js';
import { OfflineManager } from './js/offline-manager.js';
import { renderCart, updateCartAfterSync, vaciarCarrito, agregarAlCarrito } from './js/cart.js';
import { cargarInventario, renderProductSearch,
         openProductModal, closeProductModal,
         calcularPrecios, crearProducto } from './js/products.js';
import { cargarProveedores, openSupplierModal, closeSupplierModal,
         renderSuppliers, crearProveedor } from './js/suppliers.js';
import { confirmarRecepcion } from './js/reception.js';
import { cargarHistorial, refreshHistorial } from './js/history.js';
import { showAdminPanel } from './js/admin-recepciones.js';

// ── Inyección de dependencias ────────────────────────────────────────────────
// utils.js no puede importar OfflineManager (ciclo), así que se lo pasamos
// aquí, una vez que ambos módulos están cargados.
setOfflineManager(OfflineManager);
// history.js ya llama setCargarHistorial() al cargarse — no hace falta aquí.
// products.js ya llama setCalcularPrecios() al cargarse — no hace falta aquí.

// ============================================
// ESPERAR SUPABASE
// ============================================

function waitForSupabase() {
    return new Promise((resolve) => {
        if (typeof supabase !== 'undefined' && typeof sb !== 'undefined' && sb !== null) {
            logger.success('Supabase ya disponible');
            resolve(true);
            return;
        }

        let attempts    = 0;
        const maxAttempts = 100;

        const checkInterval = setInterval(() => {
            attempts++;

            if (typeof supabase !== 'undefined') {
                initSupabase();

                // sb es el binding de config.js; lo leemos via import
                import('./js/config.js').then(({ sb }) => {
                    if (sb !== null) {
                        clearInterval(checkInterval);
                        logger.success(`Supabase inicializado después de ${attempts} intentos`);
                        resolve(true);
                    }
                });
            }

            if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                logger.warn('Timeout esperando Supabase, continuando en modo offline');
                resolve(false);
            }
        }, 50);
    });
}

// ============================================
// ESTADO DE CONEXIÓN
// ============================================

function updateConnectionStatus(online) {
    const indicator = $('connectionIndicator');
    if (!indicator) return;

    if (online) {
        indicator.innerHTML        = '🟢 Online';
        indicator.style.background = '#10b981';
    } else {
        indicator.innerHTML        = '🔴 Offline';
        indicator.style.background = '#ef4444';
    }
}

// ============================================
// CARGAR DATOS CON REINTENTOS
// ============================================

async function loadDataFromServer(dataType = 'both') {
    const MAX_RETRIES = 3;
    let retries = 0;

    while (retries < MAX_RETRIES) {
        try {
            logger.info(`Intento ${retries + 1}/${MAX_RETRIES} de cargar ${dataType}...`);

            if (dataType === 'suppliers' || dataType === 'both') {
                const suppliersData = await cargarProveedores();
                if (suppliersData && suppliersData.length > 0) {
                    logger.success(`Proveedores cargados: ${suppliersData.length}`);
                }
            }

            if (dataType === 'inventory' || dataType === 'both') {
                const inventoryData = await cargarInventario();
                if (inventoryData && inventoryData.length > 0) {
                    logger.success(`Inventario cargado: ${inventoryData.length}`);
                }
            }

            return true;

        } catch (error) {
            retries++;
            logger.error(`Error en intento ${retries}: ${error.message}`);

            if (retries < MAX_RETRIES) {
                const waitTime = Math.min(1000 * Math.pow(2, retries), 5000);
                logger.info(`Esperando ${waitTime}ms antes de reintentar...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    logger.warn(`No se pudo cargar datos del servidor después de ${MAX_RETRIES} intentos`);
    return false;
}

// ============================================
// SINCRONIZACIÓN CON NOTIFICACIONES
// ============================================

async function syncWithProgressNotifications() {
    try {
        notify('📤 Iniciando sincronización...', 'success');

        logger.info('=== SINCRONIZACIÓN MANUAL INICIADA ===');
        logger.info('Estado ANTES: inventory=' + inventory.length);

        const tempProductsInMemory = inventory.filter(p => String(p.id).startsWith('temp_'));
        if (tempProductsInMemory.length > 0) {
            logger.warn(`Productos temporales en memoria: ${tempProductsInMemory.length}`);
        }

        const syncResult = await OfflineManager.syncPendingReceptions();

        logger.info('Estado DESPUÉS: inventory=' + inventory.length);

        const tempProductsAfter = inventory.filter(p => String(p.id).startsWith('temp_'));
        if (tempProductsAfter.length > 0) {
            logger.warn(`AÚN HAY productos temporales: ${tempProductsAfter.length}`);
        } else {
            logger.success('Todos los IDs temporales fueron reemplazados');
        }

        let message = '📊 RESULTADO DE SINCRONIZACIÓN:\n\n';

        if (syncResult.supplierSync) {
            if (syncResult.supplierSync.synced > 0) {
                message += `✅ ${syncResult.supplierSync.synced} proveedores sincronizados\n`;
                notify(`✅ ${syncResult.supplierSync.synced} proveedores sincronizados`, 'success');
            }
            if (syncResult.supplierSync.errors.length > 0) {
                message += `❌ ${syncResult.supplierSync.errors.length} proveedores con errores\n`;
            }
        }

        if (syncResult.productSync) {
            if (syncResult.productSync.synced > 0) {
                message += `✅ ${syncResult.productSync.synced} productos sincronizados\n`;
                notify(`✅ ${syncResult.productSync.synced} productos sincronizados`, 'success');

                if (syncResult.productSync.mapping && Object.keys(syncResult.productSync.mapping).length > 0) {
                    logger.info('Mapeo de IDs:');
                    Object.entries(syncResult.productSync.mapping).forEach(([tempId, realId]) => {
                        logger.info(`  ${tempId} → ${realId}`);
                    });
                }
            }

            const supplierMapping = syncResult.supplierSync?.mapping || {};
            const productMapping  = syncResult.productSync?.mapping  || {};
            updateCartAfterSync(productMapping, supplierMapping);

            if (syncResult.productSync.errors.length > 0) {
                message += `❌ ${syncResult.productSync.errors.length} productos con errores\n`;
            }
        }

        if (syncResult.synced > 0) {
            message += `✅ ${syncResult.synced} recepciones sincronizadas\n`;
            notify(`✅ ${syncResult.synced} recepciones sincronizadas`, 'success');
        }

        if (syncResult.errors.length > 0) {
            message += `\n❌ ${syncResult.errors.length} recepciones con errores:\n`;
            syncResult.errors.forEach((e, i) => {
                message += `${i + 1}. Factura #${e.reception}: ${e.error}\n`;
            });
            notify(`⚠️ ${syncResult.errors.length} recepciones con errores`, 'error');
        }

        if (syncResult.synced > 0 && syncResult.errors.length === 0) {
            message += '\n🎉 ¡Sincronización completada exitosamente!';

            logger.info('Recargando inventario desde servidor...');
            await loadDataFromServer('inventory');
            notify('✅ Inventario actualizado desde servidor', 'success');

            logger.info('Inventario final: ' + inventory.length + ' productos');
        }

        alert(message);
        updateSyncBadge();

    } catch (error) {
        logger.error('Error en sincronización: ' + error.message);
        notify('❌ Error en sincronización: ' + error.message, 'error');
    }
}

// ============================================
// LISTENER DE CONEXIÓN
// ============================================

function setupConnectionListener() {
    let reconnectTimeout = null;

    window.addEventListener('online', async () => {
        logger.success('Conexión restaurada');
        updateConnectionStatus(true);

        if (reconnectTimeout) clearTimeout(reconnectTimeout);

        reconnectTimeout = setTimeout(async () => {
            notify('🟢 Conexión restaurada', 'success');

            const hasConnection = await OfflineManager.checkConnection(2);
            if (!hasConnection) {
                logger.warn('Conexión inestable, esperando...');
                notify('⚠️ Verificando conexión...', 'error');
                return;
            }

            try {
                const success = await loadDataFromServer('both');
                if (success) logger.success('Datos actualizados desde servidor');
            } catch (error) {
                logger.error('Error actualizando datos: ' + error.message);
            }

            const stats = OfflineManager.getCacheStats();
            if (stats.pendingReceptions > 0 || stats.pendingProducts > 0 || stats.pendingSuppliers > 0) {
                if (confirm(`📤 Conexión restaurada!\n\nTienes:\n• ${stats.pendingProducts} productos nuevos\n• ${stats.pendingSuppliers} proveedores nuevos\n• ${stats.pendingReceptions} recepciones pendientes\n\n¿Sincronizar ahora?`)) {
                    await syncWithProgressNotifications();
                }
            } else {
                notify('✅ Todo sincronizado', 'success');
            }
        }, 2000);
    });

    window.addEventListener('offline', () => {
        logger.warn('Conexión perdida');
        updateConnectionStatus(false);
        notify('🔴 Sin conexión - Modo offline activado', 'error');

        const stats = OfflineManager.getCacheStats();
        logger.info(`Datos en caché: ${stats.inventoryCount} productos, ${stats.suppliersCount} proveedores`);
    });
}

// ============================================
// FUNCIONES GLOBALES (llamadas desde HTML)
// ============================================
// Exponer en window todo lo que el HTML invoca directamente por nombre
// via onclick / oninput / onchange.

// — Recepción y carrito —
window.confirmarRecepcion   = confirmarRecepcion;
window.vaciarCarrito        = vaciarCarrito;
window.renderProductSearch  = renderProductSearch;

// — Productos —
window.openProductModal     = openProductModal;
window.closeProductModal    = closeProductModal;
window.calcularPrecios      = calcularPrecios;
window.crearProducto        = crearProducto;

// — Proveedores —
window.openSupplierModal    = openSupplierModal;
window.closeSupplierModal   = closeSupplierModal;
window.renderSuppliers      = renderSuppliers;
window.crearProveedor       = crearProveedor;

// — Historial —
window.cargarHistorial      = cargarHistorial;
window.refreshHistorial     = refreshHistorial;

// — Navegación —
window.switchView           = switchView;

// — Admin —
window.showAdminPanel       = showAdminPanel;

// — Sincronización y caché —
window.forceSyncPendingReceptions = async function() {
    const hasConnection = await OfflineManager.checkConnection(2);
    if (!hasConnection) {
        alert('❌ Sin conexión a internet.\n\nNo se puede sincronizar en este momento.');
        return;
    }
    await syncWithProgressNotifications();
};

window.showCacheStats = function() {
    const stats             = OfflineManager.getCacheStats();
    const pendingProducts   = JSON.parse(localStorage.getItem('searys_pending_products')  || '[]');
    const pendingSuppliers  = JSON.parse(localStorage.getItem('searys_pending_suppliers') || '[]');
    const pendingReceptions = OfflineManager.loadPendingReceptions().filter(r => !r.synced);
    const lastSync          = stats.lastSync ? new Date(stats.lastSync).toLocaleString('es-CO') : 'Nunca';

    let message = `📊 ESTADÍSTICAS DE CACHÉ\n\n`;
    message += `📦 Productos: ${stats.inventoryCount}\n`;
    message += `🏢 Proveedores: ${stats.suppliersCount}\n\n`;
    message += `⏳ PENDIENTES DE SINCRONIZAR:\n`;
    message += `• ${stats.pendingProducts} productos nuevos\n`;
    message += `• ${stats.pendingSuppliers} proveedores nuevos\n`;
    message += `• ${stats.pendingReceptions} recepciones\n\n`;

    if (pendingProducts.length > 0) {
        message += `📦 Productos pendientes:\n`;
        pendingProducts.forEach((p, i) => { message += `${i + 1}. ${p.product.name}\n`; });
        message += `\n`;
    }
    if (pendingSuppliers.length > 0) {
        message += `🏢 Proveedores pendientes:\n`;
        pendingSuppliers.forEach((s, i) => { message += `${i + 1}. ${s.supplier.name}\n`; });
        message += `\n`;
    }
    if (pendingReceptions.length > 0) {
        message += `📤 Recepciones pendientes:\n`;
        pendingReceptions.forEach((r, i) => { message += `${i + 1}. Factura #${r.invoice_number} (${r.total_items} items)\n`; });
        message += `\n`;
    }

    message += `✅ Recepciones sincronizadas: ${stats.syncedReceptions}\n`;
    message += `📅 Última sincronización: ${lastSync}\n`;
    message += `💾 Tamaño de caché: ${stats.cacheSize}\n`;
    message += `${stats.cacheValid ? '✅ Caché válida (<24h)' : '⚠️ Caché antigua (>24h)'}`;

    alert(message);
};

window.clearAllCache = function() {
    if (confirm('⚠️ ¿Estás seguro de limpiar toda la caché?\n\nEsto eliminará todos los datos locales y necesitarás conexión para volver a usarla.')) {
        OfflineManager.clearCache();
        inventory.length = 0;
        suppliers.length = 0;
        cart.length      = 0;
        renderCart();
        notify('✅ Caché limpiada', 'success');
        updateSyncBadge();
        alert('✅ Caché limpiada.\n\nRecarga la app para descargar datos frescos del servidor.');
    }
};

// ============================================
// ARRANQUE
// ============================================

async function startApp() {
    logger.success('Iniciando SeArys Recepción v1.4 (Offline Ready)...');

    try {
        renderCart();
        logger.success('UI básica cargada');
    } catch (error) {
        logger.error('Error renderizando UI inicial: ' + error.message);
    }

    logger.info('Cargando datos desde caché...');

    const cachedInventory = OfflineManager.loadInventory();
    const cachedSuppliers = OfflineManager.loadSuppliers();

    logger.info(`Caché: ${cachedInventory.length} productos, ${cachedSuppliers.length} proveedores`);

    const tempProducts = cachedInventory.filter(p => String(p.id).startsWith('temp_'));
    if (tempProducts.length > 0) {
        logger.warn(`ADVERTENCIA: ${tempProducts.length} productos con IDs temporales`);
    }

    inventory.length = 0;
    inventory.push(...cachedInventory);
    suppliers.length = 0;
    suppliers.push(...cachedSuppliers);

    logger.info(`Arrays listos: inventory=${inventory.length}, suppliers=${suppliers.length}`);

    if (inventory.length > 0 || suppliers.length > 0) {
        notify(`📦 Datos cargados: ${inventory.length} productos, ${suppliers.length} proveedores`, 'success');
    }

    const supabaseReady = await waitForSupabase();
    logger.info('Supabase disponible: ' + supabaseReady);

    await new Promise(resolve => setTimeout(resolve, 800));

    const hasConnection = await OfflineManager.checkConnection(3);
    updateConnectionStatus(hasConnection);
    logger.info('Conexión detectada: ' + hasConnection);

    if (hasConnection && supabaseReady) {
        logger.info('Modo ONLINE - Actualizando desde servidor...');

        loadDataFromServer('both').then(success => {
            if (success) {
                logger.success('Datos actualizados desde servidor');
                const findInput = $('find');
                if (findInput && findInput.value.trim()) renderProductSearch();
            } else {
                logger.warn('No se pudo actualizar datos del servidor, usando caché');
            }
        }).catch(error => {
            logger.error('Error cargando datos del servidor: ' + error.message);
        });

        const stats = OfflineManager.getCacheStats();
        if (stats.pendingReceptions > 0 || stats.pendingProducts > 0 || stats.pendingSuppliers > 0) {
            logger.info(`Pendientes: ${stats.pendingProducts} productos, ${stats.pendingSuppliers} proveedores, ${stats.pendingReceptions} recepciones`);

            if (confirm(`📤 Tienes:\n• ${stats.pendingProducts} productos nuevos\n• ${stats.pendingSuppliers} proveedores nuevos\n• ${stats.pendingReceptions} recepciones pendientes\n\n¿Sincronizar ahora?`)) {
                await syncWithProgressNotifications();
            } else {
                notify('⏸️ Sincronización pospuesta. Pulsa el botón 🔄 cuando quieras sincronizar.', 'success');
            }
        }

    } else {
        logger.info('Modo OFFLINE - Usando datos de caché...');

        if (inventory.length === 0 && suppliers.length === 0) {
            notify('⚠️ Sin datos en caché. Necesitas conexión inicial para descargar datos.', 'error');
        } else {
            const stats = OfflineManager.getCacheStats();
            notify(`🔴 Modo offline: ${stats.inventoryCount} productos, ${stats.suppliersCount} proveedores`, 'success');

            if (stats.pendingReceptions > 0 || stats.pendingProducts > 0 || stats.pendingSuppliers > 0) {
                notify(`⚠️ ${stats.pendingProducts} productos, ${stats.pendingSuppliers} proveedores y ${stats.pendingReceptions} recepciones pendientes`, 'error');
            }
        }
    }

    updateSyncBadge();

    setTimeout(() => {
        try {
            const filterDate = $('filterDate');
            if (filterDate) filterDate.valueAsDate = new Date();

            setupKeyboardDetection();
            setupConnectionListener();

            logger.success('Configuraciones adicionales completadas');
        } catch (error) {
            logger.warn('Error en configuraciones: ' + error.message);
        }
    }, 100);

    const finalStats = OfflineManager.getCacheStats();
    logger.info('Estadísticas finales: ' + JSON.stringify(finalStats));
    logger.info('Productos disponibles: ' + inventory.length);
    logger.info('Proveedores disponibles: ' + suppliers.length);

    logger.success('SeArys Recepción v1.4 - Carga completa');
}

// ============================================
// LECTOR FÍSICO DE CÓDIGOS DE BARRAS
// ============================================
// El lector USB/Bluetooth funciona como un teclado: escribe el código y
// manda Enter. Si el campo de búsqueda tiene el foco, al recibir Enter
// buscamos el producto por código de barras exacto y lo agregamos al carrito.

function setupBarcodeReader() {
    const findInput = $('find');
    if (!findInput) return;

    findInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();

        const code = findInput.value.trim();
        if (!code) return;

        const product = inventory.find(p => p.barcode && String(p.barcode) === code);
        const resultsDiv = $('productSearchResults');

        if (product) {
            agregarAlCarrito(product.id);
            findInput.value = '';
            if (resultsDiv) { resultsDiv.style.display = 'none'; resultsDiv.innerHTML = ''; }
            return;
        }

        // Solo ofrecer crear producto si parece un código (sin espacios, numérico/alfanumérico)
        if (/^[A-Za-z0-9\-]{4,}$/.test(code) &&
            confirm(`Código ${code} no registrado.\n¿Deseas crear un nuevo producto?`)) {
            findInput.value = '';
            if (resultsDiv) { resultsDiv.style.display = 'none'; resultsDiv.innerHTML = ''; }
            openProductModal();
            const barcodeInput = $('newProductBarcode');
            if (barcodeInput) barcodeInput.value = code;
        }
    });
}

// Sin login por ahora: la app arranca directamente.
window.onload = () => {
    setupBarcodeReader();
    startApp();
};
