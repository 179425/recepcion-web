// ============================================
// PRODUCTS.JS - MÓDULO ES6
// ============================================
import { $, logger, notify, updateSyncBadge } from './utils.js';
import { sb, inventory, cart } from './config.js';
import { OfflineManager } from './offline-manager.js';
import { renderCart, agregarAlCarrito, setCalcularPrecios } from './cart.js';

// Registrar calcularPrecios en cart.js para que editCartItem pueda usarla
// sin crear un ciclo de imports (cart.js no importa products.js).
setCalcularPrecios(calcularPrecios);

// ============================================
// CARGAR INVENTARIO
// ============================================

export async function cargarInventario() {
    logger.info('Cargando inventario...');
    const currentData = [...inventory];

    try {
        if (!sb) throw new Error('Cliente Supabase no disponible');

        const { data, error } = await sb
            .from('products')
            .select('*')
            .order('name');

        if (error) throw new Error('Error de Supabase: ' + error.message);
        if (!data || !Array.isArray(data)) throw new Error('Respuesta inválida del servidor');

        if (data.length === 0) {
            logger.warn('Servidor devolvió 0 productos');
            if (currentData.length > 0) {
                logger.success(`Manteniendo datos actuales: ${currentData.length} productos`);
                return currentData;
            }
        }

        // Mutar en sitio — nunca reasignar el binding importado
        inventory.length = 0;
        inventory.push(...data);
        logger.success(`Inventario actualizado: ${data.length} productos`);

        OfflineManager.saveInventory(data);
        OfflineManager.updateLastSync();

        return data;

    } catch (error) {
        logger.error('Error en cargarInventario: ' + error.message);
        if (currentData.length > 0) {
            logger.success(`Manteniendo datos actuales: ${currentData.length} productos`);
        } else {
            logger.warn('No hay datos en memoria ni se pudieron cargar nuevos');
        }
        return currentData;
    }
}

// ============================================
// BÚSQUEDA DE PRODUCTOS
// ============================================

let searchTimeout = null;

export function renderProductSearch() {
    const findInput   = $('find');
    const resultsDiv  = $('productSearchResults');
    if (!findInput || !resultsDiv) return;

    const searchTerm = findInput.value.toLowerCase().trim();

    if (!searchTerm) {
        resultsDiv.style.display = 'none';
        resultsDiv.innerHTML     = '';
        return;
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const filtered = inventory.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            (p.barcode && p.barcode.includes(searchTerm))
        );

        if (filtered.length === 0) {
            resultsDiv.style.display = 'none';
            return;
        }

        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML     = '';

        filtered.slice(0, 5).forEach(p => {
            const div = document.createElement('div');
            div.style.cssText = 'padding:12px;border-bottom:1px solid #e2e8f0;cursor:pointer;transition:background 0.2s';
            div.onmouseover = () => div.style.background = '#f8fafc';
            div.onmouseout  = () => div.style.background = 'white';
            div.onclick = () => {
                agregarAlCarrito(p.id);
                findInput.value          = '';
                resultsDiv.style.display = 'none';
            };

            const tempBadge = p.is_temp
                ? ' <span style="background:#f59e0b;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold">OFFLINE</span>'
                : '';

            div.innerHTML = `
                <div style="font-weight:600;margin-bottom:3px">${p.name}${tempBadge}</div>
                <div style="font-size:12px;color:#64748b">
                    Stock: ${p.quantity} | Precio: $${p.sale_price.toLocaleString('es-CO')}
                    ${p.has_iva ? ' <span style="color:var(--orange);font-weight:600">+IVA</span>' : ''}
                </div>
            `;
            resultsDiv.appendChild(div);
        });
    }, 200);
}

// ============================================
// MODAL DE PRODUCTO
// ============================================

export function openProductModal() {
    logger.info('Abriendo modal de producto...');
    const modal = $('productModal');
    if (!modal) {
        logger.error('Modal productModal no encontrado');
        notify('Error: Modal no encontrado', 'error');
        return;
    }

    limpiarModalProducto();
    modal.dataset.editIndex = '';

    const modalTitle = modal.querySelector('h3');
    if (modalTitle) modalTitle.textContent = '💰 Calculadora de Precios';

    modal.classList.add('active');
    setTimeout(() => { const n = $('newProductName'); if (n) n.focus(); }, 100);
    logger.success('Modal abierto');
}

