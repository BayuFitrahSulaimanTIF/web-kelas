// ===================================================
// DATE PICKER (vanilla JS)
// ===================================================
// Mengikuti pola Fluent UI DatePicker:
// - Panel kalender dibuka dari field tanggal
// - Navigasi bulan (prev/next)
// - Minggu dimulai hari Minggu
// Tanpa dropdown "Select the first day of the week".
// Output format: dd/mm/yyyy (tahun penuh, sesuai pilihan user).
//
// Panel dipasang sebagai anak absolut dari kolom field
// (position: absolute), sehingga posisinya selalu persis
// di bawah kolom dan ikut bergeser saat halaman/modal di-scroll.
// ===================================================

window.DatePicker = (function () {
  'use strict';

  // ===================================================
  // KONFIGURASI
  // ===================================================

  const MONTHS = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const WEEKDAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/;
  const GRID_CELLS = 42; // 6 baris x 7 kolom

  // ===================================================
  // STATE
  // ===================================================

  let target = null;      // input yang sedang aktif
  let viewDate = null;    // bulan/tahun yang ditampilkan di panel
  let selectedDate = null; // tanggal yang dipilih (jika ada)

  // ===================================================
  // PANEL (dibuat sekali, dipindahkan ke kolom field saat attach)
  // ===================================================

  const panel = createPanel();

  function createPanel() {
    const el = document.createElement('div');
    el.className = 'datepicker-panel';
    el.hidden = true;

    el.innerHTML = `
      <header class="datepicker-header">
        <button class="datepicker-nav" type="button" data-action="prev" aria-label="Bulan sebelumnya">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <span class="datepicker-label"></span>
        <button class="datepicker-nav" type="button" data-action="next" aria-label="Bulan berikutnya">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </header>
      <div class="datepicker-weekdays">${WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="datepicker-days" role="grid"></div>
    `;

    el.querySelector('[data-action="prev"]').addEventListener('click', () => navigateMonth(-1));
    el.querySelector('[data-action="next"]').addEventListener('click', () => navigateMonth(1));
    el.querySelector('.datepicker-days').addEventListener('click', onDayClick);

    return el;
  }

  // ===================================================
  // BUKA / TUTUP
  // ===================================================

  function open(input) {
    target = input;

    const parsed = parseDate(input.value);
    viewDate = parsed ? startOfMonth(parsed) : startOfMonth(new Date());
    selectedDate = parsed;

    panel.hidden = false;
    render();
    ensureVisible();
  }

  function close() {
    if (panel.hidden) return;

    panel.hidden = true;
    target = null;
  }

  // Pastikan seluruh panel terlihat (di depan konten lain).
  // Jika panel melebihi area scroll wadahnya (mis. modal kartu),
  // wadah discroll agar kalender tidak terpotong/tertutup konten di bawahnya.
  function ensureVisible() {
    let container = panel.parentElement;

    while (container && container !== document.body) {
      const styles = window.getComputedStyle(container);

      if (/(auto|scroll)/.test(styles.overflowY)) {
        const containerRect = container.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();

        if (panelRect.bottom > containerRect.bottom) {
          container.scrollTop += panelRect.bottom - containerRect.bottom + 8;
        }
        break;
      }

      container = container.parentElement;
    }
  }

  // ===================================================
  // NAVIGASI BULAN
  // ===================================================

  function navigateMonth(offset) {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
    render();
  }

  // ===================================================
  // RENDER KALENDER
  // ===================================================

  function render() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const firstDayOffset = new Date(year, month, 1).getDay(); // 0 = Minggu
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const today = startOfDay(new Date());

    panel.querySelector('.datepicker-label').textContent = `${MONTHS[month]} ${year}`;

    const daysEl = panel.querySelector('.datepicker-days');
    daysEl.innerHTML = '';

    for (let i = 0; i < GRID_CELLS; i++) {
      const day = i - firstDayOffset + 1;
      const isOtherMonth = day < 1 || day > daysInMonth;

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'datepicker-day';
      cell.textContent = isOtherMonth ? '' : String(day);

      if (!isOtherMonth) {
        cell.dataset.y = String(year);
        cell.dataset.m = String(month);
        cell.dataset.d = String(day);

        const date = new Date(year, month, day);

        if (isSameDay(date, today)) {
          cell.classList.add('is-today');
        }

        if (selectedDate && isSameDay(date, selectedDate)) {
          cell.classList.add('is-selected');
        }
      } else {
        cell.disabled = true;
      }

      daysEl.appendChild(cell);
    }
  }

  // ===================================================
  // PILIH TANGGAL
  // ===================================================

  function onDayClick(event) {
    const cell = event.target.closest('.datepicker-day');
    if (!cell || !cell.dataset.d) return;

    select(new Date(Number(cell.dataset.y), Number(cell.dataset.m), Number(cell.dataset.d)));
  }

  function select(date) {
    selectedDate = date;
    viewDate = startOfMonth(date);

    if (target) {
      target.value = formatDate(date);
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }

    close();
  }

  // ===================================================
  // FORMAT / PARSE
  // ===================================================

  function formatDate(date) {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = String(date.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  }

  function parseDate(value) {
    const match = String(value || '').trim().match(DATE_PATTERN);
    if (!match) return null;

    const dd = Number(match[1]);
    const mm = Number(match[2]);
    const yy = Number(match[3]);
    const year = yy > 99 ? yy : 2000 + yy; // 2 digit = 2000-an, 4 digit = utuh

    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

    const date = new Date(year, mm - 1, dd);
    if (date.getDate() !== dd || date.getMonth() !== mm - 1) return null;

    return date;
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function isSameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  // ===================================================
  // ATTACH KE INPUT
  // ===================================================

  function attach(input) {
    const control = input.closest('.field-control') || input;

    // Panel menjadi anak kolom field (position: absolute),
    // sehingga selalu persis di bawah kolom dan ikut terscroll.
    control.appendChild(panel);

    // .field-control punya will-change: transform (animation.css)
    // yang membuatnya menjadi stacking context sendiri; tanpa z-index
    // positif, panel tidak bisa berada di depan konten yang datang
    // setelahnya (mis. pilihan gender). Beri z-index pada kontrol
    // agar seluruh grupnya (termasuk panel) melukis di atas.
    control.classList.add('has-datepicker');

    control.addEventListener('click', (event) => {
      // Klik yang berasal dari dalam panel (navigasi bulan / pilih hari)
      // tidak boleh membuka ulang panel, karena akan me-reset bulan
      // yang sedang dilihat (atau membuka kembali setelah memilih).
      if (panel.contains(event.target)) return;

      open(input);
    });
  }

  // ===================================================
  // GLOBAL LISTENER
  // ===================================================

  document.addEventListener('click', (event) => {
    if (!target) return;

    const inPanel = panel.contains(event.target);
    const control = target.closest('.field-control') || target;
    const inControl = control.contains(event.target);

    if (!inPanel && !inControl) {
      close();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      close();
      event.stopImmediatePropagation();
    }
  });

  window.addEventListener('resize', close);

  // ===================================================
  // EXPORT
  // ===================================================

  return {
    attach,
    close
  };
})();
