// ============================================
// OFFLINE MANAGER - VERSIÓN COMPLETA (módulo ES6)
// ============================================
import { logger, updateSyncBadge } from './utils.js';
import { sb, inventory, suppliers } from './config.js';

export const OfflineManager = {
    KEYS: {
        INVENTORY: 'searys_inventory',
        SUPPLIERS: 'searys_suppliers',
        PENDING_RECEPTIONS: 'searys_pending_receptions',
        PENDING_PRODUCTS: 'searys_pending_products',
        PENDING_SUPPLIERS: 'searys_pending_suppliers', // ✅ NUEVO
        LAST_SYNC: 'searys_last_sync',
        LAST_INVENTORY_UPDATE: 'searys_last_inventory_update',
        LAST_SUPPLIERS_UPDATE: 'searys_last_suppliers_update'
    },

    isCacheValid(key) {
        const lastUpdate = localStorage.getItem(key);
        if (!lastUpdate) return false;
        const hoursSinceUpdate = (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60);
        return hoursSinceUpdate < 24;
    },

    saveInventory(data) {
        try {
            if (!Array.isArray(data)) {
                logger.error('saveInventory: data no es array');
                return false;
            }
            localStorage.setItem(this.KEYS.INVENTORY, JSON.stringify(data));
            localStorage.setItem(this.KEYS.LAST_INVENTORY_UPDATE, new Date().toISOString());
            logger.success(`Inventario guardado: ${data.length} productos`);
            return true;
        } catch (e) {
            logger.error('Error guardando inventario: ' + e.message);
            return false;
        }
    },

    loadInventory() {
        try {
            const data = localStorage.getItem(this.KEYS.INVENTORY);
            if (data) {
                const parsed = JSON.parse(data);
                if (!Array.isArray(parsed)) {
                    logger.warn('Inventario corrupto, limpiando...');
                    localStorage.removeItem(this.KEYS.INVENTORY);
                    return [];
                }
                logger.success(`Inventario cargado: ${parsed.length} productos`);
                return parsed;
            }
            return [];
        } catch (e) {
            logger.error('Error cargando inventario: ' + e.message);
            localStorage.removeItem(this.KEYS.INVENTORY);
            return [];
        }
    },

    saveSuppliers(data) {
        try {
            if (!Array.isArray(data)) {
                logger.error('saveSuppliers: data no es array');
                return false;
            }
            localStorage.setItem(this.KEYS.SUPPLIERS, JSON.stringify(data));
            localStorage.setItem(this.KEYS.LAST_SUPPLIERS_UPDATE, new Date().toISOString());
            logger.success(`Proveedores guardados: ${data.length}`);
            return true;
        } catch (e) {
            logger.error('Error guardando proveedores: ' + e.message);
            return false;
        }
    },

    loadSuppliers() {
        try {
            const data = localStorage.getItem(this.KEYS.SUPPLIERS);
            if (data) {
                const parsed = JSON.parse(data);
                if (!Array.isArray(parsed)) {
                    logger.warn('Proveedores corruptos, limpiando...');
                    localStorage.removeItem(this.KEYS.SUPPLIERS);
                    return [];
                }
                logger.success(`Proveedores cargados: ${parsed.length}`);
                return parsed;
            }
            return [];
        } catch (e) {
            logger.error('Error cargando proveedores: ' + e.message);
            localStorage.removeItem(this.KEYS.SUPPLIERS);
            return [];
        }
    },

    savePendingReception(reception) {
        try {
            const pending = this.loadPendingReceptions();
            const receptionId = `reception_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const exists = pending.find(r => r.invoice_number === reception.invoice_number);
            if (exists) {
                logger.warn(`Recepción duplicada: ${reception.invoice_number}`);
                return false;
            }

            pending.push({
                ...reception,
                id: receptionId,
                timestamp: new Date().toISOString(),
                synced: false,
                syncAttempts: 0
            });

            localStorage.setItem(this.KEYS.PENDING_RECEPTIONS, JSON.stringify(pending));
            logger.success(`Recepción guardada: ${reception.invoice_number} (ID: ${receptionId})`);

            updateSyncBadge();

            return true;
        } catch (e) {
            logger.error('Error guardando recepción: ' + e.message);
            return false;
        }
    },

    loadPendingReceptions() {
        try {
            const data = localStorage.getItem(this.KEYS.PENDING_RECEPTIONS);
            if (!data) return [];
            const parsed = JSON.parse(data);
            if (!Array.isArray(parsed)) {
                logger.warn('Recepciones pendientes corruptas, limpiando...');
                localStorage.removeItem(this.KEYS.PENDING_RECEPTIONS);
                return [];
            }
            return parsed;
        } catch (e) {
            logger.error('Error cargando recepciones pendientes: ' + e.message);
            localStorage.removeItem(this.KEYS.PENDING_RECEPTIONS);
            return [];
        }
    },

    markReceptionSynced(receptionId) {
        try {
            const pending = this.loadPendingReceptions();
            const updated = pending.map(r =>
                r.id === receptionId ? { ...r, synced: true } : r
            );
            localStorage.setItem(this.KEYS.PENDING_RECEPTIONS, JSON.stringify(updated));
            logger.success(`Recepción marcada como sincronizada: ${receptionId}`);
            return true;
        } catch (e) {
            logger.error('Error marcando recepción: ' + e.message);
            return false;
        }
    },

    incrementSyncAttempts(receptionId) {
        try {
            const pending = this.loadPendingReceptions();
            const updated = pending.map(r =>
                r.id === receptionId
                    ? { ...r, syncAttempts: (r.syncAttempts || 0) + 1, lastAttempt: new Date().toISOString() }
                    : r
            );
            localStorage.setItem(this.KEYS.PENDING_RECEPTIONS, JSON.stringify(updated));
            return true;
        } catch (e) {
            logger.error('Error incrementando intentos: ' + e.message);
            return false;
        }
    },

    cleanSyncedReceptions() {
        try {
            const pending = this.loadPendingReceptions();
            const syncedCount = pending.filter(r => r.synced).length;
            const stillPending = pending.filter(r => !r.synced);

            logger.info(`Limpiando: ${syncedCount} sincronizadas, ${stillPending.length} pendientes`);

            localStorage.setItem(this.KEYS.PENDING_RECEPTIONS, JSON.stringify(stillPending));

            updateSyncBadge();

            return true;
        } catch (e) {
            logger.error('Error limpiando recepciones: ' + e.message);
            return false;
        }
    },

    updateLastSync() {
        try {
            localStorage.setItem(this.KEYS.LAST_SYNC, new Date().toISOString());
            return true;
        } catch (e) {
            return false;
        }
    },

    getLastSync() {
        try {
            const lastSync = localStorage.getItem(this.KEYS.LAST_SYNC);
            return lastSync ? new Date(lastSync) : null;
        } catch (e) {
            return null;
        }
    },

    async checkConnection(maxRetries = 3) {
        if (!navigator.onLine) {
            logger.warn('navigator.onLine = false');
            return false;
        }

        if (!sb) {
            logger.warn('Supabase no inicializado');
            return false;
        }

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);

                const { error } = await sb.from('products').select('id').limit(1).abortSignal(controller.signal);

                clearTimeout(timeoutId);

                if (!error) {
                    logger.success(`Conexión verificada (intento ${attempt}/${maxRetries})`);
                    return true;
                } else if (error.code) {
                    // El servidor respondió con un error de la API (p. ej. 42501 permiso
                    // denegado por RLS). Hay internet y Supabase está arriba: NO es un
                    // problema de conexión, pero la consulta fue rechazada.
                    logger.error(`Supabase respondió con error: ${error.message} (código: ${error.code}). ` +
                                 'Revisa las políticas RLS / permisos de la tabla products.');
                    return true;
                } else {
                    logger.warn(`Error de red: ${error.message}`);
                }
            } catch (e) {
                logger.warn(`Intento ${attempt}/${maxRetries} falló: ${e.message}`);
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        logger.error(`Sin conexión después de ${maxRetries} intentos`);
        return false;
    },

    // ✅ NUEVO: Sincronizar proveedores pendientes
    async syncPendingSuppliers() {
        logger.info('=== SINCRONIZANDO PROVEEDORES PENDIENTES ===');

        const pendingSuppliers = JSON.parse(localStorage.getItem(this.KEYS.PENDING_SUPPLIERS) || '[]');

        if (pendingSuppliers.length === 0) {
            logger.success('No hay proveedores pendientes');
            return { success: true, synced: 0, errors: [], mapping: {} };
        }

        logger.info(`Encontrados ${pendingSuppliers.length} proveedores pendientes`);

        const hasConnection = await this.checkConnection(2);
        if (!hasConnection) {
            logger.warn('Sin conexión, no se puede sincronizar proveedores');
            return { success: false, synced: 0, errors: ['Sin conexión'], mapping: {} };
        }

        let syncedCount = 0;
        let errors = [];
        const idMapping = {};

        for (const pending of pendingSuppliers) {
            try {
                logger.info(`Sincronizando proveedor: ${pending.supplier.name}...`);

                // Verificar si ya existe
                const { data: existingSupplier, error: checkError } = await sb
                    .from('suppliers')
                    .select('id, name')
                    .eq('name', pending.supplier.name)
                    .limit(1);

                if (checkError) {
                    throw new Error('Error verificando proveedor: ' + checkError.message);
                }

                if (existingSupplier && existingSupplier.length > 0) {
                    logger.warn(`Proveedor "${pending.supplier.name}" ya existe`);
                    idMapping[pending.tempId] = existingSupplier[0].id;
                    syncedCount++;
                    continue;
                }

                // Crear en servidor
                logger.info(`Creando proveedor "${pending.supplier.name}" en servidor...`);
                const { data: newSupplier, error: createError } = await sb
                    .from('suppliers')
                    .insert(pending.supplier)
                    .select()
                    .single();

                if (createError) {
                    throw new Error('Error creando proveedor: ' + createError.message);
                }

                logger.success(`Proveedor creado con ID real: ${newSupplier.id}`);
                idMapping[pending.tempId] = newSupplier.id;
                syncedCount++;

            } catch (e) {
                logger.error(`Error sincronizando proveedor "${pending.supplier.name}": ${e.message}`);
                errors.push({
                    supplier: pending.supplier.name,
                    error: e.message
                });
            }
        }

        // Actualizar proveedores locales con IDs reales
        if (Object.keys(idMapping).length > 0) {
            const suppliersData = this.loadSuppliers();

            suppliersData.forEach(supplier => {
                if (idMapping[supplier.id]) {
                    const oldId = supplier.id;
                    supplier.id = idMapping[oldId];
                    delete supplier.is_temp;
                    delete supplier.created_offline;
                    delete supplier.pending_sync;
                    logger.info(`Proveedor actualizado: ${oldId} → ${supplier.id}`);
                }
            });

            this.saveSuppliers(suppliersData);
            // Nota: `suppliers` se importa de config.js. Como es un binding de
            // solo lectura, no podemos hacer `suppliers = suppliersData`.
            // Mutamos el array en sitio para que siga reflejando el estado
            // compartido mientras suppliers.js no esté migrado.
            suppliers.length = 0;
            suppliers.push(...suppliersData);
        }

        // Limpiar proveedores sincronizados
        if (syncedCount > 0) {
            const stillPending = pendingSuppliers.filter(s => !idMapping[s.tempId]);
            localStorage.setItem(this.KEYS.PENDING_SUPPLIERS, JSON.stringify(stillPending));
        }

        logger.info(`Sincronización de proveedores completada: ${syncedCount} exitosos, ${errors.length} errores`);

        return {
            success: syncedCount > 0,
            synced: syncedCount,
            errors: errors,
            mapping: idMapping
        };
    },

    async syncPendingProducts() {
        logger.info('=== SINCRONIZANDO PRODUCTOS PENDIENTES ===');

        const pendingProducts = JSON.parse(localStorage.getItem(this.KEYS.PENDING_PRODUCTS) || '[]');

        if (pendingProducts.length === 0) {
            logger.success('No hay productos pendientes');
            return { success: true, synced: 0, errors: [], mapping: {} };
        }

        logger.info(`Encontrados ${pendingProducts.length} productos pendientes`);

        const hasConnection = await this.checkConnection(2);
        if (!hasConnection) {
            logger.warn('Sin conexión, no se puede sincronizar productos');
            return { success: false, synced: 0, errors: ['Sin conexión'], mapping: {} };
        }

        let syncedCount = 0;
        let errors = [];
        const idMapping = {};

        for (const pending of pendingProducts) {
            try {
                logger.info(`Sincronizando producto: ${pending.product.name}...`);

                const { data: existingProduct, error: checkError } = await sb
                    .from('products')
                    .select('id, name')
                    .eq('name', pending.product.name)
                    .limit(1);

                if (checkError) {
                    throw new Error('Error verificando producto: ' + checkError.message);
                }

                if (existingProduct && existingProduct.length > 0) {
                    logger.warn(`Producto "${pending.product.name}" ya existe`);
                    idMapping[pending.tempId] = existingProduct[0].id;
                    syncedCount++;
                    continue;
                }

                logger.info(`Creando producto "${pending.product.name}" en servidor...`);
                const { data: newProduct, error: createError } = await sb
                    .from('products')
                    .insert(pending.product)
                    .select()
                    .single();

                if (createError) {
                    throw new Error('Error creando producto: ' + createError.message);
                }

                logger.success(`Producto creado con ID real: ${newProduct.id}`);
                idMapping[pending.tempId] = newProduct.id;
                syncedCount++;

            } catch (e) {
                logger.error(`Error sincronizando producto "${pending.product.name}": ${e.message}`);
                errors.push({
                    product: pending.product.name,
                    error: e.message
                });
            }
        }

        if (Object.keys(idMapping).length > 0) {
            const inventoryData = this.loadInventory();

            inventoryData.forEach(product => {
                if (idMapping[product.id]) {
                    const oldId = product.id;
                    product.id = idMapping[oldId];
                    delete product.is_temp;
                    delete product.created_offline;
                    delete product.pending_sync;
                    logger.info(`Producto actualizado: ${oldId} → ${product.id}`);
                }
            });

            this.saveInventory(inventoryData);
            // Igual que con `suppliers`: mutación en sitio del array
            // importado de config.js (binding de solo lectura).
            inventory.length = 0;
            inventory.push(...inventoryData);
        }

        if (syncedCount > 0) {
            const stillPending = pendingProducts.filter(p => !idMapping[p.tempId]);
            localStorage.setItem(this.KEYS.PENDING_PRODUCTS, JSON.stringify(stillPending));
        }

        logger.info(`Sincronización de productos completada: ${syncedCount} exitosos, ${errors.length} errores`);

        return {
            success: syncedCount > 0,
            synced: syncedCount,
            errors: errors,
            mapping: idMapping
        };
    },

    // ✅ MEJORADO: Actualizar IDs en items de recepciones pendientes
    updateReceptionItems(supplierMapping, productMapping) {
        try {
            const pending = this.loadPendingReceptions();
            let updated = false;

            pending.forEach(reception => {
                // Actualizar supplier_id si es temporal
                if (supplierMapping[reception.supplier_id]) {
                    reception.supplier_id = supplierMapping[reception.supplier_id];
                    updated = true;
                    logger.info(`Actualizado supplier_id en recepción ${reception.invoice_number}`);
                }

                // Actualizar product_id en items
                if (typeof reception.items === 'string') {
                    const items = JSON.parse(reception.items);
                    let itemsUpdated = false;

                    items.forEach(item => {
                        if (productMapping[item.product_id]) {
                            const oldId = item.product_id;
                            item.product_id = productMapping[oldId];
                            itemsUpdated = true;
                            logger.info(`Actualizado product_id ${oldId} → ${item.product_id} en ${item.name}`);
                        }
                    });

                    if (itemsUpdated) {
                        reception.items = JSON.stringify(items);
                        updated = true;
                    }
                }
            });

            if (updated) {
                localStorage.setItem(this.KEYS.PENDING_RECEPTIONS, JSON.stringify(pending));
                logger.success('IDs temporales actualizados en recepciones pendientes');
            }

            return updated;
        } catch (e) {
            logger.error('Error actualizando items de recepción: ' + e.message);
            return false;
        }
    },

    async syncPendingReceptions() {
        logger.info('=== INICIANDO SINCRONIZACIÓN ===');

        const hasConnection = await this.checkConnection(2);
        if (!hasConnection) {
            logger.warn('Sin conexión');
            return { success: false, synced: 0, errors: ['Sin conexión'] };
        }

        // PASO 1: Sincronizar proveedores
        logger.info('Paso 1/3: Sincronizando proveedores...');
        const supplierSync = await this.syncPendingSuppliers();

        // PASO 2: Sincronizar productos
        logger.info('Paso 2/3: Sincronizando productos...');
        const productSync = await this.syncPendingProducts();

        // ✅ PASO 2.5: Actualizar IDs en recepciones pendientes
        if (Object.keys(supplierSync.mapping).length > 0 || Object.keys(productSync.mapping).length > 0) {
            logger.info('Paso 2.5: Actualizando IDs en recepciones pendientes...');
            this.updateReceptionItems(supplierSync.mapping, productSync.mapping);
        }

        // PASO 3: Sincronizar recepciones
        logger.info('Paso 3/3: Sincronizando recepciones...');

        const allPending = this.loadPendingReceptions();
        const pending = allPending.filter(r => !r.synced);

        logger.info(`Recepciones pendientes: ${pending.length}`);

        if (pending.length === 0) {
            this.cleanSyncedReceptions();
            return {
                success: true,
                synced: 0,
                errors: [],
                supplierSync,
                productSync
            };
        }

        let syncedCount = 0;
        let errors = [];

        for (const reception of pending) {
            if ((reception.syncAttempts || 0) >= 5) {
                logger.warn(`Recepción con demasiados intentos: ${reception.invoice_number}`);
                errors.push({
                    reception: reception.invoice_number,
                    error: 'Demasiados intentos (5+)',
                    attempts: reception.syncAttempts
                });
                continue;
            }

            try {
                logger.info(`Sincronizando factura #${reception.invoice_number}...`);

                // Nota: ya no se verifica duplicado aquí con un SELECT previo.
                // complete_reception valida la factura duplicada de forma atómica
                // dentro de la misma transacción (ver rpcError DUPLICATE_INVOICE abajo).

                let items;
                if (typeof reception.items === 'string') {
                    items = JSON.parse(reception.items);
                } else if (Array.isArray(reception.items)) {
                    items = reception.items;
                } else {
                    throw new Error('Formato de items inválido');
                }

                // ✅ Verificar que no haya IDs temporales sin mapear
                let hasUnmappedIds = false;
                items.forEach(item => {
                    if (String(item.product_id).startsWith('temp_')) {
                        logger.error(`ERROR: Producto temporal sin mapear: ${item.product_id} (${item.name})`);
                        hasUnmappedIds = true;
                    }
                });

                if (hasUnmappedIds) {
                    throw new Error('Hay IDs temporales sin mapear. Sincroniza productos/proveedores primero.');
                }

                logger.info(`Registrando recepción #${reception.invoice_number} vía complete_reception...`);

                const { data: rpcData, error: rpcError } = await sb.rpc('complete_reception', {
                    p_invoice_number: reception.invoice_number,
                    p_supplier_id:    reception.supplier_id,
                    p_items:          items,
                    p_subtotal:       reception.subtotal,
                    p_total_iva:      reception.total_iva || 0,
                    p_total_amount:   reception.total_amount,
                    p_total_items:    reception.total_items
                });

                if (rpcError) {
                    if (rpcError.message && rpcError.message.includes('DUPLICATE_INVOICE')) {
                        logger.warn(`Factura #${reception.invoice_number} ya existe en el servidor`);
                        this.markReceptionSynced(reception.id);
                        syncedCount++;
                        continue;
                    }
                    throw new Error('Error en complete_reception: ' + rpcError.message);
                }

                logger.success(`Recepción #${reception.invoice_number} sincronizada (id ${rpcData.reception_id})`);
                this.markReceptionSynced(reception.id);
                syncedCount++;

            } catch (e) {
                logger.error(`Error sincronizando #${reception.invoice_number}: ${e.message}`);
                this.incrementSyncAttempts(reception.id);
                errors.push({
                    reception: reception.invoice_number,
                    error: e.message,
                    attempts: (reception.syncAttempts || 0) + 1
                });
            }
        }

        this.cleanSyncedReceptions();

        logger.info(`=== SINCRONIZACIÓN COMPLETADA ===`);
        logger.success(`Proveedores: ${supplierSync.synced}, Productos: ${productSync.synced}, Recepciones: ${syncedCount}`);

        return {
            success: syncedCount > 0,
            synced: syncedCount,
            errors: errors,
            supplierSync,
            productSync
        };
    },

    clearCache() {
        try {
            Object.values(this.KEYS).forEach(key => {
                localStorage.removeItem(key);
            });
            logger.success('Caché limpiada');
            return true;
        } catch (e) {
            logger.error('Error limpiando caché: ' + e.message);
            return false;
        }
    },

    getCacheStats() {
        const inventoryData = this.loadInventory();
        const suppliersData = this.loadSuppliers();
        const pending = this.loadPendingReceptions();
        const pendingProducts = JSON.parse(localStorage.getItem(this.KEYS.PENDING_PRODUCTS) || '[]');
        const pendingSuppliers = JSON.parse(localStorage.getItem(this.KEYS.PENDING_SUPPLIERS) || '[]'); // ✅ NUEVO
        const lastSync = this.getLastSync();

        return {
            inventoryCount: inventoryData.length,
            suppliersCount: suppliersData.length,
            pendingReceptions: pending.filter(r => !r.synced).length,
            syncedReceptions: pending.filter(r => r.synced).length,
            pendingProducts: pendingProducts.length,
            pendingSuppliers: pendingSuppliers.length, // ✅ NUEVO
            lastSync: lastSync,
            cacheSize: this.estimateCacheSize(),
            cacheValid: this.isCacheValid(this.KEYS.LAST_INVENTORY_UPDATE)
        };
    },

    estimateCacheSize() {
        let totalSize = 0;
        Object.values(this.KEYS).forEach(key => {
            const data = localStorage.getItem(key);
            if (data) {
                totalSize += new Blob([data]).size;
            }
        });
        return Math.round(totalSize / 1024) + ' KB';
    }
};

logger.success('offline-manager.js cargado con sincronización completa');