export function limpiarModalProducto() {
    const fields = {
        'newProductName': '', 'newProductBarcode': '', 'totalFacturado': '',
        'cantidadRecibida': '', 'ivaRate': '', 'extraTaxRate': '', 'utilidadRate': ''
    };
    Object.keys(fields).forEach(id => { const el = $(id); if (el) el.value = fields[id]; });

    const results = {
        'costoUnitario': '$0', 'totalImpuestos': '$0', 'costoConImpuestos': '$0',
        'utilidadUnidad': '$0', 'precioVentaFinal': '$0', 'resumenCosto': '$0', 'resumenVenta': '$0'
    };
    Object.keys(results).forEach(id => { const el = $(id); if (el) el.textContent = results[id]; });

    logger.info('Modal limpiado');
}

export function closeProductModal() {
    logger.info('Cerrando modal...');
    const modal = $('productModal');
    if (!modal) return;

    modal.classList.remove('active');
    modal.dataset.editIndex = '';
    limpiarModalProducto();


    const modalTitle = modal.querySelector('h3');
    if (modalTitle) modalTitle.textContent = '💰 Calculadora de Precios';

    logger.success('Modal cerrado');
}

// ============================================
// CALCULADORA DE PRECIOS
// ============================================

export function calcularPrecios() {
    const totalFacturado = parseFloat($('totalFacturado')?.value)  || 0;
    const cantidad       = parseFloat($('cantidadRecibida')?.value) || 0;
    const ivaRate        = parseFloat($('ivaRate')?.value)         || 0;
    const extraTaxRate   = parseFloat($('extraTaxRate')?.value)    || 0;
    const utilidadRate   = parseFloat($('utilidadRate')?.value)    || 0;

    const costoUnitario       = cantidad > 0 ? totalFacturado / cantidad : 0;
    const ivaUnidad           = costoUnitario * (ivaRate / 100);
    const extraTaxUnidad      = costoUnitario * (extraTaxRate / 100);
    const totalImpuestosUnidad = ivaUnidad + extraTaxUnidad;
    const costoConImpuestos   = costoUnitario + totalImpuestosUnidad;
    const utilidadUnidad      = costoConImpuestos * (utilidadRate / 100);
    const precioVentaCalculado = costoConImpuestos + utilidadUnidad;
    const precioVentaFinal    = Math.round(precioVentaCalculado / 100) * 100;

    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    set('costoUnitario',    `$${Math.round(costoUnitario).toLocaleString('es-CO')}`);
    set('totalImpuestos',   `$${Math.round(totalImpuestosUnidad).toLocaleString('es-CO')}`);
    set('costoConImpuestos',`$${Math.round(costoConImpuestos).toLocaleString('es-CO')}`);
    set('utilidadUnidad',   `$${Math.round(utilidadUnidad).toLocaleString('es-CO')}`);
    set('precioVentaFinal', `$${precioVentaFinal.toLocaleString('es-CO')}`);
    set('resumenCosto',     `$${Math.round(costoUnitario).toLocaleString('es-CO')}`);
    set('resumenVenta',     `$${precioVentaFinal.toLocaleString('es-CO')}`);
}

// ============================================
// CREAR / EDITAR PRODUCTO
// ============================================

export async function crearProducto() {
    logger.info('Iniciando creación/edición de producto...');

    const nameInput     = $('newProductName');
    const barcodeInput  = $('newProductBarcode');
    const totalInput    = $('totalFacturado');
    const cantidadInput = $('cantidadRecibida');
    const ivaInput      = $('ivaRate');
    const extraTaxInput = $('extraTaxRate');
    const utilidadInput = $('utilidadRate');
    const modal         = $('productModal');

    if (!nameInput || !modal) {
        logger.error('Elementos del formulario no encontrados');
        notify('Error: Formulario no encontrado', 'error');
        return;
    }

    const name          = nameInput.value.trim();
    const barcode       = barcodeInput?.value.trim() || '';
    const totalFacturado = parseFloat(totalInput?.value)    || 0;
    const cantidad      = parseFloat(cantidadInput?.value)  || 0;
    const ivaRate       = parseFloat(ivaInput?.value)       || 0;
    const extraTaxRate  = parseFloat(extraTaxInput?.value)  || 0;
    const utilidadRate  = parseFloat(utilidadInput?.value)  || 0;
    const editIndex     = modal.dataset.editIndex;

    if (!name)                          { notify('El nombre es obligatorio', 'error'); nameInput.focus(); return; }
    if (totalFacturado <= 0 || cantidad <= 0) { notify('Debes ingresar el total facturado y la cantidad', 'error'); return; }
    if (utilidadRate <= 0)              { notify('Debes definir un porcentaje de utilidad', 'error'); return; }

    const costoUnitario       = totalFacturado / cantidad;
    const ivaUnidad           = costoUnitario * (ivaRate / 100);
    const extraTaxUnidad      = costoUnitario * (extraTaxRate / 100);
    const totalImpuestosUnidad = ivaUnidad + extraTaxUnidad;
    const costoConImpuestos   = costoUnitario + totalImpuestosUnidad;
    const utilidadUnidad      = costoConImpuestos * (utilidadRate / 100);
    const precioVentaFinal    = Math.round((costoConImpuestos + utilidadUnidad) / 100) * 100;

    const hasConnection = await OfflineManager.checkConnection();

    try {
        // ── EDICIÓN DE ÍTEM EN CARRITO ───────────────────────────────────
        if (editIndex !== '' && editIndex !== undefined && editIndex !== null) {
            const idx = parseInt(editIndex);
            if (!isNaN(idx) && cart[idx]) {
                logger.info('Editando producto en carrito...');

                cart[idx].name          = name;
                cart[idx].purchasePrice = Math.round(costoUnitario);
                cart[idx].salePrice     = precioVentaFinal;
                cart[idx].ivaRate       = ivaRate;
                cart[idx].extraTaxRate  = extraTaxRate;
                cart[idx].utilidadRate  = utilidadRate;

                if (hasConnection) {
                    const productId  = cart[idx].productId;
                    const updateData = { name, purchase_price: Math.round(costoUnitario), sale_price: precioVentaFinal, has_iva: ivaRate > 0 };
                    if (barcode) updateData.barcode = barcode;

                    const { error: updateError } = await sb.from('products').update(updateData).eq('id', productId);

                    if (updateError) {
                        logger.error('Error actualizando en BD: ' + updateError.message);
                        notify('⚠️ Actualizado en carrito pero error en base de datos', 'error');
                    } else {
                        const productInInventory = inventory.find(p => p.id === productId);
                        if (productInInventory) {
                            productInInventory.name           = name;
                            productInInventory.purchase_price = Math.round(costoUnitario);
                            productInInventory.sale_price     = precioVentaFinal;
                            productInInventory.has_iva        = ivaRate > 0;
                            if (barcode) productInInventory.barcode = barcode;
                        }
                        OfflineManager.saveInventory([...inventory]);
                        notify('✅ Producto actualizado exitosamente');
                    }
                } else {
                    notify('🔴 Cambios guardados localmente (sin conexión)', 'success');
                }

                renderCart();
                closeProductModal();
                return;
            }
        }

        // ── CREAR NUEVO PRODUCTO ─────────────────────────────────────────
        logger.info('Creando nuevo producto...');

        const newProduct = {
            name,
            purchase_price: Math.round(costoUnitario),
            sale_price:     precioVentaFinal,
            quantity:       0,
            has_iva:        ivaRate > 0
        };
        if (barcode) newProduct.barcode = barcode;

        if (hasConnection) {
            logger.info('Creando producto ONLINE...');

            const { data, error } = await sb.from('products').insert(newProduct).select().single();
            if (error) throw error;

            notify('✅ Producto creado exitosamente');

            inventory.push(data);
            inventory.sort((a, b) => a.name.localeCompare(b.name));
            OfflineManager.saveInventory([...inventory]);
            OfflineManager.updateLastSync();

            closeProductModal();
            if (confirm('¿Deseas agregar este producto al carrito?')) agregarAlCarrito(data.id);

        } else {
            logger.info('Creando producto OFFLINE...');

            const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const localProduct = { ...newProduct, id: tempId, is_temp: true, created_offline: true, pending_sync: true };

            inventory.push(localProduct);
            inventory.sort((a, b) => a.name.localeCompare(b.name));
            OfflineManager.saveInventory([...inventory]);

            const pendingProducts = JSON.parse(localStorage.getItem('searys_pending_products') || '[]');
            pendingProducts.push({ tempId, product: newProduct, timestamp: new Date().toISOString() });
            localStorage.setItem('searys_pending_products', JSON.stringify(pendingProducts));

            logger.success('Producto guardado en cola de sincronización');
            updateSyncBadge();
            notify('🔴 Producto creado localmente (pendiente de sincronizar)', 'success');

            closeProductModal();
            if (confirm('¿Deseas agregar este producto al carrito?')) agregarAlCarrito(tempId);
        }

    } catch (e) {
        logger.error('Error completo: ' + e.message);
        notify('Error al crear producto: ' + e.message, 'error');
    }
}

logger.success('products.js cargado');