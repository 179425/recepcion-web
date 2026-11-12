// ============================================
// SUPPLIERS.JS - MÓDULO ES6
// ============================================
import { $, logger, notify, updateSyncBadge } from './utils.js';
import { sb, suppliers, setCurrentSupplier, currentSupplier } from './config.js';
import { OfflineManager } from './offline-manager.js';

// ============================================
// CARGAR PROVEEDORES
// ============================================

export async function cargarProveedores() {
    logger.info('Cargando proveedores...');
    const currentData = [...suppliers];

    try {
        const { data, error } = await sb.from('suppliers').select('*').order('name');
        if (error) throw error;

        if (data && data.length > 0) {
            // Mutar en sitio — nunca reasignar el binding importado
            suppliers.length = 0;
            suppliers.push(...data);

            OfflineManager.saveSuppliers(data);
            OfflineManager.updateLastSync();

            logger.success(`${data.length} proveedores cargados`);
            return data;
        } else {
            logger.warn('No se obtuvieron proveedores del servidor');
            return currentData;
        }
    } catch (error) {
        logger.error('Error cargando proveedores: ' + error.message);
        return currentData;
    }
}

// ============================================
// MODAL DE PROVEEDORES
// ============================================

export function openSupplierModal() {
    const modal = $('supplierModal');
    if (modal) {
        modal.classList.add('active');
        renderSuppliers();
    }
}

export function closeSupplierModal() {
    const modal = $('supplierModal');
    if (modal) modal.classList.remove('active');
}

// ============================================
// RENDERIZADO DE LISTA
// ============================================

let supplierSearchTimeout = null;

export function renderSuppliers() {
    const list = $('suppliersList');
    if (!list) return;

    const search = ($('searchSupplier')?.value || '').toLowerCase();

    clearTimeout(supplierSearchTimeout);
    supplierSearchTimeout = setTimeout(() => {
        const filtered = suppliers.filter(s => s.name.toLowerCase().includes(search));
        const fragment = document.createDocumentFragment();

        filtered.forEach(s => {
            const div = document.createElement('div');
            div.className = 'supplier-item';

            if (currentSupplier && currentSupplier.id === s.id) {
                div.classList.add('selected');
            }

            div.onclick = () => selectSupplier(s);

            const tempBadge = s.is_temp
                ? '<span style="background:#f59e0b;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;margin-left:6px">OFFLINE</span>'
                : '';

            div.innerHTML = `
                <div style="font-weight:bold;margin-bottom:5px;display:flex;align-items:center">
                    ${s.name}${tempBadge}
                </div>
                <div style="font-size:12px;color:#64748b">
                    ${s.contact_phone ? `📞 ${s.contact_phone}` : ''}
                </div>
            `;
            fragment.appendChild(div);
        });

        list.innerHTML = '';
        list.appendChild(fragment);
    }, 150);
}

// ============================================
// SELECCIONAR PROVEEDOR
// ============================================

export function selectSupplier(supplier) {
    setCurrentSupplier(supplier);

    const display = $('supplierDisplay');
    if (display) display.value = supplier.name;

    closeSupplierModal();

    if (supplier.is_temp) {
        notify('⚠️ Proveedor creado offline (pendiente de sincronizar)', 'error');
    }
}

// ============================================
// CREAR PROVEEDOR (online / offline)
// ============================================

export async function crearProveedor() {
    const nameInput  = $('newSupplierName');
    const phoneInput = $('newSupplierPhone');

    if (!nameInput) { logger.error('Input de nombre no encontrado'); return; }

    const name          = nameInput.value.trim();
    const contact_phone = phoneInput?.value.trim() || '';

    if (!name) { notify('Pon un nombre', 'error'); nameInput.focus(); return; }

    const hasConnection = await OfflineManager.checkConnection();

    try {
        const newSupplier = { name };
        if (contact_phone) newSupplier.contact_phone = contact_phone;

        if (hasConnection) {
            // ── MODO ONLINE ──────────────────────────────────────────────
            logger.info('Creando proveedor ONLINE...');

            const { data, error } = await sb
                .from('suppliers')
                .insert(newSupplier)
                .select()
                .single();

            if (error) throw error;

            notify('✅ Proveedor creado exitosamente');

            nameInput.value = '';
            if (phoneInput) phoneInput.value = '';

            suppliers.push(data);
            suppliers.sort((a, b) => a.name.localeCompare(b.name));

            OfflineManager.saveSuppliers([...suppliers]);
            OfflineManager.updateLastSync();

            selectSupplier(data);

        } else {
            // ── MODO OFFLINE ─────────────────────────────────────────────
            logger.info('Creando proveedor OFFLINE...');

            const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

            const localSupplier = {
                ...newSupplier,
                id: tempId,
                is_temp: true,
                created_offline: true,
                pending_sync: true
            };

            nameInput.value = '';
            if (phoneInput) phoneInput.value = '';

            suppliers.push(localSupplier);
            suppliers.sort((a, b) => a.name.localeCompare(b.name));

            OfflineManager.saveSuppliers([...suppliers]);

            const pendingSuppliers = JSON.parse(
                localStorage.getItem('searys_pending_suppliers') || '[]'
            );
            pendingSuppliers.push({
                tempId,
                supplier: newSupplier,
                timestamp: new Date().toISOString()
            });
            localStorage.setItem('searys_pending_suppliers', JSON.stringify(pendingSuppliers));

            logger.success('Proveedor guardado en cola de sincronización');
            notify('🔴 Proveedor creado localmente (pendiente de sincronizar)', 'success');
            updateSyncBadge();

            selectSupplier(localSupplier);
        }

    } catch (e) {
        logger.error('Error creando proveedor: ' + e.message);
        notify('Error al crear proveedor: ' + e.message, 'error');
    }
}

logger.success('suppliers.js cargado');