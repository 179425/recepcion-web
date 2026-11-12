// ============================================
// RECEPTION.JS - MÓDULO ES6
// ============================================
import { $, logger, notify, vibrate, updateSyncBadge } from './utils.js';
import { sb, cart, inventory, currentSupplier, setCurrentSupplier } from './config.js';
import { OfflineManager } from './offline-manager.js';
import { renderCart } from './cart.js';
import { cargarInventario } from './products.js';
import { cargarProveedores } from './suppliers.js';

// ============================================
// CONFIRMAR RECEPCIÓN
// ============================================

export async function confirmarRecepcion() {
    const invoiceInput = $('invoiceNumber');

    if (!invoiceInput) {
        notify('❌ Error: Campo de factura no encontrado', 'error');
        return;
    }

    const invoiceNum   = invoiceInput.value.trim();
    const currentSupp  = currentSupplier;

    // ── Validaciones ─────────────────────────────────────────────────
    if (!invoiceNum) { notify('Ingresa el número de factura', 'error'); invoiceInput.focus(); return; }
    if (!currentSupp)  { notify('Selecciona un proveedor', 'error'); return; }
    if (cart.length === 0) { notify('El carrito está vacío', 'error'); return; }

    // ── Verificar IDs temporales sin sincronizar ──────────────────────
    const hasUnsyncedSupplier = String(currentSupp.id).startsWith('temp_');
    const hasUnsyncedProducts = cart.some(item => String(item.productId).startsWith('temp_'));

    if (hasUnsyncedSupplier || hasUnsyncedProducts) {
        let warningMsg = '⚠️ ADVERTENCIA:\n\n';

        if (hasUnsyncedSupplier) {
            warningMsg += `• El proveedor "${currentSupp.name}" fue creado offline\n`;
        }
        if (hasUnsyncedProducts) {
            const unsyncedNames = cart
                .filter(item => String(item.productId).startsWith('temp_'))
                .map(item => item.name);
            warningMsg += `• ${unsyncedNames.length} producto(s) creado(s) offline:\n  - ${unsyncedNames.join('\n  - ')}\n`;
        }

        warningMsg += '\nEstos datos deben sincronizarse antes de confirmar la recepción.\n\n¿Deseas intentar sincronizar ahora?';

        if (confirm(warningMsg)) {
            const hasConnection = await OfflineManager.checkConnection(2);

            if (!hasConnection) {
                alert('❌ Sin conexión a internet.\n\nNo se puede sincronizar en este momento.\n\nPuedes:\n1. Conectarte a internet y sincronizar\n2. Continuar y la recepción se guardará localmente');
                if (!confirm('¿Deseas guardar la recepción localmente (offline)?')) return;
            } else {
                notify('🔄 Sincronizando...', 'success');

                try {
                    const syncResult = await OfflineManager.syncPendingReceptions();

                    if (syncResult.supplierSync?.synced > 0) {
                        notify(`✅ ${syncResult.supplierSync.synced} proveedores sincronizados`, 'success');
                    }
                    if (syncResult.productSync?.synced > 0) {
                        notify(`✅ ${syncResult.productSync.synced} productos sincronizados`, 'success');
                    }

                    await cargarInventario();
                    await cargarProveedores();

                    notify('✅ Sincronización completada. Puedes confirmar la recepción ahora.', 'success');
                    return; // El usuario debe confirmar de nuevo con IDs reales

                } catch (syncError) {
                    logger.error('Error en sincronización: ' + syncError.message);
                    alert('❌ Error al sincronizar:\n\n' + syncError.message + '\n\n¿Deseas guardar la recepción localmente?');
                    if (!confirm('¿Guardar localmente?')) return;
                }
            }
        } else {
            return; // Usuario canceló
        }
    }

    const btn = document.querySelector('.btn-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'PROCESANDO...'; }

    try {
        logger.info('Preparando recepción: ' + invoiceNum);

        // ── Preparar items ────────────────────────────────────────────
        const items = cart.map(item => {
            const qty          = Number(item.qty)           || 0;
            const pPrice       = Number(item.purchasePrice)  || 0;
            const sPrice       = Number(item.salePrice)      || 0;
            const ivaRate      = Number(item.ivaRate)        || 0;
            const extraTaxRate = Number(item.extraTaxRate)   || 0;
            const profitRate   = Number(item.profitRate)     || 0;
            const subtotal     = pPrice * qty;
            const iva          = subtotal * (ivaRate / 100);
            const extraTax     = subtotal * (extraTaxRate / 100);

            return {
                product_id:     item.productId,
                name:           item.name,
                qty,
                purchase_price: pPrice,
                sale_price:     sPrice,
                has_iva:        item.hasIva || false,
                iva_rate:       ivaRate,
                extra_tax_rate: extraTaxRate,
                profit_rate:    profitRate,
                subtotal,
                iva,
                extra_tax:      extraTax,
                profit:         subtotal * (profitRate / 100),
                total:          subtotal + iva + extraTax
            };
        });

        const totalSubtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
        const totalIVA      = items.reduce((sum, i) => sum + i.iva, 0);
        const totalExtraTax = items.reduce((sum, i) => sum + i.extra_tax, 0);
        const totalFactura  = totalSubtotal + totalIVA + totalExtraTax;
        const totalItems    = items.reduce((sum, i) => sum + i.qty, 0);

        logger.info(`Totales: ${totalItems} items, $${totalFactura.toLocaleString()}`);

        const reception = {
            invoice_number: invoiceNum,
            supplier_id:    currentSupp.id,
            items:          JSON.stringify(items),
            total_items:    totalItems,
            subtotal:       totalSubtotal,
            total_iva:      totalIVA,
            total_amount:   totalFactura
        };

        const hasConnection = await OfflineManager.checkConnection(2);
        logger.info('Conexión: ' + (hasConnection ? 'ONLINE' : 'OFFLINE'));

        if (hasConnection) {
            // ── MODO ONLINE (RPC atómica) ──────────────────────────────
            logger.info('Guardando recepción ONLINE vía complete_reception...');

            const { data: rpcData, error: rpcError } = await sb.rpc('complete_reception', {
                p_invoice_number: invoiceNum,
                p_supplier_id:    currentSupp.id,
                p_items:          items,
                p_subtotal:       totalSubtotal,
                p_total_iva:      totalIVA,
                p_total_amount:   totalFactura,
                p_total_items:    totalItems
            });

            if (rpcError) {
                if (rpcError.message && rpcError.message.includes('DUPLICATE_INVOICE')) {
                    vibrate([100, 50, 100, 50, 100]);
                    notify(`⚠️ La factura #${invoiceNum} ya fue registrada`, 'error');
                    return;
                }
                throw rpcError;
            }

            logger.success('Recepción #' + rpcData.reception_id + ' registrada en el servidor');
            vibrate([100, 50, 100]);
            notify('✅ Recepción registrada exitosamente');

            // El stock ya quedó actualizado atómicamente en el servidor.
            // Recargamos el inventario real en vez de mutarlo a mano en el cliente.
            await cargarInventario();
            OfflineManager.saveInventory([...inventory]);
            OfflineManager.updateLastSync();

        } else {
            // ── MODO OFFLINE ──────────────────────────────────────────
            logger.info('Guardando recepción OFFLINE...');

            items.forEach(item => {
                const product = inventory.find(p => p.id === item.product_id);
                if (product) {
                    const oldQty     = Number(product.quantity) || 0;
                    product.quantity = oldQty + item.qty;
                    product.sale_price = item.sale_price;
                    logger.info(`${product.name}: ${oldQty} → ${product.quantity}`);
                } else {
                    logger.warn(`Producto no encontrado: ${item.product_id}`);
                }
            });

            OfflineManager.saveInventory([...inventory]);
            logger.success('Inventario local actualizado');

            const saved = OfflineManager.savePendingReception(reception);
            if (!saved) {
                logger.warn('No se pudo guardar recepción pendiente');
                notify('⚠️ Recepción guardada localmente pero no en cola de sincronización', 'error');
            } else {
                logger.success('Recepción guardada en cola');
            }

            vibrate([100, 50, 100]);
            notify('🔴 Recepción guardada localmente (pendiente de sincronizar)', 'success');
            updateSyncBadge();
        }

        // ── Limpiar interfaz ──────────────────────────────────────────
        logger.info('Limpiando interfaz...');
        cart.length = 0;
        setCurrentSupplier(null);
        invoiceInput.value = '';

        const supplierDisplay = $('supplierDisplay');
        if (supplierDisplay) supplierDisplay.value = '';

        renderCart();
        logger.success('Recepción completada');

    } catch (e) {
        logger.error('Error detallado: ' + e.message);
        notify('Error al registrar recepción: ' + e.message, 'error');

        const hasConnection = await OfflineManager.checkConnection();
        if (hasConnection) {
            try {
                logger.info('Recargando inventario después de error...');
                await cargarInventario();
                OfflineManager.saveInventory([...inventory]);
            } catch (reloadError) {
                logger.error('Error recargando inventario: ' + reloadError.message);
            }
        }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '✅ CONFIRMAR'; }
    }
}

logger.success('reception.js cargado');