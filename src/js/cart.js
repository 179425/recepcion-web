// ============================================
// CART.JS - MÓDULO ES6
// ============================================
import { $, logger, notify, vibrate } from './utils.js';
import { cart, inventory, currentSupplier, setCurrentSupplier } from './config.js';

// calcularPrecios se importa desde products.js.
// Para evitar una importación circular (products.js también importa cart.js),
// usamos inyección: products.js llama setCalcularPrecios() al cargarse.
let _calcularPrecios = null;
export function setCalcularPrecios(fn) { _calcularPrecios = fn; }

// ============================================
// RENDERIZADO DEL CARRITO
// ============================================

export function renderCart() {
    const container = $('cartContainer');
    if (!container) {
        logger.error('cartContainer no encontrado');
        return;
    }

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="cart-empty">
                <div style="font-size:48px;margin-bottom:10px">🛒</div>
                <div style="font-weight:600;margin-bottom:5px">Carrito vacío</div>
                <div style="font-size:14px">Escanea o busca un producto para comenzar</div>
            </div>`;

        const summary = $('cartSummary');
        if (summary) summary.classList.add('empty-state');

        updateCartSummary();
        return;
    }

    const summary = $('cartSummary');
    if (summary) summary.classList.remove('empty-state');

    const fragment = document.createDocumentFragment();

    cart.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.dataset.index = index;

        const itemName          = item.name || 'Sin nombre';
        const itemSalePrice     = Number(item.salePrice || item.purchasePrice || 0);
        const itemPurchasePrice = Number(item.purchasePrice || 0);
        const itemQty           = Number(item.qty || 1);
        const itemSubtotal      = itemPurchasePrice * itemQty;

        const tempBadge = String(item.productId).startsWith('temp_')
            ? '<span style="background:#f59e0b;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;margin-left:6px">OFFLINE</span>'
            : '';

        div.innerHTML = `
            <div class="cart-item-header">
                <div class="cart-item-title">
                    <span class="cart-item-number">${index + 1}</span>
                    <div>
                        <div class="cart-item-name">${itemName}${tempBadge}</div>
                        <div class="cart-item-sale-price">$${itemSalePrice.toLocaleString()}</div>
                    </div>
                </div>
                <div class="cart-item-actions">
                    <button class="btn-icon btn-edit"   data-action="edit"   title="Editar">✏️</button>
                    <button class="btn-icon btn-delete" data-action="delete" title="Eliminar">🗑️</button>
                </div>
            </div>

            <div class="cart-item-details">
                <div class="detail-box">
                    <span class="detail-label">COMPRA</span>
                    <span class="detail-value">$${itemPurchasePrice.toLocaleString()}</span>
                </div>
                <div class="detail-box">
                    <span class="detail-label">SUBTOTAL</span>
                    <span class="detail-value detail-subtotal">$${itemSubtotal.toLocaleString()}</span>
                </div>
                <div class="detail-box qty-edit-box" data-action="edit-qty">
                    <span class="detail-label">CANT.</span>
                    <span class="detail-value qty-display">${itemQty}</span>
                    <input type="number" class="qty-edit-input-inline" value="${itemQty}" min="1" style="display:none;">
                </div>
            </div>
        `;
        fragment.appendChild(div);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
    updateCartSummary();
}

// ============================================
// EVENT DELEGATION — un solo listener para todo el carrito
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const cartContainer = $('cartContainer');
    if (!cartContainer) {
        logger.error('cartContainer no encontrado en DOMContentLoaded');
        return;
    }

    // Clicks
    cartContainer.addEventListener('click', (e) => {
        const cartItem = e.target.closest('.cart-item');
        if (!cartItem) return;

        const index = parseInt(cartItem.dataset.index);
        if (isNaN(index)) return;

        if (e.target.closest('[data-action="edit"]')) {
            editCartItem(index);
            return;
        }

        if (e.target.closest('[data-action="delete"]')) {
            if (confirm('¿Eliminar este producto?')) {
                cart.splice(index, 1);
                renderCart();
            }
            return;
        }

        if (e.target.closest('[data-action="edit-qty"]')) {
            const qtyBox  = e.target.closest('.qty-edit-box');
            const display = qtyBox.querySelector('.qty-display');
            const input   = qtyBox.querySelector('.qty-edit-input-inline');
            if (display && input) {
                display.style.display = 'none';
                input.style.display   = 'block';
                setTimeout(() => { input.focus(); input.select(); }, 0);
            }
        }
    });

    // Cambios en input de cantidad
    cartContainer.addEventListener('change', (e) => {
        if (!e.target.classList.contains('qty-edit-input-inline')) return;

        const cartItem = e.target.closest('.cart-item');
        if (!cartItem) return;

        const index = parseInt(cartItem.dataset.index);
        const qty   = parseInt(e.target.value);

        if (isNaN(qty) || qty <= 0) {
            if (confirm('¿Eliminar este producto?')) {
                cart.splice(index, 1);
                renderCart();
            } else {
                e.target.value = cart[index].qty;
                const display  = e.target.previousElementSibling;
                if (display) { display.style.display = 'block'; e.target.style.display = 'none'; }
            }
        } else {
            cart[index].qty = qty;
            updateSingleCartItem(index, cartItem);
        }
    });

    // Teclas Enter / Escape en edición inline
    cartContainer.addEventListener('keydown', (e) => {
        if (!e.target.classList.contains('qty-edit-input-inline')) return;

        const cartItem = e.target.closest('.cart-item');
        if (!cartItem) return;
        const index = parseInt(cartItem.dataset.index);

        if (e.key === 'Enter') {
            e.preventDefault();
            const qty = parseInt(e.target.value);
            if (!isNaN(qty) && qty > 0) {
                cart[index].qty = qty;
                updateSingleCartItem(index, cartItem);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.target.value = cart[index].qty;
            const display  = e.target.previousElementSibling;
            if (display) { display.style.display = 'block'; e.target.style.display = 'none'; }
        }
    });

    // Blur — restaurar display
    cartContainer.addEventListener('blur', (e) => {
        if (!e.target.classList.contains('qty-edit-input-inline')) return;
        const display = e.target.previousElementSibling;
        if (display) { display.style.display = 'block'; e.target.style.display = 'none'; }
    }, true);
});

// ============================================
// RESUMEN DEL CARRITO
// ============================================

export function updateCartSummary() {
    const totalItemsLabel = $('totalItemsLabel');
    const totalLabel      = $('totalLabel');
    if (!totalItemsLabel || !totalLabel) return;

    let totalItems = 0;
    let totalDinero = 0;

    cart.forEach(item => {
        totalItems  += Number(item.qty) || 0;
        totalDinero += (Number(item.purchasePrice) * Number(item.qty)) || 0;
    });

    totalItemsLabel.textContent = totalItems;
    totalLabel.textContent      = `$${totalDinero.toLocaleString('es-CO')}`;
}

// ============================================
// AGREGAR AL CARRITO
// ============================================

export function agregarAlCarrito(productId) {
    const product = inventory.find(p => p.id === productId);

    if (!product) {
        logger.error('Producto no encontrado: ' + productId);
        notify('❌ Producto no encontrado en inventario', 'error');
        return;
    }

    const existingIndex = cart.findIndex(item => item.productId === productId);

    if (existingIndex !== -1) {
        cart[existingIndex].qty++;
        const cartItem = document.querySelector(`.cart-item[data-index="${existingIndex}"]`);
        if (cartItem) {
            updateSingleCartItem(existingIndex, cartItem);
        } else {
            renderCart();
        }
    } else {
        cart.push({
            productId:     product.id,
            name:          product.name,
            purchasePrice: product.purchase_price || 0,
            salePrice:     product.sale_price     || 0,
            qty:           1
        });
        renderCart();
    }

    vibrate(50);

    setTimeout(() => {
        const container = $('cartContainer');
        if (container) container.scrollTop = container.scrollHeight;
    }, 100);
}

// ============================================
// ACTUALIZAR UN ÍTEM SIN RE-RENDERIZAR TODO
// ============================================

export function updateSingleCartItem(index, cartItemElement) {
    const item = cart[index];
    if (!item) return;

    if (!cartItemElement) {
        cartItemElement = document.querySelector(`.cart-item[data-index="${index}"]`);
    }
    if (!cartItemElement) return;

    const qtyDisplay = cartItemElement.querySelector('.qty-display');
    const qtyInput   = cartItemElement.querySelector('.qty-edit-input-inline');

    if (qtyDisplay) { qtyDisplay.textContent = item.qty; qtyDisplay.style.display = 'block'; }
    if (qtyInput)   { qtyInput.value = item.qty;         qtyInput.style.display   = 'none';  }

    const subtotal = cartItemElement.querySelector('.detail-subtotal');
    if (subtotal) {
        subtotal.textContent = `$${(item.purchasePrice * item.qty).toLocaleString()}`;
    }

    updateCartSummary();
}

// ============================================
// EDITAR ÍTEM DEL CARRITO
// ============================================

export function editCartItem(index) {
    if (!cart[index]) return;

    const item    = cart[index];
    const product = inventory.find(p => p.id === item.productId);

    const nameInput      = $('newProductName');
    const barcodeInput   = $('newProductBarcode');
    const totalInput     = $('totalFacturado');
    const cantidadInput  = $('cantidadRecibida');
    const ivaInput       = $('ivaRate');
    const extraTaxInput  = $('extraTaxRate');
    const utilidadInput  = $('utilidadRate');
    const modal          = $('productModal');

    if (!nameInput || !modal) {
        logger.error('Elementos del modal no encontrados');
        return;
    }

    nameInput.value     = item.name;
    barcodeInput.value  = product?.barcode || '';
    totalInput.value    = item.purchasePrice;
    cantidadInput.value = 1;
    ivaInput.value      = item.ivaRate      || 0;
    extraTaxInput.value = item.extraTaxRate  || 0;
    utilidadInput.value = item.utilidadRate  || 0;

    modal.dataset.editIndex = index;

    const modalTitle = modal.querySelector('h3');
    if (modalTitle) modalTitle.textContent = '✏️ Editar Producto';

    modal.classList.add('active');

    // calcularPrecios se inyecta desde products.js para evitar ciclo de imports
    if (_calcularPrecios) {
        _calcularPrecios();
    } else {
        logger.warn('editCartItem: calcularPrecios no inyectado aún');
    }
}

// ============================================
// VACIAR CARRITO
// ============================================

export function vaciarCarrito() {
    if (confirm('¿Vaciar todo el carrito?')) {
        cart.length = 0;
        renderCart();
    }
}

export function removeFromCart(index) {
    if (confirm('¿Eliminar este producto?')) {
        cart.splice(index, 1);
        renderCart();
    }
}

// ============================================
// ACTUALIZAR IDs TEMPORALES TRAS SINCRONIZACIÓN
// ============================================

export function updateCartAfterSync(productMapping, supplierMapping) {
    if (!productMapping && !supplierMapping) return false;

    let updated = false;

    cart.forEach(item => {
        if (productMapping && productMapping[item.productId]) {
            const oldId    = item.productId;
            item.productId = productMapping[oldId];
            updated        = true;
            logger.info(`Carrito: ${item.name} - ID actualizado ${oldId} → ${item.productId}`);
        }
    });

    // currentSupplier es una referencia a objeto — se muta directamente.
    // Usamos setCurrentSupplier() para reasignar cuando sea necesario.
    if (supplierMapping && currentSupplier && supplierMapping[currentSupplier.id]) {
        const oldId = currentSupplier.id;
        currentSupplier.id = supplierMapping[oldId];
        delete currentSupplier.is_temp;
        delete currentSupplier.created_offline;
        delete currentSupplier.pending_sync;
        logger.info(`Proveedor actual actualizado: ${oldId} → ${currentSupplier.id}`);
        updated = true;
    }

    if (updated) {
        renderCart();
        logger.success('Carrito actualizado con IDs reales');
    }

    return updated;
}

logger.success('cart.js cargado');