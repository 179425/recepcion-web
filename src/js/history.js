// ============================================
// HISTORY.JS - MÓDULO ES6
// ============================================
import { $, logger, setCargarHistorial } from './utils.js';
import { sb, HISTORY_PAGE_SIZE } from './config.js';

// Registrar cargarHistorial en utils.js para que switchView pueda llamarla
// sin crear un ciclo de imports (utils.js no importa history.js).
// Se ejecuta al cargar este módulo.
setCargarHistorial(cargarHistorial);

// ============================================
// ESTADO Y DOM
// ============================================

const HistoryModule = {
    dom: {
        container:  null,
        filterDate: null,
        init() {
            this.container  = $('historyList');
            this.filterDate = $('filterDate');
        }
    },

    formatters: {
        date: new Intl.DateTimeFormat('es-CO', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }),
        number: new Intl.NumberFormat('es-CO', {
            minimumFractionDigits: 0, maximumFractionDigits: 0
        })
    },

    state: {
        currentPage:   1,
        isLoading:     false,
        expandedCards: new Set()
    }
};

// ============================================
// PLANTILLAS HTML
// ============================================

const HistoryTemplates = {
    compactCard(r) {
        const fecha = HistoryModule.formatters.date.format(new Date(r.created_at));
        const total = r.total_amount
            ? HistoryModule.formatters.number.format(r.total_amount)
            : '—';

        return `
            <div class="hc" data-id="${r.id}">
                <div class="hc-main" onclick="toggleProducts(${r.id})">
                    <div class="hc-left">
                        <div class="hc-invoice">#${r.invoice_number}</div>
                        <div class="hc-date">${fecha}</div>
                    </div>
                    <div class="hc-right">
                        <div class="hc-supplier">${r.suppliers?.name || 'N/A'}</div>
                        <div class="hc-total">$${total}</div>
                    </div>
                    <div class="hc-arrow">▼</div>
                </div>
                <div class="hc-products" id="products-${r.id}"></div>
            </div>
        `;
    },

    productsList(items) {
        if (!items || items.length === 0) {
            return '<div class="hp-empty">Sin productos</div>';
        }
        return items.map((item, i) => `
            <div class="hp-item">
                <span class="hp-num">${i + 1}</span>
                <span class="hp-name">${item.name}</span>
                <span class="hp-qty">${item.qty}</span>
            </div>
        `).join('');
    },

    loading: () => '<div class="h-loading">Cargando...</div>',
    empty:   () => '<div class="h-empty">🔭<br>Sin recepciones</div>',
    error:   () => '<div class="h-error">⚠️<br>Error al cargar</div>',

    loadMoreButton() {
        const btn = document.createElement('button');
        btn.className   = 'h-load-more';
        btn.textContent = '📥 Cargar más';
        btn.onclick     = handleLoadMore;
        return btn;
    }
};

// ============================================
// CARGAR HISTORIAL
// ============================================

export async function cargarHistorial(reset = false) {
    if (!HistoryModule.dom.container) HistoryModule.dom.init();

    const container = HistoryModule.dom.container;
    const date      = HistoryModule.dom.filterDate?.value;

    if (HistoryModule.state.isLoading) return;
    HistoryModule.state.isLoading = true;

    if (reset) {
        HistoryModule.state.currentPage = 1;
        HistoryModule.state.expandedCards.clear();
        container.innerHTML = HistoryTemplates.loading();
    }

    try {
        const offset = (HistoryModule.state.currentPage - 1) * HISTORY_PAGE_SIZE;

        let query = sb
            .from('receptions')
            .select('id, invoice_number, created_at, total_amount, total_items, suppliers(name)')
            .order('created_at', { ascending: false })
            .range(offset, offset + HISTORY_PAGE_SIZE - 1);

        if (date) {
            query = query
                .gte('created_at', `${date}T00:00:00`)
                .lte('created_at', `${date}T23:59:59`);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (reset) container.innerHTML = '';

        const oldBtn = container.querySelector('.h-load-more');
        if (oldBtn) oldBtn.remove();

        if (!data || data.length === 0) {
            if (HistoryModule.state.currentPage === 1) {
                container.innerHTML = HistoryTemplates.empty();
            }
            return;
        }

        const fragment = document.createDocumentFragment();
        const temp     = document.createElement('div');

        data.forEach(r => {
            temp.innerHTML = HistoryTemplates.compactCard(r);
            fragment.appendChild(temp.firstElementChild);
        });

        container.appendChild(fragment);

        if (data.length === HISTORY_PAGE_SIZE) {
            container.appendChild(HistoryTemplates.loadMoreButton());
        }

    } catch (error) {
        logger.error('Error cargando historial: ' + error.message);
        if (HistoryModule.state.currentPage === 1) {
            container.innerHTML = HistoryTemplates.error();
        }
    } finally {
        HistoryModule.state.isLoading = false;
    }
}

// ============================================
// EXPANDIR / COLAPSAR PRODUCTOS
// ============================================

export async function toggleProducts(receptionId) {
    const card        = document.querySelector(`[data-id="${receptionId}"]`);
    const productsDiv = $(`products-${receptionId}`);
    if (!card || !productsDiv) return;

    const isExpanded = HistoryModule.state.expandedCards.has(receptionId);

    if (isExpanded) {
        card.classList.remove('expanded');
        productsDiv.innerHTML = '';
        HistoryModule.state.expandedCards.delete(receptionId);
    } else {
        card.classList.add('expanded');
        productsDiv.innerHTML = '<div class="hp-loading">Cargando productos...</div>';

        try {
            const { data, error } = await sb
                .from('receptions')
                .select('items')
                .eq('id', receptionId)
                .single();

            if (error) throw error;

            const items = JSON.parse(data.items || '[]');
            productsDiv.innerHTML = HistoryTemplates.productsList(items);
            HistoryModule.state.expandedCards.add(receptionId);

        } catch (error) {
            logger.error('Error cargando productos: ' + error.message);
            productsDiv.innerHTML = '<div class="hp-error">Error al cargar</div>';
        }
    }
}

// ============================================
// CARGAR MÁS / REFRESCAR
// ============================================

async function handleLoadMore() {
    try {
        HistoryModule.state.currentPage++;
        await cargarHistorial(false);
    } catch (error) {
        logger.error('Error cargando más: ' + error.message);
        HistoryModule.state.currentPage--;
    }
}

export function refreshHistorial() {
    cargarHistorial(true);
}

// ============================================
// INICIALIZACIÓN DEL DOM
// ============================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => HistoryModule.dom.init());
} else {
    HistoryModule.dom.init();
}

// toggleProducts se sigue llamando desde onclick inline en el HTML generado,
// así que lo exponemos en window como puente temporal hasta refactorizar el HTML.
// Cuando el HTML use event delegation esto se puede eliminar.
window.toggleProducts = toggleProducts;

logger.success('history.js cargado');